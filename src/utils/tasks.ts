import {
  getItemTree,
  getItemName,
  getItemValue,
  getMaxLevel,
  isGeneratorType,
  ITEM_TYPES,
} from '../constants/itemTrees';
import type {
  GridState,
  ItemLevel,
  ItemType,
  Task,
  TaskRequirement,
  TaskReward,
} from '../types/game';
import { countItems, findItems, withCells } from './grid';

/**
 * Chains any generator in the game can feed. Used as the fallback pool; the
 * live pool comes from the generators actually on the player's board, so a task
 * is never issued for a chain they have no way to make.
 */
const ALL_PRODUCIBLE_TYPES: readonly ItemType[] = [
  ...new Set(
    ITEM_TYPES.flatMap((type) =>
      (getItemTree(type).generator?.tables ?? []).flatMap((table) =>
        table.map((output) => output.produces),
      ),
    ),
  ),
].filter((type) => !isGeneratorType(type));

/**
 * Reward math.
 *
 * Payout = sum(item value) * TASK_REWARD_MARGIN. Because item value grows at
 * 2.35x per level while the energy cost of a level-n item grows at 2x (2^(n-1)
 * generator taps), a margin slightly above 1 keeps every task profitable in
 * energy terms while still forcing the player to spend most of a board to
 * finish one. That gap is the pressure that sells energy refills.
 */
const TASK_REWARD_MARGIN = 1.15;
/** Gems are rare on purpose: roughly every 4th task pays 1-2. */
const GEM_DROP_EVERY = 4;

export interface TaskGenerationOptions {
  /** Higher player level -> higher requested item levels. */
  readonly playerLevel: number;
  /** Monotonic counter used for the task id and the gem cadence. */
  readonly seq: number;
  /** Chains the player can currently produce. Defaults to every chain. */
  readonly availableTypes?: readonly ItemType[];
  /** Injectable RNG so tests are deterministic. */
  readonly random?: () => number;
  readonly restoreTargetId?: string | null;
}

export function computeTaskReward(
  requirements: readonly TaskRequirement[],
  seq: number,
): TaskReward {
  let coins = 0;
  let xp = 0;
  for (const req of requirements) {
    const value = getItemValue(req.itemType, req.level) * req.count;
    coins += value;
    xp += Math.max(1, Math.round(value / 2));
  }
  return {
    coins: Math.max(10, Math.round(coins * TASK_REWARD_MARGIN)),
    gems: seq % GEM_DROP_EVERY === 0 ? 1 + (seq % 2) : 0,
    xp: Math.max(5, xp),
  };
}

/**
 * Builds one task card. Requested levels sit just below what the player can
 * comfortably reach, so a card is always 1-2 merges away from done - the
 * "almost there" state that keeps sessions going.
 */
export function generateTask(options: TaskGenerationOptions): Task {
  const { playerLevel, seq, restoreTargetId = null } = options;
  const random = options.random ?? Math.random;
  const pool =
    options.availableTypes !== undefined && options.availableTypes.length > 0
      ? options.availableTypes.filter((type) => !isGeneratorType(type))
      : ALL_PRODUCIBLE_TYPES;
  const types = pool.length > 0 ? pool : ALL_PRODUCIBLE_TYPES;

  // Two-line requests start at player level 4 and become the norm by level 10.
  const twoLineChance = Math.min(0.65, Math.max(0, (playerLevel - 3) * 0.09));
  const lineCount = types.length > 1 && random() < twoLineChance ? 2 : 1;
  const requirements: TaskRequirement[] = [];

  for (let i = 0; i < lineCount; i += 1) {
    const itemType = pickType(random, requirements, types);
    const cap = getMaxLevel(itemType);
    // Requested level climbs one step every three player levels. Each step
    // doubles the taps needed, so this is the single strongest difficulty dial
    // in the game - three is deliberately slower than it looks.
    const ramp = 2 + Math.floor((playerLevel - 1) / 3);
    const target = Math.min(cap, ramp + (random() < 0.28 ? 1 : 0));
    const level: ItemLevel = Math.max(1, target);
    // Low-level lines ask for several; deep lines never do - two level-6 parts
    // would be a wall, not a request.
    const count = level <= 2 ? 2 + (random() < 0.4 ? 1 : 0) : level <= 3 ? 2 : 1;
    requirements.push({ itemType, level, count });
  }

  return {
    id: `task_${seq}`,
    title: buildTitle(requirements),
    requirements,
    reward: computeTaskReward(requirements, seq),
    status: 'active',
    restoreTargetId,
  };
}

function pickType(
  random: () => number,
  taken: readonly TaskRequirement[],
  types: readonly ItemType[],
): ItemType {
  const fresh = types.filter((type) => !taken.some((req) => req.itemType === type));
  const source = fresh.length > 0 ? fresh : types;
  const index = Math.min(source.length - 1, Math.floor(random() * source.length));
  return source[index] ?? 'nail';
}

function buildTitle(requirements: readonly TaskRequirement[]): string {
  return requirements
    .map((req) => `${req.count}x ${getItemName(req.itemType, req.level)}`)
    .join(' + ');
}

/** Per-line progress for the task card UI. */
export interface TaskProgressLine extends TaskRequirement {
  readonly owned: number;
  readonly satisfied: boolean;
}

export function getTaskProgress(grid: GridState, task: Task): TaskProgressLine[] {
  return task.requirements.map((req) => {
    const owned = countItems(grid, req.itemType, req.level);
    return { ...req, owned, satisfied: owned >= req.count };
  });
}

export function canDeliverTask(grid: GridState, task: Task): boolean {
  return task.requirements.every((req) => countItems(grid, req.itemType, req.level) >= req.count);
}

/**
 * Removes the items a task consumes. Returns the original grid unchanged when
 * the requirements are not met, so callers can treat `grid === input` as "no-op".
 */
export function consumeTaskItems(grid: GridState, task: Task): GridState {
  if (!canDeliverTask(grid, task)) return grid;

  const updates: Array<{ index: number; item: null }> = [];
  for (const req of task.requirements) {
    for (const index of findItems(grid, req.itemType, req.level, req.count)) {
      updates.push({ index, item: null });
    }
  }
  return withCells(grid, updates);
}
