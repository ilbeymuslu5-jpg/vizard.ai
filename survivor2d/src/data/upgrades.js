// Seviye atlama kartları: rogue-lite geçici yükseltmeler (koşuya özel, envanterden ayrı).
export const UPGRADE_POOL = [
  { id: 'dmg1',   name: 'Sharpened Edge',   tier: 'Common',    icon: '🗡️', desc: '+10% ATK',        apply: (s) => (s.atk *= 1.10) },
  { id: 'def1',   name: 'Iron Skin',        tier: 'Common',    icon: '🛡️', desc: '+8% DEF',         apply: (s) => (s.def *= 1.08) },
  { id: 'spd1',   name: 'Light Feet',       tier: 'Common',    icon: '👟', desc: '+8% Move Speed',  apply: (s) => (s.spd *= 1.08) },
  { id: 'hp1',    name: 'Vitality',         tier: 'Common',    icon: '❤️', desc: '+15% Max HP',     apply: (s) => { s.maxHp *= 1.15; s.hp = s.maxHp; } },
  { id: 'dmg2',   name: "Berserker's Rage", tier: 'Rare',      icon: '🔥', desc: '+20% ATK',        apply: (s) => (s.atk *= 1.20) },
  { id: 'fireRate', name: 'Rapid Volley',   tier: 'Rare',      icon: '⏱️', desc: '+18% Attack Speed', apply: (s) => (s.atkSpeed *= 1.18) },
  { id: 'pierce', name: 'Piercing Rounds',  tier: 'Rare',      icon: '➶',  desc: 'Projectiles pierce +1 enemy', apply: (s) => (s.pierce += 1) },
  { id: 'magnet', name: "Collector's Charm",tier: 'Rare',      icon: '🧲', desc: '+40% Pickup Radius', apply: (s) => (s.magnet *= 1.40) },
  { id: 'crit',   name: 'Killer Instinct',  tier: 'Epic',      icon: '🎯', desc: '+15% Crit Chance', apply: (s) => (s.crit += 0.15) },
  { id: 'multi',  name: 'Twin Strike',      tier: 'Epic',      icon: '✳️', desc: '+1 Projectile',   apply: (s) => (s.projectiles += 1) },
  { id: 'regen',  name: 'Phoenix Blood',    tier: 'Epic',      icon: '✚',  desc: 'Regen +2 HP/sec', apply: (s) => (s.regen += 2) },
  { id: 'godlike', name: 'Ascension',       tier: 'Legendary', icon: '⭐', desc: '+30% ATK, +30% DEF, +20% Max HP',
    apply: (s) => { s.atk *= 1.30; s.def *= 1.30; s.maxHp *= 1.20; s.hp = s.maxHp; } },
];

export function rollUpgrades(n = 3) {
  const pool = UPGRADE_POOL.slice();
  const picks = [];
  for (let i = 0; i < n && pool.length; i++) {
    const idx = (Math.random() * pool.length) | 0;
    picks.push(pool.splice(idx, 1)[0]);
  }
  return picks;
}
