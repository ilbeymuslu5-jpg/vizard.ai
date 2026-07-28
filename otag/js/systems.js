/* ============================================================
   systems.js : envanter, görevler, dalga yöneticisi, kayıt
   ============================================================ */
'use strict';

/* ---------------------------------------------------------- */
const ITEMS = {
  potion:     { name: 'Şifa Şurubu', icon: '🧪', use: 'heal', power: 45, max: 9,
                desc: 'Bir yudum al, 45 can dolsun. (Kullanmak için tıkla ya da 1–5 tuşları)' },
  key:        { name: 'Kızıl Anahtar', icon: '🗝️', max: 1,
                desc: 'Gölge Geçidi\'nin kapısını açar. Görev eşyası.' },
  spearRune:  { name: 'Mızrak Runesi', icon: '🔱', max: 5, passive: true,
                desc: 'Mızrak hasarı +7. Taşıdıkça birikir.' },
  shieldRune: { name: 'Kalkan Runesi', icon: '🛡️', max: 5, passive: true,
                desc: 'Blok hasar azaltması ve kalkan açısı artar. Taşıdıkça birikir.' },
  emberHeart: { name: 'Kor Yürek', icon: '🔥', max: 3, passive: true,
                desc: 'Azami can +25. Kara Otağ\'ın kalıntısından.' },
};

const Inventory = {
  slots: [],           // {kind, n}
  SIZE: 10,

  reset() { this.slots = []; },
  count(kind) { const s = this.slots.find(s => s.kind === kind); return s ? s.n : 0; },

  add(kind, n = 1) {
    const def = ITEMS[kind]; if (!def) return false;
    let s = this.slots.find(s => s.kind === kind);
    if (!s) {
      if (this.slots.length >= this.SIZE) { UI.toast('Çanta dolu!'); return false; }
      s = { kind, n: 0 }; this.slots.push(s);
    }
    const before = s.n;
    s.n = Math.min(def.max, s.n + n);
    const got = s.n - before;
    if (got > 0) {
      UI.toast(`${def.icon} ${def.name}${got > 1 ? ' ×' + got : ''}`, 'good');
      if (kind === 'emberHeart') { Game.player.maxHp += 25; Game.player.hp += 25; }
      Quests.event('item', kind);
    }
    UI.refreshHotbar();
    return got > 0;
  },

  remove(kind, n = 1) {
    const i = this.slots.findIndex(s => s.kind === kind);
    if (i < 0) return false;
    this.slots[i].n -= n;
    if (this.slots[i].n <= 0) this.slots.splice(i, 1);
    UI.refreshHotbar();
    return true;
  },

  useSlot(i) {
    const s = this.slots[i]; if (!s) return;
    const def = ITEMS[s.kind];
    if (!def.use) { UI.toast(def.name + ' kullanılamaz'); return; }
    if (def.use === 'heal') {
      if (Game.player.hp >= Game.player.maxHp) { UI.toast('Canın zaten dolu'); return; }
      Game.player.heal(def.power);
      this.remove(s.kind, 1);
      UI.flashSlot(i);
    }
  },

  serialize() { return this.slots.map(s => [s.kind, s.n]); },
  load(arr) { this.slots = (arr || []).map(([kind, n]) => ({ kind, n })); }
};

/* ============================================================
   GÖREVLER
   ============================================================ */
const QUEST_DEFS = [
  { id: 'awaken', title: 'Uyanış', zone: 'camp',
    desc: 'Gölgeler otağı bastı. Mızrağını kap ve kampı temizle.',
    objs: [{ id: 'kill', text: 'Kamptaki gölgeleri yok et', need: 5 }],
    reward: 'Kül Ormanı\'nın yolu açıldı.' },

  { id: 'redkey', title: 'Kızıl Anahtar', zone: 'forest',
    desc: 'Kül Ormanı\'nda üç gölge dalgası var. Hepsini kır, sandığı aç.',
    objs: [
      { id: 'waves', text: 'Gölge dalgalarını kır', need: 3 },
      { id: 'key', text: 'Kızıl Anahtar\'ı al', need: 1 }],
    reward: 'Gölge Geçidi\'nin kapısı artık açılabilir.' },

  { id: 'braziers', title: 'Ateşi Uyandır', zone: 'pass',
    desc: 'Geçidi kapatan mühür üç ateş kulesine bağlı. Yak, ama her ateş gölgeleri çağırır.',
    objs: [{ id: 'lit', text: 'Ateş kulelerini yak', need: 3 }],
    reward: 'Kara Otağ\'ın kapısı açıldı.' },

  { id: 'karaotag', title: 'Kara Otağ', zone: 'arena',
    desc: 'Gölgelerin hükümdarı arenanın dibinde bekliyor. Bitir bu işi.',
    objs: [{ id: 'boss', text: 'Kara Otağ\'ı yen', need: 1 }],
    reward: 'Kızıl Sefer tamamlandı.' },
];

const Quests = {
  state: {},     // id -> {started, done, prog:{objId:n}}
  active: null,

  reset() {
    this.state = {};
    for (const q of QUEST_DEFS) this.state[q.id] = { started: false, done: false, prog: {} };
    this.start('awaken');
  },

  def(id) { return QUEST_DEFS.find(q => q.id === id); },

  start(id) {
    const s = this.state[id]; if (!s || s.started) return;
    s.started = true; this.active = id;
    const d = this.def(id);
    UI.toast('YENİ GÖREV: ' + d.title, 'quest');
    Audio2.sfx.quest();
    UI.refreshQuest();
  },

  prog(id, objId) { return this.state[id].prog[objId] || 0; },
  objDone(id, objId) {
    const o = this.def(id).objs.find(o => o.id === objId);
    return this.prog(id, objId) >= o.need;
  },

  advance(id, objId, n = 1) {
    const s = this.state[id]; if (!s || !s.started || s.done) return;
    const o = this.def(id).objs.find(o => o.id === objId); if (!o) return;
    if (this.objDone(id, objId)) return;
    s.prog[objId] = Math.min(o.need, (s.prog[objId] || 0) + n);
    UI.refreshQuest();
    if (this.objDone(id, objId)) {
      UI.toast('✔ ' + o.text, 'good');
      Audio2.sfx.pickup();
    }
    if (this.def(id).objs.every(o => this.objDone(id, o.id))) this.complete(id);
  },

  complete(id) {
    const s = this.state[id]; if (s.done) return;
    s.done = true;
    const d = this.def(id);
    UI.toast('GÖREV TAMAM: ' + d.title, 'quest');
    Audio2.sfx.quest();
    UI.portraitPose('happy', 3);
    Game.onQuestComplete(id);
    /* sıradaki görevi başlat */
    const i = QUEST_DEFS.findIndex(q => q.id === id);
    if (QUEST_DEFS[i + 1]) setTimeout(() => this.start(QUEST_DEFS[i + 1].id), 1400);
    UI.refreshQuest();
  },

  /* oyun içi olaylar buraya düşer */
  event(type, data) {
    if (type === 'kill' && World.id === 'camp') this.advance('awaken', 'kill');
    if (type === 'wave' && World.id === 'forest') this.advance('redkey', 'waves');
    if (type === 'item' && data === 'key') this.advance('redkey', 'key');
    if (type === 'brazier') this.advance('braziers', 'lit');
    if (type === 'boss') this.advance('karaotag', 'boss');
  },

  isDone(id) { return this.state[id] && this.state[id].done; },

  serialize() { return this.state; },
  load(s) { this.reset(); if (s) Object.assign(this.state, s); this.active = QUEST_DEFS.find(q => this.state[q.id].started && !this.state[q.id].done)?.id || null; }
};

/* ============================================================
   DALGA YÖNETİCİSİ
   ============================================================ */
const WAVES = {
  camp:   [{ grunt: 2 }, { grunt: 2, archer: 1 }],
  forest: [{ grunt: 3 }, { grunt: 2, archer: 2 }, { grunt: 3, brute: 1 }],
  pass:   [{ grunt: 3, archer: 1 }, { brute: 1, grunt: 2 }, { brute: 1, archer: 2, grunt: 2 }],
  arena:  [],
};

const Waves = {
  index: 0, active: false, timer: 0, done: false, pending: null,

  reset(zone) {
    this.index = 0; this.active = false; this.timer = 0; this.pending = null;
    this.done = Waves.zoneCleared[zone] || false;
  },
  zoneCleared: {},

  startZone(zone) {
    this.reset(zone);
    /* kampta dalga Dede ile konuşulunca başlar */
    if (zone === 'camp' && Game.talked.dede && !Quests.isDone('awaken')) this.queue(1.5);
    if (zone === 'forest' && Quests.prog('redkey', 'waves') < 3) {
      this.index = Quests.prog('redkey', 'waves');
      this.queue(2.0);
    }
    /* geçitte dalgalar meşale yakınca gelir */
  },

  queue(delay) { this.pending = delay; },

  spawnWave(zone, list) {
    const p = Game.player;
    let n = 0;
    for (const type in list) {
      for (let i = 0; i < list[type]; i++) {
        const sp = World.spawnPoint(p, 300);
        Game.spawnEnemy(type, sp.x + rnd(50, -50), sp.y + rnd(50, -50));
        n++;
      }
    }
    this.active = true;
    UI.toast('GÖLGE DALGASI ' + (this.index + 1), '');
    Audio2.sfx.roar();
    return n;
  },

  update(dt) {
    const zone = World.id;
    if (this.pending !== null) {
      this.pending -= dt;
      if (this.pending <= 0) {
        this.pending = null;
        const list = (WAVES[zone] || [])[this.index];
        if (list) this.spawnWave(zone, list); else this.done = true;
      }
      return;
    }
    if (!this.active) return;
    if (Game.enemies.some(e => !e.dead)) return;
    /* dalga bitti */
    this.active = false;
    this.index++;
    Quests.event('wave');
    const list = (WAVES[zone] || [])[this.index];
    if (list && !(zone === 'pass')) this.queue(3.0);
    else if (!list) { this.done = true; Waves.zoneCleared[zone] = true; UI.toast('BÖLGE TEMİZ', 'good'); }
  },

  /* geçitte meşale yakınca çağrılır */
  spawnBrazierWave(n) {
    const list = WAVES.pass[Math.min(n, WAVES.pass.length - 1)];
    this.index = n;
    this.spawnWave('pass', list);
  }
};

/* ============================================================
   KAYIT SİSTEMİ
   ============================================================ */
const Save = {
  KEY: 'otag_kizil_sefer_v1',

  exists() { try { return !!localStorage.getItem(this.KEY); } catch (e) { return false; } },

  write(auto = false) {
    const p = Game.player;
    const data = {
      v: 1, t: Date.now(),
      zone: World.id,
      x: p ? p.x : 0, y: p ? p.y : 0,
      hp: p ? p.hp : 100, maxHp: p ? p.maxHp : 100, rage: p ? p.rage : 0,
      kills: Game.kills, playtime: Game.playtime,
      inv: Inventory.serialize(),
      quests: Quests.serialize(),
      chests: World.openedChests, braziers: World.litBraziers, gates: World.openedGates,
      cleared: Waves.zoneCleared,
      talked: Game.talked,
    };
    try {
      localStorage.setItem(this.KEY, JSON.stringify(data));
      UI.toast(auto ? 'Otomatik kaydedildi' : 'Oyun kaydedildi', 'good');
      return true;
    } catch (e) { UI.toast('Kaydedilemedi (tarayıcı izni?)'); return false; }
  },

  read() {
    try { return JSON.parse(localStorage.getItem(this.KEY)); } catch (e) { return null; }
  },

  clear() { try { localStorage.removeItem(this.KEY); } catch (e) {} },

  /* --- ayarlar ayrı saklanır --- */
  SKEY: 'otag_ayarlar_v1',
  writeSettings(s) { try { localStorage.setItem(this.SKEY, JSON.stringify(s)); } catch (e) {} },
  readSettings() { try { return JSON.parse(localStorage.getItem(this.SKEY)); } catch (e) { return null; } }
};
