/**
 * Browser test for the playable build.
 *
 * Passes:
 *  1. Shell, board and locked rows.
 *  2. Generate / merge / move interactions.
 *  3. The core loop, played by a greedy bot until a request is deliverable.
 *  4. Progression purchases (hire, train, buy, unlock, restore) - funded by
 *     editing the save, since earning 30k coins honestly is the whole game.
 *  5. Persistence and offline energy regeneration.
 *
 * Usage: node scripts/e2e.mjs [screenshot-prefix]
 */

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const url = pathToFileURL(resolve(root, 'dist/merge-restore.html')).href;
const shotPrefix = process.argv[2];

/** Preinstalled Chromium in this environment; falls back to Playwright's own. */
const PINNED_CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const launchOptions = existsSync(PINNED_CHROMIUM) ? { executablePath: PINNED_CHROMIUM } : {};

let failures = 0;
const check = (name, ok, extra) => {
  console.log(ok ? `  ok   ${name}` : `  FAIL ${name} ${extra !== undefined ? JSON.stringify(extra) : ''}`);
  if (!ok) failures += 1;
};

const browser = await chromium.launch(launchOptions);
const page = await browser.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

const board = () => page.evaluate(() => Array.from(document.querySelectorAll('.cell')).map((cell, i) => {
  const tile = cell.querySelector('.tile');
  if (tile === null) return { i, empty: true, locked: cell.classList.contains('is-locked') };
  return {
    i,
    empty: false,
    locked: cell.classList.contains('is-locked'),
    level: Number(tile.dataset.level),
    gen: tile.classList.contains('is-gen'),
    name: tile.getAttribute('aria-label').split(',')[0],
  };
}));

const drag = async (from, to) => {
  const a = await page.locator(`.cell[data-index="${from}"]`).boundingBox();
  const b = await page.locator(`.cell[data-index="${to}"]`).boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2 + 5, { steps: 3 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(80);
};

const tab = async (name) => {
  await page.locator(`.tab[data-view="view${name}"]`).click();
  await page.waitForTimeout(150);
};

/** Rewrites the save, then reloads so the store rehydrates from it. */
const patchSave = async (patch) => {
  await page.evaluate((update) => {
    const save = JSON.parse(localStorage.getItem('merge-restore/save'));
    Object.assign(save.state, update);
    localStorage.setItem('merge-restore/save', JSON.stringify(save));
  }, patch);
  await page.reload();
  await page.waitForTimeout(500);
};

// ---------------------------------------------------------------------------
console.log('--- shell ---');
await page.goto(url);
await page.waitForTimeout(400);

check('no page errors', errors.length === 0, errors);
check('30 cells', (await page.locator('.cell').count()) === 30);
check('bottom two rows locked', (await page.locator('.cell.is-locked').count()) === 10);
check('exactly one generator to start', (await page.locator('.tile.is-gen').count()) === 1);
check('energy starts full', (await page.locator('#energyNow').textContent()) === '100');
check('3 request cards', (await page.locator('.task').count()) === 3);
check('player starts at level 1', (await page.locator('#playerLevel').textContent()) === '1');
check('no horizontal scroll', !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));

console.log('--- generate & merge ---');
const generator = page.locator('.tile.is-gen').first();
await generator.click();
await page.waitForTimeout(140);
check('tap spawns a part', (await page.locator('.tile').count()) === 2);
check('tap costs 1 energy', (await page.locator('#energyNow').textContent()) === '99');
check('a level-1 toolbox only makes nails',
  (await board()).filter((c) => !c.empty && !c.gen).every((c) => c.name.includes('Nail')),
  (await board()).filter((c) => !c.empty && !c.gen));

for (let i = 0; i < 3; i += 1) { await generator.click(); await page.waitForTimeout(60); }
let cells = await board();
const pair = cells.filter((cell) => !cell.empty && !cell.gen && cell.level === 1);
check('made at least two level-1 parts', pair.length >= 2);

await drag(pair[0].i, pair[1].i);
cells = await board();
check('merge yields level 2', cells.find((cell) => cell.i === pair[1].i)?.level === 2);
check('source cell emptied', cells.find((cell) => cell.i === pair[0].i)?.empty === true);

await drag(pair[1].i, 27);
check('cannot drop into a locked row', (await board()).find((cell) => cell.i === 27)?.empty === true);
check('locked-row message shown',
  (await page.locator('#toast').textContent()).toLowerCase().includes('locked'),
  await page.locator('#toast').textContent());

console.log('--- tabs ---');
await tab('Crew');
check('crew tab shows 4 people', (await page.locator('.member').count()) === 4);
check('nobody is hired at the start', (await page.locator('.member.is-locked').count()) === 4);
check('hiring is unaffordable at the start',
  await page.locator('.member .btn').first().isDisabled());

await tab('House');
check('house scene renders', (await page.locator('.scene svg').count()) === 1);
check('six rooms listed', (await page.locator('.room').count()) === 6);
check('house starts unrestored', (await page.locator('#houseCount').textContent()) === '0 of 6');

await tab('Shop');
check('four generators for sale', (await page.locator('#shopOffers .offer').count()) === 4);
check('second toolbox costs more than the first',
  (await page.locator('#shopOffers .btn').first().textContent()).startsWith('278'),
  await page.locator('#shopOffers .btn').first().textContent());
check('later generators are level-locked',
  (await page.locator('#shopOffers .offer.is-locked').count()) >= 2);
check('two board rows for sale', (await page.locator('#expansions .offer').count()) === 2);
await tab('Board');

console.log('--- core loop (bot plays until a request is deliverable) ---');
const readyCount = () => page.locator('.task .btn:not([disabled])').count();
let actions = 0;
while ((await readyCount()) === 0 && actions < 260) {
  actions += 1;
  const state = await board();
  const groups = new Map();
  for (const cell of state) {
    if (cell.empty || cell.gen) continue;
    const key = `${cell.name}|${cell.level}`;
    groups.set(key, [...(groups.get(key) ?? []), cell.i]);
  }
  const mergeable = [...groups.values()].find((group) => group.length >= 2);
  if (mergeable !== undefined) { await drag(mergeable[0], mergeable[1]); continue; }

  const generators = state.filter((cell) => !cell.empty && cell.gen);
  await page.locator(`.cell[data-index="${generators[actions % generators.length].i}"]`).click();
  await page.waitForTimeout(45);
  if ((await page.locator('#energyNow').textContent()) === '0') {
    await page.locator('#btnAd').click();
    await page.waitForTimeout(60);
  }
}
check('a request becomes deliverable while playing', (await readyCount()) > 0, { actions });

const coinsBefore = Number(await page.locator('#coins').textContent());
await page.locator('.task .btn:not([disabled])').first().click();
await page.waitForTimeout(250);
check('delivering pays coins', Number(await page.locator('#coins').textContent()) > coinsBefore);
check('the slot refills to 3 requests', (await page.locator('.task').count()) === 3);

await tab('House');
check('the delivery credits the porch',
  (await page.locator('.room').first().innerText()).includes('1/3'),
  await page.locator('.room').first().innerText());
check('the house is not restored by one delivery',
  (await page.locator('#houseCount').textContent()) === '0 of 6');
await tab('Board');

console.log('--- progression purchases ---');
await patchSave({ wallet: { coins: 60000, gems: 40 } });

await tab('Shop');
const toolboxPrice = Number((await page.locator('#shopOffers .btn').first().textContent()).replace(/\D/g, ''));
await page.locator('#shopOffers .btn').first().click();
await page.waitForTimeout(200);
check('buying a generator puts it on the board', (await page.locator('.tile.is-gen').count()) === 2);
check('buying charges the shown price',
  Number(await page.locator('#coins').textContent()) === 60000 - toolboxPrice,
  [await page.locator('#coins').textContent(), toolboxPrice]);
check('the next copy is dearer',
  Number((await page.locator('#shopOffers .btn').first().textContent()).replace(/\D/g, '')) > toolboxPrice);

await page.locator('#expansions .btn').first().click();
await page.waitForTimeout(200);
check('unlocking a row frees 5 cells', (await page.locator('.cell.is-locked').count()) === 5);
check('the second row is now purchasable',
  !(await page.locator('#expansions .btn').nth(1).isDisabled()));

await tab('Crew');
await page.locator('.member .btn').first().click();
await page.waitForTimeout(200);
check('hiring puts someone on the crew', (await page.locator('.member.is-locked').count()) === 3);
check('hired members show a perk', (await page.locator('.member__perk').first().textContent()).includes('%'));
check('level pips appear', (await page.locator('.member .pip.is-on').count()) === 1);

const trainCost = Number((await page.locator('.member .btn').first().textContent()).replace(/\D/g, '').slice(0, 3));
await page.locator('.member .btn').first().click();
await page.waitForTimeout(200);
check('training adds a level', (await page.locator('.member .pip.is-on').count()) === 2);
check('training cost is non-trivial', trainCost >= 180, trainCost);

await tab('Board');
console.log('--- merging generators opens a new chain ---');
const gens = (await board()).filter((cell) => !cell.empty && cell.gen);
await drag(gens[0].i, gens[1].i);
await page.waitForTimeout(200);
const upgraded = (await board()).find((cell) => !cell.empty && cell.gen && cell.level === 2);
check('two toolboxes merge into a level-2 toolbox', upgraded !== undefined, await board());

let sawHammer = false;
for (let i = 0; i < 60 && !sawHammer; i += 1) {
  await page.locator(`.cell[data-index="${upgraded.i}"]`).click();
  await page.waitForTimeout(35);
  sawHammer = (await board()).some((cell) => !cell.empty && cell.name.toLowerCase().includes('head'));
  if ((await page.locator('#energyNow').textContent()) === '0') {
    await page.locator('#btnAd').click();
    await page.waitForTimeout(50);
  }
  // Keep space free so taps never fail on a full board.
  const state = await board();
  const groups = new Map();
  for (const cell of state) {
    if (cell.empty || cell.gen) continue;
    const key = `${cell.name}|${cell.level}`;
    groups.set(key, [...(groups.get(key) ?? []), cell.i]);
  }
  const mergeable = [...groups.values()].find((group) => group.length >= 2);
  if (mergeable !== undefined) await drag(mergeable[0], mergeable[1]);
}
check('a level-2 toolbox eventually yields the hammer chain', sawHammer);

console.log('--- restoring a room ---');
await patchSave({
  wallet: { coins: 60000, gems: 40 },
  restorations: JSON.parse(await page.evaluate(() => JSON.stringify(
    JSON.parse(localStorage.getItem('merge-restore/save')).state.restorations.map((room, i) =>
      i === 0 ? { ...room, progress: room.requiredDeliveries } : room),
  ))),
});
await tab('House');
check('a fully-delivered room offers Restore',
  (await page.locator('.room .btn').first().textContent()) === 'Restore');
await page.locator('.room .btn').first().click();
await page.waitForTimeout(250);
check('restoring marks the room done', (await page.locator('#houseCount').textContent()) === '1 of 6');
check('the scene gains the porch layer',
  (await page.locator('.scene svg').innerHTML()).includes('lamp'));
check('the story line appears', (await page.locator('.room__story').count()) >= 1);

console.log('--- persistence ---');
const coins = await page.locator('#coins').textContent();
const tiles = await page.locator('.tile').count();
await page.reload();
await page.waitForTimeout(500);
check('save restores coins', (await page.locator('#coins').textContent()) === coins);
check('save restores the board', (await page.locator('.tile').count()) === tiles);
check('save restores the house', (await page.locator('#progress').textContent()).includes('1 of 6'));

await patchSave({ energy: { current: 10, max: 100, lastTickAt: Date.now() - 20 * 60 * 1000 } });
check('offline regen: 20 min away -> +10 energy',
  (await page.locator('#energyNow').textContent()) === '20',
  await page.locator('#energyNow').textContent());

check('still no page errors', errors.length === 0, errors);

if (shotPrefix !== undefined) {
  for (const [name, view] of [['board', 'Board'], ['crew', 'Crew'], ['house', 'House'], ['shop', 'Shop']]) {
    await tab(view);
    await page.screenshot({ path: `${shotPrefix}-${name}.png`, fullPage: true });
  }
}

await browser.close();
console.log(failures === 0 ? `\nALL PASS (${actions} bot actions)` : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
