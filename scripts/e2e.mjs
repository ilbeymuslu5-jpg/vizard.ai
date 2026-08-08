/**
 * Browser test for the playable build.
 *
 * Two passes:
 *  1. Interaction + persistence checks (tap, drag/merge/move, ad, modal,
 *     reload, offline regeneration).
 *  2. A greedy bot that plays the real core loop through the UI until a task
 *     is deliverable, then delivers it - the check that the whole
 *     generate -> merge -> deliver -> restore chain actually closes.
 *
 * Usage: node scripts/e2e.mjs [screenshot.png]
 */

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const url = pathToFileURL(resolve(root, 'dist/merge-restore.html')).href;
const shot = process.argv[2];

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
  if (tile === null) return { i, empty: true };
  return {
    i,
    empty: false,
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

// ---------------------------------------------------------------------------
console.log('--- shell ---');
await page.goto(url);
await page.waitForTimeout(400);

check('no page errors', errors.length === 0, errors);
check('30 cells', (await page.locator('.cell').count()) === 30);
check('3 generators', (await page.locator('.tile.is-gen').count()) === 3);
check('energy starts full', (await page.locator('#energyNow').textContent()) === '100');
check('3 task cards', (await page.locator('.task').count()) === 3);
check('no horizontal scroll', !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));

console.log('--- generate & merge ---');
const generator = page.locator('.tile.is-gen').first();
await generator.click();
await page.waitForTimeout(120);
check('tap spawns an item', (await page.locator('.tile').count()) === 4);
check('tap costs 1 energy', (await page.locator('#energyNow').textContent()) === '99');

for (let i = 0; i < 3; i += 1) { await generator.click(); await page.waitForTimeout(60); }
let cells = await board();
const pair = cells.filter((cell) => !cell.empty && !cell.gen && cell.level === 1);
check('made at least two level-1 parts', pair.length >= 2, cells);

await drag(pair[0].i, pair[1].i);
cells = await board();
check('merge yields level 2', cells.find((cell) => cell.i === pair[1].i)?.level === 2);
check('source cell emptied', cells.find((cell) => cell.i === pair[0].i)?.empty === true);

const emptyIndex = cells.find((cell) => cell.empty).i;
await drag(pair[1].i, emptyIndex);
check('drag to empty cell moves', (await board()).find((cell) => cell.i === emptyIndex)?.level === 2);

console.log('--- economy & chrome ---');
await page.locator('#btnAd').click();
await page.waitForTimeout(120);
check('rewarded ad refills energy', (await page.locator('#energyNow').textContent()) === '100');
check('toast appears', (await page.locator('#toast').getAttribute('class')).includes('is-up'));

await page.locator('#btnRooms').click();
await page.waitForTimeout(150);
check('house sheet lists 3 rooms', (await page.locator('.room').count()) === 3);
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
check('escape closes the sheet', !(await page.locator('#scrim').getAttribute('class')).includes('is-open'));

console.log('--- persistence ---');
const coins = await page.locator('#coins').textContent();
const tiles = await page.locator('.tile').count();
await page.reload();
await page.waitForTimeout(500);
check('save restores coins', (await page.locator('#coins').textContent()) === coins);
check('save restores the board', (await page.locator('.tile').count()) === tiles);

await page.evaluate(() => {
  const save = JSON.parse(localStorage.getItem('merge-restore/save'));
  save.state.energy = { current: 10, max: 100, lastTickAt: Date.now() - 20 * 60 * 1000 };
  localStorage.setItem('merge-restore/save', JSON.stringify(save));
});
await page.reload();
await page.waitForTimeout(600);
check('offline regen: 20 min away -> +10 energy', (await page.locator('#energyNow').textContent()) === '20');

console.log('--- core loop (bot plays until a task is deliverable) ---');
const readyCount = () => page.locator('.task .btn:not([disabled])').count();
let actions = 0;
while ((await readyCount()) === 0 && actions < 220) {
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
check('a task becomes deliverable while playing', (await readyCount()) > 0, { actions });

const coinsBefore = Number(await page.locator('#coins').textContent());
await page.locator('.task .btn:not([disabled])').first().click();
await page.waitForTimeout(250);
check('delivering pays coins', Number(await page.locator('#coins').textContent()) > coinsBefore);
check('the slot refills to 3 tasks', (await page.locator('.task').count()) === 3);
check('a room gets restored', !(await page.locator('#progress').textContent()).startsWith('0 of'));
check('still no page errors', errors.length === 0, errors);

if (shot !== undefined) await page.screenshot({ path: shot, fullPage: true });
await browser.close();

console.log(failures === 0 ? `\nALL PASS (${actions} bot actions)` : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
