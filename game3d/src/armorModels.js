import * as THREE from 'three';

const RARITY_COLORS = {
  common: 0xcccccc, uncommon: 0x2ecc71, rare: 0x3498db,
  epic: 0x9b59b6, legendary: 0xFFD700, mythic: 0xe74c3c
};
const RARITY_ORDER = ['common','uncommon','rare','epic','legendary','mythic'];

function createToonMat(color, emissive = 0x000000, intensity = 0) {
  return new THREE.MeshToonMaterial({ color, emissive, emissiveIntensity: intensity });
}

export function createArmorPiece(slot, rarity) {
  const g = new THREE.Group();
  const c = RARITY_COLORS[rarity];
  const glow = c;

  if (slot === 'helmet') {
    const base = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2), createToonMat(c, glow, 0.2));
    base.position.y = 0.1; g.add(base);
    const crest = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.22), createToonMat(c, glow, 0.3));
    crest.position.y = 0.25; g.add(crest);
  } else if (slot === 'chest') {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.25), createToonMat(c, glow, 0.15));
    plate.position.y = 0.25; g.add(plate);
    const detail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.28), createToonMat(c, glow, 0.25));
    detail.position.y = 0.3; g.add(detail);
  } else if (slot === 'gloves') {
    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), createToonMat(c, glow, 0.2));
    glove.position.y = 0.05; g.add(glove);
    const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.12, 6), createToonMat(c, glow, 0.15));
    wrist.position.y = -0.05; g.add(wrist);
  } else if (slot === 'boots') {
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.22), createToonMat(c, glow, 0.15));
    boot.position.y = 0.05; g.add(boot);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.15, 6), createToonMat(c, glow, 0.1));
    leg.position.y = 0.15; g.add(leg);
  }

  if (RARITY_ORDER.indexOf(rarity) >= 3) {
    const aura = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.08, side: THREE.BackSide }));
    aura.position.y = 0.1; g.add(aura);
  }

  g.userData = { type: 'armor', slot, rarity };
  return g;
}
