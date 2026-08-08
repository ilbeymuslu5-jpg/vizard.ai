/**
 * Pure-logic tests for the game core (no DOM, no React).
 *
 * Compiles src/ to a temp dir with tsc, then exercises the maths that the UI
 * can only show indirectly: merge resolution, energy accrual, crew perks,
 * generator roll tables and the task economy.
 *
 * Usage: node scripts/logic-test.mjs
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(join(tmpdir(), 'merge-logic-'));

execFileSync(
  'npx',
  ['tsc', 'src/utils/energy.ts', 'src/utils/grid.ts', 'src/utils/merge.ts', 'src/utils/tasks.ts',
   'src/utils/crew.ts', 'src/constants/itemTrees.ts', 'src/constants/house.ts',
   'src/types/globals.d.ts',
   // CommonJS output: tsc does not add .js extensions to relative imports, so
   // ESM output would not resolve. require() does not care.
   '--outDir', out, '--module', 'commonjs', '--target', 'es2020', '--moduleResolution', 'node',
   '--skipLibCheck', '--strict'],
  { cwd: root, stdio: 'pipe' },
);

const require = createRequire(import.meta.url);
const load = (file) => require(join(out, file));
const { createEmptyGrid, createItem, withCells, withUnlockedRows, findNearestEmptyCell, countItems } =
  load('utils/grid.js');
const { resolveDrop, canMerge, hasAvailableMerge } = load('utils/merge.js');
const { settleEnergy, spendEnergy, msUntilFull, formatDuration } = load('utils/energy.js');
const { generateTask, canDeliverTask, consumeTaskItems, getTaskProgress } = load('utils/tasks.js');
const { createCrew, crewBonuses, perkValue, upgradeCost, describePerk } = load('utils/crew.js');
const { getGeneratorTable, rollGeneratorOutput, assertItemTreesAreValid } = load('constants/itemTrees.js');
const { createHouse, currentRoom } = load('constants/house.js');

let failures = 0;
const check = (name, ok, extra) => {
  console.log(ok ? `  ok   ${name}` : `  FAIL ${name} ${extra !== undefined ? JSON.stringify(extra) : ''}`);
  if (!ok) failures += 1;
};

// --- content ---------------------------------------------------------------
console.log('--- content ---');
let contentError = null;
try { assertItemTreesAreValid(); } catch (error) { contentError = String(error); }
check('item trees and generator tables are well formed', contentError === null, contentError);

// --- grid ------------------------------------------------------------------
console.log('--- grid & locking ---');
let grid = createEmptyGrid();
check('30 cells', grid.cells.length === 30);
check('bottom two rows start locked', grid.cells.filter((c) => c.locked).length === 10);
check('spawns skip locked cells', findNearestEmptyCell(grid, 19) < 20, findNearestEmptyCell(grid, 19));

const wide = withUnlockedRows(grid, 5);
check('buying a row unlocks 5 cells', wide.cells.filter((c) => c.locked).length === 5);
check('unlock keeps untouched cells identical', wide.cells[0] === grid.cells[0]);

grid = withCells(grid, [
  { index: 0, item: createItem(1, 'nail', 1) },
  { index: 1, item: createItem(2, 'nail', 1) },
]);
check('drop into a locked cell is rejected',
  resolveDrop(grid, 0, 25, 9).outcome.reason === 'locked-cell', resolveDrop(grid, 0, 25, 9).outcome);

// --- merge -----------------------------------------------------------------
console.log('--- merge ---');
let result = resolveDrop(grid, 0, 1, 10);
check('merge yields level 2', result.outcome.kind === 'merged' && result.outcome.resultItem.level === 2);
check('unrelated cells keep identity', result.grid.cells[5] === grid.cells[5]);
check('hasAvailableMerge sees the pair', hasAvailableMerge(grid) === true);

const capped = withCells(createEmptyGrid(), [
  { index: 0, item: createItem(1, 'nail', 6) },
  { index: 1, item: createItem(2, 'nail', 6) },
]);
check('max level rejected', resolveDrop(capped, 0, 1, 3).outcome.reason === 'max-level');
check('canMerge false at cap', canMerge(capped.cells[0].item, capped.cells[1].item) === false);

// generators merge into a higher-level generator
const gens = withCells(createEmptyGrid(), [
  { index: 0, item: createItem(1, 'toolbox', 1) },
  { index: 1, item: createItem(2, 'toolbox', 1) },
]);
const merged = resolveDrop(gens, 0, 1, 5);
check('two toolboxes merge into a level-2 toolbox',
  merged.outcome.resultItem.itemType === 'toolbox' && merged.outcome.resultItem.level === 2);

// --- generator output tables ----------------------------------------------
console.log('--- generator tables ---');
check('toolbox L1 only makes nails',
  getGeneratorTable('toolbox', 1).every((o) => o.produces === 'nail' && o.level === 1));
check('toolbox L2 opens the hammer chain',
  getGeneratorTable('toolbox', 2).some((o) => o.produces === 'hammer'));
check('level clamps above the table count',
  getGeneratorTable('toolbox', 99).length === getGeneratorTable('toolbox', 3).length);

const table = getGeneratorTable('toolbox', 2);
const counts = new Map();
for (let i = 0; i < 11000; i += 1) {
  const roll = rollGeneratorOutput(table, Math.random);
  const key = `${roll.produces}${roll.level}`;
  counts.set(key, (counts.get(key) ?? 0) + 1);
}
const share = (key) => (counts.get(key) ?? 0) / 11000;
check('weights respected: nail1 ~55%', Math.abs(share('nail1') - 6 / 11) < 0.03, share('nail1'));
check('weights respected: hammer1 ~27%', Math.abs(share('hammer1') - 3 / 11) < 0.03, share('hammer1'));
check('rollGeneratorOutput never returns null for a real table', [...counts.keys()].length === 3);
check('edge roll at 0 picks the first entry', rollGeneratorOutput(table, () => 0).produces === 'nail');
check('edge roll at ~1 picks the last entry', rollGeneratorOutput(table, () => 0.999999).produces === 'hammer');

// --- energy ----------------------------------------------------------------
console.log('--- energy ---');
const T0 = 1_700_000_000_000;
let settled = settleEnergy({ current: 10, max: 100, lastTickAt: T0 }, T0 + 5 * 60_000);
check('5 min -> +2 at the base rate', settled.gained === 2 && settled.current === 12, settled);
check('partial progress survives the settle', settled.msToNextPoint === 60_000);

// with the gardener's perk the same wall-clock time yields more
settled = settleEnergy({ current: 10, max: 100, lastTickAt: T0 }, T0 + 5 * 60_000, 78_000);
check('faster interval grants more energy', settled.gained === 3, settled);

check('cap respected', settleEnergy({ current: 99, max: 100, lastTickAt: T0 }, T0 + 10 * 60_000).current === 100);
check('clock skew into the past grants nothing',
  settleEnergy({ current: 10, max: 100, lastTickAt: T0 }, T0 - 500_000).gained === 0);
check('spend refuses when short', spendEnergy({ current: 0, max: 100, lastTickAt: T0 }, 1, T0) === null);
check('0 -> full takes 200 min at base rate',
  msUntilFull({ current: 0, max: 100, lastTickAt: T0 }, T0) === 200 * 60_000);
check('duration format', formatDuration(3_725_000) === '1:02:05');

// --- crew ------------------------------------------------------------------
console.log('--- crew ---');
let crew = createCrew();
check('nobody hired at the start', crew.every((m) => !m.hired && m.level === 0));

let base = crewBonuses(crew);
check('no perks with no crew',
  base.energyRegenMs === 120_000 && base.freeTapChance === 0 && base.taskCoinMultiplier === 1, base);

crew = crew.map((m) => (m.id === 'gardener' ? { ...m, hired: true, level: 1 } : m));
check('gardener L1 speeds regen ~6%', crewBonuses(crew).energyRegenMs === Math.round(120_000 * 0.94),
  crewBonuses(crew).energyRegenMs);

crew = crew.map((m) => (m.id === 'gardener' ? { ...m, level: 8 } : m));
const maxed = crewBonuses(crew);
check('gardener perk caps at 35%', maxed.energyRegenMs === Math.round(120_000 * 0.65), maxed.energyRegenMs);
check('regen never reaches zero', maxed.energyRegenMs > 60_000);

crew = crew.map((m) => (m.id === 'curator' ? { ...m, hired: true, level: 4 } : m));
check('curator multiplies delivery coins', crewBonuses(crew).taskCoinMultiplier > 1.2,
  crewBonuses(crew).taskCoinMultiplier);

const gardener = { id: 'gardener', name: '', role: '', blurb: '', hireCost: 0, upgradeBaseCost: 1400,
  upgradeGrowth: 1.6, maxLevel: 8, perk: { kind: 'energyRegen', base: 0.06, perLevel: 0.042, cap: 0.35 } };
check('upgrade cost grows steeply', upgradeCost(gardener, 1) === 1400 && upgradeCost(gardener, 5) > 9000,
  [upgradeCost(gardener, 1), upgradeCost(gardener, 5)]);
check('maxed member cannot be upgraded', upgradeCost(gardener, 8) === null);
check('perk value is capped', perkValue(gardener, 99) === 0.35);
check('perk description reads cleanly', describePerk(gardener, 8) === '35% faster energy',
  describePerk(gardener, 8));

// --- tasks -----------------------------------------------------------------
console.log('--- tasks ---');
let seed = 7;
const rng = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

const early = generateTask({ playerLevel: 1, seq: 1, availableTypes: ['nail'], random: rng });
check('early task only asks for what you can make',
  early.requirements.every((r) => r.itemType === 'nail'), early.requirements);
check('early task stays shallow', early.requirements.every((r) => r.level <= 3), early.requirements);

const late = generateTask({ playerLevel: 13, seq: 2, availableTypes: ['nail', 'plank', 'hammer'], random: rng });
check('late tasks demand deeper items', late.requirements.some((r) => r.level >= 5), late.requirements);
check('deep lines never ask for more than one',
  late.requirements.every((r) => (r.level >= 4 ? r.count === 1 : true)), late.requirements);

const paying = generateTask({ playerLevel: 8, seq: 4, availableTypes: ['plank'], random: rng });
check('rewards scale with depth', paying.reward.coins > early.reward.coins,
  [early.reward.coins, paying.reward.coins]);
check('gems drop on the 4th task', paying.reward.gems > 0);

let board = createEmptyGrid();
check('cannot deliver from an empty board', canDeliverTask(board, early) === false);
board = withCells(board, early.requirements.flatMap((req, i) =>
  Array.from({ length: req.count }, (_, k) => ({
    index: i * 6 + k, item: createItem(200 + i * 6 + k, req.itemType, req.level),
  }))));
check('progress lines report satisfied', getTaskProgress(board, early).every((l) => l.satisfied));
check('delivery consumes exactly the requested items',
  countItems(consumeTaskItems(board, early), early.requirements[0].itemType, early.requirements[0].level) === 0);

// --- house -----------------------------------------------------------------
console.log('--- house ---');
const house = createHouse();
check('six rooms, none restored', house.length === 6 && house.every((r) => !r.restored));
check('the porch is the first job', currentRoom(house).id === 'porch');
check('requirements escalate',
  house[0].requiredDeliveries < house[5].requiredDeliveries && house[0].coinCost < house[5].coinCost);
const afterPorch = house.map((r) => (r.id === 'porch' ? { ...r, restored: true } : r));
check('the kitchen is next', currentRoom(afterPorch).id === 'kitchen');
check('createHouse returns fresh copies', createHouse()[0] !== house[0]);

rmSync(out, { recursive: true, force: true });
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
