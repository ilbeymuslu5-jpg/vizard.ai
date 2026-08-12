import * as THREE from 'three';

const RARITY_COLORS = {
  common: 0xcccccc, uncommon: 0x2ecc71, rare: 0x3498db,
  epic: 0x9b59b6, legendary: 0xFFD700, mythic: 0xe74c3c
};

function createToonMat(color, emissive = 0x000000, intensity = 0) {
  return new THREE.MeshToonMaterial({ color, emissive, emissiveIntensity: intensity });
}

export function createWeaponModel(type, level = 1) {
  const g = new THREE.Group();
  const rarity = level >= 5 ? 'legendary' : level >= 3 ? 'epic' : level >= 2 ? 'rare' : 'common';
  const c = RARITY_COLORS[rarity];
  const glowC = c;

  if (type === 'sword') {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6 + level * 0.15, 0.03), createToonMat(0xDDDDDD, glowC, level * 0.15));
    blade.position.y = 0.4; g.add(blade);
    if (level >= 3) {
      const s1 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.4, 0.03), createToonMat(0xDDDDDD, glowC, 0.2));
      s1.position.set(-0.08, 0.35, 0); s1.rotation.z = 0.3; g.add(s1);
      const s2 = s1.clone(); s2.position.set(0.08, 0.35, 0); s2.rotation.z = -0.3; g.add(s2);
    }
    if (level >= 5) {
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.02, 8, 16), new THREE.MeshBasicMaterial({ color: 0xFFD700, transparent: true, opacity: 0.4 }));
      halo.position.y = 0.5; halo.rotation.x = Math.PI / 2; g.add(halo);
    }
    const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.06), createToonMat(c, c, 0.3));
    hilt.position.y = 0.02; g.add(hilt);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.04), createToonMat(0x8B4513));
    handle.position.y = -0.1; g.add(handle);
  }
  else if (type === 'bow') {
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-0.3 - level * 0.05, 0.5, 0),
      new THREE.Vector3(0, -0.15, 0),
      new THREE.Vector3(0.3 + level * 0.05, 0.5, 0)
    );
    const geom = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curve.getPoints(12)), 12, 0.025, 4, false);
    g.add(new THREE.Mesh(geom, createToonMat(0x8B4513, glowC, level * 0.1)));
    const string = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.65, 0.015), new THREE.MeshBasicMaterial({ color: 0x90EE90 }));
    string.position.y = 0.2; g.add(string);
    if (level >= 5) {
      const wind = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.02, 8, 16), new THREE.MeshBasicMaterial({ color: 0x87CEEB, transparent: true, opacity: 0.3 }));
      wind.position.y = 0.25; wind.rotation.x = Math.PI / 2; g.add(wind);
    }
  }
  else if (type === 'staff') {
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.0 + level * 0.1, 6), createToonMat(0x8B4513));
    stick.position.y = 0.5; g.add(stick);
    const crystalType = level >= 5 ? new THREE.IcosahedronGeometry(0.12, 0) : level >= 3 ? new THREE.OctahedronGeometry(0.1, 0) : new THREE.BoxGeometry(0.08, 0.08, 0.08);
    const crystal = new THREE.Mesh(crystalType, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9 }));
    crystal.position.y = 1.05 + level * 0.05; g.add(crystal);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.15 + level * 0.03, 8, 8), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.12 }));
    glow.position.y = 1.05 + level * 0.05; g.add(glow);
  }
  else if (type === 'axe') {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.9 + level * 0.1, 6), createToonMat(0x8B4513));
    handle.position.y = 0.45; g.add(handle);
    const headW = 0.35 + level * 0.08;
    const head = new THREE.Mesh(new THREE.BoxGeometry(headW, 0.22, 0.08), createToonMat(0x696969, glowC, level * 0.1));
    head.position.y = 0.85; g.add(head);
    const edge = new THREE.Mesh(new THREE.ConeGeometry(0.1 + level * 0.02, 0.12, 4), createToonMat(0xAAAAAA, 0xFFFFFF, 0.3));
    edge.position.set(headW / 2 + 0.04, 0.85, 0); edge.rotation.z = -Math.PI / 2; g.add(edge);
    const edge2 = edge.clone(); edge2.position.set(-(headW / 2 + 0.04), 0.85, 0); edge2.rotation.z = Math.PI / 2; g.add(edge2);
    if (level >= 5) {
      const shock = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.35, 16), new THREE.MeshBasicMaterial({ color: 0xFF4500, transparent: true, opacity: 0.3, side: THREE.DoubleSide }));
      shock.position.y = 0.2; shock.rotation.x = Math.PI / 2; g.add(shock);
    }
  }

  g.userData = { type: 'weapon', weaponType: type, level };
  return g;
}
