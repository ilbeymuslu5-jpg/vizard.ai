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
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildWorld, ARENA, biomeAt, isWater, COLLIDERS } from './world.js';
import { createWeaponModel } from './weaponModels.js';

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
/* Not: gerçek gölge haritası denendi ve ölçüldü — %66 FPS bedeli getiriyor,
   buna karşılık izometrik açıda güneş yüksek olduğu için gölgeler nesnenin
   altında kalıp neredeyse görünmüyordu. Bunun yerine nesne gölgeleri zemin
   dokusuna PİŞİRİLİYOR (world.js): çalışma anında sıfır maliyet. */

const scene = new THREE.Scene();
/* Gökyüzü: düz renk yerine dikey gradyan — ufuk çizgisi ve derinlik hissi */
scene.background = (() => {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#1a2744');            // üst: gece mavisi
  grd.addColorStop(0.55, '#2b3a56');
  grd.addColorStop(1, '#3d4a5e');            // ufuk: sisli gri-mavi
  g.fillStyle = grd; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
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
  const cr = VIEW_H * 1.1 + 8; CULL_R2 = cr * cr;
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
/* Kare başına yüzlerce kez çağrılıyor; dizi döndürmek yerine paylaşılan
   alanlara yazıyoruz (çöp toplayıcı baskısı = takılma). */
let PX = 0, PY = 0;
function project(x, y, z) {
  _pv.set(x, y, z).project(camera);
  PX = (_pv.x * 0.5 + 0.5) * VW;
  PY = (-_pv.y * 0.5 + 0.5) * VH;
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

/* ============ 2) GİRDİ: ÇİFT JOYSTİCK + KLAVYE ============
   SOL yarı  -> hareket çubuğu (karakter nereye yürüyecek)
   SAĞ yarı  -> nişan çubuğu   (silahlar hangi yöne ateş edecek)
   İkisi de "dinamik": parmağın değdiği yerde belirir, sabit bir yerleri yok.
   Nişan çubuğu boştayken silahlar eskisi gibi en yakın düşmanı otomatik
   hedefler; yani tek parmakla da oynanabilir. */
const keys = {};
const mkJoy = side => ({ side, active: false, id: null, ox: 0, oy: 0, x: 0, y: 0, r: 70, mag: 0 });
const joyL = mkJoy('L');                       // hareket
const joyR = mkJoy('R');                       // nişan
const joy = joyL;                              // eski ad (test/otomasyon uyumu)
const input = { ax: 0, az: 0, aimX: 0, aimZ: 1, aimA: 0, aiming: false };
/* Fare: sağ çubuğun PC karşılığı. İmleç nereyi gösteriyorsa silahlar oraya
   ateş eder; hareket WASD ile. Böylece masaüstünde de çift kontrol olur. */
const mouseAim = { on: false, x: 0, y: 0 };

function startJoy(j, e) {
  j.active = true; j.id = e.pointerId;
  j.ox = j.x = e.clientX; j.oy = j.y = e.clientY;
  j.r = Math.min(70, Math.min(VW, VH) * 0.17);
  try { fx2d.setPointerCapture(e.pointerId); } catch (err) { /* yakalanamadıysa sorun değil */ }
}
fx2d.addEventListener('pointerdown', e => {
  if (G.state !== 'PLAY') return;
  if (e.pointerType === 'mouse') { mouseAim.on = true; mouseAim.x = e.clientX; mouseAim.y = e.clientY; }
  const wantRight = e.clientX > VW * 0.5;
  let j = wantRight ? joyR : joyL;
  if (j.active) j = wantRight ? joyL : joyR;   // iki parmak aynı yarıya düşerse diğerine ver
  if (j.active) return;
  startJoy(j, e);
}, { passive: true });
fx2d.addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse') { mouseAim.x = e.clientX; mouseAim.y = e.clientY; mouseAim.on = true; }
  if (joyL.active && e.pointerId === joyL.id) { joyL.x = e.clientX; joyL.y = e.clientY; }
  else if (joyR.active && e.pointerId === joyR.id) { joyR.x = e.clientX; joyR.y = e.clientY; }
}, { passive: true });
const endPtr = e => {
  if (joyL.active && e.pointerId === joyL.id) { joyL.active = false; joyL.id = null; }
  if (joyR.active && e.pointerId === joyR.id) { joyR.active = false; joyR.id = null; }
};
fx2d.addEventListener('pointerup', endPtr, { passive: true });
fx2d.addEventListener('pointercancel', endPtr, { passive: true });
fx2d.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') mouseAim.on = false; }, { passive: true });
fx2d.addEventListener('contextmenu', e => e.preventDefault());
const releaseSticks = () => {
  joyL.active = joyR.active = false; joyL.id = joyR.id = null;
  mouseAim.on = false; input.aiming = false;
};

addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  if (e.code === 'KeyI' || e.code === 'Tab') {
    e.preventDefault();
    G.state === 'INV' ? closeInventory() : openInventory();
  }
  if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') doDash();
  if (e.code === 'Space' && (G.state === 'MENU' || G.state === 'OVER')) startGame();
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; releaseSticks(); });

/* Ekran yönü ≠ dünya yönü: izometride "yukarı" dünyada -X-Z yönüdür.
   Joystick/klavye vektörünü kamera eksenlerine göre döndürüyoruz. */
const ISO_COS = Math.cos(-Math.PI / 4), ISO_SIN = Math.sin(-Math.PI / 4);
// ekran vektörü (sağ, aşağı) → dünya vektörü (x, z)
const _w2 = { x: 0, z: 0 };
function screenToWorld(sx, sy) {
  _w2.x = sx * ISO_COS - sy * ISO_SIN;
  _w2.z = sx * ISO_SIN + sy * ISO_COS;
  return _w2;
}
// Çubuğun ekran üzerindeki sapması; ölü bölgeyi geçtiyse büyüklüğü döner
function stickVec(j, dead) {
  const dx = j.x - j.ox, dy = j.y - j.oy, d = Math.hypot(dx, dy);
  if (d <= dead) { j.mag = 0; return null; }
  j.mag = Math.min(d, j.r) / j.r;
  return { x: dx / d, y: dy / d, m: j.mag };
}
function readInput() {
  // --- hareket (sol çubuk / WASD) ---
  let sx = 0, sy = 0;
  const L = joyL.active ? stickVec(joyL, 6) : null;
  if (L) { sx = L.x * L.m; sy = L.y * L.m; }
  else {
    if (keys.KeyA || keys.ArrowLeft) sx -= 1;
    if (keys.KeyD || keys.ArrowRight) sx += 1;
    if (keys.KeyW || keys.ArrowUp) sy -= 1;
    if (keys.KeyS || keys.ArrowDown) sy += 1;
    const d = Math.hypot(sx, sy); if (d > 1) { sx /= d; sy /= d; }
  }
  let w = screenToWorld(sx, sy);
  input.ax = w.x; input.az = w.z;
  const m = Math.hypot(input.ax, input.az);
  if (m > 1) { input.ax /= m; input.az /= m; }

  /* --- nişan (sağ çubuk / fare) ---
     Sağ çubukta ölü bölge daha geniş: yanlışlıkla değen parmak silahın
     yönünü kaçırmasın. Çubuk boştaysa aiming=false ve otomatik hedefleme
     devreye girer. */
  let axs = 0, ays = 0, aiming = false;
  const R = joyR.active ? stickVec(joyR, 12) : null;
  if (R) { axs = R.x; ays = R.y; aiming = true; }
  else if (mouseAim.on && !joyR.active) {
    // İmleç ile oyuncunun ekrandaki yeri arasındaki vektör
    project(P.x, 1, P.z);
    const dx = mouseAim.x - PX, dy = mouseAim.y - PY;
    const d = Math.hypot(dx, dy);
    if (d > 24) { axs = dx / d; ays = dy / d; aiming = true; }
  }
  input.aiming = aiming;
  if (aiming) {
    w = screenToWorld(axs, ays);
    input.aimX = w.x; input.aimZ = w.z;
    input.aimA = Math.atan2(w.x, w.z);
  }
}
/* Silahların ateş yönü: nişan çubuğu varsa oyuncunun dediği yön, yoksa
   menzildeki en yakın düşman (tek parmakla oynanabilsin diye). */
function aimAngle(range) {
  if (input.aiming) return input.aimA;
  const t = findNearest(P.x, P.z, range);
  return t ? Math.atan2(t.x - P.x, t.z - P.z) : P.yaw;
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

/* Sahne nesneleri (ağaç, kaya, fıçı, sütun) için statik çarpışma ızgarası.
   Yalnızca oyuncu itilir; düşmanların takılıp yığılmaması için onlar geçebilir. */
const PROP_CELL = 6;
const propGrid = new Map();
function buildPropGrid() {
  propGrid.clear();
  for (const c of COLLIDERS) {
    const k = (Math.floor(c.x / PROP_CELL) & 0xffff) << 16 | (Math.floor(c.z / PROP_CELL) & 0xffff);
    let b = propGrid.get(k); if (!b) { b = []; propGrid.set(k, b); }
    b.push(c);
  }
}
// Oyuncuyu nesnelerin dışına iter
function resolveProps(px, pz, pr, out) {
  const cx = Math.floor(px / PROP_CELL), cz = Math.floor(pz / PROP_CELL);
  let x = px, z = pz;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
    const bucket = propGrid.get((((cx + a) & 0xffff) << 16) | ((cz + b) & 0xffff));
    if (!bucket) continue;
    for (let i = 0; i < bucket.length; i++) {
      const c = bucket[i];
      const dx = x - c.x, dz = z - c.z;
      const min = c.r + pr;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2), push = (min - d) / d;
        x += dx * push; z += dz * push;
      }
    }
  }
  out.x = x; out.z = z;
}
const _res = { x: 0, z: 0 };
let CULL_R2 = 900;                 // ekran dışını çizim öncesi eleme yarıçapının karesi
const qbuf = [];

/* ============ 4) OYUN DURUMU ============ */
const G = {
  state: 'LOADING', time: 0, kills: 0, gold: 0,
  level: 1, xp: 0, xpNext: 10, pendingLevels: 0,
  shake: 0, hitStop: 0, flashRed: 0,
  spawnTimer: 0, bossIdx: 0, nextBossAt: 180, boss: null, finalSpawned: false,
  banner: '', bannerT: 0, dmgDealt: 0, win: false,
  toast: null, prevState: 'PLAY',
};
const WIN_TIME = 900, BOSS_EVERY = 180;
/* Yüksek seviyede saniyede binlerce isabet oluyor. Her isabet sallantı ve
   hit-stop tetiklerse ikisi de hiç boşalmaz: kamera sürekli titrer ve oyun
   karelerin yarısından fazlasında donar. Bu yüzden kare başına sallantı
   bütçesi ve hit-stop bekleme süresi var. `force` (boss ölümü, oyuncunun
   hasar alması gibi tekil olaylar) bunları atlar. */
let shakeCd = 0, hitStopCd = 0;
const SHAKE_CD = 0.14, SHAKE_MAX = 0.55, HITSTOP_CD = 0.32;
function addShake(v, force) {
  if (force) { G.shake = Math.min(1.4, G.shake + v); return; }
  // Sıradan isabetler: en fazla ~0.14 sn'de bir, sönümlenmeye zaman kalsın
  if (shakeCd > 0) return;
  shakeCd = SHAKE_CD;
  G.shake = Math.min(SHAKE_MAX, G.shake + v);
}
function hitStop(v, force) {
  if (!force && hitStopCd > 0) return;
  hitStopCd = HITSTOP_CD;
  G.hitStop = Math.max(G.hitStop, Math.min(v, 0.05));
}
const banner = (t, s = 2.4) => { G.banner = t; G.bannerT = s; };


/* ============ SES (prosedürel WebAudio — harici dosya yok) ============
   Yüksek seviyede saniyede binlerce isabet oluyor; her biri ses çalarsa
   binlerce osilatör açılır. Bu yüzden her efektin bekleme süresi ve global
   eşzamanlı ses sınırı var (sallantı/hit-stop ile aynı ders). */
const SFX = (() => {
  let ac = null, master = null, voices = 0;
  const cd = {};                                   // efekt başına bekleme
  const now = () => ac.currentTime;
  function init() {
    if (ac) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      ac = new AC();
      master = ac.createGain();
      master.gain.value = 0.5;
      master.connect(ac.destination);
    } catch (e) { ac = null; }
  }
  function ok(key, wait) {
    if (!ac || voices > 14) return false;
    const t = performance.now();
    if (cd[key] && t < cd[key]) return false;
    cd[key] = t + wait;
    return true;
  }
  function env(node, vol, dur) {
    const g = ac.createGain();
    g.gain.setValueAtTime(0, now());
    g.gain.linearRampToValueAtTime(vol, now() + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now() + dur);
    node.connect(g); g.connect(master);
    voices++;
    setTimeout(() => { voices--; }, dur * 1000 + 60);
    return g;
  }
  function tone(freq, dur, vol, type, slideTo) {
    const o = ac.createOscillator();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, now());
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, now() + dur);
    env(o, vol, dur);
    o.start(); o.stop(now() + dur + 0.02);
  }
  function noise(dur, vol, freq, q) {
    const n = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ac.createBufferSource(); src.buffer = buf;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1;
    src.connect(f);
    env(f, vol, dur);
    src.start();
  }
  return {
    init,
    resume() { if (ac && ac.state === 'suspended') ac.resume(); },
    shoot() { if (ok('shoot', 70)) tone(680, 0.07, 0.05, 'square', 320); },
    hit()   { if (ok('hit', 55))   noise(0.05, 0.05, 1800, 2); },
    kill()  { if (ok('kill', 70))  tone(180, 0.11, 0.06, 'triangle', 70); },
    boom()  { if (ok('boom', 110)) { noise(0.25, 0.12, 320, 0.7); tone(90, 0.24, 0.09, 'sine', 40); } },
    hurt()  { if (ok('hurt', 160)) tone(240, 0.22, 0.12, 'sawtooth', 80); },
    pickup(){ if (ok('pickup', 45)) tone(1180, 0.05, 0.035, 'sine', 1560); },
    dash()  { if (ok('dash', 120)) noise(0.18, 0.09, 900, 0.8); },
    levelup() { if (ok('levelup', 260)) [523, 659, 784, 1046].forEach((f, i) =>
                  setTimeout(() => ac && tone(f, 0.16, 0.07, 'triangle'), i * 65)); },
    boss()  { if (ok('boss', 900)) { tone(70, 1.1, 0.16, 'sawtooth', 45); noise(0.9, 0.09, 180, 0.6); } },
    win()   { if (ok('win', 900)) [523, 659, 784, 1046, 1318].forEach((f, i) =>
                  setTimeout(() => ac && tone(f, 0.3, 0.09, 'triangle'), i * 130)); },
    over()  { if (ok('over', 900)) [440, 349, 262].forEach((f, i) =>
                  setTimeout(() => ac && tone(f, 0.4, 0.1, 'sawtooth'), i * 190)); },
  };
})();

/* ============ 5) OYUNCU ============ */
const P = {
  x: 0, z: 0, vx: 0, vz: 0, r: 0.62, y: 0,
  hp: 100, maxHp: 100, iframe: 0, yaw: 0, walk: 0, speed: 8.6,
  weapons: [], passives: {},
  base: { dmg: 1, atkSpeed: 1, area: 1, speedMul: 1, magnet: 1, armor: 0, regen: 0, crit: 0.08 },
  st: null, model: null, hitPop: 0, inWater: false,
  dashCd: 0, dashT: 0, dashX: 0, dashZ: 0,
  // Koşu içi envanter: kuşanılanlar + çanta (ikisi de her koşuda sıfırlanır)
  eq: { helm: null, chest: null, gloves: null, boots: null, cloak: null, shield: null },
  bag: [],
  classId: 'paladin',
};
function recomputeStats() {
  const s = Object.assign({}, P.base);
  for (const id in P.passives) { const lv = P.passives[id]; if (lv) PASSIVES[id].apply(s, lv); }
  /* Kuşanılan eşyalar koşu SIRASINDA değiştiği için pasifler gibi burada
     toplanıyor; maks. can ayrı, equipItem() içinde işleniyor.
     Artılar ve eksiler aynı torbadan geçiyor — eksi bir stat basitçe
     negatif değer, ayrı bir yol gerekmiyor. */
  for (const slot in P.eq) {
    const it = itemOf(P.eq[slot]); if (!it) continue;
    for (const src of [it.plus, it.minus]) {
      if (!src) continue;
      for (const k in src) if (k !== 'maxHp' && s[k] !== undefined) s[k] += src[k];
    }
  }
  // Set bonusları: 2/4 parça eşiği (bkz. SET_BONUS). Düz statlar burada
  // işlenir; "kind" ile işaretli olanlar P.setBonus bayrağı üzerinden
  // updatePlayer/hitEnemy/updateSkillTimers'da çalışma anında okunur.
  const setCounts = equippedSetCounts();
  P.setBonus = {};
  for (const key in SET_BONUS) {
    const n = setCounts[key] || 0;
    const def = SET_BONUS[key];
    if (n >= 2) { P.setBonus[key + '2'] = true; if (def.p2.apply) def.p2.apply(s); }
    if (n >= 4) { P.setBonus[key + '4'] = true; if (def.p4.apply) def.p4.apply(s); }
  }
  P.st = s;
}
const BASE0 = { dmg: 1, atkSpeed: 1, area: 1, speedMul: 1, magnet: 1, armor: 0, regen: 0, crit: 0.08 };
function resetPlayer() {
  P.x = P.z = 0; P.vx = P.vz = 0;
  // temel değerleri fabrika ayarına al, sonra sınıf/kalıcı yükseltme/teçhizatı uygula
  Object.assign(P.base, BASE0);
  for (const slot in P.eq) P.eq[slot] = null;       // koşu sade başlar
  P.bag.length = 0;
  const cls = CLASSES[META.classId] || CLASSES.paladin;
  P.classId = cls.id;
  P.maxHp = 100 * cls.hpMul;
  P.base.speedMul *= cls.speedMul;
  P.base.dmg *= cls.dmgMul;
  if (cls.armor) P.base.armor += cls.armor;
  if (cls.regen) P.base.regen += cls.regen;
  if (cls.atkSpeed) P.base.atkSpeed += cls.atkSpeed;
  if (cls.speedAdd) P.base.speedMul += cls.speedAdd;
  if (cls.area) P.base.area += cls.area;
  if (cls.crit) P.base.crit += cls.crit;
  applyMeta();
  applySkillTree();                                  // yetenek ağacı puanları
  applyStartGear();                                  // kalıcı "miras" varsa
  P.hp = P.maxHp;
  P.iframe = 0; P.yaw = 0; P.walk = 0; P.hitPop = 0; P.dashCd = 0; P.dashT = 0;
  P.weapons = []; P.passives = {};
  // Yetenek ağacı ULTİME/periyodik düğümleri: koşu başına bir kez sıfırlanan durum
  P.titanT = 0; P.titanUsed = false; P.usedPhoenix = false; P.usedSecondChance = false;
  P.skT = { blackhole: 4, meteor: 3, timeSlow: 6, shieldPulse: 10, knockPulse: 5, invis: 3, armageddon: 20,
            leafShield: 10, burnTrail: 0, frostTrail: 0 };
  recomputeStats(); addWeapon(cls.weapon);
  refreshOutfitVisuals();
}
function updatePlayer(dt) {
  if (P.dashCd > 0) P.dashCd -= dt;
  // Orman Seti (2 parça): ormanda hareket hızı +%20 — biyoma göre canlı kontrol
  const forestBoost = (P.setBonus && P.setBonus.forest2 && biomeAt(P.x, P.z) === 'forest') ? 1.2 : 1;
  const sp = P.speed * P.st.speedMul * forestBoost;
  if (P.dashT > 0) {
    P.dashT -= dt;
    const dspd = DASH_SPEED * (1 + (P.sk ? P.sk.dashSpdMul : 0));   // Işın (Büyü T1)
    P.vx = P.dashX * dspd; P.vz = P.dashZ * dspd;
    if (Math.random() < 0.6) particle(P.x, 0.5, P.z, '#cfe8ff', 2.5, 3);
  } else {
    const k = 1 - Math.pow(0.0005, dt);
    P.vx = lerp(P.vx, input.ax * sp, k);
    P.vz = lerp(P.vz, input.az * sp, k);
  }
  // Suda hareket biraz yavaşlar (ve iz bırakır)
  P.inWater = isWater(P.x, P.z);
  const wSlow = P.inWater ? 0.78 : 1;
  P.x = clamp(P.x + P.vx * dt * wSlow, -ARENA.hx + 1.5, ARENA.hx - 1.5);
  P.z = clamp(P.z + P.vz * dt * wSlow, -ARENA.hz + 1.5, ARENA.hz - 1.5);
  resolveProps(P.x, P.z, P.r, _res);        // ağaç/kaya/fıçı içinden geçme
  P.x = _res.x; P.z = _res.z;
  /* Bakış yönü: nişan alınıyorsa namlunun yönü, alınmıyorsa yürüdüğü yön.
     (Çift çubuklu oyunların standardı; yan yürürken bile hedefe bakılır.) */
  const mv = Math.hypot(P.vx, P.vz);
  if (input.aiming || mv > 0.5) {
    const want = input.aiming ? input.aimA : Math.atan2(P.vx, P.vz);
    let d = ((want - P.yaw + Math.PI * 3) % TAU) - Math.PI;
    P.yaw += d * Math.min(1, dt * (input.aiming ? 18 : 12));
  }
  if (mv > 0.5) P.walk += dt * mv * 1.1;
  if (P.iframe > 0) P.iframe -= dt;
  if (P.hitPop > 0) P.hitPop -= dt * 4;
  if (P.st.regen > 0 && P.hp < P.maxHp) {
    // Yenilenme: can %50 altındayken rejen ×2
    const regenMul = (P.sk && P.sk.regenDouble && P.hp / P.maxHp < 0.5) ? 2 : 1;
    P.hp = Math.min(P.maxHp, P.hp + P.st.regen * regenMul * dt);
  }
  if (P.titanT > 0) P.titanT -= dt;                       // Titan Gücü süresi
  // Su üstünde yürürken halka + sıçrama
  if (P.inWater) {
    rippleT -= dt;
    if (rippleT <= 0 && mv > 1.5) {
      rippleT = 0.16;
      spawnRipple(P.x, P.z);
      for (let i = 0; i < 3; i++) particle(P.x, 0.25, P.z, '#cfeaff', 2.4, 3.5);
    } else if (rippleT <= 0) { rippleT = 0.5; spawnRipple(P.x, P.z); }
  }
  // Modeli yerleştir; bacakları iskelet animasyonu sürer
  if (P.model) {
    const idleBob = mv < 0.5 ? Math.sin(G.time * 2.2) * 0.03 : 0;   // dururken nefes alma
    P.model.position.set(P.x, MODEL_Y + idleBob, P.z);
    P.model.rotation.y = P.yaw + MODEL_YAW;
    const pop = 1 + Math.max(0, P.hitPop) * 0.13 + (P.titanT > 0 ? 0.3 : 0);   // Titan Gücü: boyut +%30
    P.model.scale.setScalar(MODEL_SCALE * pop);
    P.model.visible = !(P.iframe > 0 && ((P.iframe * 20) | 0) % 2 === 0);
    updateKnightAnim(dt, mv);
  }
}
/* Suda yürüme izi: genişleyip sönen halkalar + sıçrayan damlalar */
const RIPPLE_N = 14;
const ripples = [];
let rippleMesh = null, rippleT = 0;
function initRipples() {
  const geo = new THREE.RingGeometry(0.55, 0.72, 16);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0xdff2ff, transparent: true,
    opacity: 0.55, depthWrite: false });
  rippleMesh = new THREE.InstancedMesh(geo, mat, RIPPLE_N);
  rippleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  rippleMesh.frustumCulled = false; rippleMesh.count = 0;
  scene.add(rippleMesh);
  for (let i = 0; i < RIPPLE_N; i++) ripples.push({ x: 0, z: 0, t: 1, life: 1 });
}
function spawnRipple(x, z) {
  let best = null;
  for (const r of ripples) if (r.t >= r.life && (!best || r.t > best.t)) best = r;
  if (!best) return;
  best.x = x + rnd(0.3, -0.3); best.z = z + rnd(0.3, -0.3);
  best.t = 0; best.life = rnd(1.1, 0.75);
}
function updateRipples(dt) {
  if (!rippleMesh) return;
  let n = 0;
  for (const r of ripples) {
    if (r.t >= r.life) continue;
    r.t += dt;
    const k = r.t / r.life;
    _v3.set(r.x, 0.09, r.z);
    _q.setFromAxisAngle(_AXIS_Y, 0);
    _s3.setScalar(0.35 + k * 1.5);
    _m4.compose(_v3, _q, _s3);
    rippleMesh.setMatrixAt(n++, _m4);
  }
  rippleMesh.count = n;
  rippleMesh.instanceMatrix.needsUpdate = true;
  rippleMesh.material.opacity = 0.5;
}

/* Atılma: kısa süreli hız patlaması + dokunulmazlık. Sürüyle çevrildiğinde
   kaçış imkânı verir; bekleme süresi HUD'da gösterilir. */
const DASH_CD = 2.4, DASH_TIME = 0.18, DASH_SPEED = 42;
function doDash() {
  if (G.state !== 'PLAY' || P.dashCd > 0) return;
  let dx = input.ax, dz = input.az;
  if (Math.hypot(dx, dz) < 0.1) { dx = Math.sin(P.yaw); dz = Math.cos(P.yaw); }
  const m = Math.hypot(dx, dz) || 1;
  P.dashX = dx / m; P.dashZ = dz / m;
  P.dashT = DASH_TIME; P.dashCd = DASH_CD * (P.sk ? P.sk.dashCdMul : 1);   // Dash Yenileme
  P.iframe = Math.max(P.iframe, DASH_TIME + 0.12);
  SFX.dash(); addShake(0.18);
  for (let i = 0; i < 14; i++) particle(P.x, 0.6, P.z, '#bfe4ff', 3, 8);
}

function hurtPlayer(dmg) {
  if (P.iframe > 0 || G.state !== 'PLAY') return;
  const sk = P.sk;
  // Çeviklik / Demir Vücut: gelen hasarı çarpımsal olarak azaltır
  if (sk) dmg *= (1 - sk.dodge) * (1 - sk.dmgReduce);
  P.hp -= Math.max(1, dmg - P.st.armor);
  P.iframe = 0.62; G.flashRed = 0.35; addShake(0.42, true); hitStop(0.04, true); SFX.hurt();
  for (let i = 0; i < 10; i++) particle(P.x, 0.8, P.z, '#ff5566', 3, 6);
  // Titan Gücü: can ilk kez %25 altına düştüğünde tetiklenir (koşuda 1 kez)
  if (sk && sk.titan && !P.titanUsed && P.hp > 0 && P.hp / P.maxHp <= 0.25) {
    P.titanUsed = true; P.titanT = 5;
    banner('TITAN GÜCÜ!', 2.2); addShake(1.0, true); SFX.boss();
    explode(P.x, P.z, 5.5, dmgOf(24), 0xffb03a);
  }
  if (P.hp <= 0) {
    // Fenix Alevi > İkinci Şans: ikisi de seçiliyse daha iyisi önce tüketilir
    if (sk && sk.phoenix && !P.usedPhoenix) {
      P.usedPhoenix = true; P.hp = P.maxHp; P.iframe = Math.max(P.iframe, 3);
      banner('FENİX ALEVİ!', 2.2); addShake(1.0, true); SFX.win();
      makeFire(P.x, P.z, { r: 4.5, dps: dmgOf(20), life: 5 });
      for (let i = 0; i < 40; i++) particle(P.x, 1, P.z, '#ff7a3d', 5, 14);
      return;
    }
    if (sk && sk.secondChance && !P.usedSecondChance) {
      P.usedSecondChance = true; P.hp = 1; P.iframe = Math.max(P.iframe, 1.2);
      banner('İKİNCİ ŞANS!', 1.8); addShake(0.6, true);
      return;
    }
    P.hp = 0; gameOver(false);
  }
}

/* ============ 6) DÜŞMANLAR (INSTANCED RENDER) ============ */
const ETYPES = {
  zombie:   { hp: 12,  speed: 2.0, dmg: 8,  xp: 1, r: 0.6,  color: 0x5fae4e, geo: 'blob',  h: 1.1 },
  spider:   { hp: 7,   speed: 5.2, dmg: 6,  xp: 1, r: 0.45, color: 0xe2557d, geo: 'spike', h: 0.8 },
  skeleton: { hp: 22,  speed: 3.6, dmg: 10, xp: 1, r: 0.5,  color: 0xe8e2d0, geo: 'bone',  h: 1.3 },
  tank:     { hp: 90,  speed: 1.3, dmg: 18, xp: 5, r: 1.15, color: 0x8d9bb8, geo: 'block', h: 1.7 },
  wraith:   { hp: 45,  speed: 3.9, dmg: 12, xp: 5, r: 0.7,  color: 0x9a6bff, geo: 'ghost', h: 1.4 },
};
/* Zorluk kademeleri: koşu içinde her boss'ta ölçek/güç artar (görsel tema ayrı,
   biyoma göre seçilir — bkz. BOSS_THEMES). */
const BOSS_TIERS = [
  { scale: 1.00 }, { scale: 1.10 }, { scale: 1.20 }, { scale: 1.32 }, { scale: 1.55 },
];
/* Temalı boss'lar (Grafik Tasarım Dokümanı): biyoma göre farklı isim/renk/silüet/saldırı.
   biomeAt() 'forest'|'rocky'|'ruins'|'volcanic' döner; final boss her zaman Buzul Ejderha
   (Sv.20+ final boss teması, dokümanın "Buzul" biyomu henüz ayrı bir harita bölgesi değil). */
const BOSS_THEMES = {
  forest:   { name: 'ESKİ AĞAÇ',      color: 0x3f7d4a },
  volcanic: { name: 'MAGMA GOLEM',    color: 0xff5a1f },
  ruins:    { name: 'UNUTULMUŞ KRAL', color: 0x6a5a9e },
  rocky:    { name: 'DEMİR KOLOS',    color: 0x8d9bb8 },
  glacier:  { name: 'BUZUL EJDERHA',  color: 0x9fd8ff },
};
const MAX_ENEMIES = LOW_END ? 300 : 420;
let uid = 1;
const enemies = new Pool(() => ({
  uid: 0, x: 0, z: 0, vx: 0, vz: 0, kx: 0, kz: 0, type: 'zombie', cfg: null,
  hp: 1, maxHp: 1, r: 1, speed: 1, dmg: 1, xp: 1, flash: 0, dead: false,
  elite: false, boss: false, isFinal: false, scale: 1, atkT: 0, wob: 0,
  contactCd: 0, cdG: 0, cdZ: 0, bossName: '', bob: 0, chillT: 0,
}), MAX_ENEMIES);

// --- Instanced mesh havuzları (tip başına bir çizim çağrısı) ---
/* Düşman modelleri: her tip birkaç ilkel şeklin BİRLEŞTİRİLMİŞ tek
   geometrisidir (tip başına tek çizim çağrısı korunur). Parçalara damar rengi
   (vertex color) basılır; instanceColor ile çarpıldığı için gövde/uzuv ayrımı
   görünür ama beyaz flash efekti hâlâ okunur. */
/* Icosahedron/Octahedron indekssiz, Box/Cone indekslidir; mergeGeometries
   karışık girdi kabul etmiyor. Hepsini indekssize çevirip birleştiriyoruz. */
const ni = g => g.index ? g.toNonIndexed() : g;
function tinted(geo, shade) {
  geo = ni(geo);
  const n = geo.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i*3] = c[i*3+1] = c[i*3+2] = shade; }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}
const put = (g, x, y, z, rx, ry, rz) => {
  if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); if (rz) g.rotateZ(rz);
  g.translate(x, y, z); return g;
};
function makeGeo(kind) {
  const parts = [];
  switch (kind) {
    case 'blob': {   // Zombi: yayvan gövde, öne sarkan kollar, yamuk kafa
      parts.push(tinted(put(new THREE.IcosahedronGeometry(0.46, 0), 0, 0.52, 0), 1.0));
      parts.push(tinted(put(new THREE.SphereGeometry(0.27, 7, 5), 0, 1.02, 0.04), 0.92));
      parts.push(tinted(put(new THREE.BoxGeometry(0.16, 0.5, 0.16), -0.36, 0.62, 0.22, 0.5, 0, 0), 0.74));
      parts.push(tinted(put(new THREE.BoxGeometry(0.16, 0.5, 0.16), 0.36, 0.62, 0.22, 0.5, 0, 0), 0.74));
      parts.push(tinted(put(new THREE.BoxGeometry(0.17, 0.4, 0.17), -0.17, 0.2, 0), 0.7));
      parts.push(tinted(put(new THREE.BoxGeometry(0.17, 0.4, 0.17), 0.17, 0.2, 0), 0.7));
      break;
    }
    case 'spike': {  // Hızlı: alçak gövde, dört bacak, sivri kafa
      parts.push(tinted(put(new THREE.OctahedronGeometry(0.34, 0), 0, 0.42, 0), 1.0));
      parts.push(tinted(put(new THREE.ConeGeometry(0.16, 0.42, 5), 0, 0.44, 0.36, Math.PI / 2, 0, 0), 0.9));
      for (let i = 0; i < 4; i++) {
        const sx = i < 2 ? -0.3 : 0.3, sz = (i % 2) ? -0.22 : 0.24;
        parts.push(tinted(put(new THREE.BoxGeometry(0.08, 0.42, 0.08), sx, 0.2, sz, 0, 0, sx < 0 ? -0.5 : 0.5), 0.66));
      }
      break;
    }
    case 'bone': {   // İskelet: kaburga yığını + kafatası + kollar
      parts.push(tinted(put(new THREE.BoxGeometry(0.42, 0.46, 0.26), 0, 0.72, 0), 1.0));
      parts.push(tinted(put(new THREE.SphereGeometry(0.24, 7, 5), 0, 1.15, 0), 0.95));
      parts.push(tinted(put(new THREE.BoxGeometry(0.09, 0.44, 0.09), -0.29, 0.72, 0.1, 0.6, 0, 0), 0.78));
      parts.push(tinted(put(new THREE.BoxGeometry(0.09, 0.44, 0.09), 0.29, 0.72, 0.1, 0.6, 0, 0), 0.78));
      parts.push(tinted(put(new THREE.BoxGeometry(0.11, 0.5, 0.11), -0.12, 0.25, 0), 0.72));
      parts.push(tinted(put(new THREE.BoxGeometry(0.11, 0.5, 0.11), 0.12, 0.25, 0), 0.72));
      break;
    }
    case 'block': {  // Tank: iri gövde, omuz blokları, küçük kafa
      parts.push(tinted(put(new THREE.BoxGeometry(1.0, 1.0, 0.8), 0, 0.78, 0), 1.0));
      parts.push(tinted(put(new THREE.BoxGeometry(0.34, 0.34, 0.34), -0.62, 1.16, 0), 0.8));
      parts.push(tinted(put(new THREE.BoxGeometry(0.34, 0.34, 0.34), 0.62, 1.16, 0), 0.8));
      parts.push(tinted(put(new THREE.SphereGeometry(0.26, 7, 5), 0, 1.44, 0.06), 0.9));
      parts.push(tinted(put(new THREE.BoxGeometry(0.34, 0.34, 0.34), -0.28, 0.16, 0), 0.66));
      parts.push(tinted(put(new THREE.BoxGeometry(0.34, 0.34, 0.34), 0.28, 0.16, 0), 0.66));
      break;
    }
    case 'ghost': {  // Hayalet: koni pelerin + kukuleta
      const cloak = new THREE.ConeGeometry(0.6, 1.3, 7);
      parts.push(tinted(put(cloak, 0, 0.65, 0), 1.0));
      parts.push(tinted(put(new THREE.SphereGeometry(0.3, 7, 5, 0, Math.PI * 2, 0, Math.PI * 0.62), 0, 1.28, 0), 0.85));
      parts.push(tinted(put(new THREE.BoxGeometry(0.12, 0.34, 0.12), -0.4, 0.95, 0.1, 0, 0, 0.5), 0.7));
      parts.push(tinted(put(new THREE.BoxGeometry(0.12, 0.34, 0.12), 0.4, 0.95, 0.1, 0, 0, -0.5), 0.7));
      break;
    }
  }
  return mergeGeometries(parts, false);
}
/* Toon (cel) gölgelendirme: gerçek zamanlı ışık açısını basamaklı bir gradyan
   dokusundan okuyup düz renk bantları üretir. Tek dokulu ek bir arama olduğu
   için ek çizim geçişi (post-processing) gerektirmez — düşük uçlu cihazlarda
   bile MeshLambertMaterial ile aynı maliyettedir (bkz. gölge haritası notu). */
function makeToonGradient(steps) {
  const c = document.createElement('canvas'); c.width = steps; c.height = 1;
  const cx = c.getContext('2d');
  for (let i = 0; i < steps; i++) {
    const v = Math.round(255 * ((i + 1) / steps));
    cx.fillStyle = `rgb(${v},${v},${v})`; cx.fillRect(i, 0, 1, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}
const toonGradient = makeToonGradient(4);
const eMeshes = {};
for (const t in ETYPES) {
  const cfg = ETYPES[t];
  const mat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGradient, flatShading: true, vertexColors: true });
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

// Boss ayrı mesh (tekil, büyük) — temaya göre farklı silüet, tek grupta tutulup görünürlük değiştirilir
const BOSS_THEME_MATS = {};
const bossThemeGroups = {};
const bossMesh = new THREE.Group();
function buildBossTheme(id, color) {
  const mat = new THREE.MeshToonMaterial({ color, gradientMap: toonGradient, flatShading: true });
  BOSS_THEME_MATS[id] = mat;
  const g = new THREE.Group();
  if (id === 'forest') {                 // Eski Ağaç: gövde + geniş taç + saçaklı kökler
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, 3.0, 8), mat);
    trunk.position.y = 1.5; g.add(trunk);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.9, 0), mat);
    crown.position.y = 3.7; g.add(crown);
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU;
      const root = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.6, 4), mat);
      root.position.set(Math.cos(a) * 1.1, 0.5, Math.sin(a) * 1.1);
      root.rotation.z = Math.cos(a) * 0.6; root.rotation.x = Math.sin(a) * 0.6;
      g.add(root);
    }
  } else if (id === 'volcanic') {        // Magma Golem: bloklu iri gövde, kollar
    const torso = new THREE.Mesh(new THREE.BoxGeometry(2.1, 2.2, 1.7), mat);
    torso.position.y = 1.9; g.add(torso);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), mat);
    head.position.y = 3.5; g.add(head);
    for (let i = 0; i < 2; i++) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.8, 0.7), mat);
      arm.position.set(i ? 1.6 : -1.6, 1.6, 0); g.add(arm);
    }
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.9, 0.9, 8), mat);
    base.position.y = 0.45; g.add(base);
  } else if (id === 'ruins') {           // Unutulmuş Kral: pelerinli, taçlı silüet
    const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.7, 3.0, 8), mat);
    robe.position.y = 1.6; g.add(robe);
    const cape = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.6, 0.25), mat);
    cape.position.set(0, 1.7, -1.0); g.add(cape);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.1, 6), mat);
    crown.position.y = 3.6; g.add(crown);
  } else if (id === 'glacier') {         // Buzul Ejderha: uzun gövde + kanat + kuyruk
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3, 0), mat);
    body.scale.set(1, 0.85, 1.9); body.position.y = 2.1; g.add(body);
    for (let i = 0; i < 2; i++) {
      const wing = new THREE.Mesh(new THREE.ConeGeometry(1.5, 2.6, 3), mat);
      wing.rotation.z = Math.PI / 2; wing.rotation.y = i ? 0.5 : -0.5;
      wing.position.set(i ? 1.4 : -1.4, 2.6, -0.2); g.add(wing);
    }
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.6, 5), mat);
    tail.rotation.x = Math.PI / 2; tail.position.set(0, 1.8, 2.6); g.add(tail);
    const neck = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.6, 5), mat);
    neck.rotation.x = -Math.PI / 2.4; neck.position.set(0, 3.0, -1.6); g.add(neck);
  } else {                                // rocky (Demir Kolos) — eski genel tasarım
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 0), mat);
    body.position.y = 1.9; g.add(body);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1.6, 7), mat);
    crown.position.y = 3.3; g.add(crown);
    for (let i = 0; i < 6; i++) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.1, 4), mat);
      const a = i / 6 * TAU;
      sp.position.set(Math.cos(a) * 1.5, 1.9, Math.sin(a) * 1.5);
      sp.rotation.z = -Math.cos(a) * 1.1; sp.rotation.x = Math.sin(a) * 1.1;
      g.add(sp);
    }
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.9, 1.0, 8), mat);
    base.position.y = 0.5; g.add(base);
  }
  // Işıltı (glow): hafifçe büyütülmüş, additive-blend kopya kabuk — dokümandaki
  // "glow" efektinin ucuz karşılığı, gerçek bloom post-processing yerine
  const glowMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22,
    blending: THREE.AdditiveBlending, depthWrite: false });
  const glow = g.clone(true);
  glow.traverse(o => { if (o.isMesh) { o.material = glowMat; o.renderOrder = 2; } });
  glow.scale.setScalar(1.12);
  g.add(glow);
  g.visible = false;
  bossMesh.add(g);
  bossThemeGroups[id] = g;
}
for (const id in BOSS_THEMES) buildBossTheme(id, BOSS_THEMES[id].color);
function showBossTheme(id) {
  for (const k in bossThemeGroups) bossThemeGroups[k].visible = (k === id);
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
  e.contactCd = 0; e.cdG = 0; e.cdZ = 0; e.atkT = 2.5; e.bob = rnd(TAU); e.chillT = 0;
  e.elite = !boss && Math.random() < d.eliteChance;
  e.scale = boss ? BOSS_TIERS[Math.min(G.bossIdx, BOSS_TIERS.length - 1)].scale : (e.elite ? 1.45 : 1);
  e.r = (boss ? 2.2 : cfg.r) * e.scale;
  e.maxHp = (boss ? 1800 : cfg.hp) * d.hp * (e.elite ? 5 : 1) * (boss ? 1 + G.bossIdx * 0.85 : 1);
  e.hp = e.maxHp;
  e.speed = (boss ? 2.1 : cfg.speed) * d.spd * (e.elite ? 0.85 : 1);
  e.dmg = (boss ? 26 : cfg.dmg) * d.dmg * (e.elite ? 1.4 : 1);
  e.xp = (boss ? 20 : cfg.xp) * (e.elite ? 20 : 1);
  if (boss) {
    // Görsel tema: final boss her zaman Buzul Ejderha, diğerleri doğduğu biyoma göre
    const themeId = final ? 'glacier' : biomeAt(x, z);
    const theme = BOSS_THEMES[themeId] || BOSS_THEMES.rocky;
    e.bossName = theme.name; e.bossTheme = BOSS_THEMES[themeId] ? themeId : 'rocky';
    showBossTheme(e.bossTheme);
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
      G.finalSpawned = true; G.bossIdx = BOSS_TIERS.length - 1;
      const b = spawnEnemy(null, rnd(TAU), true, true);
      if (b) { banner('FİNAL BOSS: ' + b.bossName, 3.2); addShake(0.9, true); SFX.boss(); } else G.finalSpawned = false;
    } else if (G.time >= G.nextBossAt && G.time < WIN_TIME) {
      const b = spawnEnemy(null, rnd(TAU), true);
      if (b) { G.nextBossAt += BOSS_EVERY; banner('BOSS: ' + b.bossName, 3); addShake(0.7, true); SFX.boss(); }
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
    if (e.chillT > 0) e.chillT -= dt;             // Mage: "Soğutma" — isabet alan düşman yavaşlar
    const dx = P.x - e.x, dz = P.z - e.z, d = Math.hypot(dx, dz) || 1;
    let sp = e.speed;
    if (e.type === 'spider') sp *= 1 + Math.sin(G.time * 6 + e.wob) * 0.22;
    if (e.chillT > 0) sp *= 0.5;
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
      const mat = BOSS_THEME_MATS[e.bossTheme];
      if (mat) mat.color.setHex(e.flash > 0 ? 0xffffff : BOSS_THEMES[e.bossTheme].color);
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
function spawnTelegraph(x, z, r, dur, dmg) {
  const t = telegraphs.get(); if (!t) return;
  if (!t.mesh) t.mesh = tgMesh();
  t.mesh.visible = true;
  t.x = x; t.z = z; t.r = r; t.t = 0; t.dur = dur; t.dmg = dmg;
  t.mesh.position.set(x, 0, z); t.mesh.scale.setScalar(r);
}
// Demir Kolos (rocky) — genel saldırı paterni, önceki tek-tip boss davranışı
function bossAttackDefault(b) {
  const roll = Math.random();
  if (roll < 0.45) spawnTelegraph(P.x + rnd(2, -2), P.z + rnd(2, -2), 5 * b.scale, 1.15, b.dmg * 1.6);
  else if (roll < 0.78) {
    for (let i = 0; i < 3; i++) {
      const a = rnd(TAU), rr = rnd(7, 2);
      spawnTelegraph(P.x + Math.cos(a) * rr, P.z + Math.sin(a) * rr, 3.8 * b.scale, 1.25 + i * 0.15, b.dmg);
    }
  } else {
    spawnTelegraph(b.x, b.z, 11 * b.scale, 1.5, b.dmg * 1.8);
    for (let i = 0; i < 4; i++) spawnEnemy('spider', rnd(TAU));
  }
}
// Eski Ağaç (forest) — "Kök Sarması": oyuncuyu kendine çeker, dikenli kök sürüsü çıkarır
function bossAttackForest(b) {
  const roll = Math.random();
  if (roll < 0.4) {
    const dx = b.x - P.x, dz = b.z - P.z, d = Math.hypot(dx, dz) || 1;
    P.vx += dx / d * 9; P.vz += dz / d * 9;
    addShake(0.4, true);
    spawnTelegraph(b.x, b.z, 6 * b.scale, 0.9, b.dmg * 1.2);
  } else if (roll < 0.75) {
    for (let i = 0; i < 3; i++) spawnEnemy('spike', rnd(TAU));   // dikenli kökler
  } else {
    for (let i = 0; i < 3; i++) {
      const a = rnd(TAU), rr = rnd(7, 2);
      spawnTelegraph(P.x + Math.cos(a) * rr, P.z + Math.sin(a) * rr, 3.6 * b.scale, 1.2 + i * 0.15, b.dmg);
    }
  }
}
// Magma Golem (volcanic) — geniş kalıcı lav gölü + kızgın kütle takviyesi
function bossAttackVolcanic(b) {
  const roll = Math.random();
  if (roll < 0.55) spawnTelegraph(P.x + rnd(2.5, -2.5), P.z + rnd(2.5, -2.5), 6.5 * b.scale, 1.6, b.dmg * 1.7);
  else {
    spawnTelegraph(b.x, b.z, 12 * b.scale, 1.7, b.dmg * 1.9);
    for (let i = 0; i < 3; i++) spawnEnemy('blob', rnd(TAU));
  }
}
// Unutulmuş Kral (ruins) — ölü ordusunu çağırır, lanet okur
function bossAttackRuins(b) {
  const roll = Math.random();
  if (roll < 0.55) { for (let i = 0; i < 4; i++) spawnEnemy('bone', rnd(TAU)); banner('Ölü Ordusu!', 1.0); }
  else {
    for (let i = 0; i < 3; i++) {
      const a = rnd(TAU), rr = rnd(6, 1.5);
      spawnTelegraph(P.x + Math.cos(a) * rr, P.z + Math.sin(a) * rr, 3.2 * b.scale, 1.0 + i * 0.12, b.dmg * 1.1);
    }
  }
}
// Buzul Ejderha (final) — buz nefesi + geniş buz patlaması
function bossAttackGlacier(b) {
  const roll = Math.random();
  if (roll < 0.5) {
    const a = Math.atan2(P.x - b.x, P.z - b.z);
    for (let i = -1; i <= 1; i++) {
      const aa = a + i * 0.35;
      spawnTelegraph(b.x + Math.sin(aa) * 6, b.z + Math.cos(aa) * 6, 3.4 * b.scale, 1.0, b.dmg * 1.3);
    }
  } else {
    spawnTelegraph(P.x, P.z, 5.5 * b.scale, 1.1, b.dmg * 1.5);
    spawnTelegraph(b.x, b.z, 13 * b.scale, 1.8, b.dmg * 1.6);
  }
}
const BOSS_ATTACKS = { forest: bossAttackForest, volcanic: bossAttackVolcanic, ruins: bossAttackRuins,
                        rocky: bossAttackDefault, glacier: bossAttackGlacier };
function bossAttack(b) {
  (BOSS_ATTACKS[b.bossTheme] || bossAttackDefault)(b);
}
function updateTelegraphs(dt) {
  const A = telegraphs.active;
  for (let i = 0; i < A.length; i++) {
    const t = A[i]; t.t += dt;
    const k = clamp(t.t / t.dur, 0, 1);
    if (t.mesh) t.mesh.userData.fill.scale.setScalar(Math.max(0.001, k));
    if (t.t >= t.dur) {
      if (dist(P.x, P.z, t.x, t.z) < t.r) hurtPlayer(t.dmg);
      addShake(0.5, true); hitStop(0.03, true);
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
/* Mermi modelleri: her tip ayrı InstancedMesh (yine tip başına tek çizim).
   Fiziksel silahlara katı model, enerji silahlarına parlak form. */
function bulletGeo(kind) {
  if (kind === 'kunai') {                    // düz bıçak + sap
    const blade = new THREE.ConeGeometry(0.16, 0.62, 4); blade.rotateZ(-Math.PI / 2); blade.translate(0.16, 0, 0);
    const grip = new THREE.BoxGeometry(0.22, 0.08, 0.08); grip.translate(-0.2, 0, 0);
    const ring = new THREE.TorusGeometry(0.08, 0.03, 4, 8); ring.rotateY(Math.PI / 2); ring.translate(-0.32, 0, 0);
    return mergeGeometries([blade, grip, ring].map(ni), false);
  }
  if (kind === 'rocket') {                   // gövde + burun + kanatçık
    const body = new THREE.CylinderGeometry(0.14, 0.14, 0.5, 6); body.rotateZ(-Math.PI / 2);
    const nose = new THREE.ConeGeometry(0.14, 0.24, 6); nose.rotateZ(-Math.PI / 2); nose.translate(0.37, 0, 0);
    const fins = [];
    for (let i = 0; i < 3; i++) {
      const f = new THREE.BoxGeometry(0.16, 0.02, 0.16);
      f.rotateX(i / 3 * Math.PI * 2); f.translate(-0.22, 0, 0);
      fins.push(f);
    }
    return mergeGeometries([body, nose, ...fins].map(ni), false);
  }
  if (kind === 'molotov') {                  // şişe: gövde + boyun + fitil
    const body = new THREE.CylinderGeometry(0.16, 0.13, 0.3, 6);
    const neck = new THREE.CylinderGeometry(0.06, 0.06, 0.14, 5); neck.translate(0, 0.22, 0);
    const wick = new THREE.SphereGeometry(0.07, 5, 4); wick.translate(0, 0.32, 0);
    return mergeGeometries([body, neck, wick].map(ni), false);
  }
  // bolt: uzun enerji dartı
  const g = new THREE.OctahedronGeometry(0.2, 0);
  g.scale(2.4, 1, 1);
  return g;
}
const bulletKinds = ['bolt', 'kunai', 'rocket', 'molotov'];
const bMeshes = {};
for (const k of bulletKinds) {
  const im = new THREE.InstancedMesh(bulletGeo(k),
    new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_BULLETS);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  im.frustumCulled = false; im.count = 0;
  scene.add(im); bMeshes[k] = im;
}

const zones = new Pool(() => ({ x: 0, z: 0, r: 1, dps: 10, life: 3, maxLife: 3, dead: false, tick: 0, mesh: null }), 34);
const zoneMat = new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending });
const blasts = new Pool(() => ({ x: 0, z: 0, r: 1, life: .25, maxLife: .25, dead: false, mesh: null }), 26);
const blastMat = new THREE.MeshBasicMaterial({ color: 0xffb03a, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
const beams = new Pool(() => ({ x: 0, z: 0, a: 0, len: 1, w: 1, life: .2, maxLife: .2, dead: false, mesh: null }), 16);
const beamMat = new THREE.MeshBasicMaterial({ color: 0x9ef1ff, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });

const MAX_PICKUPS = LOW_END ? 320 : 460;
const pickups = new Pool(() => ({ x: 0, z: 0, vx: 0, vz: 0, kind: 'xp1', val: 1, dead: false,
  t: 0, pulled: false, slot: '', tier: 0 }), MAX_PICKUPS);
const gemColors = { xp1: 0x4ea8ff, xp5: 0x5dffa0, xp20: 0xffd23f, gold: 0xffb020, heal: 0xff5f7a };
const gemMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.28, 0),
  new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_PICKUPS);
gemMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
gemMesh.frustumCulled = false; gemMesh.count = 0;
scene.add(gemMesh);
/* Teçhizat düşüşü kristallerden ayrılsın diye ayrı biçim: küçük bir sandık.
   Ayrı bir InstancedMesh (tek fazladan çizim çağrısı), rengi kademeyi gösterir. */
const GEAR_DROP_MAX = 24;
const gearDropMesh = new THREE.InstancedMesh(
  mergeGeometries([
    ni(put(new THREE.BoxGeometry(0.42, 0.26, 0.3), 0, 0, 0)),
    ni(put(new THREE.BoxGeometry(0.46, 0.1, 0.34), 0, 0.16, 0)),
  ], false),
  new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), GEAR_DROP_MAX);
gearDropMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
gearDropMesh.frustumCulled = false; gearDropMesh.count = 0;
scene.add(gearDropMesh);

// Parçacıklar ve hasar sayıları 2B katmanda (dünya koordinatlarıyla)
const parts = new Pool(() => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: .4, maxLife: .4, r: 3, color: '#fff', dead: false }), LOW_END ? 260 : 420);
const texts = new Pool(() => ({ x: 0, y: 0, z: 0, vy: 2.2, life: .7, maxLife: .7, txt: '', crit: false, dead: false }), 80);

function shoot(x, z, ang, spd, dmg, pierce, r, kind, color, opt) {
  const b = bullets.get(); if (!b) return null;
  SFX.shoot();
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
  SFX.boom();
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
  const bc = { bolt: 0, kunai: 0, rocket: 0, molotov: 0 };
  for (let i = 0; i < A.length; i++) {
    const b = A[i];
    const im = bMeshes[b.kind] || bMeshes.bolt;
    const kind = bMeshes[b.kind] ? b.kind : 'bolt';
    const n = bc[kind]++;
    if (n >= MAX_BULLETS) continue;
    _v3.set(b.x, b.y, b.z);
    if (b.kind === 'molotov') {
      _q.setFromAxisAngle(_AXIS_Y, b.spin);           // şişe dönerek uçar
      _s3.setScalar(b.r * 5);
    } else {
      _q.setFromAxisAngle(_AXIS_Y, Math.atan2(b.vx, b.vz) + Math.PI / 2);
      _s3.setScalar(b.r * 5);
    }
    _m4.compose(_v3, _q, _s3);
    im.setMatrixAt(n, _m4);
    _col.setHex(b.color); im.setColorAt(n, _col);
  }
  for (const k of bulletKinds) {
    const im = bMeshes[k];
    im.count = bc[k];
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }
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
/* Öfke: sınıf (Berserker) VE yetenek ağacı (Öfke Birikimi/Berserker Rage
   düğümleri) aynı formülü besliyor, üst üste binebilir (kasıtlı: hem sınıf
   hem düğüm seçilirse daha güçlü — build çeşitliliği). Can bilgisine göre
   anlık hesaplanıyor, recomputeStats'a gerek yok. */
const dmgOf = base => {
  let m = P.st.dmg;
  if (P.maxHp > 0) {
    const missing = 1 - P.hp / P.maxHp;
    if (P.classId === 'berserker') m *= 1 + missing * 0.5;
    if (P.sk && P.sk.rageMax) m *= 1 + missing * P.sk.rageMax;
  }
  if (P.titanT > 0) m *= 2;                             // Titan Gücü (ULTİME)
  return base * m;
};
/* Nişan alırken yelpaze açısı: İLK atış tam nişan yönüne gider, fazlalıklar
   sırayla iki yana açılır (0, +s, -s, +2s, ...).
   Ortalanmış yelpaze kullanılsaydı ÇİFT sayıda atışta hedefin tam ortası boş
   kalırdı — ölçüldü: 2 ışınlı lazer 14 birim mesafedeki hedefi ıskalıyordu. */
function fanAngle(i, count, step) {
  if (count <= 1) return 0;
  const k = ((i + 1) / 2) | 0;
  return (i % 2 ? 1 : -1) * k * step;
}

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
      const base = aimAngle(30);
      for (let i = 0; i < s.count; i++)
        shoot(P.x, P.z, base + (input.aiming ? fanAngle(i, s.count, s.spread)
                                             : (i - (s.count - 1) / 2) * s.spread), s.speed, dmgOf(s.dmg), s.pierce, s.r, 'bolt', s.color, { big: !!w.evolved });
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
        const bl = w.blades[i] || (w.blades[i] = { x: 0, z: 0, a: 0 });
        bl.x = bx; bl.z = bz; bl.a = a;
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
      // Nişan alınıyorsa roketler o yöne yelpaze hâlinde çıkar (güdüm devrede
      // kalır, ama artık oyuncunun gösterdiği taraftaki hedefleri bulur).
      const ts = input.aiming ? null : findNearestN(P.x, P.z, 40, s.count, _tbuf);
      for (let i = 0; i < s.count; i++) {
        let a;
        if (input.aiming) a = input.aimA + fanAngle(i, s.count, 0.22);
        else {
          const t = ts[i] || ts[0];
          a = t ? Math.atan2(t.x - P.x, t.z - P.z) : P.yaw + rnd(1, -1);
        }
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
      if (input.aiming) {                          // nişan yönüne yelpaze ışın
        for (let i = 0; i < s.count; i++)
          beamHit(P.x, P.z, input.aimA + fanAngle(i, s.count, 0.17), s.len, s.w * P.st.area, dmgOf(s.dmg), s.color, !!w.evolved);
        return;
      }
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
        // Nişan varsa şişe o yöne, sabit bir menzile atılır
        const t = input.aiming ? null : findNearest(P.x, P.z, 26);
        const a = input.aiming ? input.aimA + rnd(0.35, -0.35)
                : t ? Math.atan2(t.x - P.x, t.z - P.z) + rnd(0.6, -0.6) : rnd(TAU);
        const d = input.aiming ? rnd(15, 9)
                : t ? Math.min(21, dist(P.x, P.z, t.x, t.z)) : rnd(15, 6);
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
      const base = aimAngle(40);
      for (let i = 0; i < s.count; i++) {
        const a = s.spread >= TAU ? base + i / s.count * TAU
                : base + (input.aiming ? fanAngle(i, s.count, s.spread)
                                       : (i - (s.count - 1) / 2) * s.spread);
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

/* ============ 8.5) TEÇHİZAT — KOŞU İÇİNDE GELİŞEN RPG İLERLEMESİ ============
   Kahraman koşuya SADE başlar (keten tunik + pantolon). Zırh parçaları
   düşmanlardan DÜŞER; toplayınca hem karakterin üstünde görünür hem de
   gerçek istatistik verir. Parçanın kademesi oyuncunun seviyesine bağlı,
   yani seviye atladıkça kahraman gözle görülür şekilde gelişir:
   çıplak → deri → demir → çelik → efsanevi.

   Ölçüler DÜNYA biriminde (karakter 2.2 birim). Gövde ölçüldü:
     kafa  y 1.01–2.20 (yarı genişlik 0.41, merkez 1.60)
     gövde y 0.85–1.30      kalça y 0.48–0.98
     el    merkez (0.63, 0.63, 0.00)   ön kol (0.48, 0.80, -0.03)
     ayak  merkez (0.24, 0.11, -0.01)
   Parçalar ilgili KEMİĞE bağlanır, böylece yürüme animasyonuyla hareket eder. */
const painted = (geo, hex) => {
  geo = ni(geo);
  const n = geo.attributes.position.count;
  const c = new Float32Array(n * 3);
  const col = new THREE.Color(hex);           // sRGB -> çalışma uzayına çevrilir
  for (let i = 0; i < n; i++) { c[i*3] = col.r; c[i*3+1] = col.g; c[i*3+2] = col.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
};

/* Kademe paleti: parça biçimleri aynı kalır, malzeme ve süsleme değişir.
   Böylece 6 yuva × 4 kademe = 24 parça, 6 şekil fonksiyonuyla üretiliyor. */
/* Nadirlik: rozet rengi ve kasadan çıkma şansını belirler. */
const RAR = {
  common: { name: 'Yaygın',    col: '#96a0b4' },
  rare:   { name: 'Nadir',     col: '#4ea8ff' },
  epic:   { name: 'Destansı',  col: '#b475ff' },
  legend: { name: 'Efsanevi',  col: '#ffd479' },
};
/* Parça biçimleri: (det 1..4 = süsleme yoğunluğu, C = {col, trim} renkler).
   Aynı fonksiyon hem envanterdeki ikonu hem karakterin üstündeki modeli
   besliyor, böylece gördüğün ikon giydiğin şeyle birebir aynı. */
const SHAPE = {
  helm(det, C) {
    /* Kafa neredeyse küre: y 1.6–1.7'de yarı genişlik 0.41, tepe 2.15.
       Kubbe kafanın yalnızca ÜST yarısını örtmeli; tamamını kaplayınca
       karakterin yüzü kaybolup yürüyen bir miğfere dönüşüyordu. */
    const out = [];
    out.push(painted(put(new THREE.SphereGeometry(0.46, 12, 8, 0, TAU, 0, Math.PI * (det === 1 ? 0.6 : 0.56)), 0, 0, -0.02), C.col));
    out.push(painted(put(new THREE.CylinderGeometry(0.47, 0.5, 0.1, 14), 0, -0.08, -0.02), C.trim));
    if (det >= 2) out.push(painted(put(new THREE.BoxGeometry(0.1, 0.3, 0.1), 0, -0.24, 0.42), C.trim));    // burunluk
    if (det >= 3) out.push(painted(put(new THREE.BoxGeometry(0.08, 0.13, 0.9), 0, 0.36, -0.02), C.trim));  // tepelik
    if (det >= 4) for (const s of [-1, 1]) {                                                                // boynuz
      const h = new THREE.ConeGeometry(0.1, 0.52, 6);
      h.rotateZ(s * 0.8); h.rotateX(-0.15); h.translate(s * 0.44, 0.2, -0.05);
      out.push(painted(h, C.trim));
    }
    return out;
  },
  chest(det, C) {
    const out = [];
    out.push(painted(put(new THREE.CylinderGeometry(0.34, 0.4, 0.52, 12), 0, 0, 0), C.col));
    out.push(painted(put(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 12), 0, 0.24, 0), C.trim));   // yaka
    out.push(painted(put(new THREE.CylinderGeometry(0.42, 0.42, 0.07, 12), 0, -0.24, 0), C.trim));  // kemer
    for (const s of [-1, 1]) {                                                                       // omuzluk
      const r = det >= 3 ? 0.23 : 0.19;
      out.push(painted(put(new THREE.SphereGeometry(r, 8, 6, 0, TAU, 0, Math.PI * 0.55), s * 0.33, 0.15, 0, 0, 0, s * 0.4), C.col));
      if (det >= 2) out.push(painted(put(new THREE.TorusGeometry(r * 0.95, 0.032, 4, 10), s * 0.33, 0.14, 0, Math.PI / 2, 0, s * 0.4), C.trim));
    }
    if (det >= 3) out.push(painted(put(new THREE.BoxGeometry(0.1, 0.44, 0.03), 0, 0, 0.4), C.trim));
    if (det >= 4) out.push(painted(put(new THREE.OctahedronGeometry(0.09, 0), 0, 0.06, 0.42), C.trim));
    return out;
  },
  gloves(det, C) {
    const out = [];
    out.push(painted(put(new THREE.CylinderGeometry(0.13, 0.15, 0.26, 8), 0, 0, 0, 0, 0, Math.PI / 2), C.col));
    out.push(painted(put(new THREE.TorusGeometry(0.145, 0.028, 4, 10), 0.1, 0, 0, 0, Math.PI / 2, 0), C.trim));
    if (det >= 2) out.push(painted(put(new THREE.BoxGeometry(0.16, 0.1, 0.16), -0.16, 0, 0), C.col));
    if (det >= 3) out.push(painted(put(new THREE.ConeGeometry(0.07, 0.16, 4), 0.2, 0.05, 0, 0, 0, -Math.PI / 2), C.trim));
    if (det >= 4) out.push(painted(put(new THREE.OctahedronGeometry(0.07, 0), -0.16, 0.09, 0), C.trim));
    return out;
  },
  boots(det, C) {
    const out = [];
    out.push(painted(put(new THREE.BoxGeometry(0.19, 0.13, 0.3), 0, -0.03, 0.02), C.col));
    out.push(painted(put(new THREE.CylinderGeometry(0.11, 0.13, 0.2, 8), 0, 0.11, -0.05), C.col));
    out.push(painted(put(new THREE.BoxGeometry(0.21, 0.05, 0.32), 0, -0.09, 0.02), C.trim));      // taban
    if (det >= 2) out.push(painted(put(new THREE.TorusGeometry(0.12, 0.03, 4, 10), 0, 0.06, -0.04), C.trim));
    if (det >= 3) out.push(painted(put(new THREE.BoxGeometry(0.16, 0.2, 0.06), 0, 0.18, 0.06), C.trim));  // dizlik
    if (det >= 4) out.push(painted(put(new THREE.ConeGeometry(0.05, 0.14, 4), 0, 0.06, 0.2, Math.PI / 2, 0, 0), C.trim));
    return out;
  },
  cloak(det, C) {
    const out = [];
    const len = 0.6 + det * 0.09;
    const shell = new THREE.CylinderGeometry(0.29, 0.4, len, 10, 1, true, Math.PI * 0.42, Math.PI * 1.16);
    shell.translate(0, -len / 2 + 0.14, 0);
    out.push(painted(shell, C.col));
    /* Yaka YATAY kalmalı: rotateX(90°) ile yatırdıktan sonra hizalama dönüşü
       Y ekseninde olmalı. Z'de döndürülünce halka dikleşip boynun etrafında
       kafaya kadar çıkan bir çembere dönüşüyordu (ölçüldü: tepe y 1.62). */
    const collar = new THREE.TorusGeometry(0.29, 0.05, 5, 12, Math.PI * 1.2);
    collar.rotateX(Math.PI / 2); collar.rotateY(-Math.PI * 0.42); collar.translate(0, 0.15, 0);
    out.push(painted(collar, C.trim));
    if (det >= 2) {
      const hem = new THREE.CylinderGeometry(0.405, 0.405, 0.07, 10, 1, true, Math.PI * 0.42, Math.PI * 1.16);
      hem.translate(0, -len + 0.17, 0);
      out.push(painted(hem, C.trim));
    }
    return out;
  },
  shield(det, C) {
    const out = [];
    if (det <= 2) {
      out.push(painted(put(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 12), 0, 0, 0, Math.PI / 2, 0, 0), C.col));
      out.push(painted(put(new THREE.TorusGeometry(0.195, 0.03, 4, 14), 0, 0, 0), C.trim));
      out.push(painted(put(new THREE.SphereGeometry(0.075, 7, 5), 0, 0, 0.05), C.trim));
    } else {
      out.push(painted(new THREE.BoxGeometry(0.38, 0.5, 0.07), C.col));
      const tip = new THREE.ConeGeometry(0.19, 0.2, 4);
      tip.rotateY(Math.PI / 4); tip.rotateX(Math.PI); tip.translate(0, -0.34, 0);
      out.push(painted(tip, C.col));
      out.push(painted(put(new THREE.BoxGeometry(0.08, 0.6, 0.025), 0, -0.03, 0.05), C.trim));
      out.push(painted(put(new THREE.BoxGeometry(0.4, 0.08, 0.025), 0, 0.1, 0.05), C.trim));
      if (det >= 4) out.push(painted(put(new THREE.OctahedronGeometry(0.09, 0), 0, 0.1, 0.08), C.trim));
    }
    return out;
  },
};

/* Kahramanın HER ZAMAN üstünde olan temel kıyafeti. Model "base form"
   (kıyafetsiz temel gövde) olarak geldiği için tunik ve pantolon oyun
   tarafında ekleniyor; zırhlar bunun üstüne biniyor. */
/* pal: { body, trim, accent } — sınıfa göre değişir (bkz. CLASSES).
   Kesin renk değil, palet parametresi: aynı geometri farklı sınıflarda
   farklı renklerle çiziliyor (Paladin altın-beyaz, Ranger yeşil-kahve…). */
const OUTFIT = {
  torso: pal => [
    painted(put(new THREE.CylinderGeometry(0.33, 0.38, 0.56, 12), 0, 0, 0), pal.body),     // tunik
    painted(put(new THREE.CylinderGeometry(0.39, 0.39, 0.07, 12), 0, -0.26, 0), pal.trim),  // kemer
    painted(put(new THREE.BoxGeometry(0.11, 0.09, 0.05), 0, -0.26, 0.38), pal.accent),      // toka
  ],
  hips: pal => [
    painted(put(new THREE.CylinderGeometry(0.31, 0.27, 0.34, 10), 0, 0, 0), pal.trim),      // pantolon
  ],
  foot: pal => [
    painted(put(new THREE.BoxGeometry(0.17, 0.09, 0.28), 0, -0.05, 0.02), pal.accent),      // ayakkabı
  ],
};

/* Yuvalar: hangi kemiğe, hangi konum/dönüşle bağlanacak.
   pos/rot KARAKTER uzayında (dünya birimi, +Z ileri, +Y yukarı). */
const GEAR = {
  helm:   { name: 'Miğfer',   icon: '⛑️', bones: ['Head'],
            pos: [0, 0.63, -0.11], rot: [0, 0, 0] },
  chest:  { name: 'Göğüslük', icon: '🎽', bones: ['Spine02'],
            pos: [0, 0.19, -0.11], rot: [0.06, 0, 0] },
  gloves: { name: 'Kolluk',   icon: '🧤', bones: ['LeftForeArm', 'RightForeArm'], mirror: true,
            pos: [0.09, -0.05, -0.1], rot: [0, 0, 0] },
  boots:  { name: 'Bot',      icon: '🥾', bones: ['LeftFoot', 'RightFoot'], mirror: true,
            pos: [0.03, -0.01, -0.09], rot: [0, 0, 0] },
  cloak:  { name: 'Pelerin',  icon: '🧥', bones: ['Spine02'],
            pos: [0, 0.22, -0.26], rot: [0.1, 0, 0] },
  shield: { name: 'Kalkan',   icon: '🛡️', bones: ['LeftHand'],
            pos: [0.11, 0, -0.1], rot: [0, 0.45, 0] },
};
const GEAR_SLOTS = Object.keys(GEAR);

/* ---------- EŞYALAR ----------
   Her eşyanın ARTILARI ve bazılarının EKSİLERİ var. Kural: güçlü artı
   genelde bir bedelle geliyor; her nadirlikte bedelsiz ("temiz") seçenekler
   de var, böylece "hep en yüksek nadirliği tak" diye tek doğru cevap olmuyor.
   det: biçim süsleme yoğunluğu · col/trim: modelin renkleri */
const ITEMS = {
  helm: [
    { id: 'hoodH',   name: 'Deri Başlık',    rar: 'common', det: 1, col: 0x7d5a3a, trim: 0x5a3f28,
      plus: { armor: 1 }, set: 'forest' },
    { id: 'ironH',   name: 'Demir Miğfer',   rar: 'common', det: 2, col: 0x9aa3b0, trim: 0x6d7683,
      plus: { armor: 3, maxHp: 15 }, minus: { speedMul: -0.03 } },
    { id: 'visorH',  name: 'Kapalı Tolga',   rar: 'rare',   det: 2, col: 0xc0cde0, trim: 0x7d8ba0,
      plus: { armor: 6, maxHp: 25 }, minus: { magnet: -0.15 }, set: 'glacier' },
    { id: 'crownH',  name: 'Savaş Tacı',     rar: 'rare',   det: 3, col: 0xd8c27a, trim: 0xffd479,
      plus: { dmg: 0.1, crit: 0.04 }, set: 'ruins' },
    { id: 'dragonH', name: 'Ejder Kaskı',    rar: 'epic',   det: 4, col: 0xa8452e, trim: 0xffb03a,
      plus: { armor: 7, dmg: 0.15 }, minus: { maxHp: -20 }, set: 'volcano' },
    { id: 'haloH',   name: 'Kutsal Hale',    rar: 'legend', det: 4, col: 0xf3eddc, trim: 0xffd479,
      plus: { armor: 5, maxHp: 40, regen: 0.8 } },
  ],
  chest: [
    { id: 'padC',    name: 'Pamuklu Zırh',   rar: 'common', det: 1, col: 0x8a7550, trim: 0x63523a,
      plus: { armor: 2, maxHp: 18 } },
    { id: 'chainC',  name: 'Zincir Zırh',    rar: 'common', det: 2, col: 0x99a2af, trim: 0x6d7683,
      plus: { armor: 5, maxHp: 30 }, minus: { speedMul: -0.06 } },
    { id: 'scaleC',  name: 'Pullu Zırh',     rar: 'rare',   det: 2, col: 0x6f9a7d, trim: 0x47705a,
      plus: { armor: 7, maxHp: 45 }, minus: { atkSpeed: -0.06 }, set: 'glacier' },
    { id: 'rangerC', name: 'Avcı Yeleği',    rar: 'rare',   det: 1, col: 0x54704a, trim: 0x8a6b3c,
      plus: { speedMul: 0.1, crit: 0.05, maxHp: 15 }, set: 'forest' },
    { id: 'lionC',   name: 'Aslan Göğüslüğü',rar: 'epic',   det: 3, col: 0xc6d2e4, trim: 0xffd479,
      plus: { armor: 11, maxHp: 70 }, minus: { speedMul: -0.1 } },
    { id: 'phoenixC',name: 'Anka Zırhı',     rar: 'legend', det: 4, col: 0xd9682e, trim: 0xffd479,
      plus: { armor: 9, maxHp: 60, regen: 1 }, set: 'volcano' },
  ],
  gloves: [
    { id: 'wrapG',   name: 'Bez Sargı',      rar: 'common', det: 1, col: 0xa89678, trim: 0x8a7a5e,
      plus: { atkSpeed: 0.05 } },
    { id: 'leatherG',name: 'Deri Kolluk',    rar: 'common', det: 1, col: 0x7d5a3a, trim: 0x5a3f28,
      plus: { dmg: 0.06, armor: 1 } },
    { id: 'ironG',   name: 'Demir Kolluk',   rar: 'rare',   det: 2, col: 0x9aa3b0, trim: 0x6d7683,
      plus: { dmg: 0.12, armor: 3 }, minus: { atkSpeed: -0.05 }, set: 'ruins' },
    { id: 'swiftG',  name: 'Çevik Eldiven',  rar: 'rare',   det: 2, col: 0x4e8f9a, trim: 0x9ef1ff,
      plus: { atkSpeed: 0.15 }, minus: { dmg: -0.05 } },
    { id: 'clawG',   name: 'Cinnet Pençesi', rar: 'epic',   det: 3, col: 0x6d2a3a, trim: 0xff5566,
      plus: { dmg: 0.25, crit: 0.08 }, minus: { armor: -3 }, set: 'volcano' },
    { id: 'titanG',  name: 'Titan Yumruğu',  rar: 'legend', det: 4, col: 0xc9a24a, trim: 0xfff0b8,
      plus: { dmg: 0.22, atkSpeed: 0.12, area: 0.1 } },
  ],
  boots: [
    { id: 'sandalB', name: 'Sandalet',       rar: 'common', det: 1, col: 0x8a6b45, trim: 0x63502f,
      plus: { speedMul: 0.05 } },
    { id: 'leatherB',name: 'Deri Bot',       rar: 'common', det: 1, col: 0x7d5a3a, trim: 0x5a3f28,
      plus: { speedMul: 0.08, armor: 1 }, set: 'forest' },
    { id: 'ironB',   name: 'Demir Dizlik',   rar: 'rare',   det: 2, col: 0x9aa3b0, trim: 0x6d7683,
      plus: { armor: 4, maxHp: 20 }, minus: { speedMul: -0.05 } },
    { id: 'windB',   name: 'Rüzgar Botu',    rar: 'rare',   det: 2, col: 0x7fd8c8, trim: 0xdff7ff,
      plus: { speedMul: 0.16 }, minus: { armor: -2 } },
    { id: 'quakeB',  name: 'Sarsıntı Botu',  rar: 'epic',   det: 3, col: 0x7a5230, trim: 0xff8a3d,
      plus: { speedMul: 0.12, dmg: 0.1 }, minus: { magnet: -0.2 }, set: 'volcano' },
    { id: 'hermesB', name: 'Hermes Kanadı',  rar: 'legend', det: 4, col: 0xe8e2cf, trim: 0xffd479,
      plus: { speedMul: 0.22, atkSpeed: 0.08 } },
  ],
  cloak: [
    { id: 'raggedK', name: 'Yırtık Pelerin', rar: 'common', det: 1, col: 0x6b6152, trim: 0x50483d,
      plus: { magnet: 0.12 } },
    { id: 'woolK',   name: 'Yün Pelerin',    rar: 'common', det: 1, col: 0x6f5f47, trim: 0x8b7a5c,
      plus: { magnet: 0.2, regen: 0.2 }, set: 'forest' },
    { id: 'shadowK', name: 'Gölge Pelerini', rar: 'rare',   det: 2, col: 0x33304a, trim: 0x6e63a8,
      plus: { speedMul: 0.1, crit: 0.05 }, minus: { armor: -2 }, set: 'ruins' },
    { id: 'royalK',  name: 'Kraliyet Pelerini', rar: 'rare', det: 3, col: 0xa32340, trim: 0xffc94d,
      plus: { maxHp: 30, regen: 0.5 } },
    { id: 'vampK',   name: 'Vampir Pelerini',rar: 'epic',   det: 3, col: 0x4a1526, trim: 0xd12b4a,
      plus: { regen: 1.4, dmg: 0.08 }, minus: { maxHp: -25 } },
    { id: 'starK',   name: 'Yıldız Mantosu', rar: 'legend', det: 4, col: 0x2b3d78, trim: 0x9ec9ff,
      plus: { magnet: 0.6, area: 0.15, regen: 0.6 }, set: 'glacier' },
  ],
  shield: [
    { id: 'woodS',   name: 'Ahşap Siperlik', rar: 'common', det: 1, col: 0x7d5a3a, trim: 0x5a3f28,
      plus: { armor: 2 } },
    { id: 'ironS',   name: 'Demir Siperlik', rar: 'common', det: 2, col: 0x9aa3b0, trim: 0x6d7683,
      plus: { armor: 4, maxHp: 15 }, minus: { atkSpeed: -0.04 }, set: 'glacier' },
    { id: 'kiteS',   name: 'Şövalye Kalkanı',rar: 'rare',   det: 3, col: 0xc0cde0, trim: 0xffd479,
      plus: { armor: 7, maxHp: 35 }, minus: { speedMul: -0.06 }, set: 'ruins' },
    { id: 'spikeS',  name: 'Dikenli Kalkan', rar: 'rare',   det: 3, col: 0x7a6b5c, trim: 0xb0483a,
      plus: { armor: 5, dmg: 0.1 } },
    { id: 'towerS',  name: 'Kule Kalkanı',   rar: 'epic',   det: 4, col: 0x8fa0bb, trim: 0xffd479,
      plus: { armor: 12, maxHp: 55 }, minus: { speedMul: -0.12, atkSpeed: -0.06 } },
    { id: 'aegisS',  name: 'Aegis',          rar: 'legend', det: 4, col: 0xf0e6c8, trim: 0xffd479,
      plus: { armor: 10, maxHp: 50, regen: 0.6 } },
  ],
};
// id -> {item, slot} arama tablosu
const ITEM_BY_ID = {};
for (const slot of GEAR_SLOTS) for (const it of ITEMS[slot]) ITEM_BY_ID[it.id] = { it, slot };
const itemOf = id => (ITEM_BY_ID[id] || {}).it || null;
const slotOfItem = id => (ITEM_BY_ID[id] || {}).slot || null;

/* ---------- SET BONUSLARI ----------
   4 tema, her biri farklı 4 yuvadan 1'er eşyayla (bkz. ITEMS'teki `set`
   etiketleri). 2 parça / 4 parça eşiklerinde bonus açılır. Bazı bonuslar
   düz stat (apply), bazıları çalışma anı kancası gerektiren gerçek
   mekanikler (kind) — biyoma bağlı hız, periyodik ateş/don izi, boss/undead
   hasarı. "Duvar arkası görme" gibi bu oyunda karşılığı olmayan tek bonus
   (Harabe 4) en yakın gerçek mekaniğe uyarlandı: boss'a ekstra hasar. */
const SET_BONUS = {
  forest:  { name: 'Orman Seti',  icon: '🌲',
    p2: { txt: 'Ormanda hareket hızı +%20', kind: 'forestSpeed' },
    p4: { txt: 'Her 10 sn "Yaprak Kalkanı": 0.8 sn dokunulmazlık', kind: 'leafShield' } },
  volcano: { name: 'Volkan Seti', icon: '🌋',
    p2: { txt: 'Zırh +3 (Ateş Direnci)', apply: s => { s.armor += 3; } },
    p4: { txt: 'Hareket ederken yürüdüğün yer 2 sn yanar', kind: 'burnTrail' } },
  ruins:   { name: 'Harabe Seti', icon: '🏛️',
    p2: { txt: 'İskelet/Hayalet düşmanlara +%30 hasar', kind: 'ruinsUndead' },
    p4: { txt: 'Boss\'lara +%15 ek hasar (Hayalet Görüşü)', kind: 'ruinsBoss' } },
  glacier: { name: 'Buzul Seti',  icon: '🧊',
    p2: { txt: 'Zırh +3 (Buz Direnci)', apply: s => { s.armor += 3; } },
    p4: { txt: 'Hareket ederken yürüdüğün yer donar, düşmanları yavaşlatır', kind: 'frostTrail' } },
};
function equippedSetCounts() {
  const counts = {};
  for (const slot in P.eq) {
    const it = itemOf(P.eq[slot]);
    if (it && it.set) counts[it.set] = (counts[it.set] || 0) + 1;
  }
  return counts;
}

/* ---------- SINIFLAR ----------
   Tasarım dokümanındaki tabloya birebir orantılandı: hpMul = dokümandaki
   HP / 100 (bizim varsayılan can değerimiz); speedMul ve dmgMul da kendi
   sütunlarının ortalamasına göre normalize edildi. Görsel ayrım: aynı model,
   kıyafet paleti sınıfa göre yeniden boyanıyor (ayrı glTF yok, bkz. README). */
const CLASSES = {
  paladin: {
    id: 'paladin', name: 'Paladin', title: 'Aldric, Işığın Muhafızı', icon: '🛡️',
    weapon: 'guardian', hpMul: 1.2, speedMul: 0.86, dmgMul: 0.8,
    armor: 4, regen: 0.5,
    palette: { body: 0xdccdab, trim: 0xffd479, accent: 0x8b6f2a },
    passiveTxt: 'Zırh +4 · Rejen +0.5 HP/sn · silahı Döner Bıçaklar',
  },
  ranger: {
    id: 'ranger', name: 'Ranger', title: 'Lyra, Ormanın Gölgesi', icon: '🏹',
    weapon: 'kunai', hpMul: 0.9, speedMul: 1.2, dmgMul: 1.0,
    atkSpeed: 0.15, speedAdd: 0.05,
    palette: { body: 0x3f5c33, trim: 0x6b4a2a, accent: 0x8a9a5a },
    passiveTxt: 'Saldırı hızı +%15 · Hareket hızı +%5 · silahı Kunai Yağmuru',
  },
  mage: {
    id: 'mage', name: 'Mage', title: 'Thorne, Buzul Ustası', icon: '🔮',
    weapon: 'laser', hpMul: 0.7, speedMul: 1.0, dmgMul: 1.4,
    area: 0.15, trait: 'chill',
    palette: { body: 0x2c3f7a, trim: 0x6a5acd, accent: 0x1a2550 },
    passiveTxt: 'Hasar +%40 · Etki alanı +%15 · isabetler düşmanı yavaşlatır (Soğutma)',
  },
  berserker: {
    id: 'berserker', name: 'Berserker', title: 'Krag, Öfke Titanı', icon: '⚔️',
    weapon: 'rocket', hpMul: 1.1, speedMul: 0.94, dmgMul: 1.2,
    crit: 0.12, trait: 'rage',
    palette: { body: 0x5a1c1c, trim: 0x3a3a3a, accent: 0xff5a1f },
    passiveTxt: 'Kritik +%12 · silahı Roketatar · can azaldıkça hasar artar (Öfke)',
  },
};
const CLASS_ORDER = ['paladin', 'ranger', 'mage', 'berserker'];

/* ---------- YETENEK AĞACI ----------
   3 dal × 5 kademe × (kademe 1-4'te 3 seçenek, kademe 5 tek ULTİME).
   Kademe N'i açmak için kademe N-1'in seçilmiş olması gerekir (req). Puan
   seviye başına 1 kazanılır (koşu sonunda altınla birlikte bankaya yatar).
   Çoğu düğüm doğrudan stat bonusu (b = P.base); bazıları çalışma anı
   kancalarına ihtiyaç duyduğu için P.sk üzerine bayrak/sayı yazıyor —
   doküman bazı kavramları (zırh delme, zehir immünitesi) bu oyunda karşılığı
   olmayan sistemlere dayandırıyordu; en yakın gerçek mekaniğe uyarlandı
   (örn. "Zırh Delici" → elit/boss'a ekstra hasar, "Çeviklik" → gelen hasar
   azaltma). Kalıcı efektler applySkillTree() ile koşu başında P.base/P.sk'ya
   işleniyor; birkaç periyodik ULTİME/aktif düğüm updateSkillTimers() içinde
   çalışıyor (bkz. 2. dosya bölümü — GİRDİ altındaki not). */
const SKILLS = {
  combat: { name: 'Savaş', icon: '⚔️', tiers: [
    { cost: 1, opts: [
      { id: 'c1a', name: 'Kılıç Ustalığı', desc: 'Hasar +%10', apply: b => { b.dmg += 0.10; } },
      { id: 'c1b', name: 'Çift Vuruş', desc: '%20 şansla ikinci (yarı hasarlı) vuruş', apply: (b, sk) => { sk.doubleHit += 0.20; } },
      { id: 'c1c', name: 'Kritik Şans', desc: 'Kritik şansı +%5', apply: b => { b.crit += 0.05; } },
    ] },
    { cost: 1, opts: [
      { id: 'c2a', name: 'Zırh Delici', desc: 'Elit ve boss düşmanlara +%15 hasar', apply: (b, sk) => { sk.armorPen += 0.15; } },
      { id: 'c2b', name: 'Öfke Birikimi', desc: 'Can azaldıkça hasar artar (üst limit +%30)', apply: (b, sk) => { sk.rageMax += 0.30; } },
      { id: 'c2c', name: 'Kanama', desc: 'İsabetler +%20 ek hasar verir', apply: (b, sk) => { sk.bleed += 0.20; } },
    ] },
    { cost: 1, opts: [
      { id: 'c3a', name: 'İkili Vuruş', desc: 'İsabetler yakındaki 2. hedefe de %50 hasar verir', apply: (b, sk) => { sk.splashHit += 0.5; } },
      { id: 'c3b', name: 'Kritik Patlama', desc: 'Kritik vuruşlar küçük alan hasarı verir', apply: (b, sk) => { sk.critBlast = true; } },
      { id: 'c3c', name: 'Ölüm Darbesi', desc: 'Canı %10 altındaki düşmanları anında öldürür', apply: (b, sk) => { sk.execute = Math.max(sk.execute, 0.10); } },
    ] },
    { cost: 1, opts: [
      { id: 'c4a', name: 'Berserker Rage', desc: 'Can azaldıkça hasar artar (üst limit +%50)', apply: (b, sk) => { sk.rageMax += 0.50; } },
      { id: 'c4b', name: 'Silah Ustası', desc: 'Hasar +%25', apply: b => { b.dmg += 0.25; } },
      { id: 'c4c', name: 'Yıldırım Hızı', desc: 'Saldırı hızı +%30', apply: b => { b.atkSpeed += 0.30; } },
    ] },
    { cost: 2, ult: true, opts: [
      { id: 'c5', name: 'ULTİME: Titan Gücü', desc: 'Can ilk kez %25 altına düştüğünde 5 sn: hasar ×2, boyut +%30, yer dalgası patlatır (koşuda 1 kez)',
        apply: (b, sk) => { sk.titan = true; } },
    ] },
  ] },
  survival: { name: 'Survival', icon: '❤️', tiers: [
    { cost: 1, opts: [
      { id: 's1a', name: 'İyileşme Çemberi', desc: 'Sürekli can yenileme +0.3 HP/sn', apply: b => { b.regen += 0.3; } },
      { id: 's1b', name: 'Dayanıklık', desc: 'Zırh +10', apply: b => { b.armor += 10; } },
      { id: 's1c', name: 'Çeviklik', desc: 'Gelen hasar -%5', apply: (b, sk) => { sk.dodge += 0.05; } },
    ] },
    { cost: 1, opts: [
      { id: 's2a', name: 'Can Çalma', desc: 'Vurduğun hasarın %5\'i canına dönüşür', apply: (b, sk) => { sk.lifesteal += 0.05; } },
      { id: 's2b', name: 'Hızlı Koşu', desc: 'Hareket hızı +%15', apply: b => { b.speedMul += 0.15; } },
      { id: 's2c', name: 'İkinci Şans', desc: 'Ölümcül darbede 1 HP\'yle hayatta kal (koşuda 1 kez)', apply: (b, sk) => { sk.secondChance = true; } },
    ] },
    { cost: 1, opts: [
      { id: 's3a', name: 'Zehir İmmünitesi', desc: 'Zırh +3 (alan hasarlarına dayanıklılık)', apply: b => { b.armor += 3; } },
      { id: 's3b', name: 'Açlık Bastırma', desc: 'XP kazancı +%20', apply: (b, sk) => { sk.xpMul += 0.20; } },
      { id: 's3c', name: 'Demir Vücut', desc: 'Tüm gelen hasar -%10', apply: (b, sk) => { sk.dmgReduce += 0.10; } },
    ] },
    { cost: 1, opts: [
      { id: 's4a', name: 'Yenilenme', desc: 'Can %50 altındayken rejen ×2', apply: (b, sk) => { sk.regenDouble = true; } },
      { id: 's4b', name: 'Dash Yenileme', desc: 'Atılma bekleme süresi -%40', apply: (b, sk) => { sk.dashCdMul = Math.min(sk.dashCdMul, 0.6); } },
      { id: 's4c', name: 'Altın Mıknatısı', desc: 'Toplama menzili +%50', apply: b => { b.magnet += 0.5; } },
    ] },
    { cost: 2, ult: true, opts: [
      { id: 's5', name: 'ULTİME: Fenix Alevi', desc: 'Öldüğünde tam can + 3 sn dokunulmazlıkla dirilirsin, ateş alanı bırakır (koşuda 1 kez)',
        apply: (b, sk) => { sk.phoenix = true; } },
    ] },
  ] },
  magic: { name: 'Büyü', icon: '🔮', tiers: [
    { cost: 1, opts: [
      { id: 'm1a', name: 'Ateş Topu', desc: 'İsabetler +%15 ek hasar verir (yanma)', apply: (b, sk) => { sk.ignite += 0.15; } },
      { id: 'm1b', name: 'Buz Kılıcı', desc: 'Her isabet düşmanı kısa süre yavaşlatır', apply: (b, sk) => { sk.chillOnHit = true; } },
      { id: 'm1c', name: 'Işın', desc: 'Atılma hızı +%20', apply: (b, sk) => { sk.dashSpdMul += 0.20; } },
    ] },
    { cost: 1, opts: [
      { id: 'm2a', name: 'Elektrik Zinciri', desc: 'İsabetler yakındaki 2 hedefe zincirler (%40 hasar)', apply: (b, sk) => { sk.chainHit += 0.40; } },
      { id: 'm2b', name: 'Kara Delik', desc: 'Periyodik olarak yakındaki düşmanları çeker', apply: (b, sk) => { sk.blackhole = true; } },
      { id: 'm2c', name: 'Kutsal Işık', desc: 'Elit düşmanlara +%20 ek hasar', apply: (b, sk) => { sk.holyVsElite += 0.20; } },
    ] },
    { cost: 1, opts: [
      { id: 'm3a', name: 'Meteor Yağmuru', desc: 'Periyodik olarak rastgele alan hasarı düşürür', apply: (b, sk) => { sk.meteor = true; } },
      { id: 'm3b', name: 'Zaman Bükme', desc: 'Periyodik olarak çevredeki düşmanları yavaşlatır', apply: (b, sk) => { sk.timeSlow = true; } },
      { id: 'm3c', name: 'Koruma Kubbesi', desc: 'Periyodik olarak kısa süreli dokunulmazlık kalkanı', apply: (b, sk) => { sk.shieldPulse = true; } },
    ] },
    { cost: 1, opts: [
      { id: 'm4a', name: 'Element Füzyonü', desc: 'Hasar +%10, kritikler ayrıca yavaşlatır', apply: (b, sk) => { b.dmg += 0.10; sk.fusion = true; } },
      { id: 'm4b', name: 'Mana Şoku', desc: 'Periyodik olarak çevredeki düşmanları iter', apply: (b, sk) => { sk.knockPulse = true; } },
      { id: 'm4c', name: 'Görünmezlik', desc: 'Sürülünce kısa süreli dokunulmazlıkla sıyrılırsın', apply: (b, sk) => { sk.invis = true; } },
    ] },
    { cost: 2, ult: true, opts: [
      { id: 'm5', name: 'ULTİME: Armageddon', desc: 'Periyodik olarak tüm ekrandaki düşmanlara element fırtınası yağdırır',
        apply: (b, sk) => { sk.armageddon = true; } },
    ] },
  ] },
};

/* İstatistik adları (envanterde okunur metin için) */
// Türkçe yazımda işaret yüzdenin ÖNÜNE gelir: "-%15" (yanlış: "%-15")
const pc = v => `${v < 0 ? '-' : '+'}%${Math.abs(Math.round(v * 100))}`;
const nm = v => `${v < 0 ? '-' : '+'}${Math.abs(v)}`;
const STAT_TXT = {
  armor:    v => `Zırh ${nm(v)}`,
  maxHp:    v => `Maks. can ${nm(v)}`,
  dmg:      v => `Hasar ${pc(v)}`,
  atkSpeed: v => `Saldırı hızı ${pc(v)}`,
  speedMul: v => `Hareket hızı ${pc(v)}`,
  magnet:   v => `Mıknatıs ${pc(v)}`,
  regen:    v => `Rejen ${v < 0 ? '-' : '+'}${Math.abs(v).toFixed(2)} HP/sn`,
  crit:     v => `Kritik ${pc(v)}`,
  area:     v => `Etki alanı ${pc(v)}`,
};
const statLines = (o, sign) => Object.keys(o || {}).map(k => (sign || '') + STAT_TXT[k](o[k]));

/* Kasadan çıkacak nadirlik: seviye yükseldikçe iyi eşya şansı artıyor.
   Yüzdeler toplanarak eşiklere çevriliyor (0-100). */
function rollRarity(lv) {
  const legend = Math.min(12, 1 + lv * 0.35);
  const epic   = Math.min(26, 5 + lv * 0.9);
  const rare   = Math.min(42, 18 + lv * 1.2);
  const r = Math.random() * 100;
  if (r < legend) return 'legend';
  if (r < legend + epic) return 'epic';
  if (r < legend + epic + rare) return 'rare';
  return 'common';
}
// Şansları arayüzde göstermek için (kasa açılırken)
function rarityOdds(lv) {
  const legend = Math.min(12, 1 + lv * 0.35);
  const epic   = Math.min(26, 5 + lv * 0.9);
  const rare   = Math.min(42, 18 + lv * 1.2);
  return { legend, epic, rare, common: Math.max(0, 100 - legend - epic - rare) };
}
/* Kasadan bir eşya çıkar. Aynı eşyanın kopyası varsa bir kez yeniden
   deneniyor — çantanın aynı şeyle dolmasını yumuşatıyor. */
function rollItem(lv) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const rar = rollRarity(lv);
    const pool = [];
    for (const slot of GEAR_SLOTS) for (const it of ITEMS[slot]) if (it.rar === rar) pool.push(it);
    const pick0 = pool[(Math.random() * pool.length) | 0];
    if (!pick0) continue;
    if (attempt === 0 && (P.bag.indexOf(pick0.id) >= 0 || P.eq[slotOfItem(pick0.id)] === pick0.id)) continue;
    return pick0;
  }
  const slot = GEAR_SLOTS[(Math.random() * GEAR_SLOTS.length) | 0];
  return ITEMS[slot][(Math.random() * ITEMS[slot].length) | 0];
}


/* --- Teçhizatın 3B tarafı --- */
const gearMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient, flatShading: true });
const gearOutlineMat = new THREE.MeshBasicMaterial({ color: 0x241c2e, side: THREE.BackSide });
const gearNodes = {};                 // slot -> kemiğe bağlı kapsayıcı dizisi
const gearBones = {};
function findBone(root, name) {
  let hit = null;
  root.traverse(o => { if (!hit && o.isBone && o.name === name) hit = o; });
  return hit;
}
/* Kemik uzayı model birimindedir (~santimetre) ve her kemiğin ekseni farklı
   yöne bakar (mesela LeftHand'in +Y'si dünyada AŞAĞIYI gösterir). Bu yüzden
   parçalar KARAKTER uzayında tanımlanır, burada kemiğin dönüşü terslenerek
   kemiğe taşınır — tablodaki sayılar "ileri/yukarı/sağa" olarak okunur kalır. */
const _relM = new THREE.Matrix4(), _rootInv = new THREE.Matrix4();
const _bp = new THREE.Vector3(), _bq = new THREE.Quaternion(), _bs = new THREE.Vector3();
const _inv = new THREE.Quaternion(), _eul = new THREE.Euler(), _off = new THREE.Vector3();
function attachNode(root, boneName, pos, rot) {
  const bone = findBone(root, boneName);
  if (!bone) { console.warn('kemik yok:', boneName); return null; }
  bone.updateWorldMatrix(true, false);
  _relM.multiplyMatrices(_rootInv, bone.matrixWorld);      // kemik -> karakter uzayı
  _relM.decompose(_bp, _bq, _bs);
  _inv.copy(_bq).invert();
  const U = 1 / (MODEL_SCALE * (_bs.x || 1));              // 1 dünya birimi = U kemik birimi
  const holder = new THREE.Group();
  holder.scale.setScalar(U);
  _off.fromArray(pos).multiplyScalar(U).applyQuaternion(_inv);
  holder.position.copy(_off);
  _eul.set(rot[0], rot[1], rot[2]);
  holder.quaternion.copy(_inv).multiply(new THREE.Quaternion().setFromEuler(_eul));
  bone.add(holder);
  return holder;
}
// Sınıfa göre elde taşınan silah görseli (weaponModels.js): oyunun kendi
// silah kimlikleri (bolt/guardian/rocket/laser/kunai) sword/bow/staff/axe
// kategorisine birebir denk düşmüyor — sınıf ikonuna göre eşleniyor.
const CLASS_WEAPON_TYPE = { paladin: 'sword', ranger: 'bow', mage: 'staff', berserker: 'axe' };
let weaponHolder = null, heldWeaponKey = '';
function refreshHeldWeapon() {
  if (!weaponHolder) return;
  const cls = CLASSES[P.classId] || CLASSES[META.classId] || CLASSES.paladin;
  const w = getWeapon(cls.weapon);
  const lvl = w ? (w.evolved ? 5 : w.lv) : 1;
  const key = cls.id + ':' + lvl;
  if (key === heldWeaponKey) return;
  heldWeaponKey = key;
  while (weaponHolder.children.length) {
    const c = weaponHolder.children.pop();
    c.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  }
  const type = CLASS_WEAPON_TYPE[cls.id] || 'sword';
  const model = createWeaponModel(type, lvl);
  // Yay'ın eğrisi yerel XY düzleminde düz; izometrik kameraya kenardan
  // görünmesin diye ek bir yaw döndürmesiyle gövdeye göre çapraz tutuluyor
  if (type === 'bow') model.rotation.y = 1.0;
  weaponHolder.add(model);
}
let outfitNodes = [];
function initGearNodes(root) {
  root.updateMatrixWorld(true);
  _rootInv.copy(root.matrixWorld).invert();
  for (const slot of GEAR_SLOTS) {
    const def = GEAR[slot];
    gearNodes[slot] = []; gearBones[slot] = [];
    def.bones.forEach((bn, i) => {
      // Sağ taraf: aynı parça, x ekseninde aynalanmış konum/dönüş
      const m = def.mirror && i === 1 ? -1 : 1;
      const h = attachNode(root, bn, [def.pos[0] * m, def.pos[1], def.pos[2]],
                                     [def.rot[0], def.rot[1] * m, def.rot[2] * m]);
      if (h) { gearNodes[slot].push(h); gearBones[slot].push(findBone(root, bn)); }
    });
  }
  // Temel kıyafet: koşu boyunca hiç değişmez, bir kez kurulur
  const outfit = [
    [OUTFIT.torso, 'Spine02', [0, 0.22, -0.1], [0.06, 0, 0]],
    [OUTFIT.hips, 'Hips', [0, -0.05, -0.11], [0, 0, 0]],
    [OUTFIT.foot, 'LeftFoot', [0.03, -0.01, -0.09], [0, 0, 0]],
    [OUTFIT.foot, 'RightFoot', [-0.03, -0.01, -0.09], [0, 0, 0]],
  ];
  outfitNodes = [];
  for (const [make, bone, pos, rot] of outfit) {
    const h = attachNode(root, bone, pos, rot);
    if (!h) continue;
    outfitNodes.push({ holder: h, make });
  }
  // Elde taşınan silah: sağ ele bağlı, sınıfın silah tipine göre kurulur
  weaponHolder = attachNode(root, 'RightHand', [0.03, 0.06, -0.14], [0, 0.2, 0]);
  heldWeaponKey = '';
  refreshHeldWeapon();
  refreshOutfitVisuals();
}
// Kıyafeti güncel sınıfın paletiyle yeniden boya (sınıf değişince / koşu başında)
function refreshOutfitVisuals() {
  const cls = CLASSES[P.classId] || CLASSES[META.classId] || CLASSES.paladin;
  for (const { holder, make } of outfitNodes) {
    while (holder.children.length) {
      const c = holder.children.pop();
      if (c.geometry) c.geometry.dispose();
    }
    const geo = mergeGeometries(make(cls.palette), false);
    if (geo) addPiece(holder, geo);
  }
  refreshHeldWeapon();
}
// Parça + ters kabuk dış çizgi (karakterin çizgisiyle aynı dil)
function addPiece(holder, geo) {
  const m = new THREE.Mesh(geo, gearMat);
  m.frustumCulled = false;
  const ol = new THREE.Mesh(geo, gearOutlineMat);
  ol.scale.setScalar(1.07); ol.renderOrder = -1; ol.frustumCulled = false;
  holder.add(m); holder.add(ol);
}
// Kuşanılanları sahneye yansıt (kademe değiştikçe çağrılır)
function refreshGearVisuals() {
  for (const slot of GEAR_SLOTS) {
    const holders = gearNodes[slot]; if (!holders) continue;
    const it = itemOf(P.eq[slot]);
    for (const holder of holders) {
      while (holder.children.length) {
        const c = holder.children.pop();
        if (c.geometry) c.geometry.dispose();
      }
      if (!it) continue;
      const geo = mergeGeometries(SHAPE[slot](it.det, it), false);
      if (geo) addPiece(holder, geo);
    }
  }
  // Göğüslük/bot giyilince temel kıyafet altında kalır; z-kavgası olmasın diye gizle
  if (outfitNodes[0]) outfitNodes[0].holder.visible = !P.eq.chest;
  if (outfitNodes[2]) outfitNodes[2].holder.visible = !P.eq.boots;
  if (outfitNodes[3]) outfitNodes[3].holder.visible = !P.eq.boots;
}

/* ---------- ENVANTER ----------
   Çanta ve kuşanılanlar KOŞUYA ÖZEL: her koşuda sıfırdan toplanıyor
   (roguelike döngüsü). Kalıcı olan tek şey koleksiyon kaydı (META.seen). */
const BAG_MAX = 20;
function itemStatSum(it, key) {
  if (!it) return 0;
  return (it.plus && it.plus[key] || 0) + (it.minus && it.minus[key] || 0);
}
/* Bir yuvaya eşya tak/çıkar. Maks. can farkı burada işleniyor çünkü envanter
   koşu ortasında değişiyor ve can barı anında güncellenmeli. */
function equipItem(slot, id) {
  const cur = P.eq[slot], next = id || null;
  if (cur === next) return false;
  const d = itemStatSum(itemOf(next), 'maxHp') - itemStatSum(itemOf(cur), 'maxHp');
  // yerinden çıkan eşya çantaya döner
  if (cur) { const i = P.bag.indexOf(cur); if (i < 0 && P.bag.length < BAG_MAX) P.bag.push(cur); }
  if (next) { const i = P.bag.indexOf(next); if (i >= 0) P.bag.splice(i, 1); }
  P.eq[slot] = next;
  if (d) { P.maxHp = Math.max(1, P.maxHp + d); P.hp = clamp(P.hp + Math.max(0, d), 1, P.maxHp); }
  recomputeStats();
  refreshGearVisuals();
  return true;
}
/* Çantaya eşya ekle. Yuva boşsa kendiliğinden kuşanılır; doluysa çantada
   bekler (oyuncu envanterden karşılaştırıp değiştirir). */
function addItem(id) {
  const slot = slotOfItem(id);
  if (!slot) return null;
  META.seen[id] = 1; metaSave();                 // koleksiyon kaydı
  if (!P.eq[slot]) { equipItem(slot, id); return 'equipped'; }
  if (P.bag.indexOf(id) >= 0) { G.gold += 25; return 'dupe'; }   // kopya: altına çevrilir
  if (P.bag.length >= BAG_MAX) { G.gold += 25; return 'full'; }
  P.bag.push(id);
  return 'bagged';
}

// Döner bıçak mesh havuzu
const bladeMat = new THREE.MeshLambertMaterial({ color: 0xdfe9ff });
const bladeEvoMat = new THREE.MeshBasicMaterial({ color: 0x7ecbff, transparent: true, opacity: 0.85 });
const bladeMeshes = [];
function getBlade(i) {
  if (!bladeMeshes[i]) {
    const blade = new THREE.ConeGeometry(0.22, 1.15, 4); blade.rotateX(Math.PI / 2); blade.translate(0, 0, 0.2);
    const guard = new THREE.BoxGeometry(0.5, 0.09, 0.12); guard.translate(0, 0, -0.36);
    const grip = new THREE.CylinderGeometry(0.07, 0.07, 0.34, 5); grip.rotateX(Math.PI / 2); grip.translate(0, 0, -0.56);
    const m = new THREE.Mesh(mergeGeometries([blade, guard, grip].map(ni), false), bladeMat);
    m.visible = false; scene.add(m); bladeMeshes[i] = m;
  }
  return bladeMeshes[i];
}
function addWeapon(id) { const w = { id, lv: 1, timer: 0, evolved: false, ang: 0, blades: [] }; P.weapons.push(w); return w; }
const getWeapon = id => P.weapons.find(w => w.id === id);

function updateWeapons(dt) {
  refreshHeldWeapon();   // silah seviye atladıkça/evrimleştikçe eldeki görsel güncellensin
  let bi = 0;
  for (let i = 0; i < P.weapons.length; i++) {
    const w = P.weapons[i], def = WEAPONS[w.id];
    // stats() her karede yeni nesne üretiyordu; seviye/evrim değişmedikçe önbellekten
    if (w._sk !== w.lv + ':' + w.evolved) { w._sk = w.lv + ':' + w.evolved; w._s = def.stats(w.lv, w.evolved); }
    const s = w._s;
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
/* Ölçüm: eski eğriyle 10. dakikada ~1.3 saniyede bir seviye atlanıyordu ve
   sürenin %15'i kart ekranında geçiyordu (insan tepkisiyle çok daha fazlası).
   Erken tempo aynı kalsın diye ilk 12 seviye neredeyse değişmedi; sonrasında
   üstel terim devreye girip seviye başına süreyi ~10 saniyeye çıkarıyor. */
const xpForLevel = lv => Math.floor(6 + lv * 5 + lv * lv * 0.35 + Math.pow(Math.max(0, lv - 12), 2.6));
function spawnPickup(x, z, kind, val, gear) {
  const p = pickups.get();
  if (!p) { if (kind.startsWith('xp')) gainXp(val); return; }
  p.x = x; p.z = z; p.kind = kind; p.val = val; p.t = rnd(TAU); p.pulled = false;
  p.slot = ''; p.tier = 0;
  const a = rnd(TAU), s = rnd(2.8, 0.9);
  p.vx = Math.cos(a) * s; p.vz = Math.sin(a) * s;
}
/* KASA düşürme. Ana kaynak SEVİYE ATLAMAK; boss ve elitler ek kasa verir.
   Kasayı toplayınca içinden yüzdelik şansla bir eşya çıkıyor (rollItem). */
function dropChest(x, z, n) {
  for (let i = 0; i < n; i++)
    spawnPickup(x + rnd(1.4, -1.4), z + rnd(1.4, -1.4), 'chest', 0);
}
function dropLoot(e) {
  if (e.boss) {
    for (let i = 0; i < 12; i++) spawnPickup(e.x + rnd(3, -3), e.z + rnd(3, -3), 'xp20', 20);
    for (let i = 0; i < 6; i++) spawnPickup(e.x + rnd(3.5, -3.5), e.z + rnd(3.5, -3.5), 'gold', 10);
    spawnPickup(e.x, e.z + 1, 'heal', 35);
    dropChest(e.x, e.z, 2);
    return;
  }
  let kind = 'xp1', val = 1;
  if (e.xp >= 20) { kind = 'xp20'; val = 20; } else if (e.xp >= 5) { kind = 'xp5'; val = 5; }
  spawnPickup(e.x, e.z, kind, val);
  if (Math.random() < (e.elite ? 1 : 0.05)) spawnPickup(e.x + rnd(.7, -.7), e.z + rnd(.7, -.7), 'gold', e.elite ? 8 : rndi(4, 1));
  if (Math.random() < 0.012) spawnPickup(e.x, e.z, 'heal', 20);
  if (e.elite && Math.random() < 0.35) dropChest(e.x, e.z, 1);
  else if (Math.random() < 0.004) dropChest(e.x, e.z, 1);
}
function updatePickups(dt) {
  const A = pickups.active;
  const magR = 5.6 * P.st.magnet, magR2 = magR * magR;
  const pickR2 = (P.r + 0.8) * (P.r + 0.8);
  let n = 0, ng = 0;
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
    if (p.kind === 'chest') {
      if (ng < GEAR_DROP_MAX) {
        _v3.set(p.x, 0.42 + Math.sin(p.t * 3.4) * 0.1, p.z);
        _q.setFromAxisAngle(_AXIS_Y, p.t * 1.1);
        _s3.setScalar(1);
        _m4.compose(_v3, _q, _s3);
        gearDropMesh.setMatrixAt(ng, _m4);
        _col.setHex(0xffb84d);                    // altın sandık
        gearDropMesh.setColorAt(ng, _col);
        ng++;
      }
      continue;
    }
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
  gearDropMesh.count = ng;
  gearDropMesh.instanceMatrix.needsUpdate = true;
  if (gearDropMesh.instanceColor) gearDropMesh.instanceColor.needsUpdate = true;
  pickups.sweep();
}
function collect(p) {
  if (p.kind === 'chest') {
    /* Kasa açılışı: nadirlik yüzdelik şansla belirleniyor (rollItem),
       çıkan eşya boş yuvaya kendiliğinden takılıyor, dolu yuvada çantaya
       düşüyor — karşılaştırmayı oyuncu envanterden yapıyor. */
    const it = rollItem(G.level);
    const res = addItem(it.id);
    const R = RAR[it.rar];
    banner(GEAR[slotOfItem(it.id)].icon + ' ' + it.name, 2);
    G.toast = { name: it.name, rar: it.rar, res, t: 2.6 };
    SFX.levelup(); addShake(0.3);
    for (let i = 0; i < 26; i++) particle(p.x, 0.9, p.z, R.col, 4, 10);
    SFX.pickup();
    return;
  }
  if (p.kind === 'gold') { G.gold += p.val; addText(p.x, 1, p.z, p.val, false); }
  else if (p.kind === 'heal') { P.hp = Math.min(P.maxHp, P.hp + p.val); for (let i = 0; i < 8; i++) particle(P.x, 1, P.z, '#ff7a94', 3, 5); }
  else gainXp(p.val);
  SFX.pickup();
  particle(p.x, 0.6, p.z, '#bfe9ff', 2, 4);
}
function gainXp(v) {
  if (P.sk && P.sk.xpMul) v *= (1 + P.sk.xpMul);    // Açlık Bastırma
  G.xp += v;
  while (G.xp >= G.xpNext) {
    G.xp -= G.xpNext; G.level++; G.pendingLevels++; G.xpNext = xpForLevel(G.level);
    dropChest(P.x, P.z, 1);          // her seviyede bir kasa
    G.skillPtsEarned++;              // yetenek puanı: seviye başına 1, koşu sonunda bankaya yatar
  }
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
    addShake(1.0, true);
    for (let i = 0; i < 50; i++) particle(P.x, 1, P.z, '#ffe08a', 5, 18);
  }
}
const elCards = document.getElementById('cards');
const elLevelup = document.getElementById('levelup');
function openLevelUp() {
  G.state = 'LEVELUP';
  SFX.levelup();
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
  else { G.state = 'PLAY'; releaseSticks(); }
}

/* ============ 10) HASAR & ÖLÜM ============ */
/* noProc: BİRİNCİL olmayan (zincir/sıçrama/patlama kaynaklı) isabetlerde true
   geçilir — sonsuz zincire girmeden yalnızca bir kademe yayılım olur. */
function hitEnemy(e, dmg, sx, sz, knock, big, noProc) {
  const crit = Math.random() < P.st.crit;
  let d = crit ? dmg * 2 : dmg;
  const sk = P.sk;
  /* Doküman bazı kavramları (zırh delme, kutsal ışık) bu oyunda karşılığı
     olmayan sistemlere dayandırıyordu; en yakın gerçek mekaniğe uyarlandı:
     "Zırh Delici" → elit/boss'a ekstra hasar, "Kutsal Işık" → elite ekstra. */
  if (sk) {
    if (sk.armorPen && (e.elite || e.boss)) d *= 1 + sk.armorPen;
    if (sk.holyVsElite && e.elite) d *= 1 + sk.holyVsElite;
    if (sk.bleed) d *= 1 + sk.bleed;
    if (sk.ignite) d *= 1 + sk.ignite;
  }
  // Harabe Seti: 2 parça iskelet/hayalete, 4 parça ayrıca boss'lara ekstra hasar
  if (P.setBonus) {
    if (P.setBonus.ruins2 && (e.type === 'skeleton' || e.type === 'wraith')) d *= 1.3;
    if (P.setBonus.ruins4 && e.boss) d *= 1.15;
  }
  e.hp -= d; G.dmgDealt += d;
  e.flash = 0.09;
  if (P.classId === 'mage' && !e.boss) e.chillT = 0.7;          // Soğutma (sınıf)
  if (sk && sk.chillOnHit && !e.boss) e.chillT = Math.max(e.chillT, 0.5);   // Buz Kılıcı
  if (sk && sk.fusion && crit && !e.boss) e.chillT = Math.max(e.chillT, 0.6); // Element Füzyonu
  if (sk && sk.lifesteal) P.hp = Math.min(P.maxHp, P.hp + d * sk.lifesteal);  // Can Çalma
  addText(e.x, (e.cfg ? e.cfg.h : 2) * e.scale + 0.4, e.z, d, crit);
  if (knock && !e.boss) {
    const dx = e.x - sx, dz = e.z - sz, dd = Math.hypot(dx, dz) || 1;
    e.kx += dx / dd * knock; e.kz += dz / dd * knock;
  }
  if (big || crit) { addShake(crit ? 0.22 : 0.16); if (big) hitStop(0.05); }
  SFX.hit();
  for (let i = 0; i < (big ? 5 : 2); i++) particle(e.x, 0.7, e.z, crit ? '#fff2a0' : '#ffd0d0', 2.5, 7);
  // Ölüm Darbesi: canı eşiğin altındaki (boss hariç) düşmanı infaz eder
  if (sk && sk.execute && !e.boss && e.hp > 0 && e.hp / e.maxHp < sk.execute) e.hp = 0;
  if (e.hp <= 0) killEnemy(e);
  if (!noProc && sk) {
    if (sk.doubleHit && Math.random() < sk.doubleHit)             // Çift Vuruş
      hitEnemy(e, dmg * 0.5, sx, sz, 0, false, true);
    if ((sk.splashHit || sk.chainHit) && !e.boss) {                // İkili Vuruş / Elektrik Zinciri
      const frac = Math.max(sk.splashHit, sk.chainHit);
      const targets = sk.chainHit ? 2 : 1;
      const list = hash.query(e.x, e.z, 3.2, qbuf);
      let hitN = 0;
      for (let i = 0; i < list.length && hitN < targets; i++) {
        const o = list[i];
        if (o === e || o.dead || o.boss) continue;
        hitEnemy(o, dmg * frac, e.x, e.z, knock * 0.4, false, true);
        hitN++;
      }
    }
    if (sk.critBlast && crit) explode(e.x, e.z, 2.2, d * 0.4, 0xfff2a0);  // Kritik Patlama
  }
}
function killEnemy(e) {
  if (e.dead) return;
  e.dead = true; G.kills++;
  SFX.kill();
  dropLoot(e);
  const col = e.boss ? '#' + (BOSS_THEMES[e.bossTheme] || BOSS_THEMES.rocky).color.toString(16).padStart(6, '0')
                     : '#' + (e.cfg.color).toString(16).padStart(6, '0');
  const n = e.boss ? 60 : e.elite ? 20 : 8;
  for (let i = 0; i < n; i++) particle(e.x, 0.7, e.z, i % 3 ? col : '#ffffff', e.boss ? 6 : 3, e.boss ? 20 : 9);
  if (e.boss) {
    G.boss = null; bossMesh.visible = false; addShake(1.2, true); hitStop(0.12, true);
    banner(e.bossName + ' YOK EDİLDİ!', 2.4);
    if (e.isFinal) gameOver(true);
  } else if (e.elite) addShake(0.28);
}

/* ---------- Yetenek ağacı: periyodik/ULTİME düğümler ----------
   Çoğu düğüm koşu başında bir kez P.base/P.sk'ya işleniyor (applySkillTree);
   bunlar ise zamanla tetiklenen aktif efektler, tek bir zamanlayıcı
   fonksiyonunda toplanıyor. Var olan sistemleri (hash sorgusu, kx/kz itme,
   chillT, explode/hitEnemy) yeniden kullanıyor — yeni bir alt sistem yok. */
function pullNearby(range, force) {
  const list = hash.query(P.x, P.z, range, qbuf);
  for (let i = 0; i < list.length; i++) {
    const e = list[i]; if (e.dead || e.boss) continue;
    const dx = P.x - e.x, dz = P.z - e.z, d = Math.hypot(dx, dz) || 1;
    e.kx += dx / d * force; e.kz += dz / d * force;
  }
  for (let i = 0; i < 12; i++) particle(P.x, 0.5, P.z, '#b07bff', 3, 6);
  addShake(0.12);
}
function pushNearby(range, force) {
  const list = hash.query(P.x, P.z, range, qbuf);
  for (let i = 0; i < list.length; i++) {
    const e = list[i]; if (e.dead || e.boss) continue;
    const dx = e.x - P.x, dz = e.z - P.z, d = Math.hypot(dx, dz) || 1;
    e.kx += dx / d * force; e.kz += dz / d * force;
  }
  for (let i = 0; i < 14; i++) particle(P.x, 0.5, P.z, '#ffd479', 3, 7);
  addShake(0.18);
}
function chillNearby(range, t) {
  const list = hash.query(P.x, P.z, range, qbuf);
  for (let i = 0; i < list.length; i++) {
    const e = list[i]; if (e.dead || e.boss) continue;
    e.chillT = Math.max(e.chillT, t);
  }
  addShake(0.15);
  for (let i = 0; i < 14; i++) particle(P.x, 0.6, P.z, '#9ef1ff', 4, 7);
}
function updateSkillTimers(dt) {
  const sk = P.sk; if (!sk) return;
  const T = P.skT;
  if (sk.blackhole) { T.blackhole -= dt; if (T.blackhole <= 0) { T.blackhole = 4; pullNearby(7, 9); } }
  if (sk.meteor) {
    T.meteor -= dt;
    if (T.meteor <= 0) {
      T.meteor = 2.6;
      const a = rnd(TAU), r = rnd(6, 1.5);
      explode(P.x + Math.cos(a) * r, P.z + Math.sin(a) * r, 2.6, dmgOf(18), 0xff8a3d);
    }
  }
  if (sk.timeSlow) { T.timeSlow -= dt; if (T.timeSlow <= 0) { T.timeSlow = 5; chillNearby(9, 1.4); } }
  if (sk.shieldPulse) {
    T.shieldPulse -= dt;
    if (T.shieldPulse <= 0) {
      T.shieldPulse = 20; P.iframe = Math.max(P.iframe, 1.5);
      banner('KORUMA KUBBESİ', 1.2);
      for (let i = 0; i < 16; i++) particle(P.x, 1, P.z, '#9ef1ff', 4, 9);
    }
  }
  if (sk.knockPulse) { T.knockPulse -= dt; if (T.knockPulse <= 0) { T.knockPulse = 6; pushNearby(7, 16); } }
  if (sk.invis) {
    T.invis -= dt;
    if (T.invis <= 0) {
      const list = hash.query(P.x, P.z, 5, qbuf);
      let near = 0;
      for (let i = 0; i < list.length; i++) if (!list[i].dead) near++;
      if (near >= 6) {
        T.invis = 12; P.iframe = Math.max(P.iframe, 1.5);
        banner('GÖRÜNMEZLİK', 1.2);
      } else T.invis = 0.5;    // koşul sağlanmadı, kısa süre sonra tekrar dene
    }
  }
  if (sk.armageddon) {
    T.armageddon -= dt;
    if (T.armageddon <= 0) { T.armageddon = 45; G.armagT = 2.2; banner('ARMAGEDDON!', 1.6); }
  }
  // Set bonusları: periyodik/hareket bağlı düğümler
  const sb = P.setBonus;
  if (sb) {
    if (sb.forest4) {
      T.leafShield -= dt;
      if (T.leafShield <= 0) {
        T.leafShield = 10; P.iframe = Math.max(P.iframe, 0.8);
        for (let i = 0; i < 12; i++) particle(P.x, 0.8, P.z, '#7fe066', 3, 6);
      }
    }
    const moving = Math.hypot(P.vx, P.vz) > 1.5;
    if (sb.volcano4 && moving) {
      T.burnTrail -= dt;
      if (T.burnTrail <= 0) { T.burnTrail = 1.2; makeFire(P.x, P.z, { r: 1.8, dps: dmgOf(6), life: 2 }); }
    }
    if (sb.glacier4 && moving) {
      T.frostTrail -= dt;
      if (T.frostTrail <= 0) { T.frostTrail = 1.0; chillNearby(2.4, 0.4); }
    }
  }
  if (G.armagT > 0) {
    G.armagTick -= dt;
    if (G.armagTick <= 0) {
      G.armagTick = 0.35;
      const A = enemies.active;
      for (let i = 0; i < A.length; i++) if (!A[i].dead) hitEnemy(A[i], dmgOf(14), P.x, P.z, 4, true, true);
      addShake(0.12);
    }
    G.armagT -= dt;
  }
}

/* ============ 11) 2B KATMAN: HUD, HASAR SAYILARI, JOYSTİCK ============ */
function drawOverlay() {
  ctx.clearRect(0, 0, VW, VH);

  // parçacıklar (dünya → ekran)
  let A = parts.active;
  for (let i = 0; i < A.length; i++) {
    const p = A[i];
    project(p.x, p.y, p.z);
    const sx = PX, sy = PY;
    if (sx < -20 || sx > VW + 20 || sy < -20 || sy > VH + 20) continue;
    const k = p.life / p.maxLife;
    const r = p.r * k;
    ctx.fillStyle = p.color;
    // Ucuz "glow": soluk geniş hale + parlak çekirdek — gerçek bloom yerine iki katmanlı dikdörtgen
    ctx.globalAlpha = k * 0.3;
    const rg = r * 2.2;
    ctx.fillRect(sx - rg, sy - rg, rg * 2, rg * 2);
    ctx.globalAlpha = k;
    ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
  }
  ctx.globalAlpha = 1;

  // hasar sayıları
  A = texts.active;
  ctx.textAlign = 'center';
  for (let i = 0; i < A.length; i++) {
    const t = A[i];
    project(t.x, t.y, t.z);
    const sx = PX, sy = PY;
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
    project(P.x, 2.0, P.z);
    const sx = PX, sy = PY;
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
    // Ekranda olamayacak kadar uzaktakileri izdüşüm almadan ele
    if (dist2(e.x, e.z, P.x, P.z) > CULL_R2) continue;
    project(e.x, (e.cfg.h * e.scale) + 0.35, e.z);
    const sx = PX, sy = PY;
    if (sx < 0 || sx > VW || sy < 0 || sy > VH) continue;
    const w = 22 * e.scale, h = 3;
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(sx - w / 2, sy, w, h);
    ctx.fillStyle = e.elite ? '#ffd23f' : '#ff5566';
    ctx.fillRect(sx - w / 2, sy, w * clamp(e.hp / e.maxHp, 0, 1), h);
  }

  if (G.flashRed > 0) {
    // Bloom/vinyet/kromatik sapma yerine ucuz 2B karşılığı: kenarları koyulaştıran
    // dairesel gradyan + kısa süreli renk-ayrışması şeridi (gerçek GPU
    // post-processing düşük uçlu cihaz bütçesiyle uyuşmuyor — bkz. gölge haritası notu)
    const k = G.flashRed, cx = VW / 2, cy = VH / 2, R = Math.hypot(cx, cy);
    const grd = ctx.createRadialGradient(cx, cy, R * 0.35, cx, cy, R);
    grd.addColorStop(0, 'rgba(255,20,40,0)');
    grd.addColorStop(1, `rgba(255,20,40,${(k * 0.85).toFixed(3)})`);
    ctx.fillStyle = grd; ctx.fillRect(0, 0, VW, VH);
    if (k > 0.15) {
      ctx.globalAlpha = clamp((k - 0.15) * 1.4, 0, 0.4);
      ctx.fillStyle = '#ff3050'; ctx.fillRect(0, 0, 4, VH); ctx.fillRect(VW - 4, 0, 4, VH);
      ctx.fillStyle = '#30e0ff'; ctx.fillRect(2, 0, 4, VH); ctx.fillRect(VW - 6, 0, 4, VH);
      ctx.globalAlpha = 1;
    }
  }
  if (G.state !== 'MENU' && G.state !== 'LOADING') { drawHUD(); updateDashBtn(); updateBagBtn(); }
  if (G.toast && G.toast.t > 0) drawToast();
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

  /* Teçhizat şeridi: 6 yuva, kademe rengiyle. RPG ilerlemesinin nerede
     olduğunu tek bakışta göstermek için — boş yuvalar sönük duruyor. */
  ix = 8;
  for (const slot of GEAR_SLOTS) {
    const it = itemOf(P.eq[slot]);
    ctx.fillStyle = it ? 'rgba(0,0,0,.55)' : 'rgba(0,0,0,.28)';
    ctx.fillRect(ix, iy - 10, 21, 20);
    if (it) {                                   // alt çizgi nadirliği gösterir
      ctx.fillStyle = RAR[it.rar].col;
      ctx.fillRect(ix, iy + 7, 21, 3);
    }
    ctx.globalAlpha = it ? 1 : 0.32;
    ctx.font = '12px sans-serif'; ctx.fillStyle = '#fff';
    ctx.fillText(GEAR[slot].icon, ix + 2, iy);
    ctx.globalAlpha = 1;
    ix += 24;
  }
  iy += 26;

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
    project(G.boss.x, 1, G.boss.z);
    const bsx = PX, bsy = PY;
    if (bsx < 0 || bsx > VW || bsy < 0 || bsy > VH) {
      project(P.x, 1, P.z);
      const a = Math.atan2(bsy - PY, bsx - PX);
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
/* Kasadan çıkan eşyanın bildirimi: nadirlik rengiyle, nereye gittiğiyle. */
function drawToast() {
  const T = G.toast;
  const a = clamp(T.t, 0, 1);
  const w = Math.min(VW - 40, 320), x = (VW - w) / 2, y = VH * 0.62;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(8,10,18,.82)';
  ctx.fillRect(x, y, w, 44);
  ctx.fillStyle = RAR[T.rar].col;
  ctx.fillRect(x, y, 4, 44);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '900 15px Trebuchet MS, sans-serif';
  ctx.fillStyle = RAR[T.rar].col;
  ctx.fillText(T.name, x + w / 2, y + 15);
  ctx.font = '700 11px Trebuchet MS, sans-serif';
  ctx.fillStyle = '#9aa4bd';
  ctx.fillText(T.res === 'equipped' ? 'KUŞANILDI'
             : T.res === 'bagged' ? 'ÇANTAYA EKLENDİ — envanterden değiştir'
             : T.res === 'dupe' ? 'ZATEN VAR — altına çevrildi'
             : 'ÇANTA DOLU — altına çevrildi', x + w / 2, y + 32);
  ctx.restore();
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}
// Atılma butonunun bekleme halkasını güncelle
function updateBagBtn() {
  if (!elBagBtn) return;
  elBagBtn.classList.toggle('alert', P.bag.length > 0);
  const n = String(P.bag.length);
  if (elBagBtn.dataset.n !== n) elBagBtn.dataset.n = n;
}
function updateDashBtn() {
  const k = P.dashCd > 0 ? 1 - P.dashCd / DASH_CD : 1;
  elDashBtn.style.background = k >= 1
    ? 'radial-gradient(circle, rgba(90,190,255,.45), rgba(16,18,30,.7))'
    : `conic-gradient(rgba(90,190,255,.4) ${k * 360}deg, rgba(16,18,30,.7) 0deg)`;
  elDashBtn.style.opacity = k >= 1 ? '1' : '0.55';
}

/* İki çubuk aynı anda çizilir; renk hangisinin ne yaptığını anlatır:
   mavi = hareket, turuncu = nişan (nişan çubuğunda ayrıca yön oku var). */
function drawStick(j, tint, arrow) {
  if (!j.active) return;
  const dx = j.x - j.ox, dy = j.y - j.oy, d = Math.hypot(dx, dy) || 1;
  const m = Math.min(d, j.r);
  ctx.save();
  ctx.globalAlpha = .28; ctx.strokeStyle = tint; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(j.ox, j.oy, j.r, 0, TAU); ctx.stroke();
  ctx.globalAlpha = .13; ctx.fillStyle = tint;
  ctx.beginPath(); ctx.arc(j.ox, j.oy, j.r, 0, TAU); ctx.fill();
  ctx.globalAlpha = .68; ctx.fillStyle = tint;
  ctx.beginPath(); ctx.arc(j.ox + dx / d * m, j.oy + dy / d * m, j.r * .42, 0, TAU); ctx.fill();
  if (arrow && m > 8) {                       // nişan yönü oku
    ctx.globalAlpha = .85; ctx.translate(j.ox, j.oy); ctx.rotate(Math.atan2(dy, dx));
    ctx.beginPath();
    ctx.moveTo(j.r + 16, 0); ctx.lineTo(j.r + 2, 9); ctx.lineTo(j.r + 2, -9);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
function drawJoystick() {
  drawStick(joyL, '#cfe3ff', false);
  drawStick(joyR, '#ffb469', true);
  // Fareyle nişan alınırken oyuncunun etrafında yön göstergesi
  if (!joyR.active && mouseAim.on && input.aiming && G.state === 'PLAY') {
    project(P.x, 1, P.z);
    ctx.save();
    ctx.globalAlpha = .55; ctx.fillStyle = '#ffb469';
    ctx.translate(PX, PY); ctx.rotate(Math.atan2(mouseAim.y - PY, mouseAim.x - PX));
    ctx.beginPath(); ctx.moveTo(58, 0); ctx.lineTo(42, 8); ctx.lineTo(42, -8);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}


/* ============ KALICI İLERLEME (altının karşılığı) ============
   Koşularda toplanan altın kalıcı olarak saklanır ve menüdeki yükseltmelere
   harcanır. localStorage bazı gömülü/sandbox bağlamlarda erişilemez olabilir,
   bu yüzden her erişim korumalı; erişilemezse bellekte tutulur (o oturum boyu). */
const UPGRADES = {
  hp:     { icon: '❤️', name: 'Dayanıklılık', desc: 'Başlangıç canı +15', max: 5, cost: l => 60 + l * 90 },
  dmg:    { icon: '🗡️', name: 'Keskinlik',    desc: 'Tüm hasar +%6',     max: 5, cost: l => 80 + l * 120 },
  spd:    { icon: '👟', name: 'Çeviklik',     desc: 'Hareket hızı +%4',  max: 5, cost: l => 70 + l * 100 },
  magnet: { icon: '🧲', name: 'Çekim',        desc: 'Mıknatıs +%15',     max: 5, cost: l => 50 + l * 70 },
  armor:  { icon: '🛡️', name: 'Zırh',         desc: 'Gelen hasar -1',    max: 5, cost: l => 90 + l * 140 },
};
const META_KEY = 'hordeSurvivor3D.meta';
/* seen: koleksiyonda görülmüş en yüksek kademe (yuva -> kademe)
   heir: "Miras" — her koşuya kaç yuva deri teçhizatla başlanacağı */
const META = {
  bank: 0,
  up: { hp: 0, dmg: 0, spd: 0, magnet: 0, armor: 0 },
  seen: {},
  heir: 0,
  classId: 'paladin',
  skillPts: 0, skills: {},          // yetenek ağacı: kazanılan puan + alınan düğümler
};
const HEIR_MAX = 6, heirCost = l => 150 + l * 220;
/* Miras: koşuya bedava deri parçalarla başla. Yuvalar sabit sırayla dolar ki
   yükseltmenin ne getirdiği tahmin edilebilir olsun. */
const HEIR_ORDER = ['chest', 'boots', 'helm', 'gloves', 'shield', 'cloak'];
function applyStartGear() {
  for (let i = 0; i < Math.min(META.heir, HEIR_ORDER.length); i++) {
    const slot = HEIR_ORDER[i];
    const it = ITEMS[slot][0];                     // yuvanın en basit eşyası
    P.eq[slot] = it.id;
    P.maxHp += itemStatSum(it, 'maxHp');
  }
  recomputeStats();
}
function metaLoad() {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    if (typeof d.bank === 'number') META.bank = Math.max(0, d.bank | 0);
    if (d.up) for (const k in META.up)
      if (typeof d.up[k] === 'number') META.up[k] = clamp(d.up[k] | 0, 0, UPGRADES[k].max);
    // Koleksiyon: artık var olmayan eşyalar sessizce elenir
    if (d.seen) for (const id in d.seen) if (ITEM_BY_ID[id]) META.seen[id] = 1;
    if (typeof d.heir === 'number') META.heir = clamp(d.heir | 0, 0, HEIR_MAX);
    if (typeof d.classId === 'string' && CLASSES[d.classId]) META.classId = d.classId;
    if (typeof d.skillPts === 'number') META.skillPts = Math.max(0, d.skillPts | 0);
    if (d.skills && typeof d.skills === 'object') META.skills = d.skills;
  } catch (e) { /* erişilemiyor: bellekte devam */ }
}
function metaSave() {
  try { localStorage.setItem(META_KEY, JSON.stringify(META)); } catch (e) { /* yok say */ }
}
// Kalıcı yükseltmeleri oyuncuya uygula (koşu başında)
function applyMeta() {
  /* Katkılar TOPLANIYOR (önceden mutlak atamaydı): sınıf bonusları applyMeta'dan
     ÖNCE P.base'e işleniyor, mutlak atama onları silerdi. */
  P.maxHp += META.up.hp * 15;
  P.base.dmg += META.up.dmg * 0.06;
  P.base.speedMul += META.up.spd * 0.04;
  P.base.magnet += META.up.magnet * 0.15;
  P.base.armor += META.up.armor;
}
/* Yetenek ağacı: META.skills[branch] = kademe başına seçilen SEÇENEK İNDEKSİ
   dizisi (örn. [0,2,null,1] → kademe1'de 1. seçenek, kademe2'de 3. seçenek…).
   Koşu başında bir kez P.base/P.sk'ya işlenir; P.sk'daki bayraklar çalışma
   anı kancalarında (hitEnemy/hurtPlayer/updateSkillTimers) okunur. */
function applySkillTree() {
  P.sk = {
    doubleHit: 0, armorPen: 0, rageMax: 0, bleed: 0, ignite: 0, splashHit: 0, chainHit: 0,
    critBlast: false, execute: 0, holyVsElite: 0, lifesteal: 0, dodge: 0, dmgReduce: 0,
    xpMul: 0, regenDouble: false, dashCdMul: 1, dashSpdMul: 0, chillOnHit: false, fusion: false,
    blackhole: false, meteor: false, timeSlow: false, shieldPulse: false, knockPulse: false,
    invis: false, armageddon: false, titan: false, secondChance: false, phoenix: false,
  };
  for (const branch in SKILLS) {
    const picks = META.skills[branch] || [];
    SKILLS[branch].tiers.forEach((tier, ti) => {
      const idx = picks[ti];
      if (idx === undefined || idx === null || idx < 0) return;
      const opt = tier.opts[idx]; if (!opt) return;
      opt.apply(P.base, P.sk);
    });
  }
}
/* Bir kademeyi açmaya çalış: önceki kademe seçilmiş olmalı, yeterli puan
   gerekir. Başarılıysa puan düşer, seçim kaydedilir ve koşu-dışı önizleme
   için P.sk hemen yeniden hesaplanır (menüde metin güncellensin diye). */
function pickSkill(branch, tierIdx, optIdx) {
  const br = SKILLS[branch]; if (!br) return false;
  const tier = br.tiers[tierIdx]; if (!tier || !tier.opts[optIdx]) return false;
  if (tierIdx > 0) {
    const prev = (META.skills[branch] || [])[tierIdx - 1];
    if (prev === undefined || prev === null || prev < 0) return false;   // önceki kademe açık değil
  }
  const cur = (META.skills[branch] || [])[tierIdx];
  if (cur === optIdx) return true;                    // zaten seçili
  const already = cur !== undefined && cur !== null && cur >= 0;
  if (!already && META.skillPts < tier.cost) return false;
  if (!META.skills[branch]) META.skills[branch] = [];
  if (!already) META.skillPts -= tier.cost;
  META.skills[branch][tierIdx] = optIdx;
  metaSave();
  applySkillTree();
  return true;
}
const elShop = document.getElementById('shop');
const elBank = document.getElementById('bank');
// Sekmeler: teçhizat / kalıcı yükseltmeler
for (const t of document.querySelectorAll('.tab')) t.onclick = () => {
  for (const o of document.querySelectorAll('.tab')) {
    o.classList.toggle('on', o === t);
    document.getElementById(o.dataset.pane).hidden = o !== t;
  }
};
/* ---------- SINIF SEÇİMİ ---------- */
const elClassRow = document.getElementById('classRow');
const elClassInfo = document.getElementById('classInfo');
function selectClass(id) {
  if (!CLASSES[id] || META.classId === id) return;
  META.classId = id; metaSave();
  renderClassSelect();
  if (P.model) { P.classId = id; refreshOutfitVisuals(); }   // menüde canlı önizleme
}
function renderClassSelect() {
  if (!elClassRow) return;
  elClassRow.innerHTML = '';
  for (const id of CLASS_ORDER) {
    const c = CLASSES[id];
    const b = document.createElement('button');
    b.className = 'classCard' + (META.classId === id ? ' on' : '');
    b.style.setProperty('--cc', '#' + c.palette.trim.toString(16).padStart(6, '0'));
    b.innerHTML = `<span class="ci">${c.icon}</span><span class="cn">${c.name}</span>`;
    b.onclick = () => selectClass(id);
    elClassRow.appendChild(b);
  }
  const c = CLASSES[META.classId];
  if (elClassInfo) elClassInfo.innerHTML =
    `<b>${c.icon} ${c.name}</b> — <i>${c.title}</i><br>${c.passiveTxt}<br>` +
    `Can ×${c.hpMul} · Hız ×${c.speedMul.toFixed(2)} · Hasar ×${c.dmgMul}`;
}

function renderShop() {
  elBank.textContent = '💰 ' + META.bank;
  elShop.innerHTML = '';
  for (const id in UPGRADES) {
    const u = UPGRADES[id], lv = META.up[id], maxed = lv >= u.max;
    const cost = maxed ? 0 : u.cost(lv);
    const row = document.createElement('div');
    row.className = 'upg';
    row.innerHTML = `<div class="ico">${u.icon}</div>
      <div class="nm">${u.name}<small>${u.desc}</small></div>
      <div class="dots">${Array.from({ length: u.max }, (_, i) =>
        `<div class="dot${i < lv ? ' on' : ''}"></div>`).join('')}</div>`;
    const btn = document.createElement('button');
    btn.className = 'buy' + (maxed ? ' max' : '');
    btn.textContent = maxed ? 'TAM' : '💰 ' + cost;
    btn.disabled = maxed || META.bank < cost;
    btn.onclick = () => {
      if (META.up[id] >= u.max || META.bank < u.cost(META.up[id])) return;
      META.bank -= u.cost(META.up[id]);
      META.up[id]++;
      metaSave(); renderShop(); SFX.levelup();
    };
    row.appendChild(btn);
    elShop.appendChild(row);
  }
  renderGear();
  renderClassSelect();
  renderSkills();
}
/* Yetenek ağacı paneli: 3 dal × 5 kademe. Bir kademeye dokunmak açar (puan
   yeterliyse ve önceki kademe açıksa); zaten açık olana dokunmak seçimi
   DEĞİŞTİRİR (aynı puanla farklı seçenek denenebilir — kilitlemiyoruz). */
const elSkills = document.getElementById('skills');
const elSkillPtsTxt = document.getElementById('skillPtsTxt');
function renderSkills() {
  if (!elSkills) return;
  if (elSkillPtsTxt) elSkillPtsTxt.textContent = META.skillPts;
  elSkills.innerHTML = '';
  for (const branchId in SKILLS) {
    const br = SKILLS[branchId];
    const picks = META.skills[branchId] || [];
    const wrap = document.createElement('div');
    wrap.className = 'skillBranch';
    wrap.innerHTML = `<div class="skillBranchHead">${br.icon} ${br.name}</div>`;
    br.tiers.forEach((tier, ti) => {
      const prevOk = ti === 0 || (picks[ti - 1] !== undefined && picks[ti - 1] !== null && picks[ti - 1] >= 0);
      const row = document.createElement('div');
      row.className = 'skillTier';
      tier.opts.forEach((opt, oi) => {
        const chosen = picks[ti] === oi;
        const b = document.createElement('button');
        b.className = 'skillOpt' + (chosen ? ' on' : '') + (tier.ult ? ' ult' : '') + (!prevOk ? ' locked' : '');
        b.innerHTML = `<span class="sn">${opt.name}</span><span class="sd">${opt.desc}</span>` +
          `<span class="sc">${chosen ? 'SEÇİLDİ' : '🔹 ' + tier.cost}</span>`;
        if (!prevOk) b.disabled = true;
        else b.onclick = () => { if (pickSkill(branchId, ti, oi)) { renderSkills(); SFX.levelup(); } };
        row.appendChild(b);
      });
      wrap.appendChild(row);
    });
    elSkills.appendChild(wrap);
  }
}
/* Teçhizat paneli artık bir DÜKKAN değil, KOLEKSİYON + MİRAS:
   parçalar koşu sırasında düşmanlardan düşüyor, menüde yalnızca ne bulduğun
   ve her koşuya kaç parçayla başladığın görünüyor. */
const elGear = document.getElementById('gear');
function renderGear() {
  if (!elGear) return;
  elGear.innerHTML = '';

  // --- Miras: altının kalıcı karşılığı ---
  const heir = document.createElement('div');
  heir.className = 'gslot';
  const maxed = META.heir >= HEIR_MAX;
  const cost = maxed ? 0 : heirCost(META.heir);
  heir.innerHTML = `<div class="ghead"><span>🎁 Miras</span>
    <small>${META.heir ? META.heir + ' yuva deri teçhizatla başla' : 'Koşuya sade başlıyorsun'}</small></div>`;
  const hrow = document.createElement('div');
  hrow.className = 'gitems';
  hrow.innerHTML = `<div class="dots" style="flex:1;align-items:center;display:flex;gap:4px">${
    Array.from({ length: HEIR_MAX }, (_, i) =>
      `<div class="dot${i < META.heir ? ' on' : ''}"></div>`).join('')}</div>`;
  const hb = document.createElement('button');
  hb.className = 'buy' + (maxed ? ' max' : '');
  hb.textContent = maxed ? 'TAM' : '💰 ' + cost;
  hb.disabled = maxed || META.bank < cost;
  hb.onclick = () => {
    if (META.heir >= HEIR_MAX || META.bank < heirCost(META.heir)) return;
    META.bank -= heirCost(META.heir); META.heir++;
    metaSave(); renderShop(); SFX.levelup();
  };
  hrow.appendChild(hb);
  heir.appendChild(hrow);
  elGear.appendChild(heir);

  // --- Koleksiyon: hangi eşyaları buldun ---
  for (const slot of GEAR_SLOTS) {
    const def = GEAR[slot];
    const found = ITEMS[slot].filter(i => META.seen[i.id]).length;
    const row = document.createElement('div');
    row.className = 'gslot';
    row.innerHTML = `<div class="ghead"><span>${def.icon} ${def.name}</span>
      <small>${found}/${ITEMS[slot].length} bulundu</small></div>`;
    const list = document.createElement('div');
    list.className = 'gitems';
    for (const it of ITEMS[slot]) {
      const seen = !!META.seen[it.id];
      const b = document.createElement('div');
      b.className = 'gitem' + (seen ? ' on' : ' locked');
      if (seen) b.style.borderColor = RAR[it.rar].col;
      b.title = seen ? it.name + ' — ' + statLines(it.plus).concat(statLines(it.minus)).join(' · ') : 'Henüz bulunmadı';
      b.innerHTML = `<span class="gi">${seen ? def.icon : '🔒'}</span>` +
        `<span class="gn"${seen ? ` style="color:${RAR[it.rar].col}"` : ''}>${seen ? it.name : '???'}</span>`;
      list.appendChild(b);
    }
    row.appendChild(list);
    elGear.appendChild(row);
  }
}

/* ============ 11.5) ENVANTER ============
   Koşu içi çanta + kuşanılanlar. Açıkken oyun duraklar; çantadaki eşyaya
   dokunmak kuşanır, kuşanılana dokunmak çıkarır (çantaya geri düşer). */
const elInv = document.getElementById('inv');
const elInvSlots = document.getElementById('invSlots');
const elInvBag = document.getElementById('invBag');
const elInvOdds = document.getElementById('invOdds');
const elInvSets = document.getElementById('invSets');
/* İkonlar 2B canvas'a çiziliyor: harici dosya yok, data: URL yok (katı CSP
   altında da çalışır) ve renkler modeldekiyle birebir aynı kaynaktan geliyor. */
function drawItemIcon(cv, slot, it) {
  const d = cv.getContext('2d');
  const S = cv.width;
  d.clearRect(0, 0, S, S);
  if (!it) return;
  const u = S / 100;
  const hex = v => '#' + v.toString(16).padStart(6, '0');
  // Aynı rengin koyu/açık tonları: hacim hissi için (düz dolgu yassı duruyordu)
  const shade = (v, k) => {
    const r = (v >> 16 & 255), g = (v >> 8 & 255), b = v & 255;
    const f = c => Math.max(0, Math.min(255, Math.round(k > 0 ? c + (255 - c) * k : c * (1 + k))));
    return `rgb(${f(r)},${f(g)},${f(b)})`;
  };
  d.save(); d.translate(S / 2, S / 2);
  d.lineJoin = d.lineCap = 'round';
  d.lineWidth = 2.6 * u;
  d.strokeStyle = 'rgba(16,11,22,.9)';
  const P2 = () => new Path2D();
  // Dikey gradyan + koyu kontur: referans sayfadaki hacimli görünüm
  const grad = (base, y0, y1) => {
    const g = d.createLinearGradient(0, y0 * u, 0, y1 * u);
    g.addColorStop(0, shade(base, 0.34));
    g.addColorStop(0.55, hex(base));
    g.addColorStop(1, shade(base, -0.38));
    return g;
  };
  const fill = (path, base, y0, y1) => {
    d.fillStyle = grad(base, y0 === undefined ? -36 : y0, y1 === undefined ? 36 : y1);
    d.fill(path); d.stroke(path);
  };
  const gloss = path => {                       // üstte ince parlama
    d.save(); d.clip(path);
    const g = d.createLinearGradient(0, -40 * u, 0, 0);
    g.addColorStop(0, 'rgba(255,255,255,.34)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    d.fillStyle = g; d.fillRect(-50 * u, -50 * u, 100 * u, 50 * u);
    d.restore();
  };
  const C = it.col, T = it.trim;
  if (slot === 'helm') {
    const dome = P2();
    dome.arc(0, 4 * u, 30 * u, Math.PI, 0); dome.lineTo(30 * u, 16 * u); dome.lineTo(-30 * u, 16 * u); dome.closePath();
    fill(dome, C, -30, 18); gloss(dome);
    const brim = P2(); brim.roundRect(-35 * u, 13 * u, 70 * u, 10 * u, 4 * u); fill(brim, T, 12, 24);
    if (it.det >= 2) { const n = P2(); n.roundRect(-5 * u, 15 * u, 10 * u, 21 * u, 3 * u); fill(n, T, 14, 37); }
    if (it.det >= 3) { const c2 = P2(); c2.roundRect(-4 * u, -38 * u, 8 * u, 16 * u, 3 * u); fill(c2, T, -39, -20); }
    if (it.det >= 4) {
      const h1 = P2(); h1.moveTo(-28 * u, -4 * u); h1.lineTo(-47 * u, -32 * u); h1.lineTo(-20 * u, -17 * u); h1.closePath(); fill(h1, T, -33, -3);
      const h2 = P2(); h2.moveTo(28 * u, -4 * u); h2.lineTo(47 * u, -32 * u); h2.lineTo(20 * u, -17 * u); h2.closePath(); fill(h2, T, -33, -3);
    }
  } else if (slot === 'chest') {
    const r = it.det >= 3 ? 16 : 12;
    const s1 = P2(); s1.arc(-28 * u, -18 * u, r * u, Math.PI, 0); s1.closePath(); fill(s1, C, -34, -16);
    const s2 = P2(); s2.arc(28 * u, -18 * u, r * u, Math.PI, 0); s2.closePath(); fill(s2, C, -34, -16);
    const body = P2();
    body.moveTo(-23 * u, -26 * u); body.lineTo(23 * u, -26 * u);
    body.lineTo(29 * u, 22 * u); body.quadraticCurveTo(0, 34 * u, -29 * u, 22 * u); body.closePath();
    fill(body, C, -27, 32); gloss(body);
    const belt = P2(); belt.roundRect(-31 * u, 16 * u, 62 * u, 11 * u, 3 * u); fill(belt, T, 15, 28);
    if (it.det >= 3) { const st = P2(); st.roundRect(-5 * u, -24 * u, 10 * u, 40 * u, 3 * u); fill(st, T, -25, 17); }
    if (it.det >= 4) { const gem = P2(); gem.moveTo(0, -14 * u); gem.lineTo(8 * u, -5 * u); gem.lineTo(0, 4 * u); gem.lineTo(-8 * u, -5 * u); gem.closePath(); fill(gem, T, -15, 5); }
  } else if (slot === 'gloves') {
    const arm = P2(); arm.roundRect(-27 * u, -16 * u, 50 * u, 32 * u, 6 * u); fill(arm, C, -17, 17); gloss(arm);
    const cuff = P2(); cuff.roundRect(-33 * u, -21 * u, 13 * u, 42 * u, 4 * u); fill(cuff, T, -22, 22);
    if (it.det >= 2) { const hnd = P2(); hnd.roundRect(19 * u, -19 * u, 18 * u, 38 * u, 6 * u); fill(hnd, C, -20, 20); }
    if (it.det >= 3) { const cl = P2(); cl.moveTo(37 * u, -10 * u); cl.lineTo(50 * u, 0); cl.lineTo(37 * u, 10 * u); cl.closePath(); fill(cl, T, -11, 11); }
  } else if (slot === 'boots') {
    const boot = P2();
    boot.moveTo(-15 * u, -32 * u); boot.lineTo(13 * u, -32 * u); boot.lineTo(13 * u, 6 * u);
    boot.lineTo(34 * u, 6 * u); boot.quadraticCurveTo(38 * u, 6 * u, 38 * u, 12 * u);
    boot.lineTo(38 * u, 20 * u); boot.lineTo(-15 * u, 20 * u); boot.closePath();
    fill(boot, C, -33, 21); gloss(boot);
    const sole = P2(); sole.roundRect(-19 * u, 19 * u, 59 * u, 11 * u, 4 * u); fill(sole, T, 18, 31);
    if (it.det >= 2) { const strap = P2(); strap.roundRect(-17 * u, -11 * u, 32 * u, 9 * u, 3 * u); fill(strap, T, -12, -1); }
    if (it.det >= 3) { const knee = P2(); knee.roundRect(-18 * u, -37 * u, 34 * u, 11 * u, 4 * u); fill(knee, T, -38, -25); }
  } else if (slot === 'cloak') {
    const cl = P2();
    cl.moveTo(-19 * u, -27 * u); cl.lineTo(19 * u, -27 * u);
    cl.lineTo(34 * u, 26 * u); cl.quadraticCurveTo(0, 38 * u, -34 * u, 26 * u); cl.closePath();
    fill(cl, C, -28, 36); gloss(cl);
    const col = P2();
    col.moveTo(-24 * u, -31 * u); col.quadraticCurveTo(0, -13 * u, 24 * u, -31 * u);
    col.lineTo(24 * u, -19 * u); col.quadraticCurveTo(0, -1 * u, -24 * u, -19 * u); col.closePath();
    fill(col, T, -32, 0);
    if (it.det >= 2) {
      const hem = P2(); hem.moveTo(-33 * u, 24 * u); hem.quadraticCurveTo(0, 36 * u, 33 * u, 24 * u);
      hem.lineTo(34 * u, 31 * u); hem.quadraticCurveTo(0, 43 * u, -34 * u, 31 * u); hem.closePath();
      fill(hem, T, 23, 33);
    }
  } else {                                   // kalkan
    if (it.det <= 2) {
      const b1 = P2(); b1.arc(0, 0, 31 * u, 0, Math.PI * 2); fill(b1, C, -32, 32); gloss(b1);
      const rim = P2(); rim.arc(0, 0, 31 * u, 0, Math.PI * 2); rim.arc(0, 0, 25 * u, 0, Math.PI * 2, true);
      fill(rim, T, -32, 32);
      const bo = P2(); bo.arc(0, 0, 10 * u, 0, Math.PI * 2); fill(bo, T, -11, 11);
    } else {
      const sh = P2();
      sh.moveTo(-27 * u, -31 * u); sh.lineTo(27 * u, -31 * u); sh.lineTo(27 * u, 8 * u);
      sh.quadraticCurveTo(27 * u, 22 * u, 0, 35 * u);
      sh.quadraticCurveTo(-27 * u, 22 * u, -27 * u, 8 * u); sh.closePath();
      fill(sh, C, -32, 36); gloss(sh);
      const v = P2(); v.roundRect(-6 * u, -29 * u, 12 * u, 55 * u, 3 * u); fill(v, T, -30, 27);
      const h = P2(); h.roundRect(-25 * u, -11 * u, 50 * u, 12 * u, 3 * u); fill(h, T, -12, 2);
      if (it.det >= 4) { const gem = P2(); gem.moveTo(0, -14 * u); gem.lineTo(9 * u, -5 * u); gem.lineTo(0, 5 * u); gem.lineTo(-9 * u, -5 * u); gem.closePath(); fill(gem, T, -15, 6); }
    }
  }
  d.restore();
}
function itemCell(slot, it, equipped) {
  const el = document.createElement('button');
  el.className = 'icell' + (equipped ? ' eq' : '');
  if (it) el.style.borderColor = RAR[it.rar].col;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 72; cv.className = 'ico';
  el.appendChild(cv);
  drawItemIcon(cv, slot, it);
  const nm = document.createElement('div');
  nm.className = 'inm';
  nm.textContent = it ? it.name : 'Boş';
  if (it) nm.style.color = RAR[it.rar].col;
  el.appendChild(nm);
  if (it && it.set) {
    const sb = document.createElement('div');
    sb.className = 'iset';
    sb.textContent = SET_BONUS[it.set].icon + ' ' + SET_BONUS[it.set].name;
    el.appendChild(sb);
  }
  if (it) {
    const st = document.createElement('div');
    st.className = 'ist';
    st.innerHTML = statLines(it.plus).map(t => `<span class="p">${t}</span>`).join('') +
                   statLines(it.minus).map(t => `<span class="m">${t}</span>`).join('');
    el.appendChild(st);
  }
  return el;
}
function renderInventory() {
  if (!elInv) return;
  elInvSlots.innerHTML = ''; elInvBag.innerHTML = '';
  // Aktif set bonusları: kaç parça giyildiği + hangi bonusun açık olduğu
  if (elInvSets) {
    const counts = equippedSetCounts();
    const rows = Object.keys(SET_BONUS).filter(k => counts[k]).map(k => {
      const def = SET_BONUS[k], n = counts[k];
      const p2on = n >= 2, p4on = n >= 4;
      return `<div class="setRow"><b>${def.icon} ${def.name} (${n}/4)</b>` +
        `<span class="${p2on ? 'on' : ''}">2: ${def.p2.txt}</span>` +
        `<span class="${p4on ? 'on' : ''}">4: ${def.p4.txt}</span></div>`;
    });
    elInvSets.innerHTML = rows.join('') ||
      '<div class="iempty" style="padding:4px 0">Aynı setten 2+ parça giyersen bonus açılır (bkz. simge renkleri).</div>';
  }
  for (const slot of GEAR_SLOTS) {
    const it = itemOf(P.eq[slot]);
    const wrap = document.createElement('div');
    wrap.className = 'islot';
    wrap.innerHTML = `<div class="ilbl">${GEAR[slot].icon} ${GEAR[slot].name}</div>`;
    const cell = itemCell(slot, it, !!it);
    cell.onclick = () => { if (it) { equipItem(slot, null); renderInventory(); SFX.pickup(); } };
    wrap.appendChild(cell);
    elInvSlots.appendChild(wrap);
  }
  if (!P.bag.length) {
    elInvBag.innerHTML = '<div class="iempty">Çanta boş — seviye atladıkça kasa düşer, kasadan eşya çıkar.</div>';
  } else {
    for (const id of P.bag.slice()) {
      const it = itemOf(id), slot = slotOfItem(id);
      const cell = itemCell(slot, it, false);
      cell.onclick = () => { equipItem(slot, id); renderInventory(); SFX.levelup(); };
      elInvBag.appendChild(cell);
    }
  }
  const o = rarityOdds(G.level);
  elInvOdds.innerHTML = `Sv. ${G.level} kasa şansı: ` +
    ['common', 'rare', 'epic', 'legend'].map(k =>
      `<b style="color:${RAR[k].col}">${RAR[k].name} %${o[k].toFixed(0)}</b>`).join(' · ');
}
function openInventory() {
  if (G.state !== 'PLAY' && G.state !== 'PAUSED') return;
  G.prevState = G.state; G.state = 'INV';
  releaseSticks(); renderInventory();
  elInv.classList.add('show');
}
function closeInventory() {
  elInv.classList.remove('show');
  G.state = G.prevState === 'PAUSED' ? 'PAUSED' : 'PLAY';
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
  G.finalSpawned = false; G.banner = ''; G.bannerT = 0; G.win = false; G.toast = null;
  G.armagT = 0; G.armagTick = 0;                        // Armageddon (yetenek ağacı ULTİME) fırtına durumu
  G.skillPtsEarned = 0;
  resetPlayer();
  camTarget.set(0, 0, 0);
  releaseSticks();
}
function startGame() {
  resetAll();
  elMenu.classList.remove('show'); elOver.classList.remove('show');
  elPaused.classList.remove('show'); elLevelup.classList.remove('show');
  if (elInv) elInv.classList.remove('show');
  elPauseBtn.classList.add('show');
  elDashBtn.classList.add('show');
  if (elBagBtn) elBagBtn.classList.add('show');
  G.state = 'PLAY';
  banner('HAYATTA KAL!', 2);
}
function togglePause() {
  if (G.state === 'INV') { closeInventory(); return; }
  if (G.state === 'PLAY') { G.state = 'PAUSED'; releaseSticks(); showPauseInfo(); elPaused.classList.add('show'); }
  else if (G.state === 'PAUSED') { G.state = 'PLAY'; elPaused.classList.remove('show'); }
}
function showPauseInfo() {
  const ws = P.weapons.map(w => `${w.evolved ? WEAPONS[w.id].evoIcon : WEAPONS[w.id].icon} ${w.evolved ? WEAPONS[w.id].evoName : WEAPONS[w.id].name} ${w.evolved ? 'EVO' : 'Sv.' + w.lv}`).join(' &nbsp;•&nbsp; ');
  const ps = Object.keys(P.passives).filter(id => P.passives[id]).map(id => `${PASSIVES[id].icon} ${PASSIVES[id].name} Sv.${P.passives[id]}`).join(' &nbsp;•&nbsp; ');
  document.getElementById('pauseInv').innerHTML = ws + (ps ? '<br><br>' + ps : '');
}
function gameOver(win) {
  G.state = 'OVER'; G.win = win;
  if (elInv) elInv.classList.remove('show');
  META.bank += G.gold; META.skillPts += G.skillPtsEarned; metaSave(); renderShop();  // toplanan altın + yetenek puanı kalıcı
  win ? SFX.win() : SFX.over();
  elPauseBtn.classList.remove('show');
  elDashBtn.classList.remove('show');
  if (elBagBtn) elBagBtn.classList.remove('show');
  document.getElementById('overTitle').textContent = win ? 'BÖLÜM TAMAMLANDI!' : 'OYUN BİTTİ';
  document.getElementById('overSub').textContent = win
    ? 'Sürüyü püskürttün ve OMEGA HORROR\'u yok ettin. Efsanevi bir hayatta kalma.'
    : 'Sürü seni ele geçirdi. Bir dahakine daha iyi kartlar seç!';
  const rows = [
    ['Hayatta Kalma', fmtTime(G.time)], ['Öldürülen Düşman', G.kills],
    ['Toplanan Altın', G.gold], ['Ulaşılan Seviye', G.level],
    ['Toplam Hasar', Math.round(G.dmgDealt).toLocaleString('tr-TR')],
    ['Silah Sayısı', P.weapons.length + (P.weapons.some(w => w.evolved) ? ' (EVO!)' : '')],
    ['Kasadaki Altın', META.bank], ['Kazanılan Yetenek Puanı', G.skillPtsEarned],
  ];
  document.getElementById('overStats').innerHTML = rows.map(r => `<div class="stat"><span>${r[0]}</span><b>${r[1]}</b></div>`).join('');
  elOver.classList.add('show');
}
document.getElementById('startBtn').onclick = () => { SFX.init(); SFX.resume(); startGame(); };
document.getElementById('againBtn').onclick = startGame;
document.getElementById('resumeBtn').onclick = togglePause;
document.getElementById('quitBtn').onclick = () => {
  G.state = 'MENU'; elPaused.classList.remove('show');
  elPauseBtn.classList.remove('show'); elDashBtn.classList.remove('show');
  if (elBagBtn) elBagBtn.classList.remove('show');
  elMenu.classList.add('show');
};
elPauseBtn.onclick = togglePause;
const elDashBtn = document.getElementById('dashBtn');
elDashBtn.addEventListener('pointerdown', e => { e.stopPropagation(); doDash(); });
const elBagBtn = document.getElementById('bagBtn');
if (elBagBtn) elBagBtn.addEventListener('pointerdown', e => { e.stopPropagation(); openInventory(); });
const elInvClose = document.getElementById('invClose');
if (elInvClose) elInvClose.onclick = closeInventory;
const elInvBtn = document.getElementById('invBtn');
if (elInvBtn) elInvBtn.onclick = () => { elPaused.classList.remove('show'); openInventory(); };

/* ============ 13) MODEL YÜKLEME + ANA DÖNGÜ ============ */
let WORLD = null;
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
  // Bekleme klibi yok: dururken tamamen dondurmak yerine çok yavaş bir
  // adımlama bırakılıyor, nefes salınımıyla birlikte "hazır duruş" okunuyor.
  mixer.timeScale = t < 0.04 ? 0.18 : lerp(0.55, 1.45, t);
  mixer.update(dt);
}
/* Doku GLB'ye gömülü DEĞİL: three.js gömülü görselleri blob: URL ile yükler ve
   katı CSP altındaki sayfalarda bu engellenip model renksiz kalıyordu.
   createImageBitmap bir kaynak isteği olmadığı için CSP'den etkilenmez. */
function loadKnightTexture() {
  const b64 = window.__KNIGHT_TEX_B64;
  if (!b64 || typeof createImageBitmap !== 'function') return Promise.resolve(null);
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return createImageBitmap(new Blob([buf], { type: 'image/jpeg' }))
    .then(bmp => {
      const t = new THREE.Texture(bmp);
      t.colorSpace = THREE.SRGBColorSpace;
      t.flipY = false;                    // glTF UV yönü
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.needsUpdate = true;
      return t;
    })
    .catch(e => { console.error('doku', e); return null; });
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
    loader.parse(buf.buffer, '', async gltf => {
      const map = await loadKnightTexture();
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
          /* Eski model gümüş zırhlıydı ve beyaza doymasın diye çelik tonuyla
             çarpılıyordu; yeni model TEN renkli olduğu için aynı ton onu
             soldurup gri gösteriyordu. Dokunun kendi rengi korunuyor. */
          o.material = new THREE.MeshLambertMaterial({
            map,
            color: 0xffffff,
            emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.1,
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
      holder.updateMatrixWorld(true);       // kemik dünya ölçeğini okuyabilmek için
      initGearNodes(holder);                // teçhizat kapsayıcılarını kemiklere bağla
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
  if (shakeCd > 0) shakeCd -= rdt;               // sallantı ve hit-stop bekleme süreleri
  if (hitStopCd > 0) hitStopCd -= rdt;
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
    updateRipples(dt);
    updateSkillTimers(dt);
    enemies.sweep();
    if (G.bannerT > 0) G.bannerT -= dt;
    if (G.flashRed > 0) G.flashRed -= dt;
    if (G.toast && G.toast.t > 0) G.toast.t -= dt;
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

  // Su yüzeyi yavaşça kaysın: durgun yerine akan su hissi
  if (WORLD && WORLD.waterMap) {
    WORLD.waterMap.offset.x = (now / 26000) % 1;
    WORLD.waterMap.offset.y = (now / 41000) % 1;
  }
  syncEnemyMeshes();
  renderer.render(scene, camera);
  drawOverlay();
}

(async function boot() {
  resize();
  metaLoad(); renderShop();
  WORLD = buildWorld(scene, { detail: !LOW_END });
  buildPropGrid();
  initRipples();
  P.model = await loadKnight();
  refreshGearVisuals();                 // kuşanılan parçaları modele tak
  resetAll();
  G.state = 'MENU';
  document.getElementById('loading').classList.remove('show');
  elMenu.classList.add('show');
  requestAnimationFrame(frame);
})();

// Test/otomasyon için
window.__game = { G, P, enemies, bullets, pickups, zones, parts, texts, WEAPONS, PASSIVES, COLLIDERS, isWater,
                  addWeapon, getWeapon, recomputeStats, applyCard, spawnEnemy, gainXp, hitEnemy,
                  buildChoices, cardInfo, openLevelUp, startGame, input, joy, joyL, joyR, mouseAim,
                  camera, scene, hurtPlayer, THREE, readInput, aimAngle,
                  GEAR, GEAR_SLOTS, ITEMS, ITEM_BY_ID, RAR, META, gearNodes, gearBones,
                  refreshGearVisuals, renderGear, renderShop, renderInventory,
                  equipItem, addItem, itemOf, slotOfItem, rollItem, rollRarity, rarityOdds,
                  openInventory, closeInventory, dropChest, metaSave, spawnPickup,
                  CLASSES, CLASS_ORDER, selectClass, renderClassSelect, refreshOutfitVisuals,
                  SKILLS, pickSkill, renderSkills, applySkillTree, dmgOf, updateSkillTimers,
                  resetAll, resetPlayer, gameOver, explode, SET_BONUS, equippedSetCounts, biomeAt,
                  BOSS_THEMES, bossAttack, CLASS_WEAPON_TYPE, get weaponHolder() { return weaponHolder; },
                  updateWeapons,
                  get mixer() { return mixer; }, get anim() { return { walk: actWalk, run: actRun }; },
                  get MODEL_YAW() { return MODEL_YAW; }, set MODEL_YAW(v) { MODEL_YAW = v; } };
