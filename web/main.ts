/**
 * Web renderer for the Merge & Restore core.
 *
 * This file owns *no* game rules: every decision comes from `src/store` and
 * `src/utils`, the exact modules the React Native build uses. It is a thin view
 * layer, which is what keeps the prototype honest - if a merge or a price feels
 * wrong here, the bug is in the shared core, not in a web-only copy of it.
 */

import { BOARD_EXPANSIONS, CREW, SHOP_OFFERS } from '../src/constants/crew';
import { ENERGY_PER_REWARDED_AD, ENERGY_REFILL_GEM_COST } from '../src/constants/gameConfig';
import { getItemName, isGeneratorType } from '../src/constants/itemTrees';
import {
  gameStore,
  generatorPrice,
  type GameState,
  type PurchaseResult,
  type TapFailureReason,
} from '../src/store/gameStore';
import type { CellIndex, Item, MergeRejectReason } from '../src/types/game';
import { crewBonuses, describePerk, isPerkCapped, upgradeCost } from '../src/utils/crew';
import { formatDuration, msUntilFull } from '../src/utils/energy';
import { canDeliverTask, getTaskProgress } from '../src/utils/tasks';
import { houseSceneSvg } from './houseScene';
import { CHAIN_COLORS, emblemSvg } from './icons';
import { portraitSvg } from './portraits';
import { Music, speakerIcon } from './audio';
import { Board3D } from './three/board3d';
import { House3D } from './three/house3d';

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
  stage: el<HTMLDivElement>('stage'),
  boardwrap: el<HTMLDivElement>('boardwrap'),
  tasks: el<HTMLDivElement>('tasks'),
  crew: el<HTMLDivElement>('crew'),
  crewCount: el('crewCount'),
  rooms: el<HTMLDivElement>('rooms'),
  houseCount: el('houseCount'),
  scene: el<HTMLDivElement>('scene'),
  sceneCaption: el<HTMLParagraphElement>('sceneCaption'),
  shopOffers: el<HTMLDivElement>('shopOffers'),
  expansions: el<HTMLDivElement>('expansions'),
  coins: el('coins'),
  gems: el('gems'),
  playerLevel: el('playerLevel'),
  xpArc: document.getElementById('xpArc') as unknown as SVGCircleElement,
  energyNow: el('energyNow'),
  energyMax: el('energyMax'),
  energyNext: el('energyNext'),
  energyFill: el<HTMLDivElement>('energyFill'),
  progress: el('progress'),
  taskCount: el('taskCount'),
  toast: el<HTMLDivElement>('toast'),
  btnAd: el<HTMLButtonElement>('btnAd'),
  btnRefill: el<HTMLButtonElement>('btnRefill'),
  btnReset: el<HTMLButtonElement>('btnReset'),
  btnMusic: el<HTMLButtonElement>('btnMusic'),
  bgm: el<HTMLAudioElement>('bgm'),
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
  toastTimer = window.setTimeout(() => dom.toast.classList.remove('is-up'), 2100);
}

/** Player-facing copy: says what happened and what to do about it. */
const TAP_MESSAGES: Readonly<Record<TapFailureReason, string>> = {
  'no-energy': 'Out of energy — watch an ad or come back later.',
  'board-full': 'Board is full — merge or deliver something first.',
  'not-a-generator': 'Only generators make parts. Tap a glowing one.',
  'empty-cell': 'Nothing here yet.',
  'out-of-bounds': 'Nothing here yet.',
};

const DROP_MESSAGES: Readonly<Record<MergeRejectReason, string>> = {
  'max-level': 'Already at the top of its chain.',
  'locked-cell': 'That row is locked — buy it in the shop.',
  'empty-source': 'Nothing to drag there.',
  'out-of-bounds': 'Drop it on the board.',
  'same-cell': '',
};

function reportPurchase(result: PurchaseResult, success: string): void {
  if (result.ok) {
    toast(`${success} · −${result.spent} coins`, 'good');
    return;
  }
  toast(result.reason === 'unaffordable' ? 'Not enough coins yet.' : 'Not available yet.', 'bad');
}

// ---------------------------------------------------------------------------
// 3D scenes
//
// The board and the house are WebGL scenes; everything else stays DOM, because
// text, prices and buttons belong in the browser's own layout and text
// rendering. If WebGL is unavailable the game falls back to the flat DOM board
// below - the store and the rules are identical either way.
// ---------------------------------------------------------------------------

let board3d: Board3D | null = null;
let house3d: House3D | null = null;

function supportsWebGL(): boolean {
  try {
    const probe = document.createElement('canvas');
    return probe.getContext('webgl2') !== null || probe.getContext('webgl') !== null;
  } catch {
    return false;
  }
}

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
  tile.style.setProperty('--chain', CHAIN_COLORS[item.itemType]);
  tile.dataset['level'] = String(item.level);
  tile.dataset['itemId'] = item.id;
  tile.innerHTML = `<span class="tile__art">${emblemSvg(item.itemType, 32)}</span>`;
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
    node.className = `cell${cell.locked ? ' is-locked' : ''}`;
    node.dataset['index'] = String(cell.index);
    node.setAttribute('aria-label', cell.locked ? 'Locked space' : `Cell ${cell.index + 1}`);
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

    node.classList.toggle('is-locked', cell.locked);

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
// Requests
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
      chip.innerHTML = `<span style="color:${CHAIN_COLORS[line.itemType]}">${emblemSvg(
        line.itemType,
        16,
      )}</span><span>${getItemName(line.itemType, line.level)} · ${Math.min(
        line.owned,
        line.count,
      )}/${line.count}</span>`;
      lines.appendChild(chip);
    });

    const reward = document.createElement('div');
    reward.className = 'task__reward';
    const multiplier = crewBonuses(state.crew).taskCoinMultiplier;
    const payout = Math.round(task.reward.coins * multiplier);
    reward.innerHTML = `Pays <b>${payout} coins</b>${
      task.reward.gems > 0 ? ` · <i>${task.reward.gems} gems</i>` : ''
    } · ${task.reward.xp} xp`;

    left.append(lines, reward);

    const deliver = document.createElement('button');
    deliver.type = 'button';
    deliver.className = `btn${ready ? ' btn--go' : ''}`;
    deliver.textContent = 'Deliver';
    deliver.disabled = !ready;
    deliver.addEventListener('click', () => {
      const before = gameStore.getState().wallet.coins;
      if (gameStore.getState().deliverTask(task.id)) {
        toast(`Delivered — +${gameStore.getState().wallet.coins - before} coins`, 'good');
      }
    });

    card.append(left, deliver);
    dom.tasks.appendChild(card);
  });

  const ready = state.activeTasks.filter((task) => canDeliverTask(state.grid, task)).length;
  dom.taskCount.textContent = ready > 0 ? `${ready} ready` : `${state.activeTasks.length} open`;
  setTabDot('viewBoard', ready > 0);
}

// ---------------------------------------------------------------------------
// Crew
// ---------------------------------------------------------------------------

function renderCrew(state: GameState): void {
  dom.crew.textContent = '';

  CREW.forEach((definition) => {
    const member = state.crew.find((candidate) => candidate.id === definition.id);
    if (member === undefined) return;

    const card = document.createElement('article');
    card.className = `member${member.hired ? '' : ' is-locked'}`;

    const portrait = document.createElement('div');
    portrait.innerHTML = portraitSvg(definition.id, member.level);

    const body = document.createElement('div');
    body.className = 'member__body';

    const head = document.createElement('div');
    head.className = 'member__head';
    head.innerHTML = `<span class="member__name">${definition.name}</span>
      <span class="member__role">${definition.role}${member.hired ? ` · Lv ${member.level}` : ''}</span>`;

    const blurb = document.createElement('p');
    blurb.className = 'member__blurb';
    blurb.textContent = definition.blurb;

    const foot = document.createElement('div');
    foot.className = 'member__foot';

    if (member.hired) {
      const capped = isPerkCapped(definition, member.level);
      const perk = document.createElement('span');
      perk.className = `member__perk${capped ? ' is-capped' : ''}`;
      perk.textContent = capped
        ? `${describePerk(definition, member.level)} · maxed`
        : describePerk(definition, member.level);

      const pips = document.createElement('div');
      pips.className = 'pips';
      for (let i = 1; i <= definition.maxLevel; i += 1) {
        const pip = document.createElement('span');
        pip.className = `pip${i <= member.level ? ' is-on' : ''}`;
        pips.appendChild(pip);
      }

      const cost = upgradeCost(definition, member.level);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn--buy';

      // The next level's effect sits in the body, not on the button: perk
      // sentences are long, and a button that grows with its label breaks the
      // card. Price on the control, value next to it.
      const next = document.createElement('span');
      next.className = 'member__next';

      if (cost === null) {
        button.textContent = 'Fully trained';
        button.disabled = true;
        next.textContent = 'Nothing left to teach them.';
      } else {
        button.textContent = `Train · ${cost} coins`;
        button.disabled = state.wallet.coins < cost;
        next.textContent = `Next: ${describePerk(definition, member.level + 1)}`;
        button.addEventListener('click', () => {
          reportPurchase(gameStore.getState().upgradeCrew(definition.id), `${definition.name} trained`);
        });
      }

      foot.append(pips, button);
      body.append(head, blurb, perk, next, foot);
    } else {
      const perk = document.createElement('span');
      perk.className = 'member__perk';
      perk.textContent = `Starts at ${describePerk(definition, 1)}`;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn--buy';
      button.textContent = `Hire · ${definition.hireCost} coins`;
      button.disabled = state.wallet.coins < definition.hireCost;
      button.addEventListener('click', () => {
        reportPurchase(gameStore.getState().hireCrew(definition.id), `${definition.name} joined the crew`);
      });

      foot.append(document.createElement('span'), button);
      body.append(head, blurb, perk, foot);
    }

    card.append(portrait, body);
    dom.crew.appendChild(card);
  });

  const hired = state.crew.filter((member) => member.hired).length;
  dom.crewCount.textContent = `${hired} of ${CREW.length} hired`;

  // Nudge the tab when something is affordable right now.
  const canAfford = CREW.some((definition) => {
    const member = state.crew.find((candidate) => candidate.id === definition.id);
    if (member === undefined) return false;
    if (!member.hired) return state.wallet.coins >= definition.hireCost;
    const cost = upgradeCost(definition, member.level);
    return cost !== null && state.wallet.coins >= cost;
  });
  setTabDot('viewCrew', canAfford);
}

// ---------------------------------------------------------------------------
// House
// ---------------------------------------------------------------------------

function renderHouse(state: GameState): void {
  const restored = state.restorations.filter((room) => room.restored);

  if (house3d !== null) {
    house3d.sync(restored.map((room) => room.id));
  } else {
    // Flat fallback for browsers without WebGL.
    dom.scene.innerHTML =
      houseSceneSvg({ restored: restored.map((room) => room.id) }) +
      '<p class="scene__caption"></p>';
  }

  const caption = dom.scene.querySelector<HTMLParagraphElement>('.scene__caption');
  const last = restored[restored.length - 1];
  const next = state.restorations.find((room) => !room.restored);
  if (caption !== null) {
    caption.textContent =
      last !== undefined
        ? last.story
        : 'Willow House has been empty for years. Start with the porch.';
  }

  dom.houseCount.textContent = `${restored.length} of ${state.restorations.length}`;
  dom.rooms.textContent = '';

  state.restorations.forEach((room) => {
    const isNext = next !== undefined && room.id === next.id;
    const card = document.createElement('article');
    card.className = `room${room.restored ? ' is-done' : ''}${isNext ? ' is-next' : ''}`;

    const left = document.createElement('div');
    const done = room.progress >= room.requiredDeliveries;
    left.innerHTML = `<div class="room__name">${room.name}</div>
      <div class="room__meta">${
        room.restored
          ? 'Restored'
          : `${room.progress}/${room.requiredDeliveries} deliveries · ${room.coinCost} coins`
      }</div>
      <div class="bar"><div class="bar__fill" style="width:${
        room.restored ? 100 : Math.round((room.progress / room.requiredDeliveries) * 100)
      }%"></div></div>
      ${room.restored ? `<p class="room__story">${room.story}</p>` : ''}`;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = done && !room.restored ? 'btn btn--go' : 'btn';
    button.textContent = room.restored ? 'Done' : 'Restore';
    button.disabled = room.restored || !done || state.wallet.coins < room.coinCost;
    button.addEventListener('click', () => {
      reportPurchase(gameStore.getState().restoreRoom(room.id), `${room.name} restored`);
    });

    card.append(left, button);
    dom.rooms.appendChild(card);
  });

  const canRestore = state.restorations.some(
    (room) =>
      !room.restored &&
      room.progress >= room.requiredDeliveries &&
      state.wallet.coins >= room.coinCost,
  );
  setTabDot('viewHouse', canRestore);
}

// ---------------------------------------------------------------------------
// Shop
// ---------------------------------------------------------------------------

function renderShop(state: GameState): void {
  dom.shopOffers.textContent = '';

  SHOP_OFFERS.forEach((offer) => {
    const locked = state.player.level < offer.requiresPlayerLevel;
    const price = generatorPrice(state.shop, offer.itemType) ?? 0;

    const row = document.createElement('article');
    row.className = `offer${locked ? ' is-locked' : ''}`;
    row.innerHTML = `<div class="offer__art">${emblemSvg(offer.itemType, 22)}</div>
      <div><div class="offer__name">${offer.name}</div>
      <p class="offer__blurb">${locked ? `Unlocks at player level ${offer.requiresPlayerLevel}.` : offer.blurb}</p></div>`;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn--buy';
    button.textContent = locked ? 'Locked' : `${price} coins`;
    button.disabled = locked || state.wallet.coins < price;
    button.addEventListener('click', () => {
      reportPurchase(gameStore.getState().buyGenerator(offer.itemType), `${offer.name} delivered`);
    });

    row.appendChild(button);
    dom.shopOffers.appendChild(row);
  });

  dom.expansions.textContent = '';
  BOARD_EXPANSIONS.forEach((expansion) => {
    const owned = state.unlockedRows >= expansion.row;
    const isNext = expansion.row === state.unlockedRows + 1;

    const row = document.createElement('article');
    row.className = `offer${owned || isNext ? '' : ' is-locked'}`;
    row.innerHTML = `<div class="offer__art">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><g fill="currentColor">
          <rect x="2" y="4" width="6.5" height="6.5" rx="1.2"/><rect x="9.8" y="4" width="6.5" height="6.5" rx="1.2" opacity=".5"/>
          <rect x="2" y="12" width="6.5" height="6.5" rx="1.2" opacity=".5"/><rect x="9.8" y="12" width="6.5" height="6.5" rx="1.2"/>
        </g></svg></div>
      <div><div class="offer__name">Row ${expansion.row}</div>
      <p class="offer__blurb">${
        owned ? 'Already yours.' : isNext ? 'Five more spaces to work in.' : 'Buy the row above first.'
      }</p></div>`;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn--buy';
    button.textContent = owned ? 'Owned' : `${expansion.cost} coins`;
    button.disabled = owned || !isNext || state.wallet.coins < expansion.cost;
    button.addEventListener('click', () => {
      reportPurchase(gameStore.getState().unlockRow(expansion.row), `Row ${expansion.row} opened`);
    });

    row.appendChild(button);
    dom.expansions.appendChild(row);
  });
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------

const XP_ARC_LENGTH = 2 * Math.PI * 16;

function renderHud(state: GameState): void {
  dom.coins.textContent = String(state.wallet.coins);
  dom.gems.textContent = String(state.wallet.gems);
  dom.playerLevel.textContent = String(state.player.level);

  const xpRatio = Math.max(0, Math.min(1, state.player.xp / state.player.xpToNextLevel));
  dom.xpArc.setAttribute('stroke-dasharray', String(XP_ARC_LENGTH));
  dom.xpArc.setAttribute('stroke-dashoffset', String(XP_ARC_LENGTH * (1 - xpRatio)));

  dom.energyNow.textContent = String(state.energy.current);
  dom.energyMax.textContent = String(state.energy.max);
  dom.energyFill.style.width = `${(state.energy.current / state.energy.max) * 100}%`;

  const regenMs = crewBonuses(state.crew).energyRegenMs;
  const remaining = msUntilFull(state.energy, Date.now(), regenMs);
  dom.energyNext.textContent = remaining === 0 ? 'full' : `full in ${formatDuration(remaining)}`;

  const restored = state.restorations.filter((room) => room.restored).length;
  dom.progress.textContent = `Willow House · ${restored} of ${state.restorations.length}`;

  dom.btnRefill.disabled =
    state.wallet.gems < ENERGY_REFILL_GEM_COST || state.energy.current >= state.energy.max;
  dom.btnRefill.textContent = `${ENERGY_REFILL_GEM_COST} gems`;
}

function setTabDot(viewId: string, on: boolean): void {
  const tab = document.querySelector<HTMLButtonElement>(`.tab[data-view="${viewId}"]`);
  if (tab === null) return;
  const existing = tab.querySelector('.tab__dot');
  if (on && existing === null) {
    const dot = document.createElement('span');
    dot.className = 'tab__dot';
    tab.appendChild(dot);
  } else if (!on && existing !== null) {
    existing.remove();
  }
}

let lastGrid: GameState['grid'] | null = null;
let lastWallet = -1;
let lastCrewSignature = '';
let lastHouseSignature = '';

/**
 * Renders only what changed.
 *
 * Cheap signatures (wallet total, crew levels, room progress) decide which of
 * the four views needs rebuilding, so a generator tap repaints one board cell
 * instead of the crew, the house and the shop.
 */
function render(state: GameState): void {
  const crewSignature = state.crew.map((member) => `${member.hired ? 1 : 0}${member.level}`).join('');
  const houseSignature = state.restorations
    .map((room) => `${room.restored ? 1 : 0}${room.progress}`)
    .join('');
  const walletChanged = state.wallet.coins !== lastWallet;

  if (state.grid !== lastGrid) {
    if (board3d !== null) board3d.sync(state.grid);
    else renderBoard(state);
    renderTasks(state);
    lastGrid = state.grid;
  }
  if (crewSignature !== lastCrewSignature || walletChanged) {
    renderCrew(state);
    lastCrewSignature = crewSignature;
  }
  if (houseSignature !== lastHouseSignature || walletChanged) {
    renderHouse(state);
    lastHouseSignature = houseSignature;
  }
  if (walletChanged || state.grid !== lastGrid) {
    renderShop(state);
  }
  lastWallet = state.wallet.coins;
  renderHud(state);
}

function renderAll(state: GameState): void {
  lastGrid = null;
  lastWallet = -1;
  lastCrewSignature = '';
  lastHouseSignature = '';
  if (board3d !== null) {
    board3d.sync(state.grid);
  } else {
    buildBoard(state);
    renderBoard(state);
  }
  renderTasks(state);
  renderCrew(state);
  renderHouse(state);
  renderShop(state);
  renderHud(state);
  lastGrid = state.grid;
  lastWallet = state.wallet.coins;
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

document.querySelectorAll<HTMLButtonElement>('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    const viewId = tab.dataset['view'];
    if (viewId === undefined) return;
    document.querySelectorAll('.tab').forEach((other) => other.classList.remove('is-active'));
    document.querySelectorAll('.view').forEach((view) => view.classList.remove('is-active'));
    tab.classList.add('is-active');
    document.getElementById(viewId)?.classList.add('is-active');
    window.scrollTo({ top: 0, behavior: 'auto' });
  });
});

// ---------------------------------------------------------------------------
// Input: tap to generate, drag to merge
// ---------------------------------------------------------------------------

interface DragSession {
  readonly pointerId: number;
  readonly from: CellIndex;
  readonly startX: number;
  readonly startY: number;
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
  ghost.innerHTML = `<span style="color:${CHAIN_COLORS[item.itemType]}">${emblemSvg(
    item.itemType,
    32,
  )}</span>`;
  document.body.appendChild(ghost);
  return ghost;
}

function clearHover(): void {
  cellNodes.forEach((node) => node.classList.remove('is-target'));
}

dom.board.addEventListener('pointerdown', (event: PointerEvent) => {
  const cell = (event.target as HTMLElement | null)?.closest<HTMLElement>('.cell');
  const raw = cell?.dataset['index'];
  if (raw === undefined) return;

  const from = Number.parseInt(raw, 10);
  if (gameStore.getState().grid.cells[from]?.item == null) return;

  drag = { pointerId: event.pointerId, from, startX: event.clientX, startY: event.clientY, ghost: null, hoverIndex: null };
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

/**
 * A tap on a generator. Shared by the 3D board and the DOM fallback so the two
 * renderers can never disagree about what a tap does.
 */
function handleTap(index: CellIndex): void {
  const result = gameStore.getState().tapGenerator(index);
  if (result.ok) {
    pendingAnimation.set(result.at, 'spawn');
    if (result.wasFree) toast('Free tap — Nell got one out for nothing.', 'good');
  } else if (TAP_MESSAGES[result.reason] !== '') {
    toast(TAP_MESSAGES[result.reason], 'bad');
  }
  render(gameStore.getState());
}

/** A chip dropped onto another cell. */
function handleDrop(from: CellIndex, to: CellIndex): void {
  const outcome = gameStore.getState().dropItem(from, to);
  if (outcome.kind === 'merged') {
    pendingAnimation.set(outcome.at, 'pop');
    board3d?.punch(outcome.at);
    if (isGeneratorType(outcome.resultItem.itemType)) {
      toast(
        `${getItemName(outcome.resultItem.itemType, outcome.resultItem.level)} — better output now.`,
        'good',
      );
    }
  } else if (outcome.kind === 'rejected' && DROP_MESSAGES[outcome.reason] !== '') {
    toast(DROP_MESSAGES[outcome.reason], 'bad');
  }
  render(gameStore.getState());
}

function endDrag(event: PointerEvent): void {
  if (drag === null || event.pointerId !== drag.pointerId) return;
  const session = drag;
  drag = null;

  session.ghost?.remove();
  clearHover();
  cellNodes[session.from]?.classList.remove('is-source');

  // No ghost means the pointer never travelled: treat it as a tap.
  if (session.ghost === null) {
    handleTap(session.from);
    return;
  }

  const to = cellIndexFromPoint(event.clientX, event.clientY);
  if (to === null) {
    render(gameStore.getState());
    return;
  }
  handleDrop(session.from, to);
}

dom.board.addEventListener('pointerup', endDrag);
dom.board.addEventListener('pointercancel', endDrag);

// Keyboard path: focus a generator cell and press Enter/Space to produce.
dom.board.addEventListener('keydown', (event: KeyboardEvent) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const raw = (event.target as HTMLElement | null)?.closest<HTMLElement>('.cell')?.dataset['index'];
  if (raw === undefined) return;
  event.preventDefault();

  handleTap(Number.parseInt(raw, 10));
});

// ---------------------------------------------------------------------------
// Energy offers & reset
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

dom.btnReset.addEventListener('click', () => {
  gameStore.getState().resetGame();
  renderAll(gameStore.getState());
  toast('Fresh workshop.', 'plain');
});

// ---------------------------------------------------------------------------
// Music
// ---------------------------------------------------------------------------

const music = new Music(dom.bgm);
music.onChange((enabled) => {
  dom.btnMusic.innerHTML = speakerIcon(enabled);
  dom.btnMusic.setAttribute('aria-pressed', String(enabled));
  dom.btnMusic.setAttribute('aria-label', enabled ? 'Mute music' : 'Play music');
});
dom.btnMusic.addEventListener('click', () => {
  toast(music.toggle() ? 'Music on' : 'Music off', 'plain');
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

if (supportsWebGL()) {
  dom.boardwrap.hidden = true;
  dom.stage.hidden = false;
  board3d = new Board3D(dom.stage, { onTap: handleTap, onDrop: handleDrop });
  house3d = new House3D(dom.scene);

  // One loop for both scenes; only the visible one is drawn, so the hidden tab
  // costs nothing.
  let last = performance.now();
  const frame = (now: number): void => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (document.getElementById('viewBoard')?.classList.contains('is-active') === true) {
      board3d?.render(dt);
    }
    if (document.getElementById('viewHouse')?.classList.contains('is-active') === true) {
      house3d?.render(dt);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  // Test hook: lets the automated tests aim real pointer events at a cell.
  (window as unknown as { __board?: unknown }).__board = {
    screenPosition: (index: number) => board3d?.screenPosition(index) ?? null,
    cells: () => gameStore.getState().grid.cells.map((cell) => ({
      index: cell.index,
      locked: cell.locked,
      level: cell.item?.level ?? null,
      itemType: cell.item?.itemType ?? null,
    })),
  };
}

renderAll(gameStore.getState());
gameStore.subscribe((state) => render(state));

// One tick a second is enough for the countdown; `refreshEnergy` only writes
// when a point actually lands, so this does not thrash the store.
window.setInterval(() => {
  gameStore.getState().refreshEnergy();
  renderHud(gameStore.getState());
}, 1000);

// The persisted save arrives asynchronously; rebuild once it lands.
gameStore.persist.onFinishHydration(() => renderAll(gameStore.getState()));
