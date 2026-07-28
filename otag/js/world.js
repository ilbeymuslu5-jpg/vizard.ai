/* ============================================================
   world.js : bölgeler, engeller, zemin dokusu, çarpışma
   ============================================================ */
'use strict';

/* --- yardımcı: dikdörtgen engel --- */
const R = (x, y, w, h, kind = 'rock') => ({ t: 'rect', x, y, w, h, kind });
/* --- yardımcı: dairesel engel (ağaç, kaya) --- */
const C = (x, y, r, kind = 'tree') => ({ t: 'circle', x, y, r, kind, h: kind === 'tree' ? r * 3.2 : r * 1.5 });

const ZONES = {

  /* ---------------------------------------------------------- */
  camp: {
    name: 'Otağ Kampı',
    w: 1500, h: 1000,
    pal: { base: '#3a2c22', base2: '#241a15', patch: '#4a3627', detail: '#5c4530', fog: 'rgba(30,16,12,.35)' },
    ambient: { type: 'ember', rate: 1.2, color: '#ff8a3c' },
    music: .3,
    starts: { begin: { x: 260, y: 800 }, fromForest: { x: 1380, y: 500 } },
    solids: [
      R(0, 0, 1500, 60, 'wall'), R(0, 940, 1500, 60, 'wall'),
      R(0, 0, 60, 1000, 'wall'), R(1440, 0, 60, 440, 'wall'), R(1440, 560, 60, 440, 'wall'),
      C(300, 300, 46, 'tent'), C(520, 230, 42, 'tent'), C(980, 250, 44, 'tent'),
      C(200, 600, 38, 'rock'), C(1180, 760, 44, 'rock'), C(760, 860, 36, 'rock'),
      C(1250, 300, 40, 'tree'), C(140, 880, 34, 'tree'),
    ],
    props: [
      { type: 'firepit', x: 700, y: 560 },
      { type: 'npc', x: 600, y: 620, name: 'Dede', pose: 'sleep',
        lines: [
          'Uyandın demek… İyi. Gölgeler gece yarısı kampı bastı.',
          'Mızrağını sıkı tut evlat. Sol tık ile saldır, üç vuruşluk bir ahengi vardır.',
          'Kalkanı da unutma: sağ tık ya da boşluk. Tam vuracakları an bırakırsan, kırılırlar. Buna biz "parry" deriz.',
          'Kampı temizle. Sonra Kül Ormanı\'na inersin. Kızıl Anahtar orada.'
        ] },
      { type: 'banner', x: 420, y: 480 }, { type: 'banner', x: 980, y: 480 },
      { type: 'chest', x: 1150, y: 620, id: 'camp_chest', loot: [['potion', 2]] },
      { type: 'exit', x: 1440, y: 440, w: 60, h: 120, to: 'forest', at: 'fromCamp', label: 'Kül Ormanı' },
    ],
    spawns: [{ x: 1100, y: 300 }, { x: 900, y: 800 }, { x: 400, y: 820 }, { x: 1250, y: 520 }],
  },

  /* ---------------------------------------------------------- */
  forest: {
    name: 'Kül Ormanı',
    w: 1800, h: 1300,
    pal: { base: '#2b3129', base2: '#161a16', patch: '#39412f', detail: '#4a5340', fog: 'rgba(20,26,22,.4)' },
    ambient: { type: 'leaf', rate: 2.4, color: '#7d8a6a' },
    music: .55,
    starts: { fromCamp: { x: 120, y: 650 }, fromPass: { x: 1660, y: 650 } },
    solids: [
      R(0, 0, 1800, 60, 'wall'), R(0, 1240, 1800, 60, 'wall'),
      R(0, 0, 60, 560, 'wall'), R(0, 740, 60, 560, 'wall'),
      R(1740, 0, 60, 560, 'wall'), R(1740, 740, 60, 560, 'wall'),
      C(340, 260, 52), C(560, 420, 46), C(300, 900, 50), C(520, 1120, 44),
      C(820, 200, 48), C(900, 640, 40, 'rock'), C(760, 1040, 52),
      C(1180, 320, 46), C(1320, 700, 50), C(1150, 1080, 44),
      C(1520, 260, 48), C(1560, 980, 46), C(620, 700, 34, 'rock'),
      C(1000, 900, 38, 'rock'), C(1420, 480, 36, 'rock'),
    ],
    props: [
      { type: 'chest', x: 900, y: 700, id: 'forest_key', req: 'forestWaves', loot: [['key', 1], ['potion', 1], ['spearRune', 1]] },
      { type: 'exit', x: 1740, y: 560, w: 60, h: 180, to: 'pass', at: 'fromForest', label: 'Gölge Geçidi', needs: 'key' },
      { type: 'exit', x: 0, y: 560, w: 60, h: 180, to: 'camp', at: 'fromForest', label: 'Otağ Kampı' },
      { type: 'banner', x: 1000, y: 500 },
    ],
    spawns: [{ x: 500, y: 300 }, { x: 1400, y: 350 }, { x: 700, y: 1100 }, { x: 1500, y: 1050 },
             { x: 1050, y: 250 }, { x: 250, y: 700 }, { x: 1650, y: 700 }],
  },

  /* ---------------------------------------------------------- */
  pass: {
    name: 'Gölge Geçidi',
    w: 1700, h: 1200,
    pal: { base: '#2a2430', base2: '#141018', patch: '#352c3c', detail: '#463a4e', fog: 'rgba(40,16,26,.4)' },
    ambient: { type: 'ember', rate: 2.0, color: '#d8452c' },
    music: .75,
    starts: { fromForest: { x: 130, y: 600 }, fromArena: { x: 850, y: 1080 } },
    solids: [
      R(0, 0, 1700, 60, 'wall'), R(0, 1140, 700, 60, 'wall'), R(1000, 1140, 700, 60, 'wall'),
      R(0, 0, 60, 500, 'wall'), R(0, 700, 60, 500, 'wall'), R(1640, 0, 60, 1200, 'wall'),
      C(420, 250, 60, 'rock'), C(1240, 240, 56, 'rock'), C(300, 950, 54, 'rock'),
      C(1330, 900, 58, 'rock'), C(820, 600, 70, 'rock'), C(600, 820, 44, 'rock'),
      C(1080, 820, 44, 'rock'), C(640, 380, 42, 'rock'), C(1050, 400, 42, 'rock'),
    ],
    props: [
      { type: 'brazier', x: 330, y: 420, id: 'br1' },
      { type: 'brazier', x: 1330, y: 430, id: 'br2' },
      { type: 'brazier', x: 830, y: 980, id: 'br3' },
      { type: 'chest', x: 1450, y: 620, id: 'pass_chest', loot: [['potion', 2], ['shieldRune', 1]] },
      { type: 'gate', x: 700, y: 1140, w: 300, h: 60, id: 'bossgate', opensWith: 'braziers' },
      { type: 'exit', x: 0, y: 500, w: 60, h: 200, to: 'forest', at: 'fromPass', label: 'Kül Ormanı' },
      { type: 'exit', x: 700, y: 1180, w: 300, h: 30, to: 'arena', at: 'begin', label: 'Kara Otağ', gate: 'bossgate' },
    ],
    spawns: [{ x: 400, y: 300 }, { x: 1300, y: 320 }, { x: 850, y: 300 }, { x: 400, y: 900 },
             { x: 1300, y: 880 }, { x: 850, y: 750 }],
  },

  /* ---------------------------------------------------------- */
  arena: {
    name: 'Kara Otağ Arenası',
    w: 1500, h: 1400,
    pal: { base: '#221a1e', base2: '#0d090c', patch: '#2e2026', detail: '#3d2a30', fog: 'rgba(60,10,10,.45)' },
    ambient: { type: 'ember', rate: 4, color: '#ff4a24' },
    music: 1,
    boss: true,
    starts: { begin: { x: 750, y: 1250 } },
    solids: [
      R(0, 0, 1500, 60, 'wall'), R(0, 1340, 1500, 60, 'wall'),
      R(0, 0, 60, 1400, 'wall'), R(1440, 0, 60, 1400, 'wall'),
      C(190, 250, 40, 'rock'), C(1310, 250, 40, 'rock'),
      C(190, 1150, 40, 'rock'), C(1310, 1150, 40, 'rock'),
    ],
    props: [
      { type: 'bossaltar', x: 750, y: 300 },
      { type: 'torch', x: 250, y: 340 }, { type: 'torch', x: 1250, y: 340 },
      { type: 'torch', x: 250, y: 1120 }, { type: 'torch', x: 1250, y: 1120 },
    ],
    spawns: [{ x: 340, y: 420 }, { x: 1160, y: 420 }, { x: 340, y: 1020 }, { x: 1160, y: 1020 }],
  },
};

/* ============================================================ */
const World = {
  id: null, z: null, solids: [], props: [], ground: null, groundCache: {},
  openedGates: {}, openedChests: {}, litBraziers: {},

  load(id, startKey) {
    this.id = id;
    this.z = ZONES[id];
    this.solids = this.z.solids.slice();
    /* prop kopyaları — durumları bölge yeniden yüklenince korunsun */
    this.props = this.z.props.map(p => {
      const o = Object.assign({}, p);
      if (o.type === 'chest') o.opened = !!this.openedChests[o.id];
      if (o.type === 'brazier') o.lit = !!this.litBraziers[o.id];
      if (o.type === 'gate') { o.open = !!this.openedGates[o.id]; o.anim = o.open ? 1 : 0; }
      return o;
    });
    /* kapalı kapılar katı engeldir */
    for (const p of this.props) if (p.type === 'gate' && !p.open) this.solids.push(R(p.x, p.y, p.w, p.h, 'gate'));

    this.ground = this.getGround(id);
    Cam.bounds = { x: 0, y: 0, w: this.z.w, h: this.z.h };
    const s = this.z.starts[startKey] || Object.values(this.z.starts)[0];
    return { x: s.x, y: s.y };
  },

  openGate(id) {
    this.openedGates[id] = true;
    const p = this.props.find(p => p.id === id);
    if (p) p.open = true;
    this.solids = this.solids.filter(s => !(s.kind === 'gate' && p && s.x === p.x && s.y === p.y));
    Audio2.sfx.gate(); Cam.addShake(14);
  },

  /* ------------ zemin dokusu (bölge başına bir kez üretilir) ------------ */
  getGround(id) {
    if (this.groundCache[id]) return this.groundCache[id];
    const z = ZONES[id], cv = document.createElement('canvas');
    cv.width = z.w; cv.height = z.h;
    const g = cv.getContext('2d');
    const rng = mulberry32(id.split('').reduce((a, c) => a + c.charCodeAt(0) * 977, 7));

    const grd = g.createRadialGradient(z.w / 2, z.h / 2, 60, z.w / 2, z.h / 2, Math.max(z.w, z.h) * .75);
    grd.addColorStop(0, z.pal.base); grd.addColorStop(1, z.pal.base2);
    g.fillStyle = grd; g.fillRect(0, 0, z.w, z.h);

    /* lekeler */
    for (let i = 0; i < 320; i++) {
      const x = rng() * z.w, y = rng() * z.h, r = 40 + rng() * 150;
      g.globalAlpha = .05 + rng() * .09;
      g.fillStyle = rng() > .5 ? z.pal.patch : z.pal.base2;
      g.beginPath(); g.ellipse(x, y, r, r * (.5 + rng() * .5), rng() * TAU, 0, TAU); g.fill();
    }
    /* çatlaklar / izler */
    g.globalAlpha = .16; g.strokeStyle = z.pal.base2; g.lineWidth = 2;
    for (let i = 0; i < 70; i++) {
      let x = rng() * z.w, y = rng() * z.h;
      g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < 5; s++) { x += (rng() - .5) * 130; y += (rng() - .5) * 130; g.lineTo(x, y); }
      g.stroke();
    }
    /* çakıl ve otlar */
    for (let i = 0; i < 900; i++) {
      const x = rng() * z.w, y = rng() * z.h;
      g.globalAlpha = .12 + rng() * .22;
      g.fillStyle = z.pal.detail;
      if (rng() > .45) { g.fillRect(x, y, 2 + rng() * 3, 2 + rng() * 2); }
      else { g.beginPath(); g.moveTo(x, y); g.lineTo(x + 1.5, y - 6 - rng() * 8); g.lineTo(x + 3, y); g.fill(); }
    }
    /* arenada merkezden dışa doğru kızıl çatlaklar */
    if (id === 'arena' || id === 'pass') {
      const cx = z.w / 2, cy = z.h / 2, n = id === 'arena' ? 14 : 8;
      for (let i = 0; i < n; i++) {
        const a0 = i / n * TAU + rng() * .4;
        let x = cx + Math.cos(a0) * 40, y = cy + Math.sin(a0) * 40, a = a0;
        g.beginPath(); g.moveTo(x, y);
        const steps = 5 + (rng() * 4 | 0);
        for (let s = 0; s < steps; s++) {
          a += (rng() - .5) * .7;
          const len = 40 + rng() * 70;
          x += Math.cos(a) * len; y += Math.sin(a) * len;
          g.lineTo(x, y);
          g.globalAlpha = .22 * (1 - s / steps);
          g.strokeStyle = id === 'arena' ? '#8d2412' : '#5a1a14';
          g.lineWidth = 3 * (1 - s / steps) + .6;
          g.stroke();
          g.beginPath(); g.moveTo(x, y);
        }
      }
    }
    g.globalAlpha = 1;
    this.groundCache[id] = cv;
    return cv;
  },

  /* ------------ çarpışma ------------ */
  blockedAt(x, y, r) {
    for (const s of this.solids) {
      if (s.t === 'rect') {
        const cx = clamp(x, s.x, s.x + s.w), cy = clamp(y, s.y, s.y + s.h);
        if (dist2(x, y, cx, cy) < r * r) return s;
      } else {
        const rr = s.r * .78 + r;
        if (dist2(x, y, s.x, s.y) < rr * rr) return s;
      }
    }
    return null;
  },

  /* varlığı engellerden dışarı iter */
  resolve(e) {
    for (let pass = 0; pass < 2; pass++) {
      for (const s of this.solids) {
        if (s.t === 'rect') {
          const cx = clamp(e.x, s.x, s.x + s.w), cy = clamp(e.y, s.y, s.y + s.h);
          let dx = e.x - cx, dy = e.y - cy, d = Math.hypot(dx, dy);
          if (d < e.r) {
            if (d < .0001) { // merkez içinde: en yakın kenara it
              const l = e.x - s.x, rr = s.x + s.w - e.x, t = e.y - s.y, b = s.y + s.h - e.y;
              const m = Math.min(l, rr, t, b);
              if (m === l) e.x = s.x - e.r; else if (m === rr) e.x = s.x + s.w + e.r;
              else if (m === t) e.y = s.y - e.r; else e.y = s.y + s.h + e.r;
            } else {
              e.x = cx + dx / d * e.r; e.y = cy + dy / d * e.r;
            }
          }
        } else {
          const rr = s.r * .78 + e.r;
          let dx = e.x - s.x, dy = e.y - s.y, d = Math.hypot(dx, dy);
          if (d < rr) { if (d < .0001) { dx = 1; dy = 0; d = 1; } e.x = s.x + dx / d * rr; e.y = s.y + dy / d * rr; }
        }
      }
    }
    e.x = clamp(e.x, e.r, this.z.w - e.r);
    e.y = clamp(e.y, e.r, this.z.h - e.r);
  },

  /* iki nokta arasında engel var mı (okçu görüş hattı) */
  lineBlocked(ax, ay, bx, by) {
    const d = dist(ax, ay, bx, by), n = Math.ceil(d / 40);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (this.blockedAt(lerp(ax, bx, t), lerp(ay, by, t), 6)) return true;
    }
    return false;
  },

  /* düşmanların doğacağı uygun nokta */
  spawnPoint(awayFrom, minD = 320) {
    const pts = this.z.spawns.slice().sort(() => Math.random() - .5);
    for (const p of pts) {
      if (!awayFrom || dist(p.x, p.y, awayFrom.x, awayFrom.y) > minD) if (!this.blockedAt(p.x, p.y, 26)) return p;
    }
    return pts[0];
  },

  update(dt, t) {
    for (const p of this.props) {
      if (p.type === 'gate' && p.open && p.anim < 1) p.anim = Math.min(1, p.anim + dt * .8);
      if (p.type === 'firepit' || (p.type === 'brazier' && p.lit)) {
        if (chance(dt * 14)) FX.ember(p.x, p.y - 34, 1, p.type === 'firepit' ? '#ff9a3c' : '#ff5c2c');
      }
      if (p.type === 'bossaltar' && chance(dt * 8)) FX.ember(p.x + rnd(60, -60), p.y - 10, 1, '#ff3a20');
    }
  },

  /* ------------ çizim ------------ */
  drawGround(ctx) {
    ctx.drawImage(this.ground, 0, 0);
    /* sınır karartması */
    const z = this.z;
    const g = ctx.createRadialGradient(z.w / 2, z.h / 2, Math.min(z.w, z.h) * .3, z.w / 2, z.h / 2, Math.max(z.w, z.h) * .72);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, z.pal.fog);
    ctx.fillStyle = g; ctx.fillRect(0, 0, z.w, z.h);
  },

  /* y-sıralı çizim listesine engelleri ve nesneleri ekle */
  collect(list) {
    for (const s of this.solids) {
      if (s.kind === 'wall' || s.kind === 'gate') continue;
      list.push({ y: s.y + (s.t === 'circle' ? s.r * .5 : s.h), draw: ctx => this.drawSolid(ctx, s) });
    }
    for (const p of this.props) list.push({ y: p.y + 4, draw: ctx => this.drawProp(ctx, p) });
    /* duvarlar her zaman en altta (arka plan gibi) */
  },

  drawWalls(ctx) {
    for (const s of this.solids) if (s.kind === 'wall') this.drawSolid(ctx, s);
    for (const p of this.props) if (p.type === 'gate') this.drawGate(ctx, p);
  },

  drawSolid(ctx, s) {
    const pal = this.z.pal;
    if (s.t === 'rect') {
      ctx.fillStyle = '#0b0709';
      ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.fillStyle = pal.base2;
      ctx.fillRect(s.x + 3, s.y + 3, s.w - 6, s.h - 6);
      ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 2;
      ctx.strokeRect(s.x + 3, s.y + 3, s.w - 6, s.h - 6);
      return;
    }
    const { x, y, r } = s;
    if (s.kind === 'tree') {
      Sprites.shadow(ctx, x, y, r * 1.15, .5);
      ctx.fillStyle = '#1c1410';
      ctx.beginPath();
      ctx.moveTo(x - r * .22, y); ctx.lineTo(x - r * .13, y - r * 1.6);
      ctx.lineTo(x + r * .13, y - r * 1.6); ctx.lineTo(x + r * .22, y);
      ctx.closePath(); ctx.fill();
      /* taç: üst üste koyu loblar */
      const lobes = [[0, -1.95, 1.05], [-.55, -1.7, .72], [.58, -1.75, .66], [-.15, -2.35, .62]];
      ctx.fillStyle = '#131a13';
      for (const [ox, oy, rr] of lobes) { ctx.beginPath(); ctx.arc(x + r * ox, y + r * oy, r * rr, 0, TAU); ctx.fill(); }
      ctx.fillStyle = '#1f2c1c';
      for (const [ox, oy, rr] of lobes) { ctx.beginPath(); ctx.arc(x + r * ox - r * .1, y + r * oy - r * .12, r * rr * .78, 0, TAU); ctx.fill(); }
      /* kenar ışığı */
      ctx.strokeStyle = 'rgba(150,170,110,.18)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x - r * .25, y - r * 2.05, r * .95, 3.5, 5.2); ctx.stroke();
    } else if (s.kind === 'tent') {
      Sprites.shadow(ctx, x, y, r * 1.2, .42);
      ctx.fillStyle = '#43201d';
      ctx.beginPath(); ctx.moveTo(x, y - r * 2.2); ctx.lineTo(x + r * 1.15, y + r * .2); ctx.lineTo(x - r * 1.15, y + r * .2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#5b2b25';
      ctx.beginPath(); ctx.moveTo(x, y - r * 2.2); ctx.lineTo(x + r * .1, y + r * .2); ctx.lineTo(x - r * 1.15, y + r * .2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#1a0d0c';
      ctx.beginPath(); ctx.moveTo(x, y - r * .95); ctx.lineTo(x + r * .34, y + r * .2); ctx.lineTo(x - r * .34, y + r * .2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#c9b28a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y - r * 2.5, r * .22, .4, 5.2); ctx.stroke();
    } else {
      Sprites.shadow(ctx, x, y, r * 1.05, .4);
      ctx.fillStyle = '#221c22';
      ctx.beginPath();
      const n = 7;
      for (let i = 0; i <= n; i++) {
        const a = i / n * TAU, rr = r * (1 + Math.sin(i * 2.7 + r) * .16);
        const px = x + Math.cos(a) * rr, py = y - r * .55 + Math.sin(a) * rr * .8;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,240,220,.07)';
      ctx.beginPath(); ctx.ellipse(x - r * .25, y - r * .95, r * .5, r * .3, -.4, 0, TAU); ctx.fill();
    }
  },

  drawGate(ctx, p) {
    if (p.open && p.anim >= 1) {
      ctx.fillStyle = 'rgba(255,120,60,.10)';
      ctx.fillRect(p.x, p.y, p.w, p.h);
      return;
    }
    const off = p.anim * p.w * .5;
    ctx.save();
    for (const dir of [-1, 1]) {
      const x = dir < 0 ? p.x - off : p.x + p.w / 2 + off;
      ctx.fillStyle = '#1a1013'; ctx.fillRect(x, p.y, p.w / 2, p.h);
      ctx.fillStyle = '#3a221f'; ctx.fillRect(x + 4, p.y + 4, p.w / 2 - 8, p.h - 8);
      ctx.strokeStyle = '#6b3a2a'; ctx.lineWidth = 3;
      for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x + i * p.w / 8, p.y + 4); ctx.lineTo(x + i * p.w / 8, p.y + p.h - 4); ctx.stroke(); }
    }
    ctx.restore();
  },

  drawProp(ctx, p) {
    const t = performance.now() / 1000;
    switch (p.type) {
      case 'firepit': {
        Sprites.shadow(ctx, p.x, p.y, 34, .4);
        ctx.fillStyle = '#20181a';
        ctx.beginPath(); ctx.ellipse(p.x, p.y, 32, 14, 0, 0, TAU); ctx.fill();
        for (let i = 0; i < 6; i++) {
          const a = i / 6 * TAU;
          ctx.fillStyle = '#3a2b24';
          ctx.beginPath(); ctx.ellipse(p.x + Math.cos(a) * 30, p.y + Math.sin(a) * 13, 8, 6, a, 0, TAU); ctx.fill();
        }
        this.flame(ctx, p.x, p.y - 6, 1 + Math.sin(t * 6) * .08, '#ff9a3c');
        break;
      }
      case 'torch': {
        Sprites.shadow(ctx, p.x, p.y, 18, .4);
        ctx.fillStyle = '#241a20'; ctx.fillRect(p.x - 5, p.y - 70, 10, 70);
        ctx.fillStyle = '#3a2a30';
        ctx.beginPath(); ctx.ellipse(p.x, p.y - 70, 13, 6, 0, 0, TAU); ctx.fill();
        this.flame(ctx, p.x, p.y - 68, .6 + Math.sin(t * 8 + p.x) * .08, '#ff5c2c');
        if (chance(.2)) FX.ember(p.x, p.y - 74, 1, '#ff7a3c');
        break;
      }
      case 'brazier': {
        Sprites.shadow(ctx, p.x, p.y, 22, .4);
        ctx.fillStyle = '#2a2026'; ctx.fillRect(p.x - 7, p.y - 44, 14, 44);
        ctx.fillStyle = '#3d3038';
        ctx.beginPath(); ctx.moveTo(p.x - 22, p.y - 44); ctx.lineTo(p.x + 22, p.y - 44); ctx.lineTo(p.x + 15, p.y - 66); ctx.lineTo(p.x - 15, p.y - 66); ctx.closePath(); ctx.fill();
        if (p.lit) this.flame(ctx, p.x, p.y - 62, .85 + Math.sin(t * 7 + p.x) * .1, '#ff5c2c');
        else { ctx.fillStyle = 'rgba(120,120,140,.25)'; ctx.beginPath(); ctx.arc(p.x, p.y - 62, 9, 0, TAU); ctx.fill(); }
        break;
      }
      case 'banner': {
        Sprites.shadow(ctx, p.x, p.y, 12, .35);
        ctx.fillStyle = '#3a2a20'; ctx.fillRect(p.x - 3, p.y - 96, 6, 96);
        const sway = Math.sin(t * 1.6 + p.x) * 5;
        ctx.fillStyle = '#8d2320';
        ctx.beginPath();
        ctx.moveTo(p.x + 3, p.y - 94); ctx.lineTo(p.x + 46 + sway, p.y - 88);
        ctx.lineTo(p.x + 40 + sway, p.y - 44); ctx.lineTo(p.x + 3, p.y - 40);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#e8dcc8';
        ctx.beginPath(); ctx.arc(p.x + 24 + sway * .5, p.y - 66, 9, .7, 5.6); ctx.fill();
        break;
      }
      case 'chest': {
        Sprites.shadow(ctx, p.x, p.y, 26, .4);
        ctx.fillStyle = '#241615'; ctx.fillRect(p.x - 24, p.y - 26, 48, 26);
        ctx.fillStyle = p.opened ? '#3a2a24' : '#57342a';
        if (p.opened) { ctx.fillRect(p.x - 24, p.y - 52, 48, 16); }
        else { ctx.beginPath(); ctx.moveTo(p.x - 24, p.y - 26); ctx.quadraticCurveTo(p.x, p.y - 52, p.x + 24, p.y - 26); ctx.fill(); }
        ctx.fillStyle = '#b98b3f'; ctx.fillRect(p.x - 5, p.y - 30, 10, 12);
        if (!p.opened) {
          const g = .5 + Math.sin(t * 3) * .3;
          ctx.globalAlpha = g * .35; ctx.fillStyle = '#ffd27a';
          ctx.beginPath(); ctx.arc(p.x, p.y - 26, 34, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
        }
        break;
      }
      case 'npc': {
        Sprites.shadow(ctx, p.x, p.y, 26, .4);
        Sprites.draw(ctx, p.pose || 'sleep', p.x, p.y, 108, { alpha: .96 });
        break;
      }
      case 'bossaltar': {
        ctx.save();
        ctx.globalAlpha = .5;
        const g = ctx.createRadialGradient(p.x, p.y, 8, p.x, p.y, 220);
        g.addColorStop(0, 'rgba(200,40,20,.5)'); g.addColorStop(1, 'rgba(200,40,20,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, 220, 0, TAU); ctx.fill();
        ctx.restore();
        for (let i = 0; i < 5; i++) {
          const x = p.x - 160 + i * 80;
          ctx.fillStyle = '#171015';
          ctx.beginPath(); ctx.moveTo(x, p.y); ctx.lineTo(x + 14, p.y - 70 - (i % 2) * 24); ctx.lineTo(x + 28, p.y); ctx.closePath(); ctx.fill();
        }
        break;
      }
      case 'exit': {
        if (p.gate) { const g = this.props.find(q => q.id === p.gate); if (g && !g.open) break; }
        const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = .10 + Math.sin(t * 2.2) * .035;
        const g2 = ctx.createRadialGradient(cx, cy, 4, cx, cy, Math.max(p.w, p.h) * 1.1);
        g2.addColorStop(0, '#ffcf7d'); g2.addColorStop(1, 'rgba(196,85,58,0)');
        ctx.fillStyle = g2;
        ctx.beginPath(); ctx.ellipse(cx, cy, Math.max(p.w, 70), Math.max(p.h, 70), 0, 0, TAU); ctx.fill();
        ctx.restore();
        if (chance(.25)) FX.ember(cx, cy + rnd(p.h / 2, -p.h / 2), 1, '#ffb45c');
        break;
      }
    }
  },

  flame(ctx, x, y, s, color) {
    const t = performance.now() / 1000;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const k = 1 - i * .28, w = (16 + Math.sin(t * 9 + i * 2) * 3) * s * k, h = (44 + Math.sin(t * 7 + i) * 6) * s * k;
      ctx.fillStyle = i === 0 ? color : (i === 1 ? '#ffb45c' : '#fff0c0');
      ctx.globalAlpha = .55 - i * .1;
      ctx.beginPath();
      ctx.moveTo(x, y - h);
      ctx.quadraticCurveTo(x + w, y - h * .35, x, y);
      ctx.quadraticCurveTo(x - w, y - h * .35, x, y - h);
      ctx.fill();
    }
    ctx.globalAlpha = .25; ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y - 16, 46 * s, 0, TAU); ctx.fill();
    ctx.restore();
  },

  /* oyuncunun etkileşebileceği en yakın nesne */
  nearestInteract(px, py) {
    let best = null, bd = Infinity;
    for (const p of this.props) {
      if (!['chest', 'npc', 'brazier', 'exit'].includes(p.type)) continue;
      if (p.type === 'chest' && p.opened) continue;
      if (p.type === 'brazier' && p.lit) continue;
      const isExit = p.type === 'exit';
      if (isExit && p.gate) { const g = this.props.find(q => q.id === p.gate); if (g && !g.open) continue; }
      const cx = isExit ? p.x + p.w / 2 : p.x;
      const cy = isExit ? p.y + p.h / 2 : p.y;
      const range = isExit ? 110 : 92;
      const d = dist(px, py, cx, cy);
      if (d < range && d < bd) { best = p; bd = d; }
    }
    return best;
  }
};
