import { useStore } from 'zustand';

import { gameStore, type GameState } from './gameStore';

/**
 * React Native binding for the vanilla `gameStore`.
 *
 * Always pass a narrow selector: `useGameStore((s) => s.energy)` re-renders the
 * energy bar only when energy changes, while `useGameStore((s) => s)` would
 * re-render it on every merge.
 */
export function useGameStore<T>(selector: (state: GameState) => T): T {
  return useStore(gameStore, selector);
}

/** Imperative access for gesture handlers and effects (outside render). */
export const gameActions = {
  get: gameStore.getState,
  set: gameStore.setState,
  subscribe: gameStore.subscribe,
};

export { gameStore };
export type { GameState, TapFailureReason, TapResult } from './gameStore';
export {
  selectActiveTasks,
  selectCell,
  selectEnergy,
  selectGrid,
  selectHydrated,
  selectPlayer,
} from './gameStore';
