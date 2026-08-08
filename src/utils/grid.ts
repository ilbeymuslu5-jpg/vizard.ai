import { GRID_CELL_COUNT, GRID_COLS, GRID_ROWS } from '../constants/gameConfig';
import type {
  CellIndex,
  GridCell,
  GridCoord,
  GridState,
  Item,
  ItemId,
  ItemLevel,
  ItemType,
} from '../types/game';

/** Builds an empty 5x6 board. */
export function createEmptyGrid(rows: number = GRID_ROWS, cols: number = GRID_COLS): GridState {
  const cells: GridCell[] = new Array<GridCell>(rows * cols);
  for (let index = 0; index < rows * cols; index += 1) {
    cells[index] = { index, item: null, locked: false };
  }
  return { rows, cols, cells };
}

export function indexToCoord(index: CellIndex, cols: number = GRID_COLS): GridCoord {
  return { row: Math.floor(index / cols), col: index % cols };
}

export function coordToIndex(coord: GridCoord, cols: number = GRID_COLS): CellIndex {
  return coord.row * cols + coord.col;
}

export function isValidIndex(grid: GridState, index: CellIndex): boolean {
  return Number.isInteger(index) && index >= 0 && index < grid.cells.length;
}

export function getCell(grid: GridState, index: CellIndex): GridCell | null {
  return isValidIndex(grid, index) ? (grid.cells[index] ?? null) : null;
}

/** Sequential ids keep saves diff-able and avoid pulling in a uuid dependency. */
export function makeItemId(seq: number): ItemId {
  return `itm_${seq}`;
}

export function createItem(
  seq: number,
  itemType: ItemType,
  level: ItemLevel,
  isNew = false,
): Item {
  return { id: makeItemId(seq), itemType, level, isNew };
}

/**
 * Replaces the items at the given indices in one pass.
 *
 * Only the touched cells get new object identities; every other cell keeps its
 * reference. That is what lets `TileItem` be a `React.memo` component that
 * re-renders 2 tiles per merge instead of all 30.
 */
export function withCells(
  grid: GridState,
  updates: ReadonlyArray<{ index: CellIndex; item: Item | null }>,
): GridState {
  if (updates.length === 0) return grid;
  const cells = grid.cells.slice();
  for (const { index, item } of updates) {
    const cell = cells[index];
    if (cell === undefined) continue;
    cells[index] = { index: cell.index, item, locked: cell.locked };
  }
  return { rows: grid.rows, cols: grid.cols, cells };
}

/** First usable empty cell, or -1 when the board is full. */
export function findFirstEmptyCell(grid: GridState): CellIndex {
  for (const cell of grid.cells) {
    if (!cell.locked && cell.item === null) return cell.index;
  }
  return -1;
}

/**
 * Empty cell nearest to `origin` (Chebyshev distance), so generated items land
 * next to the generator that produced them instead of at the top-left corner.
 */
export function findNearestEmptyCell(grid: GridState, origin: CellIndex): CellIndex {
  const from = indexToCoord(origin, grid.cols);
  let best: CellIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const cell of grid.cells) {
    if (cell.locked || cell.item !== null) continue;
    const to = indexToCoord(cell.index, grid.cols);
    const distance = Math.max(Math.abs(to.row - from.row), Math.abs(to.col - from.col));
    if (distance < bestDistance) {
      best = cell.index;
      bestDistance = distance;
    }
  }
  return best;
}

export function countEmptyCells(grid: GridState): number {
  let count = 0;
  for (const cell of grid.cells) {
    if (!cell.locked && cell.item === null) count += 1;
  }
  return count;
}

export function isBoardFull(grid: GridState): boolean {
  return countEmptyCells(grid) === 0;
}

/** How many items of exactly this type+level sit on the board (task progress). */
export function countItems(grid: GridState, itemType: ItemType, level: ItemLevel): number {
  let count = 0;
  for (const cell of grid.cells) {
    if (cell.item !== null && cell.item.itemType === itemType && cell.item.level === level) {
      count += 1;
    }
  }
  return count;
}

/** Indices of up to `count` matching items - used when a task consumes items. */
export function findItems(
  grid: GridState,
  itemType: ItemType,
  level: ItemLevel,
  count: number,
): CellIndex[] {
  const found: CellIndex[] = [];
  for (const cell of grid.cells) {
    if (found.length >= count) break;
    if (cell.item !== null && cell.item.itemType === itemType && cell.item.level === level) {
      found.push(cell.index);
    }
  }
  return found;
}

/** Sanity check for loaded saves: a truncated board would crash the renderer. */
export function isGridShapeValid(grid: GridState): boolean {
  return (
    grid.rows > 0 &&
    grid.cols > 0 &&
    grid.cells.length === grid.rows * grid.cols &&
    grid.cells.length === GRID_CELL_COUNT
  );
}
