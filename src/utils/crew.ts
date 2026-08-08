import { CREW, getCrewDefinition } from '../constants/crew';
import { ENERGY_REGEN_MS } from '../constants/gameConfig';
import type { CrewBonuses, CrewDefinition, CrewId, CrewMemberState } from '../types/game';

/** Everyone unhired, level 0. */
export function createCrew(): CrewMemberState[] {
  return CREW.map((member) => ({ id: member.id, hired: false, level: 0 }));
}

export function findMember(
  crew: readonly CrewMemberState[],
  id: CrewId,
): CrewMemberState | null {
  return crew.find((member) => member.id === id) ?? null;
}

/**
 * Perk value at a given level, capped.
 *
 * Linear growth plus a hard cap (rather than a curve that quietly approaches
 * one) means the numbers on the upgrade button are honest: the player can see
 * exactly where a member stops being worth levelling.
 */
export function perkValue(definition: CrewDefinition, level: number): number {
  if (level <= 0) return 0;
  const raw = definition.perk.base + definition.perk.perLevel * (level - 1);
  return Math.min(definition.perk.cap, raw);
}

/** Coins to take a member from `level` to `level + 1`; null when maxed. */
export function upgradeCost(definition: CrewDefinition, level: number): number | null {
  if (level >= definition.maxLevel) return null;
  return Math.round(definition.upgradeBaseCost * Math.pow(definition.upgradeGrowth, level - 1));
}

/** True when this member's perk has hit its cap and further levels add nothing. */
export function isPerkCapped(definition: CrewDefinition, level: number): boolean {
  return perkValue(definition, level) >= definition.perk.cap - 1e-9;
}

/**
 * Folds the whole crew into the four numbers the game loop actually reads.
 *
 * Computed on demand rather than stored: perks must never drift out of sync
 * with crew levels, and a save from an older build recalculates correctly.
 */
export function crewBonuses(crew: readonly CrewMemberState[]): CrewBonuses {
  let regenCut = 0;
  let luckySpawnChance = 0;
  let freeTapChance = 0;
  let coinBonus = 0;

  for (const member of crew) {
    if (!member.hired) continue;
    const definition = getCrewDefinition(member.id);
    const value = perkValue(definition, member.level);
    switch (definition.perk.kind) {
      case 'energyRegen':
        regenCut += value;
        break;
      case 'luckySpawn':
        luckySpawnChance += value;
        break;
      case 'freeTap':
        freeTapChance += value;
        break;
      case 'taskCoins':
        coinBonus += value;
        break;
    }
  }

  return {
    // Never let regeneration collapse: energy running out is the session timer.
    energyRegenMs: Math.round(ENERGY_REGEN_MS * (1 - Math.min(0.6, regenCut))),
    luckySpawnChance: Math.min(0.5, luckySpawnChance),
    freeTapChance: Math.min(0.4, freeTapChance),
    taskCoinMultiplier: 1 + Math.min(1, coinBonus),
  };
}

/** Human-readable perk line for the crew card, e.g. "+12% coins per delivery". */
export function describePerk(definition: CrewDefinition, level: number): string {
  const percent = Math.round(perkValue(definition, level) * 100);
  switch (definition.perk.kind) {
    case 'energyRegen':
      return `${percent}% faster energy`;
    case 'luckySpawn':
      return `${percent}% chance of a better part`;
    case 'freeTap':
      return `${percent}% chance of a free tap`;
    case 'taskCoins':
      return `+${percent}% coins per delivery`;
  }
}
