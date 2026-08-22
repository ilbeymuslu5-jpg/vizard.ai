// Eşya kataloğu. `sprite` gerçek görsel varlıklar geldiğinde kullanılacak dosya
// adını tutar (şu an mevcut değil) — `icon` bugünkü emoji-tabanlı render için.
export const EQUIPMENT_DATABASE = {
  helmets: [
    { id: 'leather_cap',      name: 'Leather Cap',          tier: 'Common',    hp: 20,  def: 4,           icon: '🥾', sprite: 'leather_cap.png' },
    { id: 'orbital_helm',     name: 'Orbital Helmet',       tier: 'Rare',      hp: 120, def: 15,          icon: '⛑️', sprite: 'orbital_helm.png' },
    { id: 'sage_hood',        name: "Sage's Hood",          tier: 'Epic',      hp: 60,  def: 8,  mp: 60,  icon: '🧙', sprite: 'sage_hood.png' },
    { id: 'dragon_hunter_helm', name: 'Dragon Hunter Helm', tier: 'Legendary', hp: 350, atk: 25,          icon: '🐉', sprite: 'dragon_helm.png' },
  ],
  chest_armors: [
    { id: 'cloth_tunic',      name: 'Cloth Tunic',          tier: 'Common',    hp: 25,  def: 5,           icon: '👕', sprite: 'cloth_tunic.png' },
    { id: 'mystic_sage_robe', name: 'Mystic Sage Cuirass',  tier: 'Rare',      def: 20, mp: 100,          icon: '🥋', sprite: 'sage_robe.png' },
    { id: 'lion_crest_plate', name: 'Reinforced Lion-Crest',tier: 'Epic',      def: 45, hp: 200,          icon: '🦁', sprite: 'lion_plate.png' },
    { id: 'phoenix_mail',     name: 'Phoenix Mail',         tier: 'Legendary', def: 55, hp: 260, atk: 15, icon: '🔥', sprite: 'phoenix_mail.png' },
  ],
  boots: [
    { id: 'worn_sandals',     name: 'Worn Sandals',         tier: 'Common',    def: 2,  spd: 3,           icon: '👡', sprite: 'worn_sandals.png' },
    { id: 'heavy_sabatons',   name: 'Heavy Sabatons',       tier: 'Common',    def: 10, spd: 5,           icon: '🥾', sprite: 'sabatons.png' },
    { id: 'wind_striders',    name: 'Wind Striders',        tier: 'Rare',      spd: 18, dodge: 6,         icon: '💨', sprite: 'wind_striders.png' },
    { id: 'swift_sandals',    name: 'Swift-Foot Sandals',   tier: 'Epic',      spd: 25, dodge: 12,        icon: '⚡', sprite: 'swift_sandals.png' },
  ],
  weapons: [
    { id: 'rusty_sword',      name: 'Rusty Sword',          tier: 'Common',    atk: 10,                   icon: '🗡️', sprite: 'rusty_sword.png' },
    { id: 'hunters_bow',      name: "Hunter's Bow",         tier: 'Rare',      atk: 28, spd: 4,           icon: '🏹', sprite: 'hunters_bow.png' },
    { id: 'void_scythe',      name: 'Void Scythe',          tier: 'Epic',      atk: 45, hp: 30,           icon: '⚔️', sprite: 'void_scythe.png' },
    { id: 'dragonfang_blade', name: 'Dragonfang Blade',     tier: 'Legendary', atk: 70, dodge: 5,         icon: '🔱', sprite: 'dragonfang_blade.png' },
  ],
  rings: [
    { id: 'copper_band',      name: 'Copper Band',          tier: 'Common',    hp: 10,                    icon: '💍', sprite: 'copper_band.png' },
    { id: 'ring_of_haste',    name: 'Ring of Haste',        tier: 'Rare',      spd: 10, atk: 5,           icon: '💍', sprite: 'ring_of_haste.png' },
    { id: 'ring_of_vigor',    name: 'Ring of Vigor',        tier: 'Epic',      hp: 90,  def: 12,          icon: '💍', sprite: 'ring_of_vigor.png' },
    { id: 'ring_of_kings',    name: 'Ring of Kings',        tier: 'Legendary', atk: 20, def: 20, hp: 80,  icon: '👑', sprite: 'ring_of_kings.png' },
  ],
};

export const SLOTS = [
  { key: 'helmets',      label: 'Helmet',      icon: '⛑️' },
  { key: 'chest_armors', label: 'Chest Armor', icon: '🎽' },
  { key: 'boots',        label: 'Boots',       icon: '🥾' },
  { key: 'weapons',      label: 'Weapon',      icon: '🗡️' },
  { key: 'rings',        label: 'Ring',        icon: '💍' },
];

export function itemById(slotKey, id) {
  return EQUIPMENT_DATABASE[slotKey]?.find((it) => it.id === id) || null;
}
