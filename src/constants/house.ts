import type { RestorationTarget } from '../types/game';

/**
 * Willow House, in the order it comes back to life.
 *
 * Each room needs deliveries *and* coins, and both gates grow: the porch is a
 * first-session win, the roof is an end-game goal. Rooms are worked in order,
 * so the illustration always has exactly one "next thing" to want.
 */
export const HOUSE_ROOMS: readonly RestorationTarget[] = [
  {
    id: 'porch',
    name: 'Front Porch',
    story: 'The steps hold your weight again. Someone could knock now.',
    restored: false,
    progress: 0,
    requiredDeliveries: 3,
    coinCost: 150,
  },
  {
    id: 'kitchen',
    name: 'Kitchen',
    story: 'The stove is lit. The house smells like bread instead of damp.',
    restored: false,
    progress: 0,
    requiredDeliveries: 5,
    coinCost: 600,
  },
  {
    id: 'parlour',
    name: 'Parlour',
    story: 'Shutters open. Light reaches the far wall for the first time in years.',
    restored: false,
    progress: 0,
    requiredDeliveries: 8,
    coinCost: 1800,
  },
  {
    id: 'bedroom',
    name: 'Upstairs Bedroom',
    story: 'A room worth staying the night in. The floor no longer complains.',
    restored: false,
    progress: 0,
    requiredDeliveries: 12,
    coinCost: 4500,
  },
  {
    id: 'glasshouse',
    name: 'Glasshouse',
    story: 'Glass back in every pane. Marisol has already claimed the benches.',
    restored: false,
    progress: 0,
    requiredDeliveries: 16,
    coinCost: 12000,
  },
  {
    id: 'roof',
    name: 'Roof & Chimney',
    story: 'Smoke rises straight from the chimney. Willow House is a home again.',
    restored: false,
    progress: 0,
    requiredDeliveries: 22,
    coinCost: 30000,
  },
];

/** Fresh copies, so the store never shares references with this module. */
export function createHouse(): RestorationTarget[] {
  return HOUSE_ROOMS.map((room) => ({ ...room }));
}

/** The room currently being worked on: the first unrestored one. */
export function currentRoom(rooms: readonly RestorationTarget[]): RestorationTarget | null {
  return rooms.find((room) => !room.restored) ?? null;
}
