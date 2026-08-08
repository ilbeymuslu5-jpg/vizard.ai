/**
 * Tunable economy + board constants.
 *
 * Keep every balance number here (never inline in the store) so a designer can
 * retune the game without touching logic, and so A/B tests can swap this module.
 *
 * Pacing target: a session is 8-12 minutes of energy, and the house takes weeks.
 * The brake is chain depth, not artificial waiting - a level-6 part costs 32
 * generator taps, so mid-game requests are naturally multi-session.
 */

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

export const GRID_COLS = 5;
export const GRID_ROWS = 6;
export const GRID_CELL_COUNT = GRID_COLS * GRID_ROWS; // 30

/** Rows playable at the start; the last two are bought with coins. */
export const STARTING_ROWS = 4;

/** Paid board expansions, cheapest first. */
export const EXPANSIONS = [
  { row: 5, cost: 900 },
  { row: 6, cost: 2600 },
] as const;

// ---------------------------------------------------------------------------
// Merge chain
// ---------------------------------------------------------------------------

export const MAX_ITEM_LEVEL = 10;

/**
 * Value of a level-n item = baseValue * VALUE_GROWTH^(n-1).
 * 2.35 keeps the chain slightly super-doubling: two level-n items cost 2 taps'
 * worth of energy but the level-(n+1) result is worth ~2.35x, so merging always
 * beats hoarding. That is the whole hook of the genre - keep this above 2.0.
 */
export const VALUE_GROWTH = 2.35;

// ---------------------------------------------------------------------------
// Energy
// ---------------------------------------------------------------------------

export const ENERGY_MAX = 100;
/** One point every 2 minutes -> a full 0..100 refill takes 200 minutes. */
export const ENERGY_REGEN_MS = 2 * 60 * 1000;
/** Default cost of a generator tap. Per-generator overrides live in itemTrees. */
export const DEFAULT_GENERATOR_ENERGY_COST = 1;

/** Gem price of an instant full-energy refill. */
export const ENERGY_REFILL_GEM_COST = 25;
/** Energy granted by a rewarded-ad view. */
export const ENERGY_PER_REWARDED_AD = 30;
/** Gems granted by a rewarded-ad view. */
export const GEMS_PER_REWARDED_AD = 2;

// ---------------------------------------------------------------------------
// Player progression
// ---------------------------------------------------------------------------

export const STARTING_COINS = 60;
export const STARTING_GEMS = 10;

export const BASE_XP_TO_LEVEL = 120;
/** xpToNextLevel(level) = BASE_XP_TO_LEVEL * XP_CURVE^(level-1). */
export const XP_CURVE = 1.34;
/** Energy refunded per level gained - a real reason to care about levelling. */
export const ENERGY_PER_LEVEL_UP = 25;

/** How many task cards are shown at once. */
export const ACTIVE_TASK_SLOTS = 3;

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/** v2: crew, shop, board expansions and multi-stage rooms. */
export const SAVE_SCHEMA_VERSION = 2;
export const SAVE_STORAGE_KEY = 'merge-restore/save';
