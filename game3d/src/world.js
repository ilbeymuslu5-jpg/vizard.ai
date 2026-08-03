/* ==============================================================
   DÜNYA — 4 biyomlu izometrik arena
   Referans "World Asset Collection" sayfasındaki varlıklar modellenip
   biyomlara dağıtılır:
     Orman     : yapraklı ağaç, çam, kütük, yosunlu devrik gövde, çakıl
     Kayalık   : kaya sütunları/uçurum, yuvarlak kaya, çalı, kaktüs, çakıl
     Harabeler : batık sütun, döşeme taşı, saz, nilüfer, küp/testi, tahta köprü
     Volkanik  : yanmış kütük, kömürleşmiş gövde, magma havuzu, kemik, kafatası
   Zemin dokusu çalışma anında 2D canvas'ta üretilir (harici dosya yok) ve
   doku örneklerine uyar: çimen / kuru kum taşı / kömürleşmiş toprak+kül /
   yosunlu ıslak taş / batık döşemeli berrak su.

   Tüm nesneler tür başına TEK InstancedMesh ile çizilir; renkler damar
   rengine (vertex color) gömülüdür, böylece tür başına tek çizim çağrısı yeter.
   ============================================================== */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const ARENA = { hx: 64, hz: 36 };        // yarı genişlik / yarı derinlik

export function biomeAt(x, z) {
  if (x < 0 && z < 0) return 'forest';
  if (x >= 0 && z < 0) return 'rocky';
  if (x < 0 && z >= 0) return 'ruins';
  return 'volcanic';
}

/* Su yüzeyi testi (şekil -90° X ekseninde döndürülür: şekil(sx,sy) -> dünya(sx+px, 0, -sy+pz)) */
const WATER = { px: -64 * 0.48, pz: 36 * 0.46, rx: 64 * 0.46, rz: 36 * 0.52 };
export function isWater(x, z) {
  const sx = (x - WATER.px) / WATER.rx;
  const sy = -(z - WATER.pz) / WATER.rz;
  const a = Math.atan2(sy, sx);
  const w = 1 + Math.sin(a * 3.1) * 0.10 + Math.sin(a * 5.7) * 0.07;
  return sx * sx + sy * sy < w * w;
}

// Oyuncunun içinden geçemeyeceği nesneler (x, z, yarıçap)
export const COLLIDERS = [];

export const BIOME = {
  forest:   { ground: '#4a8b3a', accent: '#3b6f2c' },
  rocky:    { ground: '#d9c9a3', accent: '#c2ad80' },
  ruins:    { ground: '#2f6ea8', accent: '#255a8a' },
  volcanic: { ground: '#241d1c', accent: '#171212' },
};

/* ============ ZEMİN DOKUSU ============ */
function groundTexture() {
  const S = 2048;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const px = wx => (wx + ARENA.hx) / (ARENA.hx * 2) * S;
  const pz = wz => (wz + ARENA.hz) / (ARENA.hz * 2) * S;
  const H = S / 2;

  g.fillStyle = BIOME.forest.ground;   g.fillRect(0, 0, H, H);
  g.fillStyle = BIOME.rocky.ground;    g.fillRect(H, 0, H, H);
  g.fillStyle = BIOME.ruins.ground;    g.fillRect(0, H, H, H);
  g.fillStyle = BIOME.volcanic.ground; g.fillRect(H, H, H, H);

  // --- Biyom sınırlarını organik hale getir ---
  const baseColorAt = (x, y) => BIOME[x < H ? (y < H ? 'forest' : 'ruins') : (y < H ? 'rocky' : 'volcanic')].ground;
  const blend = vertical => {
    g.globalAlpha = 0.55;
    for (let i = 0; i < 340; i++) {
      const t = Math.random() * S, off = (Math.random() - 0.5) * 120;
      const x = vertical ? H + off : t, y = vertical ? t : H + off;
      const ox = vertical ? (x < H ? H + 30 : H - 30) : x;
      const oy = vertical ? y : (y < H ? H + 30 : H - 30);
      g.fillStyle = baseColorAt(ox, oy);
      const r = 7 + Math.random() * 24;
      g.beginPath(); g.ellipse(x, y, r, r * (0.6 + Math.random() * 0.5), Math.random() * 6.28, 0, 6.28); g.fill();
    }
    g.globalAlpha = 1;
  };
  blend(true); blend(false);

  // --- Çimen dokusu: kısa çim tutamları (orman) ---
  g.lineCap = 'round';
  for (let i = 0; i < 5000; i++) {
    const x = Math.random() * H, y = Math.random() * H;
    g.strokeStyle = Math.random() < 0.5 ? 'rgba(96,168,72,.5)' : 'rgba(52,110,40,.45)';
    g.lineWidth = 1.6;
    const h = 5 + Math.random() * 7;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - .5) * 4, y - h); g.stroke();
  }
  // --- Kuru kum taşı: çatlak ağı (kayalık) ---
  g.strokeStyle = 'rgba(150,132,98,.45)';
  for (let i = 0; i < 420; i++) {
    let x = H + Math.random() * H, y = Math.random() * H;
    g.lineWidth = 1 + Math.random() * 2;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 3; k++) { x += (Math.random() - .5) * 46; y += (Math.random() - .5) * 46; g.lineTo(x, y); }
    g.stroke();
  }
  g.fillStyle = 'rgba(196,178,140,.35)';
  for (let i = 0; i < 900; i++) {
    const x = H + Math.random() * H, y = Math.random() * H, r = 3 + Math.random() * 11;
    g.beginPath(); g.ellipse(x, y, r, r * 0.75, Math.random() * 6.28, 0, 6.28); g.fill();
  }
  // --- Batık döşeme: su altında taş kare ızgara (harabeler) ---
  g.strokeStyle = 'rgba(190,225,240,.16)'; g.lineWidth = 3;
  for (let i = 0; i <= 16; i++) {
    const t = i / 16 * H;
    g.beginPath(); g.moveTo(0, H + t); g.lineTo(H, H + t); g.stroke();
    g.beginPath(); g.moveTo(t, H); g.lineTo(t, S); g.stroke();
  }
  g.fillStyle = 'rgba(80,150,110,.22)';                       // yosun lekeleri
  for (let i = 0; i < 700; i++) {
    const x = Math.random() * H, y = H + Math.random() * H, r = 5 + Math.random() * 20;
    g.beginPath(); g.ellipse(x, y, r, r * 0.7, Math.random() * 6.28, 0, 6.28); g.fill();
  }
  g.strokeStyle = 'rgba(220,245,255,.18)'; g.lineWidth = 3;   // su parıltısı
  for (let i = 0; i < 120; i++) {
    const x = Math.random() * H, y = H + Math.random() * H;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + 12 + Math.random() * 30, y); g.stroke();
  }
  // --- Kömürleşmiş toprak + kül (volkanik) ---
  g.fillStyle = 'rgba(12,10,10,.5)';
  for (let i = 0; i < 1400; i++) {
    const x = H + Math.random() * H, y = H + Math.random() * H, r = 4 + Math.random() * 16;
    g.beginPath(); g.ellipse(x, y, r, r * 0.7, Math.random() * 6.28, 0, 6.28); g.fill();
  }
  g.fillStyle = 'rgba(150,142,136,.22)';                      // kül serpintisi
  for (let i = 0; i < 1600; i++) {
    const x = H + Math.random() * H, y = H + Math.random() * H;
    g.fillRect(x, y, 2 + Math.random() * 3, 2 + Math.random() * 3);
  }
  g.globalAlpha = 0.9;                                        // akkor çatlaklar
  for (let i = 0; i < 60; i++) {
    const x = H + Math.random() * H, y = H + Math.random() * H;
    const len = 24 + Math.random() * 110, a = Math.random() * 6.28;
    const grd = g.createLinearGradient(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len);
    grd.addColorStop(0, '#ff6a1a'); grd.addColorStop(1, 'rgba(120,20,0,0)');
    g.strokeStyle = grd; g.lineWidth = 3 + Math.random() * 6;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
  }
  g.globalAlpha = 1;

  // --- Kumlu geçiş patikası ---
  g.strokeStyle = '#e3d08a'; g.lineWidth = 46;
  g.beginPath();
  g.moveTo(px(-ARENA.hx * 0.75), pz(-ARENA.hz * 0.15));
  g.quadraticCurveTo(px(-6), pz(-ARENA.hz * 0.45), px(2), pz(4));
  g.quadraticCurveTo(px(14), pz(ARENA.hz * 0.5), px(ARENA.hx * 0.7), pz(ARENA.hz * 0.7));
  g.stroke();
  g.strokeStyle = '#efe0ab'; g.lineWidth = 26; g.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/* ============ GEOMETRİ YARDIMCILARI ============
   Icosahedron/Octahedron indekssiz, Box/Cone indekslidir; mergeGeometries
   karışık girdi kabul etmez. Renk indekssize çevirdikten SONRA eklenir. */
const ni = g => (g.index ? g.toNonIndexed() : g);
const _c = new THREE.Color();
function C(g, hex) {
  g = ni(g);
  const n = g.attributes.position.count, arr = new Float32Array(n * 3);
  _c.set(hex);
  for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');       // birleştirmede gereksiz
  return g;
}
const T = (g, x, y, z) => (g.translate(x, y, z), g);
const R = (g, rx, ry, rz) => { if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); if (rz) g.rotateZ(rz); return g; };
const M = parts => mergeGeometries(parts, false);
const rnd = (a = 1, b = 0) => b + Math.random() * (a - b);

/* ============ NESNE MODELLERİ ============ */
const BUILD = {
  /* --- A: Bitki örtüsü --- */
  treeDeciduous() {                     // yayvan yapraklı ağaç: gövde + 4 yaprak kümesi
    const p = [C(T(new THREE.CylinderGeometry(0.17, 0.28, 1.5, 6), 0, 0.75, 0), '#6b4526')];
    for (let i = 0; i < 2; i++) {
      const a = i * 2.1;
      p.push(C(R(T(new THREE.CylinderGeometry(0.08, 0.12, 0.7, 5), 0, 1.35, 0), 0, a, i ? 0.6 : -0.6), '#6b4526'));
    }
    const leaf = ['#4aa63f', '#3d8f34', '#57b84a'];
    const pos = [[0, 2.25, 0, 0.95], [-0.62, 1.95, 0.2, 0.66], [0.6, 2.0, -0.24, 0.7], [0.12, 2.75, 0.18, 0.6]];
    pos.forEach((q, i) => p.push(C(T(new THREE.IcosahedronGeometry(q[3], 0), q[0], q[1], q[2]), leaf[i % 3])));
    return M(p);
  },
  treeConifer() {                       // çam: gövde + 3 kademe koni
    const p = [C(T(new THREE.CylinderGeometry(0.13, 0.2, 0.9, 6), 0, 0.45, 0), '#5a3b22')];
    const shades = ['#2c6b30', '#31783a', '#39864a'];
    for (let i = 0; i < 3; i++)
      p.push(C(T(new THREE.ConeGeometry(0.95 - i * 0.24, 1.15, 7), 0, 0.95 + i * 0.62, 0), shades[i]));
    return M(p);
  },
  shrub() {                             // kayalık çalısı: sivri yaprak demeti
    const p = [];
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2;
      p.push(C(R(T(new THREE.ConeGeometry(0.09, 0.62, 3), Math.cos(a) * 0.14, 0.3, Math.sin(a) * 0.14),
        Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5), i % 2 ? '#8a9b52' : '#6f8442'));
    }
    return M(p);
  },
  cactus() {                            // sütun kaktüs + iki kol
    const p = [C(T(new THREE.CylinderGeometry(0.2, 0.24, 1.5, 7), 0, 0.75, 0), '#3f8a4e')];
    p.push(C(R(T(new THREE.CylinderGeometry(0.1, 0.11, 0.55, 6), -0.3, 0.95, 0), 0, 0, 1.2), '#3f8a4e'));
    p.push(C(T(new THREE.CylinderGeometry(0.1, 0.1, 0.4, 6), -0.44, 1.28, 0), '#3f8a4e'));
    p.push(C(R(T(new THREE.CylinderGeometry(0.09, 0.1, 0.45, 6), 0.28, 1.15, 0), 0, 0, -1.2), '#47955a'));
    p.push(C(T(new THREE.CylinderGeometry(0.09, 0.09, 0.34, 6), 0.4, 1.42, 0), '#47955a'));
    return M(p);
  },
  stump() {                             // kesik kütük + halkalar
    return M([
      C(T(new THREE.CylinderGeometry(0.42, 0.5, 0.55, 9), 0, 0.28, 0), '#7a5230'),
      C(T(new THREE.CylinderGeometry(0.38, 0.38, 0.06, 9), 0, 0.57, 0), '#a67b4c'),
      C(R(T(new THREE.CylinderGeometry(0.1, 0.13, 0.5, 5), 0.34, 0.42, 0.1), 0, 0, -0.9), '#7a5230'),
    ]);
  },
  charredStump() {                      // yanmış kütük (volkanik)
    return M([
      C(T(new THREE.CylinderGeometry(0.36, 0.48, 0.7, 8), 0, 0.35, 0), '#1a1414'),
      C(T(new THREE.ConeGeometry(0.3, 0.5, 6), 0.08, 0.85, 0.05), '#241b18'),
      C(R(T(new THREE.CylinderGeometry(0.07, 0.11, 0.55, 5), -0.3, 0.6, 0.06), 0, 0, 0.8), '#151010'),
    ]);
  },
  fallenLog() {                         // yosunlu devrik gövde
    const p = [C(R(new THREE.CylinderGeometry(0.3, 0.34, 2.4, 8), 0, 0, Math.PI / 2), '#6b4a2c')];
    p[0].translate(0, 0.32, 0);
    p.push(C(T(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 8), -1.2, 0.32, 0), '#8a6540'));
    for (let i = 0; i < 5; i++)                                   // üstünde yosun yamaları
      p.push(C(T(new THREE.SphereGeometry(0.2, 5, 4, 0, 6.28, 0, 1.2), rnd(1, -1), 0.5, rnd(0.2, -0.2)), '#4e8f43'));
    return M(p);
  },
  reed() {                              // su sazı
    const p = [];
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * 6.28, lean = 0.2;
      p.push(C(R(T(new THREE.CylinderGeometry(0.03, 0.04, 1.1, 4), Math.cos(a) * 0.12, 0.55, Math.sin(a) * 0.12),
        Math.sin(a) * lean, 0, -Math.cos(a) * lean), '#5f9b46'));
    }
    p.push(C(T(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 5), 0.05, 1.2, 0), '#7a5230'));
    return M(p);
  },
  lily() {                              // nilüfer yaprakları + çiçek
    const p = [];
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1;
      p.push(C(R(T(new THREE.CircleGeometry(0.3, 8), Math.cos(a) * 0.3, 0.02, Math.sin(a) * 0.3), -Math.PI / 2, 0, 0), '#3f8f56'));
    }
    p.push(C(T(new THREE.IcosahedronGeometry(0.13, 0), 0, 0.09, 0), '#e59ecd'));
    return M(p);
  },

  /* --- B: Jeolojik --- */
  boulder() {                           // yuvarlak iri kaya
    const g = C(T(new THREE.DodecahedronGeometry(0.8, 0), 0, 0.45, 0), '#9a9384');
    g.scale(1, 0.78, 0.92);
    return g;
  },
  spire() {                             // kaya sütunu / uçurum parçası
    const p = [];
    for (let i = 0; i < 3; i++) {
      const h = 2.6 - i * 0.7, w = 0.5 - i * 0.08;
      const c = new THREE.CylinderGeometry(w * 0.55, w, h, 5);
      p.push(C(T(c, (i - 1) * 0.62, h / 2, (i % 2) * 0.35), i % 2 ? '#cfc0a0' : '#bfae8c'));
    }
    return M(p);
  },
  pebbles() {                           // küçük çakıl kümesi
    const p = [];
    for (let i = 0; i < 5; i++) {
      const r = 0.1 + Math.random() * 0.14;
      p.push(C(T(new THREE.DodecahedronGeometry(r, 0), rnd(0.4, -0.4), r * 0.6, rnd(0.4, -0.4)),
        i % 2 ? '#8d8a82' : '#7e7d78'));
    }
    return M(p);
  },
  pavement() {                          // yıpranmış döşeme taşı ızgarası
    const p = [];
    for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) {
      const s = 0.44;
      p.push(C(T(new THREE.BoxGeometry(s * 0.92, 0.1, s * 0.92), (i - 1.5) * s, 0.05, (k - 1.5) * s),
        (i + k) % 2 ? '#a8b2a0' : '#93a08f'));
    }
    return M(p);
  },
  pillar() {                            // batık harabe sütunu
    return M([
      C(T(new THREE.CylinderGeometry(0.34, 0.38, 2.2, 9), 0, 1.1, 0), '#9fb6c8'),
      C(T(new THREE.BoxGeometry(1.0, 0.18, 1.0), 0, 0.09, 0), '#8ba3b6'),
      C(T(new THREE.BoxGeometry(0.9, 0.2, 0.9), 0, 2.2, 0), '#8ba3b6'),
    ]);
  },
  pillarBroken() {                      // devrilmiş sütun parçası
    const g = M([
      C(R(T(new THREE.CylinderGeometry(0.33, 0.36, 1.5, 9), 0, 0.34, 0), 0, 0, Math.PI / 2), '#93aabd'),
      C(R(T(new THREE.CylinderGeometry(0.33, 0.33, 0.06, 9), 0.76, 0.34, 0), 0, 0, Math.PI / 2), '#7f96a8'),
    ]);
    return g;
  },

  /* --- C: Nesneler --- */
  barrel() {
    return M([
      C(T(new THREE.CylinderGeometry(0.34, 0.29, 0.8, 10), 0, 0.4, 0), '#8a5a2b'),
      C(R(T(new THREE.TorusGeometry(0.345, 0.045, 4, 12), 0, 0.6, 0), Math.PI / 2, 0, 0), '#4a3018'),
      C(R(T(new THREE.TorusGeometry(0.335, 0.045, 4, 12), 0, 0.2, 0), Math.PI / 2, 0, 0), '#4a3018'),
      C(T(new THREE.CylinderGeometry(0.31, 0.31, 0.05, 10), 0, 0.81, 0), '#a8763c'),
    ]);
  },
  urn() {                               // basit antik testi
    return M([
      C(T(new THREE.SphereGeometry(0.3, 8, 6), 0, 0.34, 0), '#b0622f'),
      C(T(new THREE.CylinderGeometry(0.13, 0.18, 0.24, 7), 0, 0.66, 0), '#a35a2a'),
      C(T(new THREE.TorusGeometry(0.15, 0.03, 4, 8), 0, 0.76, 0), '#c98a52'),
      C(T(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 8), 0, 0.05, 0), '#8c4e24'),
    ]);
  },
  coinPile() {                          // altın sikke yığını (dekor)
    const p = [];
    for (let i = 0; i < 7; i++)
      p.push(C(R(T(new THREE.CylinderGeometry(0.13, 0.13, 0.035, 8),
        rnd(0.18, -0.18), 0.02 + i * 0.03, rnd(0.18, -0.18)), rnd(0.2, -0.2), 0, rnd(0.2, -0.2)), '#ffc73a'));
    return M(p);
  },
  bones() {                             // kemik kalıntısı + kafatası
    const p = [C(T(new THREE.SphereGeometry(0.2, 7, 5), 0, 0.18, 0), '#e6e0cf')];
    p.push(C(T(new THREE.BoxGeometry(0.18, 0.1, 0.14), 0.02, 0.06, 0.16), '#d8d1bd'));
    for (let i = 0; i < 4; i++)
      p.push(C(R(T(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 5), rnd(0.5, -0.5), 0.04, rnd(0.5, -0.5)),
        Math.PI / 2, rnd(3.14), 0), '#ddd6c2'));
    return M(p);
  },
  bridge() {                            // tahta köprü
    const p = [];
    for (let i = 0; i < 7; i++)
      p.push(C(T(new THREE.BoxGeometry(0.42, 0.1, 2.4), (i - 3) * 0.46, 0.34, 0), i % 2 ? '#9a6a3a' : '#8a5c31'));
    p.push(C(T(new THREE.BoxGeometry(3.3, 0.14, 0.18), 0, 0.22, 0.95), '#6d4522'));
    p.push(C(T(new THREE.BoxGeometry(3.3, 0.14, 0.18), 0, 0.22, -0.95), '#6d4522'));
    return M(p);
  },
  ladder() {                            // merdiven
    const p = [
      C(T(new THREE.BoxGeometry(0.09, 1.8, 0.09), -0.28, 0.9, 0), '#8a5c31'),
      C(T(new THREE.BoxGeometry(0.09, 1.8, 0.09), 0.28, 0.9, 0), '#8a5c31'),
    ];
    for (let i = 0; i < 5; i++) p.push(C(T(new THREE.BoxGeometry(0.62, 0.07, 0.07), 0, 0.28 + i * 0.34, 0), '#a5713e'));
    return M(p);
  },
};

/* ============ DÜNYAYI KUR ============ */
export function buildWorld(scene) {
  COLLIDERS.length = 0;
  const group = new THREE.Group();
  scene.add(group);

  // Zemin
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA.hx * 2, ARENA.hz * 2),
    new THREE.MeshLambertMaterial({ map: groundTexture() }));
  ground.rotation.x = -Math.PI / 2;
  group.add(ground);

  // Su yüzeyi (düzensiz kıyı)
  const shape = new THREE.Shape();
  for (let i = 0; i <= 40; i++) {
    const a = i / 40 * Math.PI * 2;
    const w = 1 + Math.sin(a * 3.1) * 0.10 + Math.sin(a * 5.7) * 0.07;
    const x = Math.cos(a) * WATER.rx * w, y = Math.sin(a) * WATER.rz * w;
    i ? shape.lineTo(x, y) : shape.moveTo(x, y);
  }
  const water = new THREE.Mesh(new THREE.ShapeGeometry(shape),
    new THREE.MeshLambertMaterial({ color: '#37a3d8', transparent: true, opacity: 0.5 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(WATER.px, 0.06, WATER.pz);
  group.add(water);

  // Magma havuzları: kabuk + akkor yüzey
  const lavaMat = new THREE.MeshBasicMaterial({ color: '#e8501c' });
  const crustMat = new THREE.MeshLambertMaterial({ color: '#2e1712', flatShading: true });
  for (let i = 0; i < 20; i++) {
    const r = 0.9 + Math.random() * 1.8;
    const x = 2 + Math.random() * (ARENA.hx - 6), z = 2 + Math.random() * (ARENA.hz - 5);
    const sz = 0.7 + Math.random() * 0.6;
    const crust = new THREE.Mesh(new THREE.CircleGeometry(r * 1.32, 12), crustMat);
    crust.rotation.x = -Math.PI / 2; crust.position.set(x, 0.04, z); crust.scale.y = sz;
    group.add(crust);
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 12), lavaMat);
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.055, z); m.scale.y = sz;
    group.add(m);
    COLLIDERS.push({ x, z, r: r * 0.8 });                 // lav havuzuna girilmez
  }

  /* -------- Nesne yerleştirme (tür başına tek InstancedMesh) -------- */
  const place = {};                                        // kind -> [matris verisi]
  const inArena = (x, z) => Math.abs(x) < ARENA.hx - 3 && Math.abs(z) < ARENA.hz - 3;
  function put(kind, x, z, s, colR, ry) {
    if (!inArena(x, z) || Math.hypot(x, z) < 9) return;     // başlangıç alanı boş
    (place[kind] || (place[kind] = [])).push({ x, z, s, ry: ry === undefined ? Math.random() * 6.28 : ry });
    if (colR > 0) COLLIDERS.push({ x, z, r: colR * s });
  }
  const scatter = (n, x0, x1, z0, z1, fn) => {
    for (let i = 0; i < n; i++) fn(x0 + Math.random() * (x1 - x0), z0 + Math.random() * (z1 - z0));
  };

  // --- ORMAN (sol-üst) ---
  scatter(58, -ARENA.hx, -2, -ARENA.hz, -2, (x, z) => put('treeDeciduous', x, z, rnd(1.25, 0.85), 0.5));
  scatter(30, -ARENA.hx, -2, -ARENA.hz, -2, (x, z) => put('treeConifer', x, z, rnd(1.3, 0.9), 0.42));
  scatter(16, -ARENA.hx, -2, -ARENA.hz, -2, (x, z) => put('stump', x, z, rnd(1.2, 0.85), 0.5));
  scatter(12, -ARENA.hx, -2, -ARENA.hz, -2, (x, z) => put('fallenLog', x, z, rnd(1.15, 0.85), 0.55));
  scatter(26, -ARENA.hx, -2, -ARENA.hz, -2, (x, z) => put('pebbles', x, z, rnd(1.3, 0.8), 0));
  scatter(10, -ARENA.hx, -2, -ARENA.hz, -2, (x, z) => put('shrub', x, z, rnd(1.2, 0.8), 0));

  // --- KAYALIK PLATO (sağ-üst) ---
  scatter(34, 2, ARENA.hx, -ARENA.hz, -2, (x, z) => put('boulder', x, z, rnd(1.35, 0.7), 0.75));
  scatter(14, 2, ARENA.hx, -ARENA.hz, -2, (x, z) => put('spire', x, z, rnd(1.4, 0.9), 1.0));
  scatter(26, 2, ARENA.hx, -ARENA.hz, -2, (x, z) => put('shrub', x, z, rnd(1.25, 0.8), 0));
  scatter(18, 2, ARENA.hx, -ARENA.hz, -2, (x, z) => put('cactus', x, z, rnd(1.2, 0.85), 0.3));
  scatter(30, 2, ARENA.hx, -ARENA.hz, -2, (x, z) => put('pebbles', x, z, rnd(1.4, 0.9), 0));

  // --- BATIK HARABELER (sol-alt) ---
  scatter(20, -ARENA.hx, -2, 2, ARENA.hz, (x, z) => put('pillar', x, z, rnd(1.25, 0.85), 0.45));
  scatter(14, -ARENA.hx, -2, 2, ARENA.hz, (x, z) => put('pillarBroken', x, z, rnd(1.2, 0.9), 0.5));
  scatter(22, -ARENA.hx, -2, 2, ARENA.hz, (x, z) => put('pavement', x, z, rnd(1.5, 1.0), 0));
  scatter(24, -ARENA.hx, -2, 2, ARENA.hz, (x, z) => { if (isWater(x, z)) put('reed', x, z, rnd(1.3, 0.85), 0); });
  scatter(20, -ARENA.hx, -2, 2, ARENA.hz, (x, z) => { if (isWater(x, z)) put('lily', x, z, rnd(1.4, 0.9), 0); });
  scatter(12, -ARENA.hx, -2, 2, ARENA.hz, (x, z) => put('urn', x, z, rnd(1.2, 0.85), 0.3));
  scatter(16, -ARENA.hx, -2, 2, ARENA.hz, (x, z) => put('pebbles', x, z, rnd(1.2, 0.8), 0));
  scatter(5, -ARENA.hx, -6, 4, ARENA.hz - 4, (x, z) => put('bridge', x, z, rnd(1.2, 0.9), 0));
  scatter(4, -ARENA.hx, -2, 2, ARENA.hz, (x, z) => put('ladder', x, z, 1, 0.25));

  // --- VOLKANİK ÇORAK ARAZİ (sağ-alt) ---
  scatter(34, 2, ARENA.hx, 2, ARENA.hz, (x, z) => put('charredStump', x, z, rnd(1.3, 0.85), 0.4));
  scatter(16, 2, ARENA.hx, 2, ARENA.hz, (x, z) => put('fallenLog', x, z, rnd(1.1, 0.8), 0.55));
  scatter(22, 2, ARENA.hx, 2, ARENA.hz, (x, z) => put('bones', x, z, rnd(1.3, 0.9), 0));
  scatter(24, 2, ARENA.hx, 2, ARENA.hz, (x, z) => put('pebbles', x, z, rnd(1.2, 0.8), 0));
  scatter(10, 2, ARENA.hx, 2, ARENA.hz, (x, z) => put('boulder', x, z, rnd(1.0, 0.6), 0.6));

  // --- Patika boyunca fıçı ve altın ---
  scatter(20, -ARENA.hx * .8, ARENA.hx * .8, -ARENA.hz * .5, ARENA.hz * .5, (x, z) => put('barrel', x, z, rnd(1.2, 0.9), 0.4));
  scatter(10, -ARENA.hx * .8, ARENA.hx * .8, -ARENA.hz * .6, ARENA.hz * .6, (x, z) => put('coinPile', x, z, rnd(1.3, 0.9), 0));

  // --- InstancedMesh üretimi ---
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
  const euler = new THREE.Euler();
  let drawCalls = 0;
  for (const kind in place) {
    const list = place[kind];
    const geo = BUILD[kind]();
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((it, i) => {
      pos.set(it.x, 0, it.z);
      euler.set(0, it.ry, 0); q.setFromEuler(euler);
      sc.setScalar(it.s);
      m4.compose(pos, q, sc);
      im.setMatrixAt(i, m4);
    });
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = false;
    group.add(im);
    drawCalls++;
  }

  // Arena duvarı
  const wallMat = new THREE.MeshLambertMaterial({ color: '#4a4740', flatShading: true });
  const wall = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), wallMat, 200);
  let wi = 0;
  const edge = (x, z) => {
    if (wi >= 200) return;
    pos.set(x, 0.4 + Math.random() * 0.7, z);
    euler.set(Math.random(), Math.random(), Math.random()); q.setFromEuler(euler);
    sc.set(1.4 + Math.random(), 1.6 + Math.random(), 1.4 + Math.random());
    m4.compose(pos, q, sc); wall.setMatrixAt(wi++, m4);
  };
  const stepX = (ARENA.hx * 2) / 58, stepZ = (ARENA.hz * 2) / 32;
  for (let i = 0; i <= 58; i++) { edge(-ARENA.hx + i * stepX, -ARENA.hz - 0.6); edge(-ARENA.hx + i * stepX, ARENA.hz + 0.6); }
  for (let i = 0; i <= 32; i++) { edge(-ARENA.hx - 0.6, -ARENA.hz + i * stepZ); edge(ARENA.hx + 0.6, -ARENA.hz + i * stepZ); }
  wall.count = wi; wall.instanceMatrix.needsUpdate = true;
  group.add(wall);

  return { group, ground, water, propKinds: drawCalls, propCount: COLLIDERS.length };
}
