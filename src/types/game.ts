/**
 * Core domain types for the Merge & Restore game.
 *
 * Design notes:
 * - Everything that lives in the store must be JSON-serialisable so the whole
 *   state can be written to AsyncStorage without custom (de)serialisers.
 *   That is why we use plain arrays / records and epoch milliseconds instead of
 *   Map, Set or Date instances.
 * - The board is a flat array of 30 cells. A flat array keeps merge/`findIndex`
 *   operations O(n) with n = 30 and avoids nested array copies on every render.
 */

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

/** Every mergeable chain in the game. Generators are chains too (they can be upgraded later). */
export type ItemType =
  | 'nail'
  | 'plank'
  | 'hammer'
  | 'paint'
  | 'flower'
  // Generators. What each one makes depends on its own level - see ITEM_TREES.
  | 'toolbox'
  | 'lumberPile'
  | 'paintCan'
  | 'gardenBed';

/** Item levels are 1..MAX_ITEM_LEVEL (10). Kept as a plain number for arithmetic ergonomics. */
export type ItemLevel = number;

/** Unique, stable identifier for a single item instance (`"itm_42"`). Used as a React key. */
export type ItemId = string;

/** A concrete item instance sitting on the board. */
export interface Item {
  readonly id: ItemId;
  readonly itemType: ItemType;
  /** 1 .. MAX_ITEM_LEVEL */
  readonly level: ItemLevel;
  /** Set once the player has seen it; drives the "new item" sparkle. */
  readonly isNew: boolean;
}

/** Static definition of a merge chain, declared in `src/constants`. */
export interface ItemTreeDefinition {
  readonly itemType: ItemType;
  /** Display names indexed by level - 1. Length must equal `maxLevel`. */
  readonly names: readonly string[];
  /** Highest reachable level for this chain (<= MAX_ITEM_LEVEL). */
  readonly maxLevel: ItemLevel;
  /** Base sell/merge value at level 1; higher levels scale via VALUE_GROWTH. */
  readonly baseValue: number;
  /** Present only on generator chains. */
  readonly generator?: GeneratorDefinition;
}

/** One possible result of a generator tap. */
export interface GeneratorOutput {
  readonly produces: ItemType;
  readonly level: ItemLevel;
  /** Relative weight inside its table; the table need not sum to anything. */
  readonly weight: number;
}

/**
 * Behaviour of a tappable generator item.
 *
 * A generator is itself a merge chain, and merging two of them upgrades what
 * they make: `tables[generatorLevel - 1]` is the weighted output table for that
 * level. That is what turns "buy a second toolbox" into a real decision and
 * gives late chains (hammers) a way into the game.
 */
export interface GeneratorDefinition {
  /** Energy consumed per tap, whatever the level. */
  readonly energyCost: number;
  /** One weighted table per generator level; length must equal `maxLevel`. */
  readonly tables: readonly (readonly GeneratorOutput[])[];
}

// ---------------------------------------------------------------------------
// Grid
// ---------------------------------------------------------------------------

/** Zero-based board coordinate. `col` is 0..COLS-1, `row` is 0..ROWS-1. */
export interface GridCoord {
  readonly row: number;
  readonly col: number;
}

/** Flat index into `GridState.cells` (0 .. rows * cols - 1). */
export type CellIndex = number;

/** A single board cell. `item === null` means empty. */
export interface GridCell {
  readonly index: CellIndex;
  readonly item: Item | null;
  /** Locked cells are visible but unusable until unlocked with coins. */
  readonly locked: boolean;
}

export interface GridState {
  readonly rows: number;
  readonly cols: number;
  /** Length is always `rows * cols`, ordered row-major. */
  readonly cells: readonly GridCell[];
}

/**
 * Result of dropping the item at `from` onto `to`.
 * Discriminated union so the UI can pick an animation without re-deriving intent.
 */
export type MergeOutcome =
  | { readonly kind: 'merged'; readonly resultItem: Item; readonly at: CellIndex }
  | { readonly kind: 'moved'; readonly from: CellIndex; readonly to: CellIndex }
  | { readonly kind: 'swapped'; readonly from: CellIndex; readonly to: CellIndex }
  | { readonly kind: 'rejected'; readonly reason: MergeRejectReason };

export type MergeRejectReason =
  | 'same-cell'
  | 'out-of-bounds'
  | 'empty-source'
  | 'locked-cell'
  | 'max-level';

// ---------------------------------------------------------------------------
// Energy
// ---------------------------------------------------------------------------

/**
 * Energy is stored lazily: we never run a timer that mutates state every tick.
 * Instead we keep `lastTickAt` and derive how much energy accrued whenever the
 * app reads or spends it. That makes offline regeneration free and keeps the
 * render loop out of the way.
 */
export interface EnergyState {
  /** Current, already-settled amount. Always 0..max. */
  readonly current: number;
  readonly max: number;
  /** Epoch ms of the last settled regeneration tick. */
  readonly lastTickAt: number;
}

/** Pure output of the regeneration calculation (see `src/utils/energy.ts`). */
export interface EnergyRegenResult {
  readonly current: number;
  readonly lastTickAt: number;
  /** How many points were added by this settlement. */
  readonly gained: number;
  /** Ms until the next single point lands; 0 when already full. */
  readonly msToNextPoint: number;
}

// ---------------------------------------------------------------------------
// Currencies
// ---------------------------------------------------------------------------

export type CurrencyKind = 'coins' | 'gems';

export interface Wallet {
  /** Soft currency: earned from tasks, spent on unlocking/restoring. */
  readonly coins: number;
  /** Hard currency: rewarded ads or IAP; spent on energy refills and skips. */
  readonly gems: number;
}

// ---------------------------------------------------------------------------
// Tasks & restoration (meta layer)
// ---------------------------------------------------------------------------

/** "Give 1x level-4 hammer" - one line of a task card. */
export interface TaskRequirement {
  readonly itemType: ItemType;
  readonly level: ItemLevel;
  readonly count: number;
}

export interface TaskReward {
  readonly coins: number;
  readonly gems: number;
  readonly xp: number;
}

export type TaskStatus = 'active' | 'completed';

export interface Task {
  readonly id: string;
  readonly title: string;
  readonly requirements: readonly TaskRequirement[];
  readonly reward: TaskReward;
  readonly status: TaskStatus;
  /** Scene object restored when this task is delivered; drives the story beat. */
  readonly restoreTargetId: string | null;
}

/**
 * A room of Willow House.
 *
 * A room is not handed over by one task: it needs `requiredDeliveries` requests
 * finished *and* a coin payment. Two gates instead of one is what stretches the
 * meta layer over weeks - deliveries pace it, coins make the player choose
 * between the house and their crew.
 */
export interface RestorationTarget {
  readonly id: string;
  readonly name: string;
  /** One line of story shown when the room is finished. */
  readonly story: string;
  readonly restored: boolean;
  /** Deliveries credited to this room so far. */
  readonly progress: number;
  readonly requiredDeliveries: number;
  readonly coinCost: number;
}

// ---------------------------------------------------------------------------
// Crew (the characters you hire and raise)
// ---------------------------------------------------------------------------

export type CrewId = 'apprentice' | 'carpenter' | 'gardener' | 'curator';

/** What a crew member does for you. One perk kind per member, on purpose. */
export type CrewPerkKind =
  /** Shortens the energy regeneration interval (percent). */
  | 'energyRegen'
  /** Chance a generator tap yields a level-2 item instead of level 1. */
  | 'luckySpawn'
  /** Chance a generator tap costs no energy. */
  | 'freeTap'
  /** Bonus coins on delivery (percent). */
  | 'taskCoins';

export interface CrewPerk {
  readonly kind: CrewPerkKind;
  /** Perk value at level 1, as a fraction (0.06 = 6%). */
  readonly base: number;
  /** Added per level above 1, before the cap. */
  readonly perLevel: number;
  /** Hard ceiling, so a maxed crew never trivialises the economy. */
  readonly cap: number;
}

export interface CrewDefinition {
  readonly id: CrewId;
  readonly name: string;
  readonly role: string;
  readonly blurb: string;
  /** Coins to bring them on. */
  readonly hireCost: number;
  /** Coins for level 1 -> 2; each level after multiplies by `upgradeGrowth`. */
  readonly upgradeBaseCost: number;
  readonly upgradeGrowth: number;
  readonly maxLevel: number;
  readonly perk: CrewPerk;
}

export interface CrewMemberState {
  readonly id: CrewId;
  readonly hired: boolean;
  /** 1-based once hired; 0 while unhired. */
  readonly level: number;
}

/** Aggregated, ready-to-apply effect of the whole crew. */
export interface CrewBonuses {
  /** Effective ms per energy point (shorter than the base interval). */
  readonly energyRegenMs: number;
  readonly luckySpawnChance: number;
  readonly freeTapChance: number;
  /** 1.0 = no bonus. */
  readonly taskCoinMultiplier: number;
}

// ---------------------------------------------------------------------------
// Shop
// ---------------------------------------------------------------------------

/** A generator you can buy onto the board; each purchase raises the price. */
export interface ShopOfferState {
  readonly itemType: ItemType;
  readonly purchased: number;
}

export interface ShopOfferDefinition {
  readonly itemType: ItemType;
  readonly name: string;
  readonly blurb: string;
  readonly baseCost: number;
  /** Price multiplier per repeat purchase. */
  readonly costGrowth: number;
  /** Player level required before it appears in the shop. */
  readonly requiresPlayerLevel: number;
}

/** A paid board expansion: unlocks one more row of cells. */
export interface ExpansionDefinition {
  readonly row: number;
  readonly cost: number;
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

export interface PlayerState {
  readonly level: number;
  readonly xp: number;
  /** XP required to reach `level + 1`. */
  readonly xpToNextLevel: number;
  readonly tasksCompleted: number;
}

// ---------------------------------------------------------------------------
// Persisted snapshot
// ---------------------------------------------------------------------------

/** Everything written to AsyncStorage. Bump `schemaVersion` on breaking changes. */
export interface PersistedGameState {
  readonly schemaVersion: number;
  readonly grid: GridState;
  readonly energy: EnergyState;
  readonly wallet: Wallet;
  readonly player: PlayerState;
  readonly activeTasks: readonly Task[];
  readonly restorations: readonly RestorationTarget[];
  readonly crew: readonly CrewMemberState[];
  readonly shop: readonly ShopOfferState[];
  /** Rows currently playable; the rest of the board is locked. */
  readonly unlockedRows: number;
  /** Monotonic counter backing `ItemId` generation. */
  readonly nextItemSeq: number;
}
