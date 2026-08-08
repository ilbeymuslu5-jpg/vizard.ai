import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createStore } from 'zustand/vanilla';

import { BOARD_EXPANSIONS, CREW, getCrewDefinition, SHOP_OFFERS } from '../constants/crew';
import {
  ACTIVE_TASK_SLOTS,
  BASE_XP_TO_LEVEL,
  ENERGY_MAX,
  ENERGY_PER_LEVEL_UP,
  ENERGY_PER_REWARDED_AD,
  ENERGY_REFILL_GEM_COST,
  GEMS_PER_REWARDED_AD,
  SAVE_SCHEMA_VERSION,
  SAVE_STORAGE_KEY,
  STARTING_COINS,
  STARTING_GEMS,
  STARTING_ROWS,
  XP_CURVE,
} from '../constants/gameConfig';
import { createHouse, currentRoom } from '../constants/house';
import {
  getGeneratorChains,
  getGeneratorTable,
  getItemTree,
  isGeneratorType,
  rollGeneratorOutput,
} from '../constants/itemTrees';
import type {
  CellIndex,
  CrewBonuses,
  CrewId,
  CrewMemberState,
  EnergyState,
  GridState,
  Item,
  ItemType,
  MergeOutcome,
  PlayerState,
  RestorationTarget,
  ShopOfferState,
  Task,
  Wallet,
} from '../types/game';
import { crewBonuses, createCrew, upgradeCost } from '../utils/crew';
import { grantEnergy, settleEnergyState, spendEnergy } from '../utils/energy';
import {
  createEmptyGrid,
  createItem,
  findNearestEmptyCell,
  getCell,
  isGridShapeValid,
  withCells,
  withUnlockedRows,
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
  | { readonly ok: true; readonly item: Item; readonly at: CellIndex; readonly wasFree: boolean }
  | { readonly ok: false; readonly reason: TapFailureReason };

/** Shared shape for the coin purchases: hire, upgrade, buy, unlock, restore. */
export type PurchaseResult =
  | { readonly ok: true; readonly spent: number }
  | { readonly ok: false; readonly reason: 'unaffordable' | 'unavailable' | 'no-room' };

export interface GameState {
  // -- persisted ----------------------------------------------------------
  grid: GridState;
  energy: EnergyState;
  wallet: Wallet;
  player: PlayerState;
  activeTasks: Task[];
  restorations: RestorationTarget[];
  crew: CrewMemberState[];
  shop: ShopOfferState[];
  unlockedRows: number;
  nextItemSeq: number;
  nextTaskSeq: number;

  // -- transient ----------------------------------------------------------
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

  // progression purchases
  hireCrew: (id: CrewId) => PurchaseResult;
  upgradeCrew: (id: CrewId) => PurchaseResult;
  buyGenerator: (itemType: ItemType) => PurchaseResult;
  unlockRow: (row: number) => PurchaseResult;
  restoreRoom: (roomId: string) => PurchaseResult;

  // derived helpers (cheap; recomputed rather than stored)
  bonuses: () => CrewBonuses;
  availableChains: () => ItemType[];
}

// ---------------------------------------------------------------------------
// Initial content
// ---------------------------------------------------------------------------

function createInitialPlayer(): PlayerState {
  return { level: 1, xp: 0, xpToNextLevel: BASE_XP_TO_LEVEL, tasksCompleted: 0 };
}

function xpForLevel(level: number): number {
  return Math.round(BASE_XP_TO_LEVEL * Math.pow(XP_CURVE, level - 1));
}

/**
 * The starting board: one toolbox, four playable rows.
 *
 * Everything else - more generators, the bottom two rows, the crew - is bought.
 * Starting poor is the point: the first hour has to establish that coins are
 * scarce, or none of the later purchases mean anything.
 */
function createInitialGrid(startSeq: number): { grid: GridState; nextItemSeq: number } {
  const grid = withCells(createEmptyGrid(undefined, undefined, STARTING_ROWS), [
    { index: 7, item: createItem(startSeq, 'toolbox', 1) },
  ]);
  return { grid, nextItemSeq: startSeq + 1 };
}

function createInitialShop(): ShopOfferState[] {
  return SHOP_OFFERS.map((offer) => ({
    itemType: offer.itemType,
    // The starting toolbox counts as a purchase, so the next one costs more.
    purchased: offer.itemType === 'toolbox' ? 1 : 0,
  }));
}

/** Chains the player can actually make, given the generators on their board. */
function chainsOnBoard(grid: GridState): ItemType[] {
  const chains = new Set<ItemType>();
  for (const cell of grid.cells) {
    if (cell.item === null || !isGeneratorType(cell.item.itemType)) continue;
    // Only what this generator makes *at its current level*: a task should not
    // ask for hammers before the player has merged their way to them.
    for (const output of getGeneratorTable(cell.item.itemType, cell.item.level)) {
      chains.add(output.produces);
    }
  }
  return [...chains];
}

function createInitialTasks(
  playerLevel: number,
  startSeq: number,
  availableTypes: readonly ItemType[],
  restoreTargetId: string | null,
): { tasks: Task[]; nextTaskSeq: number } {
  const tasks: Task[] = [];
  let seq = startSeq;
  for (let i = 0; i < ACTIVE_TASK_SLOTS; i += 1) {
    tasks.push(generateTask({ playerLevel, seq, availableTypes, restoreTargetId }));
    seq += 1;
  }
  return { tasks, nextTaskSeq: seq };
}

type InitialState = Pick<
  GameState,
  | 'grid'
  | 'energy'
  | 'wallet'
  | 'player'
  | 'activeTasks'
  | 'restorations'
  | 'crew'
  | 'shop'
  | 'unlockedRows'
  | 'nextItemSeq'
  | 'nextTaskSeq'
  | 'lastOutcome'
>;

function createInitialState(): InitialState {
  const { grid, nextItemSeq } = createInitialGrid(1);
  const player = createInitialPlayer();
  const restorations = createHouse();
  const { tasks, nextTaskSeq } = createInitialTasks(
    player.level,
    1,
    chainsOnBoard(grid),
    currentRoom(restorations)?.id ?? null,
  );

  return {
    grid,
    energy: { current: ENERGY_MAX, max: ENERGY_MAX, lastTickAt: Date.now() },
    wallet: { coins: STARTING_COINS, gems: STARTING_GEMS },
    player,
    activeTasks: tasks,
    restorations,
    crew: createCrew(),
    shop: createInitialShop(),
    unlockedRows: STARTING_ROWS,
    nextItemSeq,
    nextTaskSeq,
    lastOutcome: null,
  };
}

// ---------------------------------------------------------------------------
// Progression helpers
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

/** Price of the next copy of a generator: base * growth^(times already bought). */
export function generatorPrice(shop: readonly ShopOfferState[], itemType: ItemType): number | null {
  const offer = SHOP_OFFERS.find((candidate) => candidate.itemType === itemType);
  if (offer === undefined) return null;
  const owned = shop.find((entry) => entry.itemType === itemType)?.purchased ?? 0;
  return Math.round(offer.baseCost * Math.pow(offer.costGrowth, owned));
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

/**
 * Vanilla (framework-agnostic) store.
 *
 * The React Native app binds to it through `useGameStore`; the web build drives
 * it straight from `subscribe()`. Keeping the game logic out of the React
 * binding means the whole core is testable in plain node and reusable by any
 * renderer.
 */
export const gameStore = createStore<GameState>()(
  persist(
    (set, get) => ({
      ...createInitialState(),
      hydrated: false,

      bonuses: () => crewBonuses(get().crew),
      availableChains: () => chainsOnBoard(get().grid),

      resetGame: () => {
        set({ ...createInitialState(), hydrated: true });
      },

      /**
       * Settles offline regeneration. Cheap to call - it writes only when the
       * settled value actually differs, so a 1 Hz UI tick does not thrash
       * subscribers or trigger a persist write every second.
       */
      refreshEnergy: () => {
        const state = get();
        const settled = settleEnergyState(
          state.energy,
          Date.now(),
          crewBonuses(state.crew).energyRegenMs,
        );
        if (settled.current !== state.energy.current || settled.lastTickAt !== state.energy.lastTickAt) {
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

        const bonuses = crewBonuses(state.crew);
        const wasFree = Math.random() < bonuses.freeTapChance;
        const energy = wasFree
          ? settleEnergyState(state.energy, Date.now(), bonuses.energyRegenMs)
          : spendEnergy(state.energy, generator.energyCost, Date.now(), bonuses.energyRegenMs);
        if (energy === null) return { ok: false, reason: 'no-energy' };

        const output = rollGeneratorOutput(getGeneratorTable(cell.item.itemType, cell.item.level));
        if (output === null) return { ok: false, reason: 'not-a-generator' };

        // The carpenter's perk bumps the roll one level, never past the chain.
        const lucky = Math.random() < bonuses.luckySpawnChance;
        const level = lucky
          ? Math.min(getItemTree(output.produces).maxLevel, output.level + 1)
          : output.level;

        const spawned = createItem(state.nextItemSeq, output.produces, level, true);

        set({
          grid: withCells(state.grid, [{ index: target, item: spawned }]),
          energy,
          nextItemSeq: state.nextItemSeq + 1,
        });

        return { ok: true, item: spawned, at: target, wasFree };
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

        const bonuses = crewBonuses(state.crew);
        const grid = consumeTaskItems(state.grid, task);
        const { player, levelsGained } = applyXp(state.player, task.reward.xp);

        // Deliveries credit the room being worked on, not the one the card was
        // issued for: rooms can be finished in between, and a delivery should
        // never fall on the floor.
        const room = currentRoom(state.restorations);
        const restorations =
          room === null
            ? state.restorations
            : state.restorations.map((candidate) =>
                candidate.id === room.id
                  ? {
                      ...candidate,
                      progress: Math.min(candidate.requiredDeliveries, candidate.progress + 1),
                    }
                  : candidate,
              );

        const replacement = generateTask({
          playerLevel: player.level,
          seq: state.nextTaskSeq,
          availableTypes: chainsOnBoard(grid),
          restoreTargetId: currentRoom(restorations)?.id ?? null,
        });
        const activeTasks = state.activeTasks.map((candidate) =>
          candidate.id === taskId ? replacement : candidate,
        );

        set({
          grid,
          activeTasks,
          restorations,
          nextTaskSeq: state.nextTaskSeq + 1,
          wallet: {
            coins: state.wallet.coins + Math.round(task.reward.coins * bonuses.taskCoinMultiplier),
            gems: state.wallet.gems + task.reward.gems,
          },
          player: { ...player, tasksCompleted: player.tasksCompleted + 1 },
          energy:
            levelsGained > 0
              ? grantEnergy(
                  state.energy,
                  levelsGained * ENERGY_PER_LEVEL_UP,
                  Date.now(),
                  bonuses.energyRegenMs,
                )
              : settleEnergyState(state.energy, Date.now(), bonuses.energyRegenMs),
        });
        return true;
      },

      refillEnergyWithGems: () => {
        const state = get();
        if (state.wallet.gems < ENERGY_REFILL_GEM_COST) return false;
        const settled = settleEnergyState(state.energy, Date.now(), crewBonuses(state.crew).energyRegenMs);
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
          set({
            energy: grantEnergy(
              state.energy,
              ENERGY_PER_REWARDED_AD,
              Date.now(),
              crewBonuses(state.crew).energyRegenMs,
            ),
          });
          return;
        }
        set({ wallet: { ...state.wallet, gems: state.wallet.gems + GEMS_PER_REWARDED_AD } });
      },

      // -- progression purchases -------------------------------------------

      hireCrew: (id) => {
        const state = get();
        const member = state.crew.find((candidate) => candidate.id === id);
        if (member === undefined || member.hired) return { ok: false, reason: 'unavailable' };

        const definition = getCrewDefinition(id);
        if (state.wallet.coins < definition.hireCost) return { ok: false, reason: 'unaffordable' };

        set({
          wallet: { ...state.wallet, coins: state.wallet.coins - definition.hireCost },
          crew: state.crew.map((candidate) =>
            candidate.id === id ? { ...candidate, hired: true, level: 1 } : candidate,
          ),
        });
        return { ok: true, spent: definition.hireCost };
      },

      upgradeCrew: (id) => {
        const state = get();
        const member = state.crew.find((candidate) => candidate.id === id);
        if (member === undefined || !member.hired) return { ok: false, reason: 'unavailable' };

        const definition = getCrewDefinition(id);
        const cost = upgradeCost(definition, member.level);
        if (cost === null) return { ok: false, reason: 'unavailable' };
        if (state.wallet.coins < cost) return { ok: false, reason: 'unaffordable' };

        set({
          wallet: { ...state.wallet, coins: state.wallet.coins - cost },
          crew: state.crew.map((candidate) =>
            candidate.id === id ? { ...candidate, level: candidate.level + 1 } : candidate,
          ),
        });
        return { ok: true, spent: cost };
      },

      buyGenerator: (itemType) => {
        const state = get();
        const offer = SHOP_OFFERS.find((candidate) => candidate.itemType === itemType);
        if (offer === undefined) return { ok: false, reason: 'unavailable' };
        if (state.player.level < offer.requiresPlayerLevel) return { ok: false, reason: 'unavailable' };

        const price = generatorPrice(state.shop, itemType);
        if (price === null) return { ok: false, reason: 'unavailable' };
        if (state.wallet.coins < price) return { ok: false, reason: 'unaffordable' };

        const target = findNearestEmptyCell(state.grid, 0);
        if (target < 0) return { ok: false, reason: 'no-room' };

        set({
          wallet: { ...state.wallet, coins: state.wallet.coins - price },
          grid: withCells(state.grid, [
            { index: target, item: createItem(state.nextItemSeq, itemType, 1, true) },
          ]),
          nextItemSeq: state.nextItemSeq + 1,
          shop: state.shop.map((entry) =>
            entry.itemType === itemType ? { ...entry, purchased: entry.purchased + 1 } : entry,
          ),
        });
        return { ok: true, spent: price };
      },

      unlockRow: (row) => {
        const state = get();
        const expansion = BOARD_EXPANSIONS.find((candidate) => candidate.row === row);
        if (expansion === undefined) return { ok: false, reason: 'unavailable' };
        // Rows unlock in order, so the cheap one is always the next purchase.
        if (row !== state.unlockedRows + 1) return { ok: false, reason: 'unavailable' };
        if (state.wallet.coins < expansion.cost) return { ok: false, reason: 'unaffordable' };

        set({
          wallet: { ...state.wallet, coins: state.wallet.coins - expansion.cost },
          unlockedRows: row,
          grid: withUnlockedRows(state.grid, row),
        });
        return { ok: true, spent: expansion.cost };
      },

      restoreRoom: (roomId) => {
        const state = get();
        const room = state.restorations.find((candidate) => candidate.id === roomId);
        if (room === undefined || room.restored) return { ok: false, reason: 'unavailable' };
        if (room.progress < room.requiredDeliveries) return { ok: false, reason: 'unavailable' };
        if (state.wallet.coins < room.coinCost) return { ok: false, reason: 'unaffordable' };

        const restorations = state.restorations.map((candidate) =>
          candidate.id === roomId ? { ...candidate, restored: true } : candidate,
        );
        const nextRoomId = currentRoom(restorations)?.id ?? null;

        set({
          wallet: { ...state.wallet, coins: state.wallet.coins - room.coinCost },
          restorations,
          // Point the open cards at the new room so the story stays coherent.
          activeTasks: state.activeTasks.map((task) => ({ ...task, restoreTargetId: nextRoomId })),
        });
        return { ok: true, spent: room.coinCost };
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
        crew: state.crew,
        shop: state.shop,
        unlockedRows: state.unlockedRows,
        nextItemSeq: state.nextItemSeq,
        nextTaskSeq: state.nextTaskSeq,
      }),
      // v1 saves predate the crew, shop and staged rooms. Rather than guess at
      // an equivalent v1 economy, start those systems fresh and keep the board.
      migrate: (persisted, version) => {
        const state = persisted as Partial<GameState> | undefined;
        if (state === undefined) return undefined as never;
        if (version >= SAVE_SCHEMA_VERSION) return state as GameState;
        return {
          ...state,
          crew: createCrew(),
          shop: createInitialShop(),
          unlockedRows: STARTING_ROWS,
          restorations: createHouse(),
        } as GameState;
      },
      onRehydrateStorage: () => (state, error) => {
        if (error !== undefined || state === undefined) {
          // Corrupt save: start clean rather than booting into a broken board.
          gameStore.setState({ ...createInitialState(), hydrated: true });
          return;
        }
        // A save from an older/edited build could carry a wrong-sized board.
        if (!isGridShapeValid(state.grid)) {
          gameStore.setState({ ...createInitialState(), hydrated: true });
          return;
        }
        gameStore.setState({
          // Keep lock flags consistent with the purchased row count.
          grid: withUnlockedRows(state.grid, state.unlockedRows),
          energy: settleEnergyState(state.energy, Date.now(), crewBonuses(state.crew).energyRegenMs),
          hydrated: true,
        });
      },
    },
  ),
);

// ---------------------------------------------------------------------------
// Selectors
//
// Always subscribe through a narrow selector: `useGameStore((s) => s.energy)`
// re-renders the energy bar only when energy changes, while
// `useGameStore((s) => s)` would re-render it on every merge.
// ---------------------------------------------------------------------------

export const selectGrid = (state: GameState): GridState => state.grid;
export const selectEnergy = (state: GameState): EnergyState => state.energy;
export const selectWallet = (state: GameState): Wallet => state.wallet;
export const selectPlayer = (state: GameState): PlayerState => state.player;
export const selectActiveTasks = (state: GameState): Task[] => state.activeTasks;
export const selectCrew = (state: GameState): CrewMemberState[] => state.crew;
export const selectRestorations = (state: GameState): RestorationTarget[] => state.restorations;
export const selectHydrated = (state: GameState): boolean => state.hydrated;

/** Per-cell selector so `TileItem` re-renders only when its own cell changes. */
export const selectCell =
  (index: CellIndex) =>
  (state: GameState): Item | null =>
    state.grid.cells[index]?.item ?? null;

export { CREW, SHOP_OFFERS, BOARD_EXPANSIONS, getGeneratorChains };
