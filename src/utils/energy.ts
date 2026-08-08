import { ENERGY_MAX, ENERGY_REGEN_MS } from '../constants/gameConfig';
import type { EnergyRegenResult, EnergyState } from '../types/game';

/**
 * Lazy ("accrual") energy model.
 *
 * We never tick energy on a timer. We store the timestamp of the last settled
 * point and, whenever the state is read or spent, we settle everything that has
 * accrued since. This gives correct offline regeneration for free (app killed,
 * phone asleep, whatever) and costs one subtraction instead of a setInterval
 * that wakes the JS thread every second.
 *
 * The one subtlety: on settle we advance `lastTickAt` by `gained * REGEN_MS`,
 * NOT to `now`. Snapping to `now` would throw away the partial progress toward
 * the next point every time the player opens the app - a slow, invisible tax
 * that players do notice over a session.
 */
export function settleEnergy(
  energy: EnergyState,
  now: number = Date.now(),
  intervalMs: number = ENERGY_REGEN_MS,
): EnergyRegenResult {
  const max = energy.max > 0 ? energy.max : ENERGY_MAX;

  // Already full: nothing accrues, and the clock parks at `now` so the next
  // spend starts a fresh 2-minute window rather than granting banked points.
  if (energy.current >= max) {
    return { current: max, lastTickAt: now, gained: 0, msToNextPoint: 0 };
  }

  // Guard against clock skew / restored backups with a future timestamp.
  const elapsed = Math.max(0, now - energy.lastTickAt);
  const accrued = Math.floor(elapsed / intervalMs);
  const capped = Math.min(accrued, max - energy.current);
  const current = energy.current + capped;
  const lastTickAt = capped > 0 ? energy.lastTickAt + capped * intervalMs : energy.lastTickAt;

  const msToNextPoint = current >= max ? 0 : Math.max(0, intervalMs - (now - lastTickAt));

  return { current, lastTickAt, gained: capped, msToNextPoint };
}

/** Applies `settleEnergy` and returns a ready-to-store `EnergyState`. */
export function settleEnergyState(
  energy: EnergyState,
  now: number = Date.now(),
  intervalMs: number = ENERGY_REGEN_MS,
): EnergyState {
  const settled = settleEnergy(energy, now, intervalMs);
  return { current: settled.current, max: energy.max, lastTickAt: settled.lastTickAt };
}

/** Ms until energy reaches `max`; 0 when already full. */
export function msUntilFull(
  energy: EnergyState,
  now: number = Date.now(),
  intervalMs: number = ENERGY_REGEN_MS,
): number {
  const settled = settleEnergy(energy, now, intervalMs);
  const missing = energy.max - settled.current;
  if (missing <= 0) return 0;
  return settled.msToNextPoint + (missing - 1) * intervalMs;
}

/** `"12:05"` / `"1:02:05"` - for the countdown chip on the energy bar. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number): string => n.toString().padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/**
 * Spends `amount` after settling. Returns `null` when the player cannot afford
 * it, so callers can branch to the "out of energy" upsell in one check.
 */
export function spendEnergy(
  energy: EnergyState,
  amount: number,
  now: number = Date.now(),
  intervalMs: number = ENERGY_REGEN_MS,
): EnergyState | null {
  const settled = settleEnergyState(energy, now, intervalMs);
  if (settled.current < amount) return null;

  // Dropping below max starts (or keeps) the regen clock running from `now`
  // only if we were full; otherwise the existing accrual window is preserved.
  const wasFull = settled.current >= settled.max;
  return {
    current: settled.current - amount,
    max: settled.max,
    lastTickAt: wasFull ? now : settled.lastTickAt,
  };
}

/** Grants energy (rewarded ad, gem refill, level-up) without exceeding `max`. */
export function grantEnergy(
  energy: EnergyState,
  amount: number,
  now: number = Date.now(),
  intervalMs: number = ENERGY_REGEN_MS,
): EnergyState {
  const settled = settleEnergyState(energy, now, intervalMs);
  return {
    current: Math.min(settled.max, settled.current + amount),
    max: settled.max,
    lastTickAt: settled.lastTickAt,
  };
}
