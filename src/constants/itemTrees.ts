import type { ItemLevel, ItemTreeDefinition, ItemType } from '../types/game';
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
  toolbox: {
    itemType: 'toolbox',
    maxLevel: 3,
    baseValue: 0,
    names: ['Old Toolbox', 'Toolbox', 'Pro Toolbox'],
    generator: { produces: 'nail', producesLevel: 1, energyCost: DEFAULT_GENERATOR_ENERGY_COST },
  },
  lumberPile: {
    itemType: 'lumberPile',
    maxLevel: 3,
    baseValue: 0,
    names: ['Scrap Wood', 'Lumber Pile', 'Timber Stack'],
    generator: { produces: 'plank', producesLevel: 1, energyCost: DEFAULT_GENERATOR_ENERGY_COST },
  },
  paintCan: {
    itemType: 'paintCan',
    maxLevel: 3,
    baseValue: 0,
    names: ['Dried Can', 'Paint Can', 'Paint Mixer'],
    generator: { produces: 'paint', producesLevel: 1, energyCost: DEFAULT_GENERATOR_ENERGY_COST },
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

/** Throws on malformed content. Called once at module load in dev builds. */
export function assertItemTreesAreValid(): void {
  for (const type of ITEM_TYPES) {
    const tree = ITEM_TREES[type];
    if (tree.names.length !== tree.maxLevel) {
      throw new Error(
        `[itemTrees] "${type}" declares maxLevel ${tree.maxLevel} but has ${tree.names.length} names.`,
      );
    }
    const produced = tree.generator?.produces;
    if (produced !== undefined && ITEM_TREES[produced] === undefined) {
      throw new Error(`[itemTrees] generator "${type}" produces unknown chain "${produced}".`);
    }
  }
}

// `__DEV__` is absent outside React Native (tests, node scripts), hence the guard.
if (typeof __DEV__ !== 'undefined' && __DEV__) {
  assertItemTreesAreValid();
}
