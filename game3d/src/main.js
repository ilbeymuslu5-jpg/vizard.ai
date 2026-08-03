/* ==============================================================
   HORDE SURVIVOR 3D — İzometrik Bullet Heaven
   three.js · WebGL · tek dosyada paketlenir
   --------------------------------------------------------------
   Dünya WebGL ile, HUD / hasar sayıları / joystick ise üstteki
   2B canvas katmanında çizilir (hız + kolay yerleşim).
   Oyun mantığı x/z düzleminde çalışır, y yukarıdır.
   ============================================================== */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { buildWorld, ARENA, biomeAt } from './world.js';

/* ============ 0) YARDIMCILAR ============ */
const TAU = Math.PI * 2;
const rnd = (a = 1, b = 0) => b + Math.random() * (a - b);
const rndi = (a, b) => Math.floor(rnd(a, b));
const pick = arr => arr[(Math.random() * arr.length) | 0];
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };
const dist = (ax, az, bx, bz) => Math.sqrt(dist2(ax, az, bx, bz));
const fmtTime = s => { s = Math.max(0, Math.floor(s)); return String((s / 60) | 0).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };

const LOW_END = (navigator.hardwareConcurrency || 4) <= 4 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/* ============ 1) RENDERER / SAHNE / İZOMETRİK KAMERA ============ */
const glCanvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: !LOW_END, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, LOW_END ? 1.6 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0e1220');
// Not: ortografik kamera hedefin 70 birim uzağında durur; sis mesafesi buna göre
// ayarlanmazsa tüm sahne sise gömülür. Uzak kenarlara hafif bir tül bırakıyoruz.
scene.fog = new THREE.Fog('#131a2c', 92, 150);

// İzometrik: ortografik kamera, 45° yaw + ~35.26° yükseklik (klasik 2:1 görünüm)
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 260);
const CAM_DIR = new THREE.Vector3(1, Math.SQRT2 * 0.82, 1).normalize();
const camTarget = new THREE.Vector3();
let VIEW_H = 34;                                   // dikeyde kaç dünya birimi görünsün

scene.add(new THREE.HemisphereLight(0xdcecff, 0x6b5a48, 1.05));
const sun = new THREE.DirectionalLight(0xfff4e2, 1.55);
sun.position.set(30, 60, 20);
scene.add(sun);

const fx2d = document.getElementById('fx');          // üst katman 2B canvas
const ctx = fx2d.getContext('2d');
let VW = 0, VH = 0, DPR = 1, SAFE_TOP = 0;

function resize() {
  VW = Math.round(innerWidth); VH = Math.round(innerHeight);
  DPR = Math.min(devicePixelRatio || 1, LOW_END ? 2 : 2.5);
  renderer.setSize(VW, VH, false);
  // Dar ekranda (dikey telefon) biraz daha geniş göster
  VIEW_H = VH > VW ? 30 : 26;
  const aspect = VW / VH;
  camera.top = VIEW_H / 2; camera.bottom = -VIEW_H / 2;
  camera.left = -VIEW_H / 2 * aspect; camera.right = VIEW_H / 2 * aspect;
  camera.updateProjectionMatrix();
  fx2d.width = Math.round(VW * DPR); fx2d.height = Math.round(VH * DPR);
  fx2d.style.width = VW + 'px'; fx2d.style.height = VH + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  SAFE_TOP = parseFloat(getComputedStyle(document.getElementById('safeProbe')).paddingTop) || 0;
}
addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 120));
if (window.visualViewport) visualViewport.addEventListener('resize', resize);

// Dünya → ekran izdüşümü (2B katmandaki yazılar için)
const _pv = new THREE.Vector3();
function project(x, y, z) {
  _pv.set(x, y, z).project(camera);
  return [(_pv.x * 0.5 + 0.5) * VW, (-_pv.y * 0.5 + 0.5) * VH];
}
/* Verilen yöndeki EN KISA "ekran dışı" mesafe.
   İzometride görünür alan döndürülmüş bir dikdörtgendir; sabit bir yarıçap
   kullanılırsa düşmanlar ya ekranda belirir ya da gereksiz uzakta doğar.
   Dünya yönünü ekran eksenlerine ayrıştırıp kenara olan mesafeyi buluyoruz. */
const SIN_ELEV = CAM_DIR.y;                       // kameranın yükseklik sinüsü
function spawnDist(a) {
  const c = Math.cos(a), s = Math.sin(a);
  const u = Math.abs((c - s) * Math.SQRT1_2);                 // ekran yatay bileşeni
  const v = Math.abs((c + s) * Math.SQRT1_2 * SIN_ELEV);      // ekran dikey bileşeni
  const halfW = VIEW_H / 2 * (VW / VH), halfH = VIEW_H / 2;
  return Math.min(u > 1e-4 ? halfW / u : 1e9, v > 1e-4 ? halfH / v : 1e9) + 4;
}

/* ============ 2) GİRDİ: SANAL JOYSTİCK + KLAVYE ============ */
const keys = {};
const joy = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0, r: 70 };
const input = { ax: 0, az: 0 };

fx2d.addEventListener('pointerdown', e => {
  if (G.state !== 'PLAY' || joy.active) return;
  joy.active = true; joy.id = e.pointerId;
  joy.ox = joy.x = e.clientX; joy.oy = joy.y = e.clientY;
  joy.r = Math.min(70, Math.min(VW, VH) * 0.17);
  fx2d.setPointerCapture(e.pointerId);
}, { passive: true });
fx2d.addEventListener('pointermove', e => {
  if (joy.active && e.pointerId === joy.id) { joy.x = e.clientX; joy.y = e.clientY; }
}, { passive: true });
const endPtr = e => { if (joy.active && e.pointerId === joy.id) { joy.active = false; joy.id = null; } };
fx2d.addEventListener('pointerup', endPtr, { passive: true });
fx2d.addEventListener('pointercancel', endPtr, { passive: true });
fx2d.addEventListener('contextmenu', e => e.preventDefault());

addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  if (e.code === 'Space' && (G.state === 'MENU' || G.state === 'OVER')) startGame();
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; joy.active = false; });

/* Ekran yönü ≠ dünya yönü: izometride "yukarı" dünyada -X-Z yönüdür.
   Joystick/klavye vektörünü kamera eksenlerine göre döndürüyoruz. */
const ISO_COS = Math.cos(-Math.PI / 4), ISO_SIN = Math.sin(-Math.PI / 4);
function readInput() {
  let sx = 0, sy = 0;
  if (joy.active) {
    const dx = joy.x - joy.ox, dy = joy.y - joy.oy, d = Math.hypot(dx, dy);
    if (d > 6) { const m = Math.min(d, joy.r) / joy.r; sx = dx / d * m; sy = dy / d * m; }
  } else {
    if (keys.KeyA || keys.ArrowLeft) sx -= 1;
    if (keys.KeyD || keys.ArrowRight) sx += 1;
    if (keys.KeyW || keys.ArrowUp) sy -= 1;
    if (keys.KeyS || keys.ArrowDown) sy += 1;
    const d = Math.hypot(sx, sy); if (d > 1) { sx /= d; sy /= d; }
  }
  // ekran (sx, sy) → dünya (x, z), 45° döndürülmüş
  input.ax = sx * ISO_COS - sy * ISO_SIN;
  input.az = sx * ISO_SIN + sy * ISO_COS;
  const m = Math.hypot(input.ax, input.az);
  if (m > 1) { input.ax /= m; input.az /= m; }
}

/* ============ 3) NESNE HAVUZU & SPATIAL HASH ============ */
class Pool {
  constructor(factory, cap) { this.factory = factory; this.cap = cap; this.free = []; this.active = []; }
  get() {
    if (this.active.length >= this.cap) return null;
    const o = this.free.pop() || this.factory();
    o.dead = false; this.active.push(o); return o;
  }
  releaseAt(i) { const a = this.active, l = a.length - 1; const o = a[i]; a[i] = a[l]; a.pop(); this.free.push(o); }
  sweep() { for (let i = this.active.length - 1; i >= 0; i--) if (this.active[i].dead) this.releaseAt(i); }
  clear() { while (this.active.length) this.releaseAt(this.active.length - 1); }
  get count() { return this.active.length; }
}
class SpatialHash {
  constructor(cell) { this.cell = cell; this.map = new Map(); }
  key(cx, cz) { return ((cx & 0xffff) << 16) | (cz & 0xffff); }
  clear() { for (const b of this.map.values()) b.length = 0; }
  insert(o) {
    const k = this.key(Math.floor(o.x / this.cell), Math.floor(o.z / this.cell));
    let b = this.map.get(k); if (!b) { b = []; this.map.set(k, b); }
    b.push(o);
  }
  query(x, z, r, out) {
    out.length = 0; const c = this.cell;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
    const z0 = Math.floor((z - r) / c), z1 = Math.floor((z + r) / c);
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
      const b = this.map.get(this.key(cx, cz));
      if (b) for (let i = 0; i < b.length; i++) out.push(b[i]);
    }
    return out;
  }
}
const hash = new SpatialHash(3);
const qbuf = [];

/* ============ 4) OYUN DURUMU ============ */
const G = {
  state: 'LOADING', time: 0, kills: 0, gold: 0,
  level: 1, xp: 0, xpNext: 10, pendingLevels: 0,
  shake: 0, hitStop: 0, flashRed: 0,
  spawnTimer: 0, bossIdx: 0, nextBossAt: 180, boss: null, finalSpawned: false,
  banner: '', bannerT: 0, dmgDealt: 0, win: false,
};
const WIN_TIME = 900, BOSS_EVERY = 180;
const addShake = v => { G.shake = Math.min(1.4, G.shake + v); };
const hitStop = v => { G.hitStop = Math.max(G.hitStop, v); };
const banner = (t, s = 2.4) => { G.banner = t; G.bannerT = s; };

/* ============ 5) OYUNCU ============ */
const P = {
  x: 0, z: 0, vx: 0, vz: 0, r: 0.62, y: 0,
  hp: 100, maxHp: 100, iframe: 0, yaw: 0, walk: 0, speed: 8.6,
  weapons: [], passives: {},
  base: { dmg: 1, atkSpeed: 1, area: 1, speedMul: 1, magnet: 1, armor: 0, regen: 0, crit: 0.08 },
  st: null, model: null, hitPop: 0,
};
function recomputeStats() {
  const s = Object.assign({}, P.base);
  for (const id in P.passives) { const lv = P.passives[id]; if (lv) PASSIVES[id].apply(s, lv); }
  P.st = s;
}
function resetPlayer() {
  P.x = P.z = 0; P.vx = P.vz = 0; P.maxHp = 100; P.hp = 100;
  P.iframe = 0; P.yaw = 0; P.walk = 0; P.hitPop = 0;
  P.weapons = []; P.passives = {};
  recomputeStats(); addWeapon('bolt');
}
function updatePlayer(dt) {
  const sp = P.speed * P.st.speedMul;
  const k = 1 - Math.pow(0.0005, dt);
  P.vx = lerp(P.vx, input.ax * sp, k);
  P.vz = lerp(P.vz, input.az * sp, k);
  P.x = clamp(P.x + P.vx * dt, -ARENA.hx + 1.5, ARENA.hx - 1.5);
  P.z = clamp(P.z + P.vz * dt, -ARENA.hz + 1.5, ARENA.hz - 1.5);
  const mv = Math.hypot(P.vx, P.vz);
  if (mv > 0.5) {
    const want = Math.atan2(P.vx, P.vz);
    let d = ((want - P.yaw + Math.PI * 3) % TAU) - Math.PI;
    P.yaw += d * Math.min(1, dt * 12);
    P.walk += dt * mv * 1.1;
  }
  if (P.iframe > 0) P.iframe -= dt;
  if (P.hitPop > 0) P.hitPop -= dt * 4;
  if (P.st.regen > 0 && P.hp < P.maxHp) P.hp = Math.min(P.maxHp, P.hp + P.st.regen * dt);
  // Modeli yerleştir; bacakları iskelet animasyonu sürer
  if (P.model) {
    const idleBob = mv < 0.5 ? Math.sin(G.time * 2.2) * 0.03 : 0;   // dururken nefes alma
    P.model.position.set(P.x, MODEL_Y + idleBob, P.z);
    P.model.rotation.y = P.yaw + MODEL_YAW;
    const pop = 1 + Math.max(0, P.hitPop) * 0.13;
    P.model.scale.setScalar(MODEL_SCALE * pop);
    P.model.visible = !(P.iframe > 0 && ((P.iframe * 20) | 0) % 2 === 0);
    updateKnightAnim(dt, mv);
  }
}
function hurtPlayer(dmg) {
  if (P.iframe > 0 || G.state !== 'PLAY') return;
  P.hp -= Math.max(1, dmg - P.st.armor);
  P.iframe = 0.62; G.flashRed = 0.35; addShake(0.42); hitStop(0.04);
  for (let i = 0; i < 10; i++) particle(P.x, 0.8, P.z, '#ff5566', 3, 6);
  if (P.hp <= 0) { P.hp = 0; gameOver(false); }
}

/* ============ 6) DÜŞMANLAR (INSTANCED RENDER) ============ */
const ETYPES = {
  zombie:   { hp: 12,  speed: 2.0, dmg: 8,  xp: 1, r: 0.6,  color: 0x5fae4e, geo: 'blob',  h: 1.1 },
  spider:   { hp: 7,   speed: 5.2, dmg: 6,  xp: 1, r: 0.45, color: 0xe2557d, geo: 'spike', h: 0.8 },
  skeleton: { hp: 22,  speed: 3.6, dmg: 10, xp: 1, r: 0.5,  color: 0xe8e2d0, geo: 'bone',  h: 1.3 },
  tank:     { hp: 90,  speed: 1.3, dmg: 18, xp: 5, r: 1.15, color: 0x8d9bb8, geo: 'block', h: 1.7 },
  wraith:   { hp: 45,  speed: 3.9, dmg: 12, xp: 5, r: 0.7,  color: 0x9a6bff, geo: 'ghost', h: 1.4 },
};
const BOSSES = [
  { name: 'GRAVE TITAN', color: 0xff6b3d, scale: 1.00 },
  { name: 'PLAGUE MAW', color: 0x7de06a, scale: 1.10 },
  { name: 'VOID WARDEN', color: 0x9a6bff, scale: 1.20 },
  { name: 'IRON COLOSSUS', color: 0x8d9bb8, scale: 1.32 },
  { name: 'OMEGA HORROR', color: 0xff3b6b, scale: 1.55 },
];
const MAX_ENEMIES = LOW_END ? 300 : 420;
let uid = 1;
const enemies = new Pool(() => ({
  uid: 0, x: 0, z: 0, vx: 0, vz: 0, kx: 0, kz: 0, type: 'zombie', cfg: null,
  hp: 1, maxHp: 1, r: 1, speed: 1, dmg: 1, xp: 1, flash: 0, dead: false,
  elite: false, boss: false, isFinal: false, scale: 1, atkT: 0, wob: 0,
  contactCd: 0, cdG: 0, cdZ: 0, bossName: '', bob: 0,
}), MAX_ENEMIES);

// --- Instanced mesh havuzları (tip başına bir çizim çağrısı) ---
function makeGeo(kind) {
  switch (kind) {
    case 'blob':  { const g = new THREE.IcosahedronGeometry(0.6, 0); g.scale(1, 0.95, 1); g.translate(0, 0.58, 0); return g; }
    case 'spike': { const g = new THREE.ConeGeometry(0.42, 1.0, 5); g.translate(0, 0.5, 0); return g; }
    case 'bone':  { const g = new THREE.CapsuleGeometry(0.32, 0.62, 3, 6); g.translate(0, 0.65, 0); return g; }
    case 'block': { const g = new THREE.BoxGeometry(1.15, 1.35, 1.15); g.translate(0, 0.68, 0); return g; }
    case 'ghost': { const g = new THREE.OctahedronGeometry(0.72, 0); g.scale(1, 1.35, 1); g.translate(0, 0.75, 0); return g; }
  }
}
const eMeshes = {};
for (const t in ETYPES) {
  const cfg = ETYPES[t];
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  const im = new THREE.InstancedMesh(makeGeo(cfg.geo), mat, MAX_ENEMIES);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  im.frustumCulled = false; im.count = 0;
  scene.add(im); eMeshes[t] = im;
}
// Zemin gölgeleri (yalancı blob shadow)
const shadowMesh = new THREE.InstancedMesh(
  new THREE.CircleGeometry(1, 10),
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
  MAX_ENEMIES + 8);
shadowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
shadowMesh.frustumCulled = false; shadowMesh.count = 0;
scene.add(shadowMesh);

// Boss ayrı mesh (tekil, büyük)
const bossMat = new THREE.MeshLambertMaterial({ color: 0xff6b3d, flatShading: true });
const bossMesh = new THREE.Group();
{
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 0), bossMat);
  body.position.y = 1.9; bossMesh.add(body);
  const crown = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1.6, 7), bossMat);
  crown.position.y = 3.3; bossMesh.add(crown);
  for (let i = 0; i < 6; i++) {
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.1, 4), bossMat);
    const a = i / 6 * TAU;
    sp.position.set(Math.cos(a) * 1.5, 1.9, Math.sin(a) * 1.5);
    sp.rotation.z = -Math.cos(a) * 1.1; sp.rotation.x = Math.sin(a) * 1.1;
    bossMesh.add(sp);
  }
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.9, 1.0, 8), bossMat);
  base.position.y = 0.5; bossMesh.add(base);
}
bossMesh.visible = false; scene.add(bossMesh);

function diff() {
  const m = G.time / 60;
  return {
    hp: 1 + m * 0.40 + m * m * 0.055,
    spd: Math.min(1.70, 1 + m * 0.030),
    dmg: 1 + m * 0.12,
    cap: Math.min(MAX_ENEMIES, Math.floor(45 + m * 34)),
    rate: Math.max(0.10, 0.70 - m * 0.075),
    batch: 2 + Math.floor(m * 1.3),
    eliteChance: clamp((m - 3) * 0.02, 0, 0.18),
  };
}
// Biyoma ve zamana göre düşman tipi
function pickType(x, z) {
  const m = G.time / 60, r = Math.random(), b = biomeAt(x, z);
  if (b === 'volcanic' && m > 1.5 && r < 0.45) return 'skeleton';
  if (b === 'ruins' && m > 4 && r < 0.30) return 'wraith';
  if (b === 'rocky' && m > 2 && r < 0.35) return 'tank';
  if (m > 6 && r < 0.14) return 'wraith';
  if (m > 2.5 && r < 0.22) return 'tank';
  if (m > 0.6 && r < 0.48) return 'spider';
  return 'zombie';
}
function spawnEnemy(type, ang, boss = false, final = false) {
  const e = enemies.get(); if (!e) return null;
  // Arena içinde kalan, ekranın hemen dışındaki bir doğum noktası bul
  let x = 0, z = 0, ok = false;
  for (let i = 0; i < 14; i++) {
    const a = (i === 0 && ang !== undefined) ? ang : rnd(TAU);
    const R = spawnDist(a);
    x = P.x + Math.cos(a) * R; z = P.z + Math.sin(a) * R;
    if (Math.abs(x) < ARENA.hx - 2 && Math.abs(z) < ARENA.hz - 2) { ok = true; break; }
  }
  if (!ok) { x = clamp(x, -ARENA.hx + 2, ARENA.hx - 2); z = clamp(z, -ARENA.hz + 2, ARENA.hz - 2); }

  const t = type || pickType(x, z);
  const cfg = ETYPES[t] || ETYPES.zombie;
  const d = diff();
  e.uid = uid++; e.type = boss ? 'boss' : t; e.cfg = cfg; e.boss = boss; e.isFinal = final;
  e.x = x; e.z = z; e.vx = e.vz = e.kx = e.kz = 0; e.flash = 0; e.wob = rnd(TAU);
  e.contactCd = 0; e.cdG = 0; e.cdZ = 0; e.atkT = 2.5; e.bob = rnd(TAU);
  e.elite = !boss && Math.random() < d.eliteChance;
  e.scale = boss ? BOSSES[Math.min(G.bossIdx, BOSSES.length - 1)].scale : (e.elite ? 1.45 : 1);
  e.r = (boss ? 2.2 : cfg.r) * e.scale;
  e.maxHp = (boss ? 1800 : cfg.hp) * d.hp * (e.elite ? 5 : 1) * (boss ? 1 + G.bossIdx * 0.85 : 1);
  e.hp = e.maxHp;
  e.speed = (boss ? 2.1 : cfg.speed) * d.spd * (e.elite ? 0.85 : 1);
  e.dmg = (boss ? 26 : cfg.dmg) * d.dmg * (e.elite ? 1.4 : 1);
  e.xp = (boss ? 20 : cfg.xp) * (e.elite ? 20 : 1);
  if (boss) {
    const B = BOSSES[Math.min(G.bossIdx, BOSSES.length - 1)];
    e.bossName = B.name; bossMat.color.setHex(B.color);
    bossMesh.visible = true; G.boss = e; G.bossIdx++;
  }
  return e;
}
function spawnWave(dt) {
  const d = diff();
  G.spawnTimer -= dt;
  if (G.spawnTimer <= 0 && enemies.count < d.cap) {
    G.spawnTimer = d.rate;
    const n = Math.min(d.batch, d.cap - enemies.count);
    const clusterA = rnd(TAU), cluster = Math.random() < 0.5;
    for (let i = 0; i < n; i++) spawnEnemy(null, cluster ? clusterA + rnd(0.5, -0.5) : rnd(TAU));
  }
  if (!G.boss) {
    if (G.time >= WIN_TIME && !G.finalSpawned) {
      G.finalSpawned = true; G.bossIdx = BOSSES.length - 1;
      const b = spawnEnemy(null, rnd(TAU), true, true);
      if (b) { banner('FİNAL BOSS: ' + b.bossName, 3.2); addShake(0.9); } else G.finalSpawned = false;
    } else if (G.time >= G.nextBossAt && G.time < WIN_TIME) {
      const b = spawnEnemy(null, rnd(TAU), true);
      if (b) { G.nextBossAt += BOSS_EVERY; banner('BOSS: ' + b.bossName, 3); addShake(0.7); }
    }
  }
}
function updateEnemies(dt) {
  const A = enemies.active;
  for (let i = 0; i < A.length; i++) {
    const e = A[i];
    if (e.flash > 0) e.flash -= dt;
    if (e.contactCd > 0) e.contactCd -= dt;
    if (e.cdG > 0) e.cdG -= dt;
    if (e.cdZ > 0) e.cdZ -= dt;
    const dx = P.x - e.x, dz = P.z - e.z, d = Math.hypot(dx, dz) || 1;
    let sp = e.speed;
    if (e.type === 'spider') sp *= 1 + Math.sin(G.time * 6 + e.wob) * 0.22;
    e.vx = dx / d * sp; e.vz = dz / d * sp;
    e.x += (e.vx + e.kx) * dt; e.z += (e.vz + e.kz) * dt;
    e.kx *= Math.pow(0.0015, dt); e.kz *= Math.pow(0.0015, dt);
    e.x = clamp(e.x, -ARENA.hx - 4, ARENA.hx + 4);
    e.z = clamp(e.z, -ARENA.hz - 4, ARENA.hz + 4);
    if (d < e.r + P.r && e.contactCd <= 0) { hurtPlayer(e.dmg); e.contactCd = 0.5; }
    if (e.boss) { e.atkT -= dt; if (e.atkT <= 0) { bossAttack(e); e.atkT = rnd(4.6, 3.0); } }
  }
  hash.clear();
  for (let i = 0; i < A.length; i++) hash.insert(A[i]);
  separate();
}
function separate() {
  for (const bucket of hash.map.values()) {
    const n = bucket.length; if (n < 2) continue;
    for (let i = 0; i < n; i++) {
      const a = bucket[i];
      for (let j = i + 1; j < n; j++) {
        const b = bucket[j];
        const dx = b.x - a.x, dz = b.z - a.z;
        const min = (a.r + b.r) * 0.82, d2 = dx * dx + dz * dz;
        if (d2 > 1e-4 && d2 < min * min) {
          const d = Math.sqrt(d2), push = (min - d) * 0.5;
          const nx = dx / d * push, nz = dz / d * push;
          const wa = b.boss ? 0 : 1, wb = a.boss ? 0 : 1;
          a.x -= nx * wa; a.z -= nz * wa; b.x += nx * wb; b.z += nz * wb;
        }
      }
    }
  }
}
// Instanced matrisleri her karede doldur
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v3 = new THREE.Vector3(), _s3 = new THREE.Vector3();
const _col = new THREE.Color();
const _AXIS_X = new THREE.Vector3(1, 0, 0), _AXIS_Y = new THREE.Vector3(0, 1, 0);
function syncEnemyMeshes() {
  const counts = {};
  for (const t in eMeshes) counts[t] = 0;
  let si = 0;
  const A = enemies.active;
  for (let i = 0; i < A.length; i++) {
    const e = A[i];
    if (e.dead) continue;
    // yalancı zemin gölgesi
    if (si < MAX_ENEMIES) {
      _v3.set(e.x, 0.02, e.z); _q.setFromAxisAngle(_AXIS_X, -Math.PI / 2);
      _s3.setScalar(e.r * 0.95);
      _m4.compose(_v3, _q, _s3); shadowMesh.setMatrixAt(si++, _m4);
    }
    if (e.boss) {
      bossMesh.position.set(e.x, Math.sin(G.time * 2 + e.bob) * 0.15, e.z);
      bossMesh.scale.setScalar(e.scale);
      bossMesh.rotation.y += 0.004;
      bossMat.color.setHex(e.flash > 0 ? 0xffffff : BOSSES[Math.min(G.bossIdx - 1, BOSSES.length - 1)].color);
      continue;
    }
    const im = eMeshes[e.type]; if (!im) continue;
    const k = counts[e.type]++;
    if (k >= MAX_ENEMIES) continue;
    const bob = Math.sin(G.time * 7 + e.bob) * 0.06;
    _v3.set(e.x, bob, e.z);
    _q.setFromAxisAngle(_AXIS_Y, Math.atan2(e.vx, e.vz));
    _s3.setScalar(e.scale);
    _m4.compose(_v3, _q, _s3);
    im.setMatrixAt(k, _m4);
    _col.setHex(e.flash > 0 ? 0xffffff : (e.elite ? 0xffd23f : e.cfg.color));
    im.setColorAt(k, _col);
  }
  for (const t in eMeshes) {
    const im = eMeshes[t];
    im.count = counts[t];
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }
  // oyuncunun gölgesi
  _v3.set(P.x, 0.02, P.z); _q.setFromAxisAngle(_AXIS_X, -Math.PI / 2); _s3.setScalar(0.7);
  _m4.compose(_v3, _q, _s3); shadowMesh.setMatrixAt(si++, _m4);
  shadowMesh.count = si;
  shadowMesh.instanceMatrix.needsUpdate = true;
}

/* ---- Boss telegraf saldırıları (yere kırmızı alan) ---- */
const telegraphs = new Pool(() => ({ x: 0, z: 0, r: 0, t: 0, dur: 1, dmg: 0, dead: false, mesh: null }), 12);
const tgMat = new THREE.MeshBasicMaterial({ color: 0xff2b3d, transparent: true, opacity: 0.32, depthWrite: false });
const tgFillMat = new THREE.MeshBasicMaterial({ color: 0xff6a6a, transparent: true, opacity: 0.5, depthWrite: false });
function tgMesh() {
  const g = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.CircleGeometry(1, 24), tgMat);
  const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 24), tgFillMat);
  outer.rotation.x = fill.rotation.x = -Math.PI / 2;
  outer.position.y = 0.08; fill.position.y = 0.09;
  g.add(outer); g.add(fill); g.userData.fill = fill;
  scene.add(g); return g;
}
function bossAttack(b) {
  const roll = Math.random();
  const add = (x, z, r, dur, dmg) => {
    const t = telegraphs.get(); if (!t) return;
    if (!t.mesh) t.mesh = tgMesh();
    t.mesh.visible = true;
    t.x = x; t.z = z; t.r = r; t.t = 0; t.dur = dur; t.dmg = dmg;
    t.mesh.position.set(x, 0, z); t.mesh.scale.setScalar(r);
  };
  if (roll < 0.45) add(P.x + rnd(2, -2), P.z + rnd(2, -2), 5 * b.scale, 1.15, b.dmg * 1.6);
  else if (roll < 0.78) {
    for (let i = 0; i < 3; i++) {
      const a = rnd(TAU), rr = rnd(7, 2);
      add(P.x + Math.cos(a) * rr, P.z + Math.sin(a) * rr, 3.8 * b.scale, 1.25 + i * 0.15, b.dmg);
    }
  } else {
    add(b.x, b.z, 11 * b.scale, 1.5, b.dmg * 1.8);
    for (let i = 0; i < 4; i++) spawnEnemy('spider', rnd(TAU));
  }
}
function updateTelegraphs(dt) {
  const A = telegraphs.active;
  for (let i = 0; i < A.length; i++) {
    const t = A[i]; t.t += dt;
    const k = clamp(t.t / t.dur, 0, 1);
    if (t.mesh) t.mesh.userData.fill.scale.setScalar(Math.max(0.001, k));
    if (t.t >= t.dur) {
      if (dist(P.x, P.z, t.x, t.z) < t.r) hurtPlayer(t.dmg);
      addShake(0.5); hitStop(0.03);
      for (let n = 0; n < 20; n++) {
        const a = rnd(TAU);
        particle(t.x + Math.cos(a) * t.r * 0.6, 0.4, t.z + Math.sin(a) * t.r * 0.6, '#ff7a4d', 4, 9);
      }
      if (t.mesh) t.mesh.visible = false;
      t.dead = true;
    }
  }
  telegraphs.sweep();
}

/* ============ 7) MERMİLER / ALANLAR / IŞINLAR / EFEKTLER ============ */
const MAX_BULLETS = LOW_END ? 220 : 360;
const bullets = new Pool(() => ({
  x: 0, z: 0, y: 0.9, vx: 0, vz: 0, r: 0.2, dmg: 1, life: 1, pierce: 1, dead: false,
  kind: 'bolt', color: 0x7ddcff, hits: [], homing: 0, target: null, spin: 0,
  tx: 0, tz: 0, boom: 0, zone: null, big: false, cluster: 0,
}), MAX_BULLETS);
const bulletMesh = new THREE.InstancedMesh(
  (() => { const g = new THREE.BoxGeometry(1, 0.34, 0.34); return g; })(),
  new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_BULLETS);
bulletMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
bulletMesh.frustumCulled = false; bulletMesh.count = 0;
scene.add(bulletMesh);

const zones = new Pool(() => ({ x: 0, z: 0, r: 1, dps: 10, life: 3, maxLife: 3, dead: false, tick: 0, mesh: null }), 34);
const zoneMat = new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending });
const blasts = new Pool(() => ({ x: 0, z: 0, r: 1, life: .25, maxLife: .25, dead: false, mesh: null }), 26);
const blastMat = new THREE.MeshBasicMaterial({ color: 0xffb03a, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
const beams = new Pool(() => ({ x: 0, z: 0, a: 0, len: 1, w: 1, life: .2, maxLife: .2, dead: false, mesh: null }), 16);
const beamMat = new THREE.MeshBasicMaterial({ color: 0x9ef1ff, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });

const MAX_PICKUPS = LOW_END ? 320 : 460;
const pickups = new Pool(() => ({ x: 0, z: 0, vx: 0, vz: 0, kind: 'xp1', val: 1, dead: false, t: 0, pulled: false }), MAX_PICKUPS);
const gemColors = { xp1: 0x4ea8ff, xp5: 0x5dffa0, xp20: 0xffd23f, gold: 0xffb020, heal: 0xff5f7a };
const gemMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.28, 0),
  new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_PICKUPS);
gemMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
gemMesh.frustumCulled = false; gemMesh.count = 0;
scene.add(gemMesh);

// Parçacıklar ve hasar sayıları 2B katmanda (dünya koordinatlarıyla)
const parts = new Pool(() => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: .4, maxLife: .4, r: 3, color: '#fff', dead: false }), LOW_END ? 260 : 420);
const texts = new Pool(() => ({ x: 0, y: 0, z: 0, vy: 2.2, life: .7, maxLife: .7, txt: '', crit: false, dead: false }), 80);

function shoot(x, z, ang, spd, dmg, pierce, r, kind, color, opt) {
  const b = bullets.get(); if (!b) return null;
  b.x = x; b.z = z; b.y = 0.95;
  b.vx = Math.sin(ang) * spd; b.vz = Math.cos(ang) * spd;
  b.r = r; b.dmg = dmg; b.pierce = pierce; b.life = 2.2; b.kind = kind; b.color = color;
  b.hits.length = 0; b.homing = 0; b.target = null; b.spin = rnd(TAU);
  b.boom = 0; b.big = false; b.cluster = 0; b.zone = null;
  if (opt) Object.assign(b, opt);
  return b;
}
function particle(x, y, z, color, r, spd) {
  const p = parts.get(); if (!p) return;
  const a = rnd(TAU), e = rnd(1, -0.2), s = rnd(spd, spd * 0.25);
  p.x = x; p.y = y; p.z = z;
  p.vx = Math.cos(a) * s; p.vz = Math.sin(a) * s; p.vy = e * s * 0.7;
  p.r = r; p.color = color; p.life = p.maxLife = rnd(0.55, 0.22);
}
function addText(x, y, z, v, crit) {
  if (texts.count > 55 && !crit) return;
  const t = texts.get(); if (!t) return;
  t.x = x + rnd(0.4, -0.4); t.y = y; t.z = z; t.vy = crit ? 3.2 : 2.4;
  t.txt = String(Math.round(v)); t.crit = crit;
  t.life = t.maxLife = crit ? 0.85 : 0.6;
}
function explode(x, z, r, dmg, colorHex = 0xffb03a) {
  const list = hash.query(x, z, r, qbuf);
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.dead) continue;
    if (dist2(e.x, e.z, x, z) < (r + e.r) * (r + e.r)) hitEnemy(e, dmg, x, z, 7, true);
  }
  for (let i = 0; i < 16; i++) particle(x, 0.6, z, '#ffb03a', rnd(5, 2), 11);
  addShake(0.35); hitStop(0.035);
  const b = blasts.get();
  if (b) {
    if (!b.mesh) { b.mesh = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 20), blastMat); b.mesh.rotation.x = -Math.PI / 2; scene.add(b.mesh); }
    b.mesh.visible = true; b.mesh.position.set(x, 0.25, z);
    b.x = x; b.z = z; b.r = r; b.life = b.maxLife = 0.25;
  }
}
function detonate(b) {
  explode(b.x, b.z, b.boom, b.dmg, b.color);
  for (let i = 0; i < b.cluster; i++) {
    const a = rnd(TAU);
    shoot(b.x, b.z, a, rnd(17, 8), b.dmg * 0.45, 1, 0.22, 'rocket', 0xffd06a, { life: rnd(0.55, 0.25), boom: b.boom * 0.6 });
  }
}
function makeFire(x, z, cfg) {
  const zn = zones.get(); if (!zn) return;
  if (!zn.mesh) { zn.mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 18), zoneMat); zn.mesh.rotation.x = -Math.PI / 2; scene.add(zn.mesh); }
  zn.mesh.visible = true; zn.mesh.position.set(x, 0.12, z); zn.mesh.scale.setScalar(cfg.r);
  zn.x = x; zn.z = z; zn.r = cfg.r; zn.dps = cfg.dps; zn.life = zn.maxLife = cfg.life; zn.tick = 0;
  for (let i = 0; i < 10; i++) particle(x, 0.3, z, '#ffae4d', 4, 6);
}
function updateBullets(dt) {
  const A = bullets.active;
  for (let i = 0; i < A.length; i++) {
    const b = A[i];
    b.life -= dt;
    if (b.homing > 0) {
      if (!b.target || b.target.dead) b.target = findNearest(b.x, b.z, 34);
      if (b.target) {
        const want = Math.atan2(b.target.x - b.x, b.target.z - b.z);
        const cur = Math.atan2(b.vx, b.vz);
        let d = ((want - cur + Math.PI * 3) % TAU) - Math.PI;
        const na = cur + clamp(d, -b.homing * dt, b.homing * dt);
        const sp = Math.hypot(b.vx, b.vz);
        b.vx = Math.sin(na) * sp; b.vz = Math.cos(na) * sp;
      }
    }
    b.x += b.vx * dt; b.z += b.vz * dt; b.spin += dt * 14;
    if (b.kind === 'molotov' && (b.life <= 0 || dist2(b.x, b.z, b.tx, b.tz) < 0.55)) {
      makeFire(b.x, b.z, b.zone); b.dead = true; continue;
    }
    if (b.life <= 0) { if (b.boom > 0) detonate(b); b.dead = true; continue; }
    const list = hash.query(b.x, b.z, b.r + 1.6, qbuf);
    for (let j = 0; j < list.length; j++) {
      const e = list[j];
      if (e.dead) continue;
      const rr = e.r + b.r;
      if (dist2(e.x, e.z, b.x, b.z) > rr * rr) continue;
      if (b.hits.indexOf(e.uid) >= 0) continue;
      b.hits.push(e.uid);
      if (b.boom > 0) { detonate(b); b.dead = true; break; }
      hitEnemy(e, b.dmg, b.x, b.z, b.big ? 11 : 5, b.big);
      if (--b.pierce <= 0) { b.dead = true; break; }
    }
  }
  bullets.sweep();
  // instanced çizim
  let n = 0;
  for (let i = 0; i < A.length; i++) {
    const b = A[i];
    _v3.set(b.x, b.y, b.z);
    _q.setFromAxisAngle(_AXIS_Y, Math.atan2(b.vx, b.vz) + Math.PI / 2);
    const L = b.kind === 'kunai' ? 0.9 : b.kind === 'rocket' ? 0.8 : 1.0;
    _s3.set(b.r * 4 * L, b.r * 2.4, b.r * 2.4);
    _m4.compose(_v3, _q, _s3);
    bulletMesh.setMatrixAt(n, _m4);
    _col.setHex(b.color); bulletMesh.setColorAt(n, _col);
    n++;
  }
  bulletMesh.count = n;
  bulletMesh.instanceMatrix.needsUpdate = true;
  if (bulletMesh.instanceColor) bulletMesh.instanceColor.needsUpdate = true;
}
function updateZones(dt) {
  let A = zones.active;
  for (let i = 0; i < A.length; i++) {
    const z = A[i];
    z.life -= dt;
    if (z.life <= 0) { if (z.mesh) z.mesh.visible = false; z.dead = true; continue; }
    if (z.mesh) { z.mesh.material = zoneMat; z.mesh.scale.setScalar(z.r * (0.9 + 0.1 * Math.sin(G.time * 9 + z.x))); }
    z.tick -= dt;
    if (z.tick <= 0) {
      z.tick = 0.25;
      const list = hash.query(z.x, z.z, z.r, qbuf);
      for (let j = 0; j < list.length; j++) {
        const e = list[j];
        if (e.dead || e.cdZ > 0) continue;
        if (dist2(e.x, e.z, z.x, z.z) < (z.r + e.r) * (z.r + e.r)) { hitEnemy(e, z.dps * 0.25, z.x, z.z, 0, false); e.cdZ = 0.2; }
      }
    }
  }
  zones.sweep();
  A = blasts.active;
  for (let i = 0; i < A.length; i++) {
    const b = A[i]; b.life -= dt;
    const k = b.life / b.maxLife;
    if (b.mesh) { b.mesh.scale.setScalar(b.r * (1.6 - k * 0.6)); b.mesh.material.opacity = k * 0.85; }
    if (b.life <= 0) { if (b.mesh) b.mesh.visible = false; b.dead = true; }
  }
  blasts.sweep();
  A = beams.active;
  for (let i = 0; i < A.length; i++) {
    const b = A[i]; b.life -= dt;
    const k = b.life / b.maxLife;
    if (b.mesh) { b.mesh.scale.set(b.w * k, b.w * k, b.len); b.mesh.material.opacity = k; }
    if (b.life <= 0) { if (b.mesh) b.mesh.visible = false; b.dead = true; }
  }
  beams.sweep();
}
function updateFx(dt) {
  let A = parts.active;
  for (let i = 0; i < A.length; i++) {
    const p = A[i];
    p.life -= dt; if (p.life <= 0) { p.dead = true; continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    p.vy -= 9 * dt;
    p.vx *= Math.pow(0.05, dt); p.vz *= Math.pow(0.05, dt);
    if (p.y < 0.05) { p.y = 0.05; p.vy *= -0.35; }
  }
  parts.sweep();
  A = texts.active;
  for (let i = 0; i < A.length; i++) {
    const t = A[i]; t.life -= dt; if (t.life <= 0) { t.dead = true; continue; }
    t.y += t.vy * dt; t.vy -= 4 * dt;
  }
  texts.sweep();
}

/* ============ 8) SİLAHLAR / PASİFLER / EVRİM ============ */
const EVO_PASSIVE_LV = 3, MAX_WEAPONS = 6, MAX_PASSIVES = 6, WEAPON_MAX_LV = 5;
function findNearest(x, z, maxD) {
  const A = enemies.active; let best = null, bd = maxD * maxD;
  for (let i = 0; i < A.length; i++) {
    const e = A[i]; if (e.dead) continue;
    const d = dist2(e.x, e.z, x, z);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
const _tbuf = [];
function findNearestN(x, z, maxD, n, out) {
  out.length = 0;
  const A = enemies.active;
  for (let i = 0; i < A.length && out.length < n * 4; i++) {
    const e = A[i]; if (e.dead) continue;
    if (dist2(e.x, e.z, x, z) < maxD * maxD) out.push(e);
  }
  out.sort((a, b) => dist2(a.x, a.z, x, z) - dist2(b.x, b.z, x, z));
  out.length = Math.min(out.length, n);
  return out;
}
const dmgOf = base => base * P.st.dmg;

const WEAPONS = {
  bolt: {
    name: 'Enerji Tabancası', evoName: 'Fırtına Mızrağı', icon: '⚡', evoIcon: '🌩️', evoWith: 'dmg',
    desc: 'En yakın düşmana enerji mermisi fırlatır.',
    evoDesc: 'Devasa delici mızraklar, her yöne şimşek.',
    stats(lv, evo) {
      return evo ? { cd: 0.30, dmg: 34, count: 4, spread: 0.5, speed: 32, pierce: 5, r: 0.34, color: 0xa9e6ff }
                 : { cd: 0.70 - 0.06 * (lv - 1), dmg: 12 + 5 * (lv - 1), count: lv >= 3 ? 2 : 1, spread: 0.14, speed: 26, pierce: lv >= 5 ? 2 : 1, r: 0.2, color: 0x7ddcff };
    },
    fire(w, s) {
      const t = findNearest(P.x, P.z, 30);
      const base = t ? Math.atan2(t.x - P.x, t.z - P.z) : P.yaw;
      for (let i = 0; i < s.count; i++)
        shoot(P.x, P.z, base + (i - (s.count - 1) / 2) * s.spread, s.speed, dmgOf(s.dmg), s.pierce, s.r, 'bolt', s.color, { big: !!w.evolved });
    },
  },
  guardian: {
    name: 'Döner Bıçaklar', evoName: 'Durdurulamaz Kalkan', icon: '🗡️', evoIcon: '🛡️', evoWith: 'spd',
    desc: 'Etrafında dönen bıçaklar temas edeni biçer.',
    evoDesc: 'Dev kalkan; sürekli hasar verir ve savurur.',
    orbit: true,
    stats(lv, evo) {
      return evo ? { n: 8, rad: 6.4, dmg: 30, spin: 3.2, size: 1.0, knock: 19, cd: 0.35 }
                 : { n: 1 + Math.floor(lv / 1.4), rad: 3.7 + lv * 0.35, dmg: 8 + 4 * (lv - 1), spin: 2.1 + lv * 0.16, size: 0.55 + lv * 0.05, knock: 6, cd: 0.5 };
    },
    update(w, s, dt) {
      w.ang = (w.ang || 0) + s.spin * dt * (0.75 + P.st.atkSpeed * 0.25);
      const rad = s.rad * P.st.area;
      w.blades = w.blades || [];
      for (let i = 0; i < s.n; i++) {
        const a = w.ang + i / s.n * TAU;
        const bx = P.x + Math.cos(a) * rad, bz = P.z + Math.sin(a) * rad;
        w.blades[i] = { x: bx, z: bz, a };
        const list = hash.query(bx, bz, s.size + 1.5, qbuf);
        for (let j = 0; j < list.length; j++) {
          const e = list[j];
          if (e.dead || e.cdG > 0) continue;
          const rr = e.r + s.size;
          if (dist2(e.x, e.z, bx, bz) < rr * rr) { hitEnemy(e, dmgOf(s.dmg), bx, bz, s.knock, !!w.evolved); e.cdG = s.cd; }
        }
      }
      w.blades.length = s.n;
    },
  },
  rocket: {
    name: 'Roketatar', evoName: 'Küme Bombardımanı', icon: '🚀', evoIcon: '💥', evoWith: 'area',
    desc: 'Güdümlü roket; çarpınca alan hasarı verir.',
    evoDesc: '4 roket; patlayınca küme bombalarına ayrılır.',
    stats(lv, evo) {
      return evo ? { cd: 1.0, dmg: 55, count: 4, boom: 5.2, speed: 15, homing: 5.5, cluster: 4 }
                 : { cd: 2.2 - 0.18 * (lv - 1), dmg: 20 + 9 * (lv - 1), count: lv >= 4 ? 2 : 1, boom: 3.1 + lv * 0.3, speed: 14, homing: 3.4, cluster: 0 };
    },
    fire(w, s) {
      const ts = findNearestN(P.x, P.z, 40, s.count, _tbuf);
      for (let i = 0; i < s.count; i++) {
        const t = ts[i] || ts[0];
        const a = t ? Math.atan2(t.x - P.x, t.z - P.z) : P.yaw + rnd(1, -1);
        const b = shoot(P.x, P.z, a, s.speed, dmgOf(s.dmg), 1, 0.3, 'rocket', 0xffb03a, { homing: s.homing, boom: s.boom * P.st.area, life: 3.2 });
        if (b && s.cluster) b.cluster = s.cluster;
      }
    },
  },
  laser: {
    name: 'Lazer Kesici', evoName: 'Ölüm Işını', icon: '🔆', evoIcon: '☄️', evoWith: 'atk',
    desc: 'Anlık ışın; hattaki herkesi deler.',
    evoDesc: 'Arenayı boydan boya yakan ölüm ışını.',
    stats(lv, evo) {
      return evo ? { cd: 0.7, dmg: 46, count: 3, w: 1.7, len: 70, color: 0xff6bd6 }
                 : { cd: 1.9 - 0.16 * (lv - 1), dmg: 16 + 8 * (lv - 1), count: lv >= 4 ? 2 : 1, w: 0.5 + lv * 0.1, len: 31 + lv * 2, color: 0x9ef1ff };
    },
    fire(w, s) {
      const ts = findNearestN(P.x, P.z, s.len, s.count, _tbuf);
      for (let i = 0; i < s.count; i++) {
        const t = ts[i]; if (!t) break;
        beamHit(P.x, P.z, Math.atan2(t.x - P.x, t.z - P.z), s.len, s.w * P.st.area, dmgOf(s.dmg), s.color, !!w.evolved);
      }
    },
  },
  molotov: {
    name: 'Molotof', evoName: 'Cehennem', icon: '🔥', evoIcon: '🌋', evoWith: 'area',
    desc: 'Yere ateş havuzu bırakır.',
    evoDesc: 'Devasa ve kalıcı lav gölleri.',
    stats(lv, evo) {
      return evo ? { cd: 1.6, count: 3, dps: 70, r: 6.5, life: 6.5 }
                 : { cd: 3.2 - 0.25 * (lv - 1), count: lv >= 4 ? 2 : 1, dps: 14 + 7 * (lv - 1), r: 2.8 + lv * 0.4, life: 3 + lv * 0.4 };
    },
    fire(w, s) {
      for (let i = 0; i < s.count; i++) {
        const t = findNearest(P.x, P.z, 26);
        const a = t ? Math.atan2(t.x - P.x, t.z - P.z) + rnd(0.6, -0.6) : rnd(TAU);
        const d = t ? Math.min(21, dist(P.x, P.z, t.x, t.z)) : rnd(15, 6);
        const tx = P.x + Math.sin(a) * d, tz = P.z + Math.cos(a) * d;
        const b = shoot(P.x, P.z, a, d / 0.55, 0, 999, 0.24, 'molotov', 0xff8a3d, { life: 0.6, tx, tz });
        if (b) b.zone = { r: s.r * P.st.area, dps: dmgOf(s.dps), life: s.life };
      }
    },
  },
  kunai: {
    name: 'Kunai Yağmuru', evoName: 'Girdap Kunai', icon: '🔪', evoIcon: '🌀', evoWith: 'mag',
    desc: 'Hızlı, delici bıçaklar fırlatır.',
    evoDesc: 'Her yöne saçılan kunailer; kristalleri çeker.',
    stats(lv, evo) {
      return evo ? { cd: 0.55, dmg: 26, count: 10, speed: 45, pierce: 99, spread: TAU }
                 : { cd: 1.5 - 0.13 * (lv - 1), dmg: 11 + 5 * (lv - 1), count: 2 + Math.floor(lv / 2), speed: 39, pierce: 1 + Math.floor(lv / 2), spread: 0.34 };
    },
    fire(w, s) {
      const t = findNearest(P.x, P.z, 40);
      const base = t ? Math.atan2(t.x - P.x, t.z - P.z) : P.yaw;
      for (let i = 0; i < s.count; i++) {
        const a = s.spread >= TAU ? base + i / s.count * TAU : base + (i - (s.count - 1) / 2) * s.spread;
        shoot(P.x, P.z, a, s.speed, dmgOf(s.dmg), s.pierce, 0.2, 'kunai', 0xdfe8ff, { life: 1.4 });
      }
      if (w.evolved) for (const p of pickups.active) p.pulled = true;
    },
  },
};
const PASSIVES = {
  dmg: { name: 'Güç', icon: '🗡️', max: 5, txt: l => `Tüm hasar +%${l * 20}`, apply: (s, l) => s.dmg += 0.20 * l },
  atk: { name: 'Hızlı Şarjör', icon: '⏱️', max: 5, txt: l => `Saldırı hızı +%${l * 14}`, apply: (s, l) => s.atkSpeed += 0.14 * l },
  spd: { name: 'Koşu Botu', icon: '👟', max: 5, txt: l => `Hareket hızı +%${l * 10}`, apply: (s, l) => s.speedMul += 0.10 * l },
  hp: { name: 'Zırh Plakası', icon: '❤️', max: 5, txt: l => `Maksimum HP +${l * 25}`, apply: () => {} },
  mag: { name: 'Mıknatıs', icon: '🧲', max: 5, txt: l => `Mıknatıs menzili +%${l * 35}`, apply: (s, l) => s.magnet += 0.35 * l },
  area: { name: 'Alan Genişliği', icon: '🌐', max: 5, txt: l => `Etki alanı +%${l * 15}`, apply: (s, l) => s.area += 0.15 * l },
  armor: { name: 'Zırh', icon: '🛡️', max: 5, txt: l => `Gelen hasar -${l * 3}`, apply: (s, l) => s.armor += 3 * l },
  regen: { name: 'Rejenerasyon', icon: '✚', max: 5, txt: l => `Saniyede ${(l * 0.7).toFixed(1)} HP`, apply: (s, l) => s.regen += 0.7 * l },
};

// Döner bıçak mesh havuzu
const bladeMat = new THREE.MeshLambertMaterial({ color: 0xdfe9ff });
const bladeEvoMat = new THREE.MeshBasicMaterial({ color: 0x7ecbff, transparent: true, opacity: 0.85 });
const bladeMeshes = [];
function getBlade(i) {
  if (!bladeMeshes[i]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 1.1), bladeMat);
    m.visible = false; scene.add(m); bladeMeshes[i] = m;
  }
  return bladeMeshes[i];
}
function addWeapon(id) { const w = { id, lv: 1, timer: 0, evolved: false, ang: 0, blades: [] }; P.weapons.push(w); return w; }
const getWeapon = id => P.weapons.find(w => w.id === id);

function updateWeapons(dt) {
  let bi = 0;
  for (let i = 0; i < P.weapons.length; i++) {
    const w = P.weapons[i], def = WEAPONS[w.id];
    const s = def.stats(w.lv, w.evolved);
    if (def.orbit) {
      def.update(w, s, dt);
      for (const bl of w.blades) {
        const m = getBlade(bi++);
        m.visible = true;
        m.material = w.evolved ? bladeEvoMat : bladeMat;
        m.position.set(bl.x, 0.85, bl.z);
        m.rotation.y = -bl.a; m.rotation.z = G.time * 6;
        m.scale.setScalar(w.evolved ? s.size * 2.0 : s.size * 1.5);
      }
      continue;
    }
    w.timer -= dt;
    if (w.timer <= 0) { w.timer = Math.max(0.05, s.cd / P.st.atkSpeed); def.fire(w, s); }
  }
  for (let i = bi; i < bladeMeshes.length; i++) bladeMeshes[i].visible = false;
}
function beamHit(x, z, a, len, w, dmg, colorHex, big) {
  const b = beams.get();
  if (b) {
    if (!b.mesh) { b.mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), beamMat.clone()); scene.add(b.mesh); }
    b.mesh.visible = true;
    b.mesh.material.color.setHex(colorHex);
    b.mesh.position.set(x + Math.sin(a) * len / 2, 0.9, z + Math.cos(a) * len / 2);
    b.mesh.rotation.y = a;
    b.x = x; b.z = z; b.a = a; b.len = len; b.w = w; b.life = b.maxLife = 0.2;
    b.mesh.scale.set(w, w, len);
  }
  const dx = Math.sin(a), dz = Math.cos(a);
  const A = enemies.active;
  for (let i = 0; i < A.length; i++) {
    const e = A[i]; if (e.dead) continue;
    const px = e.x - x, pz = e.z - z;
    const t = px * dx + pz * dz;
    if (t < 0 || t > len) continue;
    if (Math.abs(px * dz - pz * dx) < w * 0.5 + e.r) hitEnemy(e, dmg, e.x, e.z, big ? 8 : 3, big);
  }
  addShake(big ? 0.3 : 0.12);
}

/* ============ 9) XP / SEVİYE / KARTLAR ============ */
const xpForLevel = lv => Math.floor(5 + lv * 3.5 + Math.pow(lv, 1.42));
function spawnPickup(x, z, kind, val) {
  const p = pickups.get();
  if (!p) { if (kind.startsWith('xp')) gainXp(val); return; }
  p.x = x; p.z = z; p.kind = kind; p.val = val; p.t = rnd(TAU); p.pulled = false;
  const a = rnd(TAU), s = rnd(2.8, 0.9);
  p.vx = Math.cos(a) * s; p.vz = Math.sin(a) * s;
}
function dropLoot(e) {
  if (e.boss) {
    for (let i = 0; i < 12; i++) spawnPickup(e.x + rnd(3, -3), e.z + rnd(3, -3), 'xp20', 20);
    for (let i = 0; i < 6; i++) spawnPickup(e.x + rnd(3.5, -3.5), e.z + rnd(3.5, -3.5), 'gold', 10);
    spawnPickup(e.x, e.z + 1, 'heal', 35);
    return;
  }
  let kind = 'xp1', val = 1;
  if (e.xp >= 20) { kind = 'xp20'; val = 20; } else if (e.xp >= 5) { kind = 'xp5'; val = 5; }
  spawnPickup(e.x, e.z, kind, val);
  if (Math.random() < (e.elite ? 1 : 0.05)) spawnPickup(e.x + rnd(.7, -.7), e.z + rnd(.7, -.7), 'gold', e.elite ? 8 : rndi(4, 1));
  if (Math.random() < 0.012) spawnPickup(e.x, e.z, 'heal', 20);
}
function updatePickups(dt) {
  const A = pickups.active;
  const magR = 5.6 * P.st.magnet, magR2 = magR * magR;
  const pickR2 = (P.r + 0.8) * (P.r + 0.8);
  let n = 0;
  for (let i = 0; i < A.length; i++) {
    const p = A[i];
    p.t += dt;
    p.x += p.vx * dt; p.z += p.vz * dt;
    p.vx *= Math.pow(0.02, dt); p.vz *= Math.pow(0.02, dt);
    const d2 = dist2(p.x, p.z, P.x, P.z);
    if (p.pulled || d2 < magR2) {
      p.pulled = true;
      const d = Math.sqrt(d2) || 1;
      const sp = clamp(38 - d * 0.9, 13, 45);
      p.x += (P.x - p.x) / d * sp * dt; p.z += (P.z - p.z) / d * sp * dt;
    } else if (p.t > 6) {
      const d = Math.sqrt(d2) || 1;
      const sp = Math.min(15, (p.t - 6) * 2.8);
      p.x += (P.x - p.x) / d * sp * dt; p.z += (P.z - p.z) / d * sp * dt;
    }
    if (d2 < pickR2) { collect(p); p.dead = true; continue; }
    _v3.set(p.x, 0.45 + Math.sin(p.t * 5) * 0.12, p.z);
    _q.setFromAxisAngle(_AXIS_Y, p.t * 2);
    _s3.setScalar(p.kind === 'xp20' ? 1.3 : p.kind === 'xp5' ? 1.1 : 1);
    _m4.compose(_v3, _q, _s3);
    gemMesh.setMatrixAt(n, _m4);
    _col.setHex(gemColors[p.kind]); gemMesh.setColorAt(n, _col);
    n++;
  }
  gemMesh.count = n;
  gemMesh.instanceMatrix.needsUpdate = true;
  if (gemMesh.instanceColor) gemMesh.instanceColor.needsUpdate = true;
  pickups.sweep();
}
function collect(p) {
  if (p.kind === 'gold') { G.gold += p.val; addText(p.x, 1, p.z, p.val, false); }
  else if (p.kind === 'heal') { P.hp = Math.min(P.maxHp, P.hp + p.val); for (let i = 0; i < 8; i++) particle(P.x, 1, P.z, '#ff7a94', 3, 5); }
  else gainXp(p.val);
  particle(p.x, 0.6, p.z, '#bfe9ff', 2, 4);
}
function gainXp(v) {
  G.xp += v;
  while (G.xp >= G.xpNext) { G.xp -= G.xpNext; G.level++; G.pendingLevels++; G.xpNext = xpForLevel(G.level); }
  if (G.pendingLevels > 0 && G.state === 'PLAY') openLevelUp();
}
function buildChoices() {
  const evoOpts = [], upgOpts = [], newOpts = [], passOpts = [];
  for (const w of P.weapons) {
    const def = WEAPONS[w.id];
    if (!w.evolved && w.lv >= WEAPON_MAX_LV) {
      if ((P.passives[def.evoWith] || 0) >= EVO_PASSIVE_LV) evoOpts.push({ kind: 'evo', id: w.id });
    } else if (w.lv < WEAPON_MAX_LV) upgOpts.push({ kind: 'weapon', id: w.id });
  }
  if (P.weapons.length < MAX_WEAPONS)
    for (const id in WEAPONS) if (!getWeapon(id)) newOpts.push({ kind: 'weapon', id, isNew: true });
  const pCount = Object.keys(P.passives).filter(k => P.passives[k]).length;
  for (const id in PASSIVES) {
    const lv = P.passives[id] || 0;
    if (lv >= PASSIVES[id].max) continue;
    if (lv === 0 && pCount >= MAX_PASSIVES) continue;
    passOpts.push({ kind: 'passive', id });
  }
  const out = [];
  if (evoOpts.length) out.push(pick(evoOpts));
  const pool = upgOpts.concat(upgOpts, newOpts, passOpts);
  while (out.length < 3 && pool.length) {
    const c = pool.splice((Math.random() * pool.length) | 0, 1)[0];
    if (out.some(o => o.kind === c.kind && o.id === c.id)) continue;
    out.push(c);
  }
  const utils = ['heal', 'gold', 'bomb'];
  for (let i = 0; out.length < 3 && i < utils.length; i++)
    if (!out.some(o => o.kind === 'util' && o.id === utils[i])) out.push({ kind: 'util', id: utils[i] });
  return out;
}
function upgradeText(id, lv) {
  const d = WEAPONS[id], a = d.stats(lv, false), b = d.stats(lv + 1, false), bits = [];
  if (b.dmg && b.dmg !== a.dmg) bits.push(`Hasar ${a.dmg}→${b.dmg}`);
  if (b.dps && b.dps !== a.dps) bits.push(`Saniyelik hasar ${a.dps}→${b.dps}`);
  if (b.count > a.count) bits.push(`Adet ${a.count}→${b.count}`);
  if (b.n && b.n > a.n) bits.push(`Bıçak ${a.n}→${b.n}`);
  if (b.cd && b.cd < a.cd) bits.push(`Bekleme -%${Math.round((1 - b.cd / a.cd) * 100)}`);
  if (b.pierce > a.pierce) bits.push(`Delme ${a.pierce}→${b.pierce}`);
  if (lv + 1 >= WEAPON_MAX_LV) bits.push(`⭐ ${PASSIVES[d.evoWith].name} Sv.${EVO_PASSIVE_LV} ile EVRİM açılır`);
  return bits.join(' · ') || 'Güçlendirilir.';
}
function cardInfo(c) {
  if (c.kind === 'evo') { const d = WEAPONS[c.id]; return { ico: d.evoIcon, nm: d.evoName, lv: 'EVRİM!', ds: d.evoDesc, cls: 'evo' }; }
  if (c.kind === 'weapon') {
    const d = WEAPONS[c.id], w = getWeapon(c.id);
    return { ico: d.icon, nm: d.name, lv: w ? `Sv. ${w.lv} → ${w.lv + 1}` : 'YENİ SİLAH', ds: w ? upgradeText(c.id, w.lv) : d.desc, cls: 'weapon' };
  }
  if (c.kind === 'passive') {
    const d = PASSIVES[c.id], lv = (P.passives[c.id] || 0) + 1;
    return { ico: d.icon, nm: d.name, lv: `Sv. ${lv}/${d.max}`, ds: d.txt(lv), cls: 'passive' };
  }
  const U = { heal: { ico: '🍗', nm: 'Yemek', ds: 'Canını tamamen doldur.' },
              gold: { ico: '💰', nm: 'Altın Kesesi', ds: '+50 altın kazan.' },
              bomb: { ico: '💣', nm: 'Kutsal Bomba', ds: 'Tüm düşmanlara ağır hasar.' } }[c.id];
  return { ico: U.ico, nm: U.nm, lv: 'ANLIK', ds: U.ds, cls: 'util' };
}
function applyCard(c) {
  if (c.kind === 'evo') {
    const w = getWeapon(c.id); w.evolved = true; w.timer = 0;
    banner('EVRİM: ' + WEAPONS[c.id].evoName, 2.6); addShake(0.7);
    for (let i = 0; i < 40; i++) particle(P.x, 1, P.z, '#d3a4ff', 5, 14);
  } else if (c.kind === 'weapon') { const w = getWeapon(c.id); if (w) w.lv++; else addWeapon(c.id); }
  else if (c.kind === 'passive') {
    P.passives[c.id] = (P.passives[c.id] || 0) + 1;
    if (c.id === 'hp') { P.maxHp += 25; P.hp += 25; }
    recomputeStats();
  }
  else if (c.id === 'heal') P.hp = P.maxHp;
  else if (c.id === 'gold') G.gold += 50;
  else if (c.id === 'bomb') {
    for (const e of enemies.active.slice()) if (!e.dead) hitEnemy(e, 300 * P.st.dmg, P.x, P.z, 13, true);
    addShake(1.0);
    for (let i = 0; i < 50; i++) particle(P.x, 1, P.z, '#ffe08a', 5, 18);
  }
}
const elCards = document.getElementById('cards');
const elLevelup = document.getElementById('levelup');
function openLevelUp() {
  G.state = 'LEVELUP';
  elCards.innerHTML = '';
  document.getElementById('lvSub').textContent = `SEVİYE ${G.level}` + (G.pendingLevels > 1 ? ` · SIRADA ${G.pendingLevels - 1} SEÇİM DAHA` : '');
  buildChoices().forEach(c => {
    const info = cardInfo(c);
    const el = document.createElement('div');
    el.className = 'card ' + info.cls;
    el.innerHTML = `<div class="ico">${info.ico}</div><div class="nm">${info.nm}</div><div class="lv">${info.lv}</div><div class="ds">${info.ds}</div>`;
    el.addEventListener('click', () => chooseCard(c), { once: true });
    elCards.appendChild(el);
  });
  elLevelup.classList.add('show');
}
function chooseCard(c) {
  applyCard(c); G.pendingLevels--;
  elLevelup.classList.remove('show');
  if (G.pendingLevels > 0) setTimeout(openLevelUp, 60);
  else { G.state = 'PLAY'; joy.active = false; }
}

/* ============ 10) HASAR & ÖLÜM ============ */
function hitEnemy(e, dmg, sx, sz, knock, big) {
  const crit = Math.random() < P.st.crit;
  const d = crit ? dmg * 2 : dmg;
  e.hp -= d; G.dmgDealt += d;
  e.flash = 0.09;
  addText(e.x, (e.cfg ? e.cfg.h : 2) * e.scale + 0.4, e.z, d, crit);
  if (knock && !e.boss) {
    const dx = e.x - sx, dz = e.z - sz, dd = Math.hypot(dx, dz) || 1;
    e.kx += dx / dd * knock; e.kz += dz / dd * knock;
  }
  if (big || crit) { addShake(crit ? 0.22 : 0.16); if (big) hitStop(0.05); }
  for (let i = 0; i < (big ? 5 : 2); i++) particle(e.x, 0.7, e.z, crit ? '#fff2a0' : '#ffd0d0', 2.5, 7);
  if (e.hp <= 0) killEnemy(e);
}
function killEnemy(e) {
  if (e.dead) return;
  e.dead = true; G.kills++;
  dropLoot(e);
  const col = e.boss ? '#ff8a5a' : '#' + (e.cfg.color).toString(16).padStart(6, '0');
  const n = e.boss ? 60 : e.elite ? 20 : 8;
  for (let i = 0; i < n; i++) particle(e.x, 0.7, e.z, i % 3 ? col : '#ffffff', e.boss ? 6 : 3, e.boss ? 20 : 9);
  if (e.boss) {
    G.boss = null; bossMesh.visible = false; addShake(1.2); hitStop(0.12);
    banner(e.bossName + ' YOK EDİLDİ!', 2.4);
    if (e.isFinal) gameOver(true);
  } else if (e.elite) addShake(0.28);
}

/* ============ 11) 2B KATMAN: HUD, HASAR SAYILARI, JOYSTİCK ============ */
function drawOverlay() {
  ctx.clearRect(0, 0, VW, VH);

  // parçacıklar (dünya → ekran)
  let A = parts.active;
  for (let i = 0; i < A.length; i++) {
    const p = A[i];
    const [sx, sy] = project(p.x, p.y, p.z);
    if (sx < -20 || sx > VW + 20 || sy < -20 || sy > VH + 20) continue;
    const k = p.life / p.maxLife;
    ctx.globalAlpha = k; ctx.fillStyle = p.color;
    const r = p.r * k;
    ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
  }
  ctx.globalAlpha = 1;

  // hasar sayıları
  A = texts.active;
  ctx.textAlign = 'center';
  for (let i = 0; i < A.length; i++) {
    const t = A[i];
    const [sx, sy] = project(t.x, t.y, t.z);
    if (sx < -40 || sx > VW + 40 || sy < -30 || sy > VH + 30) continue;
    const k = t.life / t.maxLife;
    ctx.globalAlpha = clamp(k * 1.6, 0, 1);
    ctx.font = (t.crit ? '900 ' : '800 ') + (t.crit ? 21 : 15) + 'px Trebuchet MS, sans-serif';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.75)';
    ctx.strokeText(t.txt, sx, sy);
    ctx.fillStyle = t.crit ? '#fff06a' : '#ffe9a8';
    ctx.fillText(t.txt, sx, sy);
  }
  ctx.globalAlpha = 1;

  // oyuncu can barı (başının üstünde)
  {
    const [sx, sy] = project(P.x, 2.0, P.z);
    const w = 46, h = 5, hx = sx - w / 2, hy = sy;
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(hx - 1, hy - 1, w + 2, h + 2);
    const k = clamp(P.hp / P.maxHp, 0, 1);
    ctx.fillStyle = k > .5 ? '#4be07f' : k > .25 ? '#ffcc3d' : '#ff4d5e';
    ctx.fillRect(hx, hy, w * k, h);
  }
  // düşman can barları (sadece hasar almış, ekranda olanlar)
  A = enemies.active;
  for (let i = 0; i < A.length; i++) {
    const e = A[i];
    if (e.dead || e.boss || e.hp >= e.maxHp) continue;
    const [sx, sy] = project(e.x, (e.cfg.h * e.scale) + 0.35, e.z);
    if (sx < 0 || sx > VW || sy < 0 || sy > VH) continue;
    const w = 22 * e.scale, h = 3;
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(sx - w / 2, sy, w, h);
    ctx.fillStyle = e.elite ? '#ffd23f' : '#ff5566';
    ctx.fillRect(sx - w / 2, sy, w * clamp(e.hp / e.maxHp, 0, 1), h);
  }

  if (G.flashRed > 0) { ctx.fillStyle = `rgba(255,20,40,${(G.flashRed * 0.5).toFixed(3)})`; ctx.fillRect(0, 0, VW, VH); }
  if (G.state !== 'MENU' && G.state !== 'LOADING') drawHUD();
  drawJoystick();
}
function drawHUD() {
  const top = SAFE_TOP;
  ctx.textBaseline = 'middle';
  // XP barı
  const barH = 12, y = top + 6;
  ctx.fillStyle = 'rgba(10,12,22,.85)'; ctx.fillRect(0, top, VW, barH + 12);
  ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(10, y, VW - 20, barH);
  const g = ctx.createLinearGradient(10, 0, VW - 10, 0);
  g.addColorStop(0, '#4ea8ff'); g.addColorStop(1, '#9be7ff');
  ctx.fillStyle = g; ctx.fillRect(10, y, (VW - 20) * clamp(G.xp / G.xpNext, 0, 1), barH);
  ctx.textAlign = 'left'; ctx.font = '900 12px Trebuchet MS, sans-serif';
  ctx.fillStyle = '#08101c'; ctx.fillRect(10, y, 58, barH);
  ctx.fillStyle = '#ffd479'; ctx.fillText('SV. ' + G.level, 16, y + barH / 2 + 1);

  // süre
  const rowY = top + 46;
  ctx.textAlign = 'center'; ctx.font = '900 26px Trebuchet MS, sans-serif';
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.75)';
  ctx.strokeText(fmtTime(G.time), VW / 2, rowY);
  ctx.fillStyle = '#fff'; ctx.fillText(fmtTime(G.time), VW / 2, rowY);

  // sol panel
  ctx.textAlign = 'left'; ctx.font = '800 12px Trebuchet MS, sans-serif';
  ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(8, rowY - 17, 116, 38);
  ctx.fillStyle = '#7dffa8'; ctx.fillText('❤ ' + Math.ceil(P.hp) + '/' + P.maxHp, 14, rowY - 7);
  ctx.fillStyle = '#ff8f8f'; ctx.fillText('☠ ' + G.kills, 14, rowY + 11);
  ctx.fillStyle = '#ffd479'; ctx.fillText('💰 ' + G.gold, 72, rowY + 11);

  // silah / pasif ikonları
  let ix = 8, iy = rowY + 40;
  for (const w of P.weapons) {
    const d = WEAPONS[w.id];
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(ix, iy - 13, 26, 26);
    ctx.font = '16px sans-serif'; ctx.fillStyle = '#fff';
    ctx.fillText(w.evolved ? d.evoIcon : d.icon, ix + 3, iy);
    ctx.font = '900 9px Trebuchet MS, sans-serif'; ctx.fillStyle = w.evolved ? '#e0b3ff' : '#ffd479';
    ctx.fillText(w.evolved ? 'EVO' : '' + w.lv, ix + 17, iy + 9);
    ix += 29;
  }
  if (P.weapons.length) iy += 28;
  ix = 8; let hasP = false;
  for (const id in P.passives) {
    if (!P.passives[id]) continue;
    hasP = true;
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(ix, iy - 11, 23, 22);
    ctx.font = '13px sans-serif'; ctx.fillStyle = '#fff';
    ctx.fillText(PASSIVES[id].icon, ix + 3, iy);
    ctx.font = '900 9px Trebuchet MS, sans-serif'; ctx.fillStyle = '#8fc4ff';
    ctx.fillText('' + P.passives[id], ix + 15, iy + 8);
    ix += 26;
  }
  if (hasP) iy += 24;

  // boss barı
  if (G.boss) {
    const bw = Math.min(VW - 40, 460), bx = (VW - bw) / 2, by = iy - 2;
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(bx - 2, by - 2, bw + 4, 16);
    ctx.fillStyle = '#3a1010'; ctx.fillRect(bx, by, bw, 12);
    const bg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    bg.addColorStop(0, '#ff2b3d'); bg.addColorStop(1, '#ff9d3d');
    ctx.fillStyle = bg; ctx.fillRect(bx, by, bw * clamp(G.boss.hp / G.boss.maxHp, 0, 1), 12);
    ctx.textAlign = 'center'; ctx.font = '900 11px Trebuchet MS, sans-serif';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.65)';
    ctx.strokeText(G.boss.bossName, VW / 2, by + 7);
    ctx.fillStyle = '#fff0e0'; ctx.fillText(G.boss.bossName, VW / 2, by + 7);
    // ekran dışındaysa yön oku
    const [bsx, bsy] = project(G.boss.x, 1, G.boss.z);
    if (bsx < 0 || bsx > VW || bsy < 0 || bsy > VH) {
      const [psx, psy] = project(P.x, 1, P.z);
      const a = Math.atan2(bsy - psy, bsx - psx);
      ctx.save();
      ctx.translate(VW / 2 + Math.cos(a) * Math.min(VW, VH) * 0.36, VH / 2 + Math.sin(a) * Math.min(VW, VH) * 0.36);
      ctx.rotate(a); ctx.fillStyle = '#ff5a3d';
      ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, 8); ctx.lineTo(-8, -8); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }
  // banner
  if (G.bannerT > 0) {
    ctx.globalAlpha = clamp(G.bannerT, 0, 1);
    ctx.textAlign = 'center';
    ctx.font = '900 ' + Math.round(Math.min(34, VW * 0.07)) + 'px Trebuchet MS, sans-serif';
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,.8)';
    ctx.strokeText(G.banner, VW / 2, VH * 0.30);
    ctx.fillStyle = '#ffd479'; ctx.fillText(G.banner, VW / 2, VH * 0.30);
    ctx.globalAlpha = 1;
  }
  ctx.textBaseline = 'alphabetic';
}
function drawJoystick() {
  if (!joy.active) return;
  const dx = joy.x - joy.ox, dy = joy.y - joy.oy, d = Math.hypot(dx, dy) || 1;
  const m = Math.min(d, joy.r);
  ctx.save();
  ctx.globalAlpha = .28; ctx.strokeStyle = '#cfe3ff'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(joy.ox, joy.oy, joy.r, 0, TAU); ctx.stroke();
  ctx.globalAlpha = .14; ctx.fillStyle = '#cfe3ff';
  ctx.beginPath(); ctx.arc(joy.ox, joy.oy, joy.r, 0, TAU); ctx.fill();
  ctx.globalAlpha = .65; ctx.fillStyle = '#eaf3ff';
  ctx.beginPath(); ctx.arc(joy.ox + dx / d * m, joy.oy + dy / d * m, joy.r * .42, 0, TAU); ctx.fill();
  ctx.restore();
}

/* ============ 12) AKIŞ: MENÜ / DURAKLAT / SONUÇ ============ */
const elMenu = document.getElementById('menu');
const elPaused = document.getElementById('paused');
const elOver = document.getElementById('over');
const elPauseBtn = document.getElementById('pauseBtn');

function resetAll() {
  enemies.clear(); bullets.clear(); pickups.clear(); parts.clear(); texts.clear();
  for (const z of zones.active) if (z.mesh) z.mesh.visible = false;
  for (const b of blasts.active) if (b.mesh) b.mesh.visible = false;
  for (const b of beams.active) if (b.mesh) b.mesh.visible = false;
  for (const t of telegraphs.active) if (t.mesh) t.mesh.visible = false;
  zones.clear(); blasts.clear(); beams.clear(); telegraphs.clear();
  for (const m of bladeMeshes) m.visible = false;
  bossMesh.visible = false;
  G.time = 0; G.kills = 0; G.gold = 0; G.level = 1; G.xp = 0; G.xpNext = xpForLevel(1);
  G.pendingLevels = 0; G.shake = 0; G.hitStop = 0; G.flashRed = 0; G.dmgDealt = 0;
  G.spawnTimer = 0; G.bossIdx = 0; G.nextBossAt = BOSS_EVERY; G.boss = null;
  G.finalSpawned = false; G.banner = ''; G.bannerT = 0; G.win = false;
  resetPlayer();
  camTarget.set(0, 0, 0);
  joy.active = false;
}
function startGame() {
  resetAll();
  elMenu.classList.remove('show'); elOver.classList.remove('show');
  elPaused.classList.remove('show'); elLevelup.classList.remove('show');
  elPauseBtn.classList.add('show');
  G.state = 'PLAY';
  banner('HAYATTA KAL!', 2);
}
function togglePause() {
  if (G.state === 'PLAY') { G.state = 'PAUSED'; joy.active = false; showPauseInfo(); elPaused.classList.add('show'); }
  else if (G.state === 'PAUSED') { G.state = 'PLAY'; elPaused.classList.remove('show'); }
}
function showPauseInfo() {
  const ws = P.weapons.map(w => `${w.evolved ? WEAPONS[w.id].evoIcon : WEAPONS[w.id].icon} ${w.evolved ? WEAPONS[w.id].evoName : WEAPONS[w.id].name} ${w.evolved ? 'EVO' : 'Sv.' + w.lv}`).join(' &nbsp;•&nbsp; ');
  const ps = Object.keys(P.passives).filter(id => P.passives[id]).map(id => `${PASSIVES[id].icon} ${PASSIVES[id].name} Sv.${P.passives[id]}`).join(' &nbsp;•&nbsp; ');
  document.getElementById('pauseInv').innerHTML = ws + (ps ? '<br><br>' + ps : '');
}
function gameOver(win) {
  G.state = 'OVER'; G.win = win;
  elPauseBtn.classList.remove('show');
  document.getElementById('overTitle').textContent = win ? 'BÖLÜM TAMAMLANDI!' : 'OYUN BİTTİ';
  document.getElementById('overSub').textContent = win
    ? 'Sürüyü püskürttün ve OMEGA HORROR\'u yok ettin. Efsanevi bir hayatta kalma.'
    : 'Sürü seni ele geçirdi. Bir dahakine daha iyi kartlar seç!';
  const rows = [
    ['Hayatta Kalma', fmtTime(G.time)], ['Öldürülen Düşman', G.kills],
    ['Toplanan Altın', G.gold], ['Ulaşılan Seviye', G.level],
    ['Toplam Hasar', Math.round(G.dmgDealt).toLocaleString('tr-TR')],
    ['Silah Sayısı', P.weapons.length + (P.weapons.some(w => w.evolved) ? ' (EVO!)' : '')],
  ];
  document.getElementById('overStats').innerHTML = rows.map(r => `<div class="stat"><span>${r[0]}</span><b>${r[1]}</b></div>`).join('');
  elOver.classList.add('show');
}
document.getElementById('startBtn').onclick = startGame;
document.getElementById('againBtn').onclick = startGame;
document.getElementById('resumeBtn').onclick = togglePause;
document.getElementById('quitBtn').onclick = () => {
  G.state = 'MENU'; elPaused.classList.remove('show');
  elPauseBtn.classList.remove('show'); elMenu.classList.add('show');
};
elPauseBtn.onclick = togglePause;

/* ============ 13) MODEL YÜKLEME + ANA DÖNGÜ ============ */
let MODEL_SCALE = 1, MODEL_YAW = 0, MODEL_Y = 0;   // model +Z yönüne bakar
const OUTLINE_W = 0.0005;                          // dış çizgi kalınlığı (tarayıcıda ölçülerek bulundu)
let mixer = null, actWalk = null, actRun = null;

/* Yürüme/koşma harmanı. Modelde bekleme (idle) klibi yok; oyuncu dururken
   animasyon dondurulup yerine hafif bir nefes salınımı veriliyor. */
function updateKnightAnim(dt, speed) {
  if (!mixer) return;
  const maxSp = P.speed * P.st.speedMul;
  const t = clamp(speed / Math.max(0.001, maxSp), 0, 1);
  if (actRun && actWalk) {
    const runW = clamp((t - 0.45) / 0.55, 0, 1);
    actWalk.setEffectiveWeight(1 - runW);
    actRun.setEffectiveWeight(runW);
  }
  mixer.timeScale = t < 0.04 ? 0 : lerp(0.55, 1.45, t);
  mixer.update(dt);
}
function loadKnight() {
  return new Promise(resolve => {
    const b64 = window.__KNIGHT_B64;
    if (!b64) return resolve(null);
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);      // model meshopt ile sıkıştırıldı
    loader.parse(buf.buffer, '', gltf => {
      const m = gltf.scene;
      const box = new THREE.Box3().setFromObject(m);
      const size = box.getSize(new THREE.Vector3());
      MODEL_SCALE = 2.2 / size.y;                  // ~2.2 dünya birimi boy
      // Not: iskeletli meshlerde mesh düğümünün dönüşümü yok sayılır; hizalamayı
      // dıştaki kapsayıcıda yapıyoruz.
      MODEL_Y = -box.min.y * MODEL_SCALE;
      const holder = new THREE.Group();
      holder.add(m);
      holder.scale.setScalar(MODEL_SCALE);
      /* Oyun mesafesinde karakter ~60 piksel; gümüş zırh siluetin çoğunu
         kaplayıp soluk bir lekeye dönüşüyordu. Stilize oyunların standart
         çözümü: hafif çelik tonu + ters-kabuk (inverted hull) koyu dış çizgi. */
      /* Dış çizgi (ters kabuk): geometri meshopt ile kuantalandığı için offset'in
         birimi model birimi DEĞİL; kalınlık uniform olarak verilip ölçülerek
         ayarlandı. <begin_vertex> iskelet dönüşümünden önce geldiğinden offset
         animasyonla birlikte hareket eder. */
      const outlineU = { value: OUTLINE_W };
      const makeOutlineMat = () => {
        const mat = new THREE.MeshBasicMaterial({ color: 0x241c2e, side: THREE.BackSide });
        mat.onBeforeCompile = sh => {
          sh.uniforms.uOutline = outlineU;
          sh.vertexShader = 'uniform float uOutline;\n' + sh.vertexShader.replace(
            '#include <begin_vertex>',
            '#include <begin_vertex>\n\ttransformed += objectNormal * uOutline;');
        };
        return mat;
      };
      window.__outlineU = outlineU;                 // ölçüm/ayar için (test)
      const outlines = [];
      m.traverse(o => {
        if (o.isMesh || o.isSkinnedMesh) {
          o.frustumCulled = false;
          const map = o.material.map;
          o.material = new THREE.MeshLambertMaterial({
            map,
            color: 0xd7dde8,                 // hafif çelik tonu: beyaza doymayı önler
            emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.16,
          });
          // Dış çizgi: aynı geometri + iskelet, ters yüzeyle çizilir
          const om = makeOutlineMat();
          let ol;
          if (o.isSkinnedMesh) {
            ol = new THREE.SkinnedMesh(o.geometry, om);
            ol.bind(o.skeleton, o.bindMatrix);
          } else {
            ol = new THREE.Mesh(o.geometry, om);
          }
          ol.frustumCulled = false;
          ol.renderOrder = -1;
          outlines.push([o, ol]);
        }
      });
      for (const [src, ol] of outlines) src.parent.add(ol);
      // Animasyonlar: "Walking" / "Running"
      if (gltf.animations && gltf.animations.length) {
        mixer = new THREE.AnimationMixer(m);
        const byName = {};
        for (const c of gltf.animations) byName[c.name.toLowerCase()] = c;
        const walkClip = byName.walking || gltf.animations[0];
        const runClip = byName.running || walkClip;
        actWalk = mixer.clipAction(walkClip);
        actRun = mixer.clipAction(runClip);
        actWalk.play(); actRun.play();
        actWalk.setEffectiveWeight(1); actRun.setEffectiveWeight(0);
      }
      scene.add(holder);
      resolve(holder);
    }, err => { console.error('model', err); resolve(null); });
  });
}

const _camOff = new THREE.Vector3();
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let rdt = (now - last) / 1000; last = now;
  rdt = Math.min(rdt, 0.05);
  let dt = rdt;
  if (G.hitStop > 0) { G.hitStop -= rdt; dt = 0; }

  if (G.state === 'PLAY') {
    G.time += dt;
    readInput();
    updatePlayer(dt);
    spawnWave(dt);
    updateEnemies(dt);
    updateWeapons(dt);
    updateBullets(dt);
    updateZones(dt);
    updateTelegraphs(dt);
    updatePickups(dt);
    updateFx(dt);
    enemies.sweep();
    if (G.bannerT > 0) G.bannerT -= dt;
    if (G.flashRed > 0) G.flashRed -= dt;
  } else {
    updateFx(Math.min(rdt, 0.02));
    if (G.state === 'MENU' || G.state === 'LOADING') {
      // menüde arenayı yavaşça tara
      camTarget.set(Math.sin(now / 6000) * 18, 0, Math.cos(now / 6000) * 10);
    }
  }
  if (G.state !== 'MENU' && G.state !== 'LOADING') camTarget.lerp(_v3.set(P.x, 0, P.z), 1 - Math.pow(0.0008, rdt));

  // kamera + ekran sallantısı
  _camOff.copy(CAM_DIR).multiplyScalar(70);
  camera.position.copy(camTarget).add(_camOff);
  if (G.shake > 0.002) {
    G.shake *= Math.pow(0.02, rdt);
    camera.position.x += rnd(G.shake, -G.shake);
    camera.position.z += rnd(G.shake, -G.shake);
  } else G.shake = 0;
  camera.lookAt(camTarget);

  syncEnemyMeshes();
  renderer.render(scene, camera);
  drawOverlay();
}

(async function boot() {
  resize();
  buildWorld(scene);
  P.model = await loadKnight();
  resetAll();
  G.state = 'MENU';
  document.getElementById('loading').classList.remove('show');
  elMenu.classList.add('show');
  requestAnimationFrame(frame);
})();

// Test/otomasyon için
window.__game = { G, P, enemies, bullets, pickups, zones, parts, texts, WEAPONS, PASSIVES,
                  addWeapon, getWeapon, recomputeStats, applyCard, spawnEnemy, gainXp, hitEnemy,
                  buildChoices, cardInfo, openLevelUp, startGame, input, joy, camera, scene,
                  hurtPlayer, THREE,
                  get mixer() { return mixer; }, get anim() { return { walk: actWalk, run: actRun }; },
                  get MODEL_YAW() { return MODEL_YAW; }, set MODEL_YAW(v) { MODEL_YAW = v; } };
