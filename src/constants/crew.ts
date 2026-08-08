import type { CrewDefinition, CrewId, ExpansionDefinition, ShopOfferDefinition } from '../types/game';
import { EXPANSIONS } from './gameConfig';

/**
 * The crew: four people you hire with coins and raise over the whole game.
 *
 * Balance shape, and why:
 * - Hire costs are spaced roughly 3.5x apart, so each new face is a goal you
 *   save toward for days rather than an afternoon.
 * - Upgrades grow at ~1.6x per level over 8 levels. Level 8 of the cheapest
 *   crew member costs more than hiring the most expensive one, which keeps
 *   "go wide" and "go deep" genuinely competing for the same coins.
 * - Every perk is capped well under the point where it breaks the loop. The
 *   Gardener tops out at -35% regen (2:00 -> 1:18 per point), never at zero:
 *   energy has to stay the thing that ends a session.
 */
export const CREW: readonly CrewDefinition[] = [
  {
    id: 'apprentice',
    name: 'Nell',
    role: 'Apprentice',
    blurb: 'Quick hands. Sometimes gets a part out of the box for free.',
    hireCost: 250,
    upgradeBaseCost: 180,
    upgradeGrowth: 1.6,
    maxLevel: 8,
    perk: { kind: 'freeTap', base: 0.04, perLevel: 0.025, cap: 0.22 },
  },
  {
    id: 'carpenter',
    name: 'Osgood',
    role: 'Carpenter',
    blurb: 'Knows good stock when he sees it. Pulls better parts from a tap.',
    hireCost: 900,
    upgradeBaseCost: 520,
    upgradeGrowth: 1.6,
    maxLevel: 8,
    perk: { kind: 'luckySpawn', base: 0.05, perLevel: 0.03, cap: 0.26 },
  },
  {
    id: 'gardener',
    name: 'Marisol',
    role: 'Gardener',
    blurb: 'Keeps the place breathing. You recover faster between visits.',
    hireCost: 3200,
    upgradeBaseCost: 1400,
    upgradeGrowth: 1.6,
    maxLevel: 8,
    perk: { kind: 'energyRegen', base: 0.06, perLevel: 0.042, cap: 0.35 },
  },
  {
    id: 'curator',
    name: 'Aunt Iris',
    role: 'Curator',
    blurb: 'Handles the ledger. Every delivery is worth more with her name on it.',
    hireCost: 11000,
    upgradeBaseCost: 4200,
    upgradeGrowth: 1.6,
    maxLevel: 8,
    perk: { kind: 'taskCoins', base: 0.08, perLevel: 0.05, cap: 0.45 },
  },
];

export const CREW_IDS: readonly CrewId[] = CREW.map((member) => member.id);

export function getCrewDefinition(id: CrewId): CrewDefinition {
  const found = CREW.find((member) => member.id === id);
  if (found === undefined) throw new Error(`[crew] unknown member "${id}"`);
  return found;
}

/**
 * Generators for sale.
 *
 * The board starts with one toolbox, so the first hours are a nail-only game;
 * every other chain is something the player buys their way into. Repeat
 * purchases get steeply pricier because two of the same generator merge into a
 * better one - that has to stay a real investment.
 */
export const SHOP_OFFERS: readonly ShopOfferDefinition[] = [
  {
    itemType: 'toolbox',
    name: 'Toolbox',
    blurb: 'Makes nails. Merge two to reach hammers.',
    baseCost: 150,
    costGrowth: 1.85,
    requiresPlayerLevel: 1,
  },
  {
    itemType: 'lumberPile',
    name: 'Lumber Pile',
    blurb: 'Makes planks — the backbone of every repair.',
    baseCost: 400,
    costGrowth: 1.85,
    requiresPlayerLevel: 2,
  },
  {
    itemType: 'paintCan',
    name: 'Paint Can',
    blurb: 'Makes paint. Nothing looks finished without it.',
    baseCost: 1600,
    costGrowth: 1.85,
    requiresPlayerLevel: 4,
  },
  {
    itemType: 'gardenBed',
    name: 'Garden Bed',
    blurb: 'Makes flowers for the grounds and the glasshouse.',
    baseCost: 5200,
    costGrowth: 1.85,
    requiresPlayerLevel: 7,
  },
];

export function getShopOffer(itemType: string): ShopOfferDefinition | null {
  return SHOP_OFFERS.find((offer) => offer.itemType === itemType) ?? null;
}

export const BOARD_EXPANSIONS: readonly ExpansionDefinition[] = EXPANSIONS;
