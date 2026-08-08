import { getMaxLevel } from '../constants/itemTrees';
import type {
  CellIndex,
  GridState,
  Item,
  MergeOutcome,
  MergeRejectReason,
} from '../types/game';
import { createItem, getCell, isValidIndex, withCells } from './grid';

/** Two items merge when they share a chain and a level, and are not topped out. */
export function canMerge(a: Item | null, b: Item | null): boolean {
  if (a === null || b === null) return false;
  if (a.id === b.id) return false;
  if (a.itemType !== b.itemType) return false;
  if (a.level !== b.level) return false;
  return a.level < getMaxLevel(a.itemType);
}

export function isMaxLevel(item: Item): boolean {
  return item.level >= getMaxLevel(item.itemType);
}

/** Result of resolving a drag: the new board plus what the UI should animate. */
export interface DropResult {
  readonly grid: GridState;
  readonly outcome: MergeOutcome;
  /** Item ids consumed by a merge - the UI plays their "absorb" animation. */
  readonly consumedItemIds: readonly string[];
  /** Set when a merge happened, so the store can hand out XP / check tasks. */
  readonly mergedInto: Item | null;
  /** Incremented item-id counter; the caller must persist it. */
  readonly nextItemSeq: number;
}

/**
 * Resolves dropping the item at `from` onto `to`.
 *
 * Order of checks mirrors the genre convention:
 *   merge (same type+level)  ->  move (target empty)  ->  swap (anything else).
 * Swapping instead of rejecting is important for feel: a mis-drop should never
 * cost the player a tile position, and it doubles as free board organisation.
 *
 * Pure function - takes and returns plain state, no store access, so it is
 * trivially unit-testable and safe to call from a worklet/gesture handler.
 */
export function resolveDrop(
  grid: GridState,
  from: CellIndex,
  to: CellIndex,
  nextItemSeq: number,
): DropResult {
  const reject = (reason: MergeRejectReason): DropResult => ({
    grid,
    outcome: { kind: 'rejected', reason },
    consumedItemIds: [],
    mergedInto: null,
    nextItemSeq,
  });

  if (from === to) return reject('same-cell');
  if (!isValidIndex(grid, from) || !isValidIndex(grid, to)) return reject('out-of-bounds');

  const source = getCell(grid, from);
  const target = getCell(grid, to);
  if (source === null || target === null) return reject('out-of-bounds');
  if (source.item === null) return reject('empty-source');
  if (target.locked) return reject('locked-cell');

  // 1. Merge
  if (canMerge(source.item, target.item) && target.item !== null) {
    const merged = createItem(nextItemSeq, source.item.itemType, source.item.level + 1, true);
    return {
      grid: withCells(grid, [
        { index: from, item: null },
        { index: to, item: merged },
      ]),
      outcome: { kind: 'merged', resultItem: merged, at: to },
      consumedItemIds: [source.item.id, target.item.id],
      mergedInto: merged,
      nextItemSeq: nextItemSeq + 1,
    };
  }

  // Same type + level but already topped out: tell the UI why, don't shuffle.
  if (
    target.item !== null &&
    target.item.itemType === source.item.itemType &&
    target.item.level === source.item.level &&
    isMaxLevel(source.item)
  ) {
    return reject('max-level');
  }

  // 2. Move into an empty cell
  if (target.item === null) {
    return {
      grid: withCells(grid, [
        { index: from, item: null },
        { index: to, item: source.item },
      ]),
      outcome: { kind: 'moved', from, to },
      consumedItemIds: [],
      mergedInto: null,
      nextItemSeq,
    };
  }

  // 3. Swap
  return {
    grid: withCells(grid, [
      { index: from, item: target.item },
      { index: to, item: source.item },
    ]),
    outcome: { kind: 'swapped', from, to },
    consumedItemIds: [],
    mergedInto: null,
    nextItemSeq,
  };
}

/** True when at least one merge is available - drives the "no moves" hint. */
export function hasAvailableMerge(grid: GridState): boolean {
  const seen = new Map<string, number>();
  for (const cell of grid.cells) {
    if (cell.item === null || isMaxLevel(cell.item)) continue;
    const key = `${cell.item.itemType}:${cell.item.level}`;
    const count = (seen.get(key) ?? 0) + 1;
    if (count >= 2) return true;
    seen.set(key, count);
  }
  return false;
}
