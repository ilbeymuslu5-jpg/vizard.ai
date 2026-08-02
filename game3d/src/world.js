/* ==============================================================
   DÜNYA — 4 biyomlu izometrik arena
   Referans haritadaki bölgeler:
     Sol-üst  : Yoğun Yaprak Dökücü Orman
     Sağ-üst  : Kayalık Plato
     Sol-alt  : Antik Batık Harabeler (su)
     Sağ-alt  : Volkanik Çorak Arazi
   Zemin dokusu çalışma anında 2D canvas'ta boyanır (harici dosya yok),
   üstüne de biyoma göre 3B nesneler (ağaç, kaya, sütun, lav) serpilir.
   ============================================================== */
import * as THREE from 'three';

export const ARENA = { hx: 64, hz: 36 };        // yarı genişlik / yarı derinlik

// Bir dünya noktasının hangi biyomda olduğunu döndürür
export function biomeAt(x, z) {
  if (x < 0 && z < 0) return 'forest';
  if (x >= 0 && z < 0) return 'rocky';
  if (x < 0 && z >= 0) return 'ruins';
  return 'volcanic';
}

export const BIOME = {
  forest:   { ground: '#4a8b3a', accent: '#3b6f2c', fog: '#7fb069' },
  rocky:    { ground: '#d9c9a3', accent: '#c2ad80', fog: '#e6dcc0' },
  ruins:    { ground: '#2f6ea8', accent: '#255a8a', fog: '#5aa7d8' },
  volcanic: { ground: '#241d1c', accent: '#171212', fog: '#ff5a1f' },
};

/* -------- Zemin dokusu: haritayı taklit eden prosedürel boyama -------- */
function groundTexture() {
  const S = 2048;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const px = (wx) => (wx + ARENA.hx) / (ARENA.hx * 2) * S;
  const pz = (wz) => (wz + ARENA.hz) / (ARENA.hz * 2) * S;

  // Temel biyom blokları
  g.fillStyle = BIOME.forest.ground;   g.fillRect(0, 0, S / 2, S / 2);
  g.fillStyle = BIOME.rocky.ground;    g.fillRect(S / 2, 0, S / 2, S / 2);
  g.fillStyle = BIOME.ruins.ground;    g.fillRect(0, S / 2, S / 2, S / 2);
  g.fillStyle = BIOME.volcanic.ground; g.fillRect(S / 2, S / 2, S / 2, S / 2);

  // Biyom sınırlarını yumuşat: her sınıra karşı biyomun KENDİ renginde küçük
  // diller serpiştirilir; böylece dörtgen köşeler yerine organik geçiş oluşur.
  const baseColorAt = (x, y) => {
    const key = x < S / 2 ? (y < S / 2 ? 'forest' : 'ruins') : (y < S / 2 ? 'rocky' : 'volcanic');
    return BIOME[key].ground;
  };
  const blend = (vertical) => {
    g.globalAlpha = 0.55;
    for (let i = 0; i < 340; i++) {
      const t = Math.random() * S, off = (Math.random() - 0.5) * 120;
      const x = vertical ? S / 2 + off : t;
      const y = vertical ? t : S / 2 + off;
      // karşı taraftan renk al → diller birbirinin içine girer
      const ox = vertical ? (x < S / 2 ? S / 2 + 30 : S / 2 - 30) : x;
      const oy = vertical ? y : (y < S / 2 ? S / 2 + 30 : S / 2 - 30);
      const r = 7 + Math.random() * 24;
      g.fillStyle = baseColorAt(ox, oy);
      g.beginPath();
      g.ellipse(x, y, r, r * (0.6 + Math.random() * 0.5), Math.random() * 6.28, 0, 6.28);
      g.fill();
    }
    g.globalAlpha = 1;
  };
  blend(true); blend(false);

  // Kumlu geçiş yolu (haritadaki sarı patika) — merkezden geçer
  g.strokeStyle = '#e3d08a'; g.lineWidth = 46; g.lineCap = 'round';
  g.beginPath();
  g.moveTo(px(-ARENA.hx * 0.75), pz(-ARENA.hz * 0.15));
  g.quadraticCurveTo(px(-6), pz(-ARENA.hz * 0.45), px(2), pz(4));
  g.quadraticCurveTo(px(14), pz(ARENA.hz * 0.5), px(ARENA.hx * 0.7), pz(ARENA.hz * 0.7));
  g.stroke();
  g.strokeStyle = '#efe0ab'; g.lineWidth = 26; g.stroke();

  // Doku grenleri: her biyoma hafif benek
  const speck = (x0, y0, w, h, col, n, r0, r1, alpha) => {
    g.globalAlpha = alpha; g.fillStyle = col;
    for (let i = 0; i < n; i++) {
      const x = x0 + Math.random() * w, y = y0 + Math.random() * h;
      const r = r0 + Math.random() * (r1 - r0);
      g.beginPath(); g.ellipse(x, y, r, r * 0.7, Math.random() * 6.28, 0, 6.28); g.fill();
    }
    g.globalAlpha = 1;
  };
  speck(0, 0, S / 2, S / 2, BIOME.forest.accent, 1200, 3, 11, 0.10);
  speck(S / 2, 0, S / 2, S / 2, BIOME.rocky.accent, 950, 3, 12, 0.10);
  speck(0, S / 2, S / 2, S / 2, BIOME.ruins.accent, 700, 4, 14, 0.12);
  speck(S / 2, S / 2, S / 2, S / 2, '#0d0a0a', 1000, 3, 12, 0.14);
  // Volkanik bölgeye akkor çatlaklar
  g.globalAlpha = 0.85;
  for (let i = 0; i < 34; i++) {
    const x = S / 2 + Math.random() * S / 2, y = S / 2 + Math.random() * S / 2;
    const len = 20 + Math.random() * 90, a = Math.random() * 6.28;
    const grd = g.createLinearGradient(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len);
    grd.addColorStop(0, '#ff6a1a'); grd.addColorStop(1, 'rgba(120,20,0,0)');
    g.strokeStyle = grd; g.lineWidth = 3 + Math.random() * 6;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
  }
  // Harabelerde su parıltısı
  g.globalAlpha = 0.25; g.strokeStyle = '#bfe6ff'; g.lineWidth = 3;
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * S / 2, y = S / 2 + Math.random() * S / 2;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + 14 + Math.random() * 26, y); g.stroke();
  }
  g.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/* -------- Basit düşük poligonlu nesne üreticileri -------- */
function coneTree(h, r, leaf, trunk) {
  const g = new THREE.Group();
  const t = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.16, r * 0.22, h * 0.32, 5),
                           new THREE.MeshLambertMaterial({ color: trunk }));
  t.position.y = h * 0.16; g.add(t);
  for (let i = 0; i < 3; i++) {
    const s = 1 - i * 0.26;
    const c = new THREE.Mesh(new THREE.ConeGeometry(r * s, h * 0.42, 6),
                             new THREE.MeshLambertMaterial({ color: leaf }));
    c.position.y = h * (0.34 + i * 0.22); g.add(c);
  }
  return g;
}
function blobTree(h, r, leaf, trunk) {
  const g = new THREE.Group();
  const t = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.14, r * 0.2, h * 0.45, 5),
                           new THREE.MeshLambertMaterial({ color: trunk }));
  t.position.y = h * 0.22; g.add(t);
  const m = new THREE.MeshLambertMaterial({ color: leaf });
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r * (0.62 - i * 0.08), 0), m);
    b.position.set((Math.random() - .5) * r * .7, h * (0.6 + i * 0.14), (Math.random() - .5) * r * .7);
    g.add(b);
  }
  return g;
}
function deadTree(h, r) {
  const g = new THREE.Group();
  const m = new THREE.MeshLambertMaterial({ color: '#161010' });
  const t = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.08, r * 0.18, h, 5), m);
  t.position.y = h / 2; g.add(t);
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.04, r * 0.08, h * 0.5, 4), m);
    b.position.y = h * (0.55 + i * 0.14);
    b.rotation.z = (i % 2 ? 1 : -1) * (0.6 + Math.random() * 0.4);
    b.rotation.y = Math.random() * 6.28;
    g.add(b);
  }
  return g;
}
function rock(r, col) {
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0),
                           new THREE.MeshLambertMaterial({ color: col, flatShading: true }));
  m.position.y = r * 0.55;
  m.rotation.set(Math.random(), Math.random(), Math.random());
  m.scale.y = 0.6 + Math.random() * 0.5;
  return m;
}
function column(h, r) {
  const g = new THREE.Group();
  const m = new THREE.MeshLambertMaterial({ color: '#9fb6c8' });
  const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.05, h, 8), m);
  c.position.y = h / 2; g.add(c);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(r * 2.6, r * 0.5, r * 2.6), m);
  cap.position.y = h; g.add(cap);
  g.rotation.z = (Math.random() - .5) * 0.25;      // devrilmiş görünüm
  return g;
}
function barrel(r, h) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.88, h, 8),
                           new THREE.MeshLambertMaterial({ color: '#8a5a2b' }));
  b.position.y = h / 2; g.add(b);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.02, r * 0.07, 4, 10),
                              new THREE.MeshLambertMaterial({ color: '#5c3a1a' }));
  ring.rotation.x = Math.PI / 2; ring.position.y = h * 0.6; g.add(ring);
  return g;
}

/* -------- Dünyayı kur -------- */
export function buildWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  // Zemin
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA.hx * 2, ARENA.hz * 2),
    new THREE.MeshLambertMaterial({ map: groundTexture() }));
  ground.rotation.x = -Math.PI / 2;
  group.add(ground);

  // Harabelerdeki su yüzeyi (yarı saydam, hafif dalgalı)
  // Düzensiz kıyı çizgili sığ su (dikdörtgen kenar yapay duruyordu)
  const shape = new THREE.Shape();
  const RX = ARENA.hx * 0.46, RZ = ARENA.hz * 0.52;
  for (let i = 0; i <= 40; i++) {
    const a = i / 40 * Math.PI * 2;
    const w = 1 + Math.sin(a * 3.1) * 0.10 + Math.sin(a * 5.7) * 0.07;
    const x = Math.cos(a) * RX * w, y = Math.sin(a) * RZ * w;
    i ? shape.lineTo(x, y) : shape.moveTo(x, y);
  }
  const water = new THREE.Mesh(new THREE.ShapeGeometry(shape),
    new THREE.MeshLambertMaterial({ color: '#2b7fc4', transparent: true, opacity: 0.45 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(-ARENA.hx * 0.48, 0.06, ARENA.hz * 0.46);
  group.add(water);

  // Lav havuzları (volkanik bölge) — kendinden ışıklı diskler
  const lavaMat = new THREE.MeshBasicMaterial({ color: '#e8501c' });
  const crustMat = new THREE.MeshLambertMaterial({ color: '#3a1a10' });
  for (let i = 0; i < 18; i++) {
    const r = 0.9 + Math.random() * 1.7;
    const x = 2 + Math.random() * (ARENA.hx - 6), z = 2 + Math.random() * (ARENA.hz - 5);
    const sz = 0.7 + Math.random() * 0.6;
    const crust = new THREE.Mesh(new THREE.CircleGeometry(r * 1.28, 14), crustMat);
    crust.rotation.x = -Math.PI / 2; crust.position.set(x, 0.04, z); crust.scale.y = sz;
    group.add(crust);
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 14), lavaMat);
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.05, z); m.scale.y = sz;
    group.add(m);
  }

  // Biyomlara göre nesne serpiştirme
  const place = (obj, x, z, s) => {
    obj.position.x = x; obj.position.z = z;
    obj.scale.multiplyScalar(s);
    obj.rotation.y = Math.random() * Math.PI * 2;
    group.add(obj);
  };
  const inArena = (x, z) => Math.abs(x) < ARENA.hx - 3 && Math.abs(z) < ARENA.hz - 3;
  const spawnArea = (n, minX, maxX, minZ, maxZ, make) => {
    for (let i = 0; i < n; i++) {
      const x = minX + Math.random() * (maxX - minX), z = minZ + Math.random() * (maxZ - minZ);
      if (!inArena(x, z)) continue;
      if (Math.hypot(x, z) < 10) continue;                  // başlangıç alanı boş kalsın
      make(x, z);
    }
  };
  // Orman (sol-üst)
  spawnArea(70, -ARENA.hx, -2, -ARENA.hz, -2, (x, z) =>
    place(Math.random() < 0.35 ? coneTree(3.7, 1.15, '#2f7d33', '#5a3b22')
                               : blobTree(3.4, 1.3, '#3f9b3f', '#6b4526'), x, z, 0.75 + Math.random() * 0.45));
  // Kayalık plato (sağ-üst)
  spawnArea(55, 2, ARENA.hx, -ARENA.hz, -2, (x, z) =>
    place(rock(0.65 + Math.random() * 1.1, Math.random() < .5 ? '#c9b98f' : '#b3a077'), x, z, 1));
  // Batık harabeler (sol-alt)
  spawnArea(26, -ARENA.hx, -2, 2, ARENA.hz, (x, z) => place(column(2.2 + Math.random() * 2, 0.42), x, z, 1));
  spawnArea(24, -ARENA.hx, -2, 2, ARENA.hz, (x, z) => place(rock(0.8 + Math.random() * 1.1, '#7f93a6'), x, z, 1));
  // Volkanik çorak arazi (sağ-alt)
  spawnArea(42, 2, ARENA.hx, 2, ARENA.hz, (x, z) => place(deadTree(2.8 + Math.random() * 1.7, 0.75), x, z, 1));
  spawnArea(20, 2, ARENA.hx, 2, ARENA.hz, (x, z) => place(rock(0.6 + Math.random() * 0.85, '#2a2020'), x, z, 1));
  // Fıçılar (haritadaki B) — patika boyunca
  spawnArea(18, -ARENA.hx * .8, ARENA.hx * .8, -ARENA.hz * .5, ARENA.hz * .5, (x, z) =>
    place(barrel(0.42, 0.92), x, z, 1));

  // Arena duvarı — dört kenarda kaya sırası
  const wallMat = new THREE.MeshLambertMaterial({ color: '#4a4740', flatShading: true });
  const wallGeo = new THREE.DodecahedronGeometry(1, 0);
  const wallCount = 200;
  const wall = new THREE.InstancedMesh(wallGeo, wallMat, wallCount);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
  let wi = 0;
  const edge = (x, z) => {
    if (wi >= wallCount) return;
    pos.set(x, 0.4 + Math.random() * 0.7, z);
    q.setFromEuler(new THREE.Euler(Math.random(), Math.random(), Math.random()));
    sc.set(1.4 + Math.random(), 1.6 + Math.random(), 1.4 + Math.random());
    m4.compose(pos, q, sc); wall.setMatrixAt(wi++, m4);
  };
  const stepX = (ARENA.hx * 2) / 58, stepZ = (ARENA.hz * 2) / 32;
  for (let i = 0; i <= 58; i++) { edge(-ARENA.hx + i * stepX, -ARENA.hz - 0.6); edge(-ARENA.hx + i * stepX, ARENA.hz + 0.6); }
  for (let i = 0; i <= 32; i++) { edge(-ARENA.hx - 0.6, -ARENA.hz + i * stepZ); edge(ARENA.hx + 0.6, -ARENA.hz + i * stepZ); }
  wall.count = wi;
  wall.instanceMatrix.needsUpdate = true;
  group.add(wall);

  return { group, ground, water };
}
