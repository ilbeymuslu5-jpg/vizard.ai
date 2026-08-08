import type {
  GeneratorOutput,
  ItemLevel,
  ItemTreeDefinition,
  ItemType,
} from '../types/game';
import { DEFAULT_GENERATOR_ENERGY_COST, VALUE_GROWTH } from './gameConfig';

/**
 * Static merge-chain catalogue.
 *
 * `names` is indexed by (level - 1) and must have exactly `maxLevel` entries -
 * `assertItemTreesAreValid()` below enforces that at module load in dev, which
 * catches the single most common content bug in this genre (a chain that dead
 * ends because someone added a level without a name/art entry).
 */
export const ITEM_TREES: Readonly<Record<ItemType, ItemTreeDefinition>> = {
  nail: {
    itemType: 'nail',
    maxLevel: 6,
    baseValue: 2,
    names: ['Bent Nail', 'Nail', 'Nail Pack', 'Screw', 'Bolt Set', 'Hardware Kit'],
  },
  plank: {
    itemType: 'plank',
    maxLevel: 7,
    baseValue: 3,
    names: ['Splinter', 'Plank', 'Board', 'Panel', 'Shelf', 'Cabinet Door', 'Cabinet'],
  },
  hammer: {
    itemType: 'hammer',
    maxLevel: 8,
    baseValue: 5,
    names: [
      'Rusty Head',
      'Small Hammer',
      'Hammer',
      'Claw Hammer',
      'Mallet',
      'Sledgehammer',
      'Power Hammer',
      'Master Hammer',
    ],
  },
  paint: {
    itemType: 'paint',
    maxLevel: 6,
    baseValue: 4,
    names: ['Pigment', 'Paint Tube', 'Paint Jar', 'Paint Bucket', 'Paint Barrel', 'Paint Station'],
  },
  flower: {
    itemType: 'flower',
    maxLevel: 5,
    baseValue: 6,
    names: ['Seed', 'Sprout', 'Bud', 'Flower', 'Bouquet'],
  },

  // -- Generators ----------------------------------------------------------
  //
  // Merging two generators raises the level, and the level picks the output
  // table. So a second toolbox is never wasted: it is the only route to the
  // hammer chain, and the reason the shop keeps selling duplicates.
  toolbox: {
    itemType: 'toolbox',
    maxLevel: 3,
    baseValue: 0,
    names: ['Old Toolbox', 'Toolbox', 'Master Toolbox'],
    generator: {
      energyCost: DEFAULT_GENERATOR_ENERGY_COST,
      tables: [
        [{ produces: 'nail', level: 1, weight: 1 }],
        [
          { produces: 'nail', level: 1, weight: 6 },
          { produces: 'nail', level: 2, weight: 2 },
          { produces: 'hammer', level: 1, weight: 3 },
        ],
        [
          { produces: 'nail', level: 2, weight: 4 },
          { produces: 'hammer', level: 1, weight: 4 },
          { produces: 'hammer', level: 2, weight: 2 },
        ],
      ],
    },
  },
  lumberPile: {
    itemType: 'lumberPile',
    maxLevel: 3,
    baseValue: 0,
    names: ['Scrap Wood', 'Lumber Pile', 'Timber Yard'],
    generator: {
      energyCost: DEFAULT_GENERATOR_ENERGY_COST,
      tables: [
        [{ produces: 'plank', level: 1, weight: 1 }],
        [
          { produces: 'plank', level: 1, weight: 7 },
          { produces: 'plank', level: 2, weight: 3 },
        ],
        [
          { produces: 'plank', level: 1, weight: 4 },
          { produces: 'plank', level: 2, weight: 5 },
          { produces: 'plank', level: 3, weight: 1 },
        ],
      ],
    },
  },
  paintCan: {
    itemType: 'paintCan',
    maxLevel: 3,
    baseValue: 0,
    names: ['Dried Can', 'Paint Can', 'Paint Mixer'],
    generator: {
      energyCost: DEFAULT_GENERATOR_ENERGY_COST,
      tables: [
        [{ produces: 'paint', level: 1, weight: 1 }],
        [
          { produces: 'paint', level: 1, weight: 7 },
          { produces: 'paint', level: 2, weight: 3 },
        ],
        [
          { produces: 'paint', level: 1, weight: 3 },
          { produces: 'paint', level: 2, weight: 5 },
          { produces: 'paint', level: 3, weight: 2 },
        ],
      ],
    },
  },
  gardenBed: {
    itemType: 'gardenBed',
    maxLevel: 3,
    baseValue: 0,
    names: ['Weed Patch', 'Garden Bed', 'Glasshouse Bed'],
    generator: {
      energyCost: DEFAULT_GENERATOR_ENERGY_COST,
      tables: [
        [{ produces: 'flower', level: 1, weight: 1 }],
        [
          { produces: 'flower', level: 1, weight: 7 },
          { produces: 'flower', level: 2, weight: 3 },
        ],
        [
          { produces: 'flower', level: 1, weight: 4 },
          { produces: 'flower', level: 2, weight: 4 },
          { produces: 'flower', level: 3, weight: 2 },
        ],
      ],
    },
  },
};

/** All chain ids, handy for random task generation. */
export const ITEM_TYPES = Object.keys(ITEM_TREES) as readonly ItemType[];

export function getItemTree(itemType: ItemType): ItemTreeDefinition {
  return ITEM_TREES[itemType];
}

/** Highest level this chain can reach. */
export function getMaxLevel(itemType: ItemType): ItemLevel {
  return ITEM_TREES[itemType].maxLevel;
}

/** Display name for a given chain level; falls back to the top name if out of range. */
export function getItemName(itemType: ItemType, level: ItemLevel): string {
  const tree = ITEM_TREES[itemType];
  return tree.names[Math.min(level, tree.maxLevel) - 1] ?? tree.itemType;
}

/** Economic value of an item, used for task rewards and future sell mechanics. */
export function getItemValue(itemType: ItemType, level: ItemLevel): number {
  const tree = ITEM_TREES[itemType];
  return Math.round(tree.baseValue * Math.pow(VALUE_GROWTH, level - 1));
}

export function isGeneratorType(itemType: ItemType): boolean {
  return ITEM_TREES[itemType].generator !== undefined;
}

/** Output table for a generator at `level`; clamped to the defined tables. */
export function getGeneratorTable(
  itemType: ItemType,
  level: ItemLevel,
): readonly GeneratorOutput[] {
  const generator = ITEM_TREES[itemType].generator;
  if (generator === undefined) return [];
  const index = Math.min(Math.max(1, level), generator.tables.length) - 1;
  return generator.tables[index] ?? [];
}

/**
 * Picks one output from a weighted table.
 *
 * `random` is injectable so tests are deterministic and so a future "lucky
 * hour" event can bias the roll without touching this function.
 */
export function rollGeneratorOutput(
  table: readonly GeneratorOutput[],
  random: () => number = Math.random,
): GeneratorOutput | null {
  if (table.length === 0) return null;
  const total = table.reduce((sum, output) => sum + output.weight, 0);
  let ticket = random() * total;
  for (const output of table) {
    ticket -= output.weight;
    if (ticket < 0) return output;
  }
  return table[table.length - 1] ?? null;
}

/** Every chain this generator can produce at any level - used by the shop UI. */
export function getGeneratorChains(itemType: ItemType): readonly ItemType[] {
  const generator = ITEM_TREES[itemType].generator;
  if (generator === undefined) return [];
  const chains = new Set<ItemType>();
  for (const table of generator.tables) for (const output of table) chains.add(output.produces);
  return [...chains];
}

/** Throws on malformed content. Called once at module load in dev builds. */
export function assertItemTreesAreValid(): void {
  for (const type of ITEM_TYPES) {
    const tree = ITEM_TREES[type];
    if (tree.names.length !== tree.maxLevel) {
      throw new Error(
        `[itemTrees] "${type}" declares maxLevel ${tree.maxLevel} but has ${tree.names.length} names.`,
      );
    }
    const generator = tree.generator;
    if (generator === undefined) continue;

    if (generator.tables.length !== tree.maxLevel) {
      throw new Error(
        `[itemTrees] generator "${type}" has ${generator.tables.length} output tables but maxLevel ${tree.maxLevel}.`,
      );
    }
    for (const table of generator.tables) {
      if (table.length === 0) throw new Error(`[itemTrees] generator "${type}" has an empty table.`);
      for (const output of table) {
        if (ITEM_TREES[output.produces] === undefined) {
          throw new Error(`[itemTrees] generator "${type}" makes unknown chain "${output.produces}".`);
        }
        if (output.weight <= 0) {
          throw new Error(`[itemTrees] generator "${type}" has a non-positive weight.`);
        }
      }
    }
  }
}

// `__DEV__` is absent outside React Native (tests, node scripts), hence the guard.
if (typeof __DEV__ !== 'undefined' && __DEV__) {
  assertItemTreesAreValid();
}
