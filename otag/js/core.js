/* ============================================================
   OTAĞ — Kızıl Sefer
   core.js : matematik yardımcıları, girdi, ses, parçacıklar, kamera
   ============================================================ */
'use strict';

const TAU = Math.PI * 2;

const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp  = (a, b, t) => a + (b - a) * t;
/* kare hızından bağımsız yumuşatma */
const damp  = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
const rnd   = (a = 1, b = 0) => b + Math.random() * (a - b);
const rndi  = (a, b) => Math.floor(rnd(a, b));
const pick  = arr => arr[(Math.random() * arr.length) | 0];
const chance= p => Math.random() < p;
const dist  = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
const dist2 = (ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; };
const angTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
function angDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
function approach(v, target, step) { return v < target ? Math.min(v + step, target) : Math.max(v - step, target); }

/* deterministik rastgele (harita üretimi için) */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* ==========================================================
   GİRDİ
   ========================================================== */
const Input = {
  keys: Object.create(null),
  justKeys: Object.create(null),
  mx: 0, my: 0,            // ekran koordinatı
  wx: 0, wy: 0,            // dünya koordinatı (main.js her karede günceller)
  mouseL: false, mouseR: false,
  justL: false, justR: false,
  releasedR: false,
  wheel: 0,

  init(canvas) {
    addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      if (!this.keys[k]) this.justKeys[k] = true;
      this.keys[k] = true;
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'tab'].includes(k)) e.preventDefault();
    });
    addEventListener('keyup', e => { this.keys[e.key.toLowerCase()] = false; });
    addEventListener('blur', () => { this.keys = Object.create(null); this.mouseL = this.mouseR = false; });

    canvas.addEventListener('mousemove', e => {
      const r = canvas.getBoundingClientRect();
      /* CSS pikseli olarak sakla; dünya koordinatına main.js çevirir */
      this.mx = e.clientX - r.left;
      this.my = e.clientY - r.top;
    });
    canvas.addEventListener('mousedown', e => {
      if (e.button === 0) { this.mouseL = true; this.justL = true; }
      if (e.button === 2) { this.mouseR = true; this.justR = true; }
    });
    addEventListener('mouseup', e => {
      if (e.button === 0) this.mouseL = false;
      if (e.button === 2) { if (this.mouseR) this.releasedR = true; this.mouseR = false; }
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  },

  down(...ks) { return ks.some(k => this.keys[k]); },
  hit(...ks) { return ks.some(k => this.justKeys[k]); },
  /* karenin sonunda "bu karede basıldı" bayraklarını temizle */
  endFrame() {
    this.justKeys = Object.create(null);
    this.justL = this.justR = false;
    this.releasedR = false;
    this.wheel = 0;
  },
  /* hareket vektörü — 3B'de kamera yönüne göre döndürülür */
  axis() {
    let x = 0, y = 0;
    if (this.down('a', 'arrowleft')) x -= 1;
    if (this.down('d', 'arrowright')) x += 1;
    if (this.down('w', 'arrowup')) y -= 1;
    if (this.down('s', 'arrowdown')) y += 1;
    const l = Math.hypot(x, y);
    if (l <= 0) return { x: 0, y: 0, len: 0 };
    x /= l; y /= l;
    const yaw = (typeof R3D !== 'undefined' && R3D.ok) ? R3D.camYaw : 0;
    if (yaw) {
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const nx = x * c + y * s, ny = -x * s + y * c;
      x = nx; y = ny;
    }
    return { x, y, len: 1 };
  }
};

/* ==========================================================
   SES  —  tamamı WebAudio ile anlık üretilir, dosya yok
   ========================================================== */
const Audio2 = {
  ctx: null, master: null, sfxGain: null, musGain: null,
  vol: { master: .8, sfx: .8, music: .5 },
  musicOn: false, _step: 0, _next: 0, _timer: null, _scale: [0, 2, 3, 5, 7, 8, 10],

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    this.musGain = this.ctx.createGain();
    this.sfxGain.connect(this.master); this.musGain.connect(this.master);
    this.master.connect(this.ctx.destination);
    this.applyVolumes();
  },
  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.vol.master;
    this.sfxGain.gain.value = this.vol.sfx;
    this.musGain.gain.value = this.vol.music * .35;
  },

  tone(freq, dur, type = 'square', vol = .3, slideTo = null, dest = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + Math.min(.012, dur * .3));
    g.gain.exponentialRampToValueAtTime(.0008, t + dur);
    o.connect(g); g.connect(dest || this.sfxGain);
    o.start(t); o.stop(t + dur + .02);
  },
  noise(dur, vol = .3, freq = 1200, q = 1, type = 'bandpass') {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, len = Math.max(1, (this.ctx.sampleRate * dur) | 0);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = this.ctx.createBufferSource(); s.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(.0008, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfxGain);
    s.start(t); s.stop(t + dur);
  },

  /* --- adlandırılmış efektler --- */
  sfx: {
    swing() { Audio2.noise(.14, .16, 2600, .8, 'highpass'); Audio2.tone(420, .1, 'triangle', .06, 900); },
    hit()   { Audio2.noise(.13, .3, 900, 1.4); Audio2.tone(150, .12, 'square', .22, 70); },
    crit()  { Audio2.noise(.2, .34, 1500, 1.1); Audio2.tone(260, .2, 'sawtooth', .2, 80); },
    block() { Audio2.tone(880, .1, 'square', .16, 620); Audio2.noise(.09, .18, 3800, 2, 'highpass'); },
    parry() { Audio2.tone(1320, .1, 'square', .22, 1980); Audio2.tone(1980, .22, 'triangle', .16, 2640); Audio2.noise(.16, .22, 5200, 2, 'highpass'); },
    hurt()  { Audio2.tone(220, .22, 'sawtooth', .22, 90); Audio2.noise(.16, .2, 500, 1.2); },
    dash()  { Audio2.noise(.22, .16, 1600, .7, 'lowpass'); },
    spin()  { Audio2.tone(160, .5, 'sawtooth', .18, 520); Audio2.noise(.5, .18, 900, .8); },
    pickup(){ Audio2.tone(720, .08, 'triangle', .2); setTimeout(() => Audio2.tone(1080, .12, 'triangle', .18), 70); },
    heal()  { Audio2.tone(520, .12, 'sine', .22); setTimeout(() => Audio2.tone(780, .16, 'sine', .2), 90); setTimeout(() => Audio2.tone(1040, .22, 'sine', .16), 180); },
    quest() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => Audio2.tone(f, .3, 'triangle', .18), i * 110)); },
    ui()    { Audio2.tone(440, .05, 'square', .1); },
    gate()  { Audio2.tone(90, .8, 'sawtooth', .2, 45); Audio2.noise(.9, .18, 260, .6, 'lowpass'); },
    die()   { [440, 330, 262, 175].forEach((f, i) => setTimeout(() => Audio2.tone(f, .45, 'triangle', .2), i * 170)); },
    roar()  { Audio2.tone(70, 1.2, 'sawtooth', .32, 38); Audio2.noise(1.1, .26, 320, .5, 'lowpass'); },
    arrow() { Audio2.noise(.1, .12, 3200, 1.2, 'highpass'); Audio2.tone(700, .09, 'triangle', .07, 1500); },
    burn()  { Audio2.noise(.7, .2, 700, .5, 'lowpass'); Audio2.tone(120, .5, 'sawtooth', .1, 300); },
  },

  /* --- basit döngüsel müzik (davul + minör ezgi) --- */
  startMusic() {
    this.ensure(); if (!this.ctx || this.musicOn) return;
    this.musicOn = true; this._step = 0; this._next = this.ctx.currentTime + .1;
    this._timer = setInterval(() => this._schedule(), 60);
  },
  stopMusic() { this.musicOn = false; clearInterval(this._timer); this._timer = null; },
  setIntensity(v) { this._intensity = clamp(v, 0, 1); },
  _schedule() {
    if (!this.ctx || !this.musicOn) return;
    const spb = .26; // adım süresi
    while (this._next < this.ctx.currentTime + .3) {
      const s = this._step % 32, t = this._next;
      const root = 110; // A2
      const deg = this._scale[[0, 0, 3, 4, 2, 0, 5, 4][(this._step >> 2) % 8]];
      const f = root * Math.pow(2, deg / 12);
      // bas nabız
      if (s % 4 === 0) this._mnote(f / 2, spb * 1.6, 'triangle', .3, t);
      // ezgi
      if ([0, 3, 6, 8, 11, 14, 16, 19, 22, 24, 27, 30].includes(s)) {
        const oct = chance(.3) ? 4 : 2;
        this._mnote(f * oct, spb * (chance(.25) ? 1.7 : .8), 'square', .09, t);
      }
      // vurmalı
      if (s % 8 === 4) this._mnoise(t, .12, .16);
      if (s % 16 === 14) this._mnoise(t, .08, .1);
      this._next += spb; this._step++;
    }
  },
  _mnote(freq, dur, type, vol, t) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), fl = this.ctx.createBiquadFilter();
    fl.type = 'lowpass'; fl.frequency.value = 1600;
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + .03);
    g.gain.exponentialRampToValueAtTime(.0006, t + dur);
    o.connect(fl); fl.connect(g); g.connect(this.musGain);
    o.start(t); o.stop(t + dur + .05);
  },
  _mnoise(t, dur, vol) {
    const len = (this.ctx.sampleRate * dur) | 0;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = this.ctx.createBufferSource(); s.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3000;
    const g = this.ctx.createGain(); g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(this.musGain);
    s.start(t); s.stop(t + dur);
  }
};

/* ==========================================================
   PARÇACIKLAR
   ========================================================== */
const FX = {
  parts: [], texts: [], rings: [],

  clear() { this.parts.length = 0; this.texts.length = 0; this.rings.length = 0; },

  spark(x, y, n, color, spd = 260, life = .5, size = 3, dir = null, spread = TAU) {
    for (let i = 0; i < n; i++) {
      const a = dir === null ? rnd(TAU) : dir + rnd(spread / 2, -spread / 2);
      const s = spd * rnd(1.1, .35);
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * rnd(1.2, .6),
        t: 0, size: size * rnd(1.3, .6), color, drag: 3.2, grav: 0, glow: true });
    }
  },
  dust(x, y, n, color = '#6b5b48') {
    for (let i = 0; i < n; i++) {
      const a = rnd(TAU), s = rnd(70, 15);
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * .5, life: rnd(.9, .4),
        t: 0, size: rnd(7, 3), color, drag: 2.4, grav: -8, glow: false });
    }
  },
  ember(x, y, n = 1, color = '#ff7a3c') {
    for (let i = 0; i < n; i++)
      this.parts.push({ x: x + rnd(16, -16), y: y + rnd(8, -8), vx: rnd(18, -18), vy: rnd(-16, -46),
        life: rnd(2.4, 1.1), t: 0, size: rnd(3, 1.2), color, drag: .4, grav: -6, glow: true });
  },
  ring(x, y, r0, r1, life, color, width = 4) {
    this.rings.push({ x, y, r0, r1, life, t: 0, color, width });
  },
  text(x, y, str, color = '#fff', size = 18, vy = -60) {
    this.texts.push({ x, y, str, color, size, t: 0, life: .9, vy });
  },

  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.t += dt;
      if (p.t >= p.life) { this.parts.splice(i, 1); continue; }
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vy *= d; p.vy += p.grav * dt * 10;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]; r.t += dt;
      if (r.t >= r.life) this.rings.splice(i, 1);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i]; t.t += dt;
      t.y += t.vy * dt; t.vy *= Math.exp(-2.2 * dt);
      if (t.t >= t.life) this.texts.splice(i, 1);
    }
  },

  draw(ctx) {
    ctx.save();
    for (const r of this.rings) {
      const k = r.t / r.life;
      ctx.globalAlpha = (1 - k) * .9;
      ctx.strokeStyle = r.color; ctx.lineWidth = r.width * (1 - k * .6);
      ctx.beginPath(); ctx.arc(r.x, r.y, lerp(r.r0, r.r1, k), 0, TAU); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.parts) {
      if (!p.glow) continue;
      const k = 1 - p.t / p.life;
      ctx.globalAlpha = k;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * k, 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const p of this.parts) {
      if (p.glow) continue;
      const k = 1 - p.t / p.life;
      ctx.globalAlpha = k * .6;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.4 - k * .4), 0, TAU); ctx.fill();
    }
    ctx.restore();
  },

  drawTexts(ctx) {
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const k = 1 - t.t / t.life;
      ctx.globalAlpha = clamp(k * 1.6, 0, 1);
      ctx.font = `bold ${t.size}px "Trebuchet MS", sans-serif`;
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.85)';
      ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.restore();
  }
};

/* ==========================================================
   KAMERA
   ========================================================== */
const Cam = {
  x: 0, y: 0, tx: 0, ty: 0, shake: 0, shakeAmp: 0, ox: 0, oy: 0,
  bounds: null, vw: 0, vh: 0, userShake: 1,

  setView(w, h) { this.vw = w; this.vh = h; },
  snap(x, y) { this.x = this.tx = x; this.y = this.ty = y; this.clampToBounds(); },
  follow(x, y, dt, lead = 0) { this.tx = x; this.ty = y; this.x = damp(this.x, this.tx, 7, dt); this.y = damp(this.y, this.ty, 7, dt); this.clampToBounds(); },
  clampToBounds() {
    const b = this.bounds; if (!b) return;
    const hw = this.vw / 2, hh = this.vh / 2;
    this.x = b.w <= this.vw ? b.x + b.w / 2 : clamp(this.x, b.x + hw, b.x + b.w - hw);
    this.y = b.h <= this.vh ? b.y + b.h / 2 : clamp(this.y, b.y + hh, b.y + b.h - hh);
  },
  addShake(amp) { this.shakeAmp = Math.max(this.shakeAmp, amp * this.userShake); this.shake = Math.max(this.shake, .35); },
  update(dt) {
    if (this.shake > 0) {
      this.shake -= dt;
      const k = clamp(this.shake / .35, 0, 1);
      this.ox = rnd(this.shakeAmp, -this.shakeAmp) * k;
      this.oy = rnd(this.shakeAmp, -this.shakeAmp) * k;
      if (this.shake <= 0) { this.ox = this.oy = 0; this.shakeAmp = 0; }
    }
  },
  apply(ctx) { ctx.translate(Math.round(this.vw / 2 - this.x + this.ox), Math.round(this.vh / 2 - this.y + this.oy)); },
  toWorld(sx, sy) { return { x: sx - this.vw / 2 + this.x - this.ox, y: sy - this.vh / 2 + this.y - this.oy }; }
};
