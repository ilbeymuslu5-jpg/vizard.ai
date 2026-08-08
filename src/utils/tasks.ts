import { getItemName, getItemValue, getMaxLevel, isGeneratorType } from '../constants/itemTrees';
import type {
  GridState,
  ItemLevel,
  ItemType,
  Task,
  TaskRequirement,
  TaskReward,
} from '../types/game';
import { countItems, findItems, withCells } from './grid';

/** Chains a task can ask for: generators are never requested. */
const REQUESTABLE_TYPES: readonly ItemType[] = ['nail', 'plank', 'hammer', 'paint', 'flower'];

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

  const lineCount = playerLevel >= 5 && random() < 0.4 ? 2 : 1;
  const requirements: TaskRequirement[] = [];

  for (let i = 0; i < lineCount; i += 1) {
    const itemType = pickType(random, requirements);
    const cap = getMaxLevel(itemType);
    // Target level ramps with player level but never exceeds the chain cap.
    const target = Math.min(cap, 2 + Math.floor(playerLevel / 2) + (random() < 0.3 ? 1 : 0));
    const level: ItemLevel = Math.max(1, target);
    const count = level <= 2 && random() < 0.5 ? 2 : 1;
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

function pickType(random: () => number, taken: readonly TaskRequirement[]): ItemType {
  const pool = REQUESTABLE_TYPES.filter(
    (type) => !isGeneratorType(type) && !taken.some((req) => req.itemType === type),
  );
  const source = pool.length > 0 ? pool : REQUESTABLE_TYPES;
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
