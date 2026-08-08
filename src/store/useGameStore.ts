import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  ACTIVE_TASK_SLOTS,
  BASE_XP_TO_LEVEL,
  ENERGY_MAX,
  ENERGY_PER_REWARDED_AD,
  ENERGY_REFILL_GEM_COST,
  GEMS_PER_REWARDED_AD,
  SAVE_SCHEMA_VERSION,
  SAVE_STORAGE_KEY,
  STARTING_COINS,
  STARTING_GEMS,
  XP_CURVE,
} from '../constants/gameConfig';
import { getItemTree } from '../constants/itemTrees';
import type {
  CellIndex,
  EnergyState,
  GridState,
  Item,
  MergeOutcome,
  PlayerState,
  RestorationTarget,
  Task,
  Wallet,
} from '../types/game';
import { grantEnergy, settleEnergyState, spendEnergy } from '../utils/energy';
import {
  createEmptyGrid,
  createItem,
  findNearestEmptyCell,
  getCell,
  isGridShapeValid,
  withCells,
} from '../utils/grid';
import { resolveDrop } from '../utils/merge';
import { canDeliverTask, consumeTaskItems, generateTask } from '../utils/tasks';

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

/** Why a generator tap did nothing - the UI maps these to an upsell or a nudge. */
export type TapFailureReason =
  | 'not-a-generator'
  | 'empty-cell'
  | 'out-of-bounds'
  | 'no-energy'
  | 'board-full';

export type TapResult =
  | { readonly ok: true; readonly item: Item; readonly at: CellIndex }
  | { readonly ok: false; readonly reason: TapFailureReason };

export interface GameState {
  // -- persisted ----------------------------------------------------------
  grid: GridState;
  energy: EnergyState;
  wallet: Wallet;
  player: PlayerState;
  activeTasks: Task[];
  restorations: RestorationTarget[];
  nextItemSeq: number;
  nextTaskSeq: number;

  // -- transient ----------------------------------------------------------
  /** Last drag result, consumed by the board for animations. Never persisted. */
  lastOutcome: MergeOutcome | null;
  hydrated: boolean;

  // -- actions ------------------------------------------------------------
  resetGame: () => void;
  refreshEnergy: () => void;
  tapGenerator: (index: CellIndex) => TapResult;
  dropItem: (from: CellIndex, to: CellIndex) => MergeOutcome;
  clearOutcome: () => void;
  deliverTask: (taskId: string) => boolean;
  refillEnergyWithGems: () => boolean;
  claimRewardedAd: (reward: 'energy' | 'gems') => void;
  addCoins: (amount: number) => void;
  spendCoins: (amount: number) => boolean;
  addGems: (amount: number) => void;
  restore: (targetId: string) => boolean;
}

// ---------------------------------------------------------------------------
// Initial content
// ---------------------------------------------------------------------------

const INITIAL_RESTORATIONS: readonly RestorationTarget[] = [
  { id: 'porch', name: 'Front Porch', restored: false, coinCost: 0 },
  { id: 'kitchen', name: 'Kitchen', restored: false, coinCost: 150 },
  { id: 'garden', name: 'Garden', restored: false, coinCost: 300 },
];

function createInitialPlayer(): PlayerState {
  return { level: 1, xp: 0, xpToNextLevel: BASE_XP_TO_LEVEL, tasksCompleted: 0 };
}

function xpForLevel(level: number): number {
  return Math.round(BASE_XP_TO_LEVEL * Math.pow(XP_CURVE, level - 1));
}

/** Board the player starts with: three generators, everything else empty. */
function createInitialGrid(startSeq: number): { grid: GridState; nextItemSeq: number } {
  let seq = startSeq;
  const placements: ReadonlyArray<{ index: CellIndex; type: 'toolbox' | 'lumberPile' | 'paintCan' }> =
    [
      { index: 10, type: 'toolbox' },
      { index: 12, type: 'lumberPile' },
      { index: 14, type: 'paintCan' },
    ];

  const grid = withCells(
    createEmptyGrid(),
    placements.map(({ index, type }) => {
      const item = createItem(seq, type, 1);
      seq += 1;
      return { index, item };
    }),
  );

  return { grid, nextItemSeq: seq };
}

function createInitialTasks(playerLevel: number, startSeq: number): { tasks: Task[]; nextTaskSeq: number } {
  const tasks: Task[] = [];
  let seq = startSeq;
  const restoreIds = INITIAL_RESTORATIONS.map((target) => target.id);

  for (let i = 0; i < ACTIVE_TASK_SLOTS; i += 1) {
    tasks.push(
      generateTask({
        playerLevel,
        seq,
        restoreTargetId: restoreIds[i % restoreIds.length] ?? null,
      }),
    );
    seq += 1;
  }
  return { tasks, nextTaskSeq: seq };
}

function createInitialState(): Pick<
  GameState,
  | 'grid'
  | 'energy'
  | 'wallet'
  | 'player'
  | 'activeTasks'
  | 'restorations'
  | 'nextItemSeq'
  | 'nextTaskSeq'
  | 'lastOutcome'
> {
  const { grid, nextItemSeq } = createInitialGrid(1);
  const player = createInitialPlayer();
  const { tasks, nextTaskSeq } = createInitialTasks(player.level, 1);

  return {
    grid,
    energy: { current: ENERGY_MAX, max: ENERGY_MAX, lastTickAt: Date.now() },
    wallet: { coins: STARTING_COINS, gems: STARTING_GEMS },
    player,
    activeTasks: tasks,
    restorations: INITIAL_RESTORATIONS.map((target) => ({ ...target })),
    nextItemSeq,
    nextTaskSeq,
    lastOutcome: null,
  };
}

// ---------------------------------------------------------------------------
// Progression helper
// ---------------------------------------------------------------------------

/** Applies XP, rolling over as many level-ups as the amount covers. */
function applyXp(player: PlayerState, amount: number): { player: PlayerState; levelsGained: number } {
  let { level, xp, xpToNextLevel } = player;
  let levelsGained = 0;
  xp += amount;

  while (xp >= xpToNextLevel) {
    xp -= xpToNextLevel;
    level += 1;
    levelsGained += 1;
    xpToNextLevel = xpForLevel(level);
  }

  return {
    player: { level, xp, xpToNextLevel, tasksCompleted: player.tasksCompleted },
    levelsGained,
  };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      ...createInitialState(),
      hydrated: false,

      resetGame: () => {
        set({ ...createInitialState(), hydrated: true });
      },

      /**
       * Settles offline regeneration. Cheap to call - it writes only when the
       * settled value actually differs, so a 1 Hz UI tick does not thrash
       * subscribers or trigger a persist write every second.
       */
      refreshEnergy: () => {
        const { energy } = get();
        const settled = settleEnergyState(energy);
        if (settled.current !== energy.current || settled.lastTickAt !== energy.lastTickAt) {
          set({ energy: settled });
        }
      },

      tapGenerator: (index) => {
        const state = get();
        const cell = getCell(state.grid, index);
        if (cell === null) return { ok: false, reason: 'out-of-bounds' };
        if (cell.item === null) return { ok: false, reason: 'empty-cell' };

        const generator = getItemTree(cell.item.itemType).generator;
        if (generator === undefined) return { ok: false, reason: 'not-a-generator' };

        // Check the board before charging energy: never take a payment we
        // cannot deliver on.
        const target = findNearestEmptyCell(state.grid, index);
        if (target < 0) return { ok: false, reason: 'board-full' };

        const energy = spendEnergy(state.energy, generator.energyCost);
        if (energy === null) return { ok: false, reason: 'no-energy' };

        const spawned = createItem(
          state.nextItemSeq,
          generator.produces,
          generator.producesLevel,
          true,
        );

        set({
          grid: withCells(state.grid, [{ index: target, item: spawned }]),
          energy,
          nextItemSeq: state.nextItemSeq + 1,
        });

        return { ok: true, item: spawned, at: target };
      },

      dropItem: (from, to) => {
        const state = get();
        const result = resolveDrop(state.grid, from, to, state.nextItemSeq);
        if (result.outcome.kind === 'rejected') {
          set({ lastOutcome: result.outcome });
          return result.outcome;
        }

        // A merge is the core dopamine beat, so it also pays a little XP.
        const xpGain = result.mergedInto !== null ? result.mergedInto.level : 0;
        const { player } = applyXp(state.player, xpGain);

        set({
          grid: result.grid,
          nextItemSeq: result.nextItemSeq,
          player,
          lastOutcome: result.outcome,
        });
        return result.outcome;
      },

      clearOutcome: () => set({ lastOutcome: null }),

      deliverTask: (taskId) => {
        const state = get();
        const task = state.activeTasks.find((candidate) => candidate.id === taskId);
        if (task === undefined || task.status !== 'active') return false;
        if (!canDeliverTask(state.grid, task)) return false;

        const grid = consumeTaskItems(state.grid, task);
        const { player, levelsGained } = applyXp(state.player, task.reward.xp);

        // Refill the slot immediately: an empty task board kills the loop.
        const replacement = generateTask({
          playerLevel: player.level,
          seq: state.nextTaskSeq,
          restoreTargetId: task.restoreTargetId,
        });
        const activeTasks = state.activeTasks.map((candidate) =>
          candidate.id === taskId ? replacement : candidate,
        );

        const restorations =
          task.restoreTargetId === null
            ? state.restorations
            : state.restorations.map((target) =>
                target.id === task.restoreTargetId ? { ...target, restored: true } : target,
              );

        set({
          grid,
          activeTasks,
          restorations,
          nextTaskSeq: state.nextTaskSeq + 1,
          wallet: {
            coins: state.wallet.coins + task.reward.coins,
            gems: state.wallet.gems + task.reward.gems,
          },
          player: { ...player, tasksCompleted: player.tasksCompleted + 1 },
          // Levelling up tops the player back up - a reward that also pulls
          // them straight back into the generator loop.
          energy:
            levelsGained > 0
              ? grantEnergy(state.energy, levelsGained * 20)
              : settleEnergyState(state.energy),
        });
        return true;
      },

      refillEnergyWithGems: () => {
        const state = get();
        if (state.wallet.gems < ENERGY_REFILL_GEM_COST) return false;
        const settled = settleEnergyState(state.energy);
        if (settled.current >= settled.max) return false;

        set({
          wallet: { ...state.wallet, gems: state.wallet.gems - ENERGY_REFILL_GEM_COST },
          energy: { current: settled.max, max: settled.max, lastTickAt: Date.now() },
        });
        return true;
      },

      claimRewardedAd: (reward) => {
        const state = get();
        if (reward === 'energy') {
          set({ energy: grantEnergy(state.energy, ENERGY_PER_REWARDED_AD) });
          return;
        }
        set({ wallet: { ...state.wallet, gems: state.wallet.gems + GEMS_PER_REWARDED_AD } });
      },

      addCoins: (amount) => {
        if (amount <= 0) return;
        set((state) => ({ wallet: { ...state.wallet, coins: state.wallet.coins + amount } }));
      },

      spendCoins: (amount) => {
        const state = get();
        if (amount <= 0 || state.wallet.coins < amount) return false;
        set({ wallet: { ...state.wallet, coins: state.wallet.coins - amount } });
        return true;
      },

      addGems: (amount) => {
        if (amount <= 0) return;
        set((state) => ({ wallet: { ...state.wallet, gems: state.wallet.gems + amount } }));
      },

      restore: (targetId) => {
        const state = get();
        const target = state.restorations.find((candidate) => candidate.id === targetId);
        if (target === undefined || target.restored) return false;
        if (state.wallet.coins < target.coinCost) return false;

        set({
          wallet: { ...state.wallet, coins: state.wallet.coins - target.coinCost },
          restorations: state.restorations.map((candidate) =>
            candidate.id === targetId ? { ...candidate, restored: true } : candidate,
          ),
        });
        return true;
      },
    }),
    {
      name: SAVE_STORAGE_KEY,
      version: SAVE_SCHEMA_VERSION,
      storage: createJSONStorage(() => AsyncStorage),
      // Only game data is written; transient UI state stays in memory.
      partialize: (state) => ({
        grid: state.grid,
        energy: state.energy,
        wallet: state.wallet,
        player: state.player,
        activeTasks: state.activeTasks,
        restorations: state.restorations,
        nextItemSeq: state.nextItemSeq,
        nextTaskSeq: state.nextTaskSeq,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error !== undefined || state === undefined) {
          // Corrupt save: start clean rather than booting into a broken board.
          useGameStore.setState({ ...createInitialState(), hydrated: true });
          return;
        }
        // A save from an older/edited build could carry a wrong-sized board.
        if (!isGridShapeValid(state.grid)) {
          useGameStore.setState({ ...createInitialState(), hydrated: true });
          return;
        }
        // Settle offline energy the moment the save lands.
        useGameStore.setState({ energy: settleEnergyState(state.energy), hydrated: true });
      },
    },
  ),
);

// ---------------------------------------------------------------------------
// Selectors
//
// Always subscribe through a narrow selector: `useGameStore((s) => s.energy)`
// re-renders the energy bar only when energy changes, while
// `useGameStore()` would re-render it on every merge.
// ---------------------------------------------------------------------------

export const selectGrid = (state: GameState): GridState => state.grid;
export const selectEnergy = (state: GameState): EnergyState => state.energy;
export const selectWallet = (state: GameState): Wallet => state.wallet;
export const selectPlayer = (state: GameState): PlayerState => state.player;
export const selectActiveTasks = (state: GameState): Task[] => state.activeTasks;
export const selectHydrated = (state: GameState): boolean => state.hydrated;

/** Per-cell selector so `TileItem` re-renders only when its own cell changes. */
export const selectCell =
  (index: CellIndex) =>
  (state: GameState): Item | null =>
    state.grid.cells[index]?.item ?? null;
