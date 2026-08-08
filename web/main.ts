/**
 * Web renderer for the Merge & Restore core.
 *
 * This file owns *no* game rules: every decision comes from `src/store` and
 * `src/utils`, the exact modules the React Native build uses. It is a thin
 * view layer, which is also what keeps the prototype honest - if a merge feels
 * wrong here, the bug is in the shared core, not in a web-only copy of it.
 */

import { ENERGY_PER_REWARDED_AD, ENERGY_REFILL_GEM_COST } from '../src/constants/gameConfig';
import { getItemName, isGeneratorType } from '../src/constants/itemTrees';
import { gameStore, type GameState, type TapFailureReason } from '../src/store/gameStore';
import type { CellIndex, Item, MergeRejectReason } from '../src/types/game';
import { formatDuration, msUntilFull } from '../src/utils/energy';
import { canDeliverTask, getTaskProgress } from '../src/utils/tasks';
import { emblemSvg } from './icons';

// ---------------------------------------------------------------------------
// DOM handles
// ---------------------------------------------------------------------------

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`Missing #${id}`);
  return node as T;
}

const dom = {
  board: el<HTMLDivElement>('board'),
  tasks: el<HTMLDivElement>('tasks'),
  coins: el('coins'),
  gems: el('gems'),
  energyNow: el('energyNow'),
  energyMax: el('energyMax'),
  energyNext: el('energyNext'),
  energyFill: el<HTMLDivElement>('energyFill'),
  progress: el('progress'),
  taskCount: el('taskCount'),
  toast: el<HTMLDivElement>('toast'),
  scrim: el<HTMLDivElement>('scrim'),
  rooms: el<HTMLDivElement>('rooms'),
  btnAd: el<HTMLButtonElement>('btnAd'),
  btnRefill: el<HTMLButtonElement>('btnRefill'),
  btnRooms: el<HTMLButtonElement>('btnRooms'),
  btnReset: el<HTMLButtonElement>('btnReset'),
  btnCloseRooms: el<HTMLButtonElement>('btnCloseRooms'),
};

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

let toastTimer = 0;
type ToastTone = 'good' | 'bad' | 'plain';

function toast(message: string, tone: ToastTone = 'plain'): void {
  dom.toast.textContent = message;
  dom.toast.classList.remove('is-good', 'is-bad');
  if (tone !== 'plain') dom.toast.classList.add(tone === 'good' ? 'is-good' : 'is-bad');
  dom.toast.classList.add('is-up');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => dom.toast.classList.remove('is-up'), 1900);
}

/** Player-facing copy: says what happened and what to do about it. */
const TAP_MESSAGES: Readonly<Record<TapFailureReason, string>> = {
  'no-energy': 'Out of energy — watch an ad or wait for it to refill.',
  'board-full': 'Board is full — merge or deliver something first.',
  'not-a-generator': 'Only generators make new parts. Try the glowing ones.',
  'empty-cell': 'Nothing here yet.',
  'out-of-bounds': 'Nothing here yet.',
};

const DROP_MESSAGES: Readonly<Record<MergeRejectReason, string>> = {
  'max-level': 'Already at the top of its chain.',
  'locked-cell': 'That space is still locked.',
  'empty-source': 'Nothing to drag there.',
  'out-of-bounds': 'Drop it on the board.',
  'same-cell': '',
};

// ---------------------------------------------------------------------------
// Board rendering
//
// Cell nodes are created once and reused; each render only touches cells whose
// item identity changed. That mirrors the memoisation strategy the React Native
// build uses, and keeps a merge at 2 DOM writes instead of 30.
// ---------------------------------------------------------------------------

const cellNodes: HTMLButtonElement[] = [];
const renderedItemIds: Array<string | null> = [];

function tileColor(level: number): string {
  return `var(--tile-${Math.min(10, Math.max(1, level))})`;
}

function buildTile(item: Item, animation: 'pop' | 'spawn' | null): HTMLDivElement {
  const tile = document.createElement('div');
  tile.className = 'tile';
  if (isGeneratorType(item.itemType)) tile.classList.add('is-gen');
  if (animation !== null) tile.classList.add(`anim-${animation}`);
  tile.style.color = tileColor(item.level);
  tile.dataset['level'] = String(item.level);
  tile.dataset['itemId'] = item.id;
  tile.innerHTML = emblemSvg(item.itemType, 32);
  tile.setAttribute(
    'aria-label',
    `${getItemName(item.itemType, item.level)}, level ${item.level}${
      isGeneratorType(item.itemType) ? ', generator' : ''
    }`,
  );
  return tile;
}

function buildBoard(state: GameState): void {
  dom.board.textContent = '';
  cellNodes.length = 0;
  renderedItemIds.length = 0;

  state.grid.cells.forEach((cell) => {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'cell';
    node.dataset['index'] = String(cell.index);
    node.setAttribute('aria-label', `Cell ${cell.index + 1}`);
    dom.board.appendChild(node);
    cellNodes.push(node);
    renderedItemIds.push(null);
  });
}

/** Cells that should pop on the next paint (merge results, fresh spawns). */
const pendingAnimation = new Map<CellIndex, 'pop' | 'spawn'>();

function renderBoard(state: GameState): void {
  state.grid.cells.forEach((cell, index) => {
    const node = cellNodes[index];
    if (node === undefined) return;

    const itemId = cell.item?.id ?? null;
    const animation = pendingAnimation.get(index) ?? null;
    if (itemId === renderedItemIds[index] && animation === null) return;

    node.textContent = '';
    if (cell.item !== null) node.appendChild(buildTile(cell.item, animation));
    renderedItemIds[index] = itemId;
  });
  pendingAnimation.clear();
}

// ---------------------------------------------------------------------------
// Tasks / HUD
// ---------------------------------------------------------------------------

function renderTasks(state: GameState): void {
  dom.tasks.textContent = '';

  state.activeTasks.forEach((task) => {
    const ready = canDeliverTask(state.grid, task);
    const card = document.createElement('article');
    card.className = `task${ready ? ' is-ready' : ''}`;

    const left = document.createElement('div');
    const lines = document.createElement('div');
    lines.className = 'task__lines';

    getTaskProgress(state.grid, task).forEach((line) => {
      const chip = document.createElement('span');
      chip.className = `req${line.satisfied ? ' is-met' : ''}`;
      chip.innerHTML = `${emblemSvg(line.itemType, 16)}<span>${getItemName(
        line.itemType,
        line.level,
      )} · ${Math.min(line.owned, line.count)}/${line.count}</span>`;
      lines.appendChild(chip);
    });

    const reward = document.createElement('div');
    reward.className = 'task__reward';
    reward.innerHTML = `Pays <b>${task.reward.coins} coins</b>${
      task.reward.gems > 0 ? ` · <i>${task.reward.gems} gems</i>` : ''
    } · ${task.reward.xp} xp`;

    left.append(lines, reward);

    const deliver = document.createElement('button');
    deliver.type = 'button';
    deliver.className = `btn${ready ? ' btn--go' : ''}`;
    deliver.textContent = 'Deliver';
    deliver.disabled = !ready;
    deliver.addEventListener('click', () => {
      const coinsBefore = gameStore.getState().wallet.coins;
      if (gameStore.getState().deliverTask(task.id)) {
        const gained = gameStore.getState().wallet.coins - coinsBefore;
        toast(`Delivered — +${gained} coins`, 'good');
      }
    });

    card.append(left, deliver);
    dom.tasks.appendChild(card);
  });

  const ready = state.activeTasks.filter((task) => canDeliverTask(state.grid, task)).length;
  dom.taskCount.textContent = ready > 0 ? `${ready} ready` : `${state.activeTasks.length} open`;
}

function renderHud(state: GameState): void {
  dom.coins.textContent = String(state.wallet.coins);
  dom.gems.textContent = String(state.wallet.gems);
  dom.energyNow.textContent = String(state.energy.current);
  dom.energyMax.textContent = String(state.energy.max);
  dom.energyFill.style.width = `${(state.energy.current / state.energy.max) * 100}%`;

  const remaining = msUntilFull(state.energy);
  dom.energyNext.textContent = remaining === 0 ? 'full' : `full in ${formatDuration(remaining)}`;

  const restored = state.restorations.filter((room) => room.restored).length;
  dom.progress.textContent = `${restored} of ${state.restorations.length} restored`;

  dom.btnRefill.disabled =
    state.wallet.gems < ENERGY_REFILL_GEM_COST || state.energy.current >= state.energy.max;
  dom.btnAd.textContent = `Watch ad · +${ENERGY_PER_REWARDED_AD} energy`;
  dom.btnRefill.textContent = `Refill · ${ENERGY_REFILL_GEM_COST} gems`;
}

function renderRooms(state: GameState): void {
  dom.rooms.textContent = '';
  state.restorations.forEach((room) => {
    const row = document.createElement('div');
    row.className = `room${room.restored ? ' is-done' : ''}`;
    row.innerHTML = `<span>${room.name}</span><span class="room__state">${
      room.restored ? 'Restored' : room.coinCost > 0 ? `${room.coinCost} coins` : 'In progress'
    }</span>`;
    dom.rooms.appendChild(row);
  });
}

let lastGrid: GameState['grid'] | null = null;

function render(state: GameState): void {
  if (state.grid !== lastGrid) {
    renderBoard(state);
    renderTasks(state);
    lastGrid = state.grid;
  }
  renderHud(state);
  if (dom.scrim.classList.contains('is-open')) renderRooms(state);
}

// ---------------------------------------------------------------------------
// Input: tap to generate, drag to merge
// ---------------------------------------------------------------------------

interface DragSession {
  readonly pointerId: number;
  readonly from: CellIndex;
  readonly startX: number;
  readonly startY: number;
  readonly startedAt: number;
  ghost: HTMLDivElement | null;
  hoverIndex: CellIndex | null;
}

let drag: DragSession | null = null;
const DRAG_THRESHOLD_PX = 8;

function cellIndexFromPoint(x: number, y: number): CellIndex | null {
  const node = document.elementFromPoint(x, y);
  const cell = node?.closest<HTMLElement>('.cell');
  if (cell === null || cell === undefined) return null;
  const raw = cell.dataset['index'];
  return raw === undefined ? null : Number.parseInt(raw, 10);
}

function makeGhost(item: Item, x: number, y: number): HTMLDivElement {
  const ghost = document.createElement('div');
  ghost.className = 'ghost';
  ghost.style.color = tileColor(item.level);
  ghost.style.left = `${x}px`;
  ghost.style.top = `${y}px`;
  ghost.innerHTML = emblemSvg(item.itemType, 32);
  document.body.appendChild(ghost);
  return ghost;
}

function clearHover(): void {
  cellNodes.forEach((node) => node.classList.remove('is-target'));
}

dom.board.addEventListener('pointerdown', (event: PointerEvent) => {
  const target = event.target as HTMLElement | null;
  const cell = target?.closest<HTMLElement>('.cell');
  if (cell === null || cell === undefined) return;
  const raw = cell.dataset['index'];
  if (raw === undefined) return;

  const from = Number.parseInt(raw, 10);
  if (gameStore.getState().grid.cells[from]?.item == null) return;

  drag = {
    pointerId: event.pointerId,
    from,
    startX: event.clientX,
    startY: event.clientY,
    startedAt: performance.now(),
    ghost: null,
    hoverIndex: null,
  };
  dom.board.setPointerCapture(event.pointerId);
});

dom.board.addEventListener('pointermove', (event: PointerEvent) => {
  if (drag === null || event.pointerId !== drag.pointerId) return;

  const moved = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
  if (drag.ghost === null) {
    if (moved < DRAG_THRESHOLD_PX) return;
    const item = gameStore.getState().grid.cells[drag.from]?.item;
    if (item == null) return;
    drag.ghost = makeGhost(item, event.clientX, event.clientY);
    cellNodes[drag.from]?.classList.add('is-source');
  }

  drag.ghost.style.left = `${event.clientX}px`;
  drag.ghost.style.top = `${event.clientY}px`;

  const over = cellIndexFromPoint(event.clientX, event.clientY);
  if (over !== drag.hoverIndex) {
    clearHover();
    if (over !== null && over !== drag.from) cellNodes[over]?.classList.add('is-target');
    drag.hoverIndex = over;
  }
});

function endDrag(event: PointerEvent): void {
  if (drag === null || event.pointerId !== drag.pointerId) return;
  const session = drag;
  drag = null;

  session.ghost?.remove();
  clearHover();
  cellNodes[session.from]?.classList.remove('is-source');

  const store = gameStore.getState();

  // No ghost means the pointer never travelled: treat it as a tap.
  if (session.ghost === null) {
    const result = store.tapGenerator(session.from);
    if (result.ok) pendingAnimation.set(result.at, 'spawn');
    else if (TAP_MESSAGES[result.reason] !== '') toast(TAP_MESSAGES[result.reason], 'bad');
    render(gameStore.getState());
    return;
  }

  const to = cellIndexFromPoint(event.clientX, event.clientY);
  if (to === null) {
    render(gameStore.getState());
    return;
  }

  const outcome = store.dropItem(session.from, to);
  if (outcome.kind === 'merged') {
    pendingAnimation.set(outcome.at, 'pop');
  } else if (outcome.kind === 'rejected' && DROP_MESSAGES[outcome.reason] !== '') {
    toast(DROP_MESSAGES[outcome.reason], 'bad');
  }
  render(gameStore.getState());
}

dom.board.addEventListener('pointerup', endDrag);
dom.board.addEventListener('pointercancel', endDrag);

// Keyboard path: focus a generator cell and press Enter/Space to produce.
dom.board.addEventListener('keydown', (event: KeyboardEvent) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const cell = (event.target as HTMLElement | null)?.closest<HTMLElement>('.cell');
  const raw = cell?.dataset['index'];
  if (raw === undefined) return;
  event.preventDefault();

  const result = gameStore.getState().tapGenerator(Number.parseInt(raw, 10));
  if (result.ok) pendingAnimation.set(result.at, 'spawn');
  else toast(TAP_MESSAGES[result.reason], 'bad');
  render(gameStore.getState());
});

// ---------------------------------------------------------------------------
// Action bar
// ---------------------------------------------------------------------------

dom.btnAd.addEventListener('click', () => {
  // Stands in for the AdMob rewarded-ad callback; the store call is identical.
  gameStore.getState().claimRewardedAd('energy');
  toast(`+${ENERGY_PER_REWARDED_AD} energy`, 'good');
});

dom.btnRefill.addEventListener('click', () => {
  if (gameStore.getState().refillEnergyWithGems()) toast('Energy topped up', 'good');
  else toast('Not enough gems.', 'bad');
});

dom.btnRooms.addEventListener('click', () => {
  renderRooms(gameStore.getState());
  dom.scrim.classList.add('is-open');
});

function closeRooms(): void {
  dom.scrim.classList.remove('is-open');
}

dom.btnCloseRooms.addEventListener('click', closeRooms);
dom.scrim.addEventListener('click', (event) => {
  if (event.target === dom.scrim) closeRooms();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeRooms();
});

dom.btnReset.addEventListener('click', () => {
  gameStore.getState().resetGame();
  lastGrid = null;
  buildBoard(gameStore.getState());
  render(gameStore.getState());
  toast('Fresh workshop.', 'plain');
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

buildBoard(gameStore.getState());
render(gameStore.getState());

gameStore.subscribe((state) => render(state));

// One tick a second is enough for the countdown; `refreshEnergy` only writes
// when a point actually lands, so this does not thrash the store.
window.setInterval(() => {
  gameStore.getState().refreshEnergy();
  renderHud(gameStore.getState());
}, 1000);

// The persisted save arrives asynchronously; rebuild once it lands.
gameStore.persist.onFinishHydration(() => {
  lastGrid = null;
  buildBoard(gameStore.getState());
  render(gameStore.getState());
});
