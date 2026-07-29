/* ============================================================
   main.js : oyun döngüsü, durumlar, bölge geçişleri, çizim
   ============================================================ */
'use strict';

const Game = {
  canvas: null, ctx: null, dpr: 1, zoom: 1, cssW: 0, cssH: 0,
  mode: 'load',                 // load | menu | play | paused | dead | win
  player: null, enemies: [], projectiles: [], pickups: [], slashes: [], boss: null,
  hitstop: 0, playtime: 0, kills: 0, talked: {},
  inv: Inventory,
  last: 0, ambT: 0, transitioning: false,

  settings: { master: .8, sfx: .8, music: .5, shake: 1, difficulty: 'normal', dmgNum: true },
  diff: { hp: 1, dmg: 1, spd: 1 },

  /* ---------------------------------------------------------- */
  init() {
    this.canvas = document.getElementById('game');
    /* önce 3B denenir; WebGL yoksa eski 2B çizime düşülür */
    this.is3d = R3D.init(this.canvas);
    if (!this.is3d) this.ctx = this.canvas.getContext('2d');
    this.fx2d = document.getElementById('fx2d');
    if (this.fx2d) {
      if (this.is3d) this.fxctx = this.fx2d.getContext('2d');
      else this.fx2d.style.display = 'none';
    }

    const st = Save.readSettings();
    if (st) Object.assign(this.settings, st);
    Audio2.vol.master = this.settings.master;
    Audio2.vol.sfx = this.settings.sfx;
    Audio2.vol.music = this.settings.music;
    Cam.userShake = this.settings.shake;
    this.applyDifficulty();

    UI.init();
    Input.init(this.canvas);
    addEventListener('resize', () => this.resize());
    this.resize();

    /* ilk kullanıcı etkileşiminde sesi aç (tarayıcı kuralı) */
    const unlock = () => { Audio2.ensure(); };
    addEventListener('pointerdown', unlock, { once: true });
    addEventListener('keydown', unlock, { once: true });

    Sprites.load(() => {
      UI.open('menu');
      this.mode = 'menu';
      this.menuScene();
      requestAnimationFrame(t => { this.last = t; this.loop(t); });
    });
  },

  applyDifficulty() {
    const d = this.settings.difficulty;
    this.diff = d === 'easy' ? { hp: .8, dmg: .65, spd: .92 }
             : d === 'hard' ? { hp: 1.45, dmg: 1.45, spd: 1.1 }
             : { hp: 1, dmg: 1, spd: 1 };
  },

  resize() {
    const w = innerWidth, h = innerHeight;
    this.cssW = w; this.cssH = h;
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';

    if (this.is3d) {
      this.zoom = 1;
      R3D.resize(w, h, this.dpr);
      if (this.fx2d) {
        this.fx2d.width = Math.floor(w * this.dpr);
        this.fx2d.height = Math.floor(h * this.dpr);
        this.fx2d.style.width = w + 'px';
        this.fx2d.style.height = h + 'px';
      }
    } else {
      this.canvas.width = Math.floor(w * this.dpr);
      this.canvas.height = Math.floor(h * this.dpr);
      this.zoom = clamp(h / 780, .62, 1.5);
      Cam.setView(w / this.zoom, h / this.zoom);
    }
    Cam.clampToBounds();
  },

  /* ---------------------------------------------------------- */
  menuScene() {
    /* menü arkasında sakin bir kamp manzarası dönsün */
    World.openedChests = {}; World.litBraziers = {}; World.openedGates = {};
    World.load('camp', 'begin');
    Cam.snap(700, 520);
    this.enemies = []; this.projectiles = []; this.pickups = []; this.slashes = [];
    this.boss = null; this.player = null;
    FX.clear();
    UI.showHud(false);
    UI.showBoss(false);
  },

  newGame() {
    Inventory.reset();
    Quests.reset();
    Waves.zoneCleared = {};
    World.openedChests = {}; World.litBraziers = {}; World.openedGates = {};
    this.kills = 0; this.playtime = 0; this.talked = {};
    this.enemies = []; this.projectiles = []; this.pickups = []; this.slashes = [];
    this.boss = null; this.hitstop = 0;
    FX.clear();
    const s = World.load('camp', 'begin');
    this.player = new Player(s.x, s.y);
    Inventory.add('potion', 2);
    Cam.snap(this.player.x, this.player.y);
    UI.setZone(World.z.name);
    UI.refreshQuest(); UI.refreshHotbar(); UI.showHud(true); UI.showBoss(false);
    UI.closeAll();
    this.mode = 'play';
    Audio2.ensure(); Audio2.startMusic();
    Waves.startZone('camp');
    setTimeout(() => UI.toast('Dede ile konuş — E', 'quest'), 900);
  },

  loadGame() {
    const d = Save.read();
    if (!d) { this.newGame(); return; }
    Inventory.reset(); Quests.reset();
    Inventory.load(d.inv);
    Quests.load(d.quests);
    World.openedChests = d.chests || {};
    World.litBraziers = d.braziers || {};
    World.openedGates = d.gates || {};
    Waves.zoneCleared = d.cleared || {};
    this.kills = d.kills || 0; this.playtime = d.playtime || 0;
    this.talked = d.talked || {};
    this.enemies = []; this.projectiles = []; this.pickups = []; this.slashes = [];
    this.boss = null; this.hitstop = 0;
    FX.clear();

    const zone = ZONES[d.zone] ? d.zone : 'camp';
    const s = World.load(zone, Object.keys(ZONES[zone].starts)[0]);
    this.player = new Player(d.x || s.x, d.y || s.y);
    this.player.maxHp = d.maxHp || 100;
    this.player.hp = clamp(d.hp || 100, 25, this.player.maxHp);
    Cam.snap(this.player.x, this.player.y);
    UI.setZone(World.z.name);
    UI.refreshQuest(); UI.refreshHotbar(); UI.showHud(true); UI.showBoss(false);
    UI.closeAll();
    this.mode = 'play';
    Audio2.ensure(); Audio2.startMusic();
    if (zone === 'arena') this.startBoss();
    else Waves.startZone(zone);
    UI.toast('Kayıt yüklendi', 'good');
  },

  /* ---------------------------------------------------------- */
  uiAction(act) {
    switch (act) {
      case 'new': this.newGame(); break;
      case 'continue': this.loadGame(); break;
      case 'resume': this.resume(); break;
      case 'save': Save.write(false); break;
      case 'settings': this._back = UI.current; UI.open('settings'); break;
      case 'help': this._back = UI.current; UI.open('help'); break;
      case 'credits': this._back = UI.current; UI.open('credits'); break;
      case 'back':
        if (['inv', 'journal'].includes(UI.current)) { this.resume(); break; }
        UI.open(this._back || (this.mode === 'play' || this.mode === 'paused' ? 'pause' : 'menu'));
        break;
      case 'quit':
        this.mode = 'menu'; UI.open('menu'); UI.showHud(false); UI.showBoss(false);
        this.menuScene(); Audio2.stopMusic();
        break;
      case 'retry':
        if (Save.exists()) this.loadGame(); else this.newGame();
        break;
    }
  },

  pause(screen = 'pause') {
    if (this.mode !== 'play') return;
    this.mode = 'paused'; UI.open(screen);
  },
  resume() {
    if (this.mode !== 'paused') return;
    this.mode = 'play'; UI.closeAll(); this._back = null;
  },

  /* ---------------------------------------------------------- */
  spawnEnemy(type, x, y) {
    const e = new Enemy(type, x, y);
    this.enemies.push(e);
    FX.ring(x, y, 6, 60, .45, ENEMY_TYPES[type].eye, 4);
    FX.spark(x, y - 20, 10, ENEMY_TYPES[type].eye, 160, .5, 3);
    return e;
  },

  onEnemyKilled(e) {
    this.kills++;
    Quests.event('kill', e.type);
    if (chance(.3)) this.pickups.push(new Pickup(e.x, e.y, 'hp'));
    if (chance(.22)) this.pickups.push(new Pickup(e.x, e.y, 'rage'));
    if (e.type === 'brute' && chance(.5)) this.pickups.push(new Pickup(e.x, e.y, 'potion'));
  },

  onQuestComplete(id) {
    if (id === 'braziers') {
      World.openGate('bossgate');
      UI.toast('Kara Otağ\'ın kapısı açıldı', 'quest');
    }
    Save.write(true);
  },

  onPlayerDeath() {
    setTimeout(() => {
      if (this.mode === 'play') {
        this.mode = 'dead';
        UI.el.deadSub.innerHTML =
          `Bölge: <b>${World.z.name}</b> &nbsp;•&nbsp; Öldürülen gölge: <b>${this.kills}</b> &nbsp;•&nbsp; Süre: <b>${UI.fmtTime(this.playtime)}</b><br>
           Gölgeler otağı yine kuşattı. Ama sen daha bitmedin.`;
        UI.open('dead'); UI.showHud(false); UI.showBoss(false);
      }
    }, 1500);
  },

  startBoss() {
    this.boss = new Boss(750, 640);
    UI.showBoss(true); UI.setBossHp(1); UI.setBossPhase(1);
    UI.toast('KARA OTAĞ UYANDI', 'quest');
    Audio2.sfx.roar();
    Cam.addShake(20);
  },

  onBossKilled() {
    Quests.event('boss');
    UI.showBoss(false);
    this.pickups.push(new Pickup(this.boss.x, this.boss.y + 40, 'emberHeart'));
    setTimeout(() => {
      if (this.mode !== 'play') return;
      this.mode = 'win';
      UI.el.winSub.innerHTML =
        `Öldürülen gölge: <b>${this.kills}</b> &nbsp;•&nbsp; Parry: <b>${this.player.parries}</b><br>
         Alınan hasar: <b>${Math.round(this.player.dmgTaken)}</b> &nbsp;•&nbsp; Süre: <b>${UI.fmtTime(this.playtime)}</b><br><br>
         Otağ ayakta. Sancak hâlâ dalgalanıyor.`;
      UI.open('win'); UI.showHud(false);
      Save.write(true);
    }, 3600);
  },

  /* ---------------- bölge geçişi ---------------- */
  travel(to, at) {
    if (this.transitioning) return;
    this.transitioning = true;
    UI.fade(true);
    setTimeout(() => {
      const s = World.load(to, at);
      this.player.x = s.x; this.player.y = s.y;
      this.player.vx = this.player.vy = 0;
      this.enemies = []; this.projectiles = []; this.pickups = []; this.slashes = [];
      this.boss = null; UI.showBoss(false);
      FX.clear();
      Cam.snap(this.player.x, this.player.y);
      UI.setZone(World.z.name);
      Audio2.setIntensity(World.z.music);
      if (to === 'arena') this.startBoss();
      else Waves.startZone(to);
      Save.write(true);
      UI.fade(false);
      this.transitioning = false;
    }, 400);
  },

  /* ---------------- etkileşim ---------------- */
  interact(p) {
    switch (p.type) {
      case 'npc': {
        /* diyalog açıkken oyun ilerlemez, sadece görsel öğeler akar */
        UI.hint('');
        p.pose = 'confused';
        UI.dialogue(p.name, p.lines, 'confused', () => {
          p.pose = 'happy';
          if (!this.talked.dede) {
            this.talked.dede = true;
            UI.toast('Kampı temizle!', 'quest');
            Waves.queue(1.2);
          }
        });
        break;
      }
      case 'chest': {
        if (p.req === 'forestWaves' && Quests.prog('redkey', 'waves') < 3) {
          UI.toast('Sandık mühürlü — önce dalgaları kır');
          Audio2.sfx.ui(); return;
        }
        p.opened = true;
        World.openedChests[p.id] = true;
        Audio2.sfx.pickup();
        FX.spark(p.x, p.y - 30, 22, '#ffd27a', 220, .8, 3);
        FX.ring(p.x, p.y - 20, 10, 90, .5, '#ffd27a', 4);
        for (const [kind, n] of p.loot) Inventory.add(kind, n);
        Save.write(true);
        break;
      }
      case 'brazier': {
        p.lit = true;
        World.litBraziers[p.id] = true;
        Audio2.sfx.burn(); Cam.addShake(8);
        FX.ring(p.x, p.y - 60, 8, 120, .5, '#ff5c2c', 5);
        for (let i = 0; i < 20; i++) FX.ember(p.x, p.y - 60, 1, '#ff8a3c');
        const n = Object.keys(World.litBraziers).length;
        Quests.event('brazier');
        if (!Quests.isDone('braziers')) {
          UI.toast('Ateş gölgeleri çağırdı!');
          setTimeout(() => Waves.spawnBrazierWave(n - 1), 900);
        }
        break;
      }
      case 'exit': {
        if (p.gate) {
          const g = World.props.find(q => q.id === p.gate);
          if (g && !g.open) { UI.toast('Kapı mühürlü'); return; }
        }
        if (p.needs === 'key' && Inventory.count('key') < 1) {
          UI.toast('Kızıl Anahtar gerekiyor'); Audio2.sfx.ui(); return;
        }
        if (World.id === 'camp' && p.to === 'forest' && !Quests.isDone('awaken')) {
          UI.toast('Önce kampı temizle'); Audio2.sfx.ui(); return;
        }
        this.travel(p.to, p.at);
        break;
      }
    }
  },

  /* ---------------------------------------------------------- */
  loop(t) {
    requestAnimationFrame(tt => this.loop(tt));
    let dt = (t - this.last) / 1000;
    this.last = t;
    if (!isFinite(dt) || dt <= 0) dt = 1 / 60;
    dt = Math.min(dt, .05);
    this._dt = dt;

    this.handleGlobalKeys();

    if (this.mode === 'play') {
      if (UI.dlg) {
        UI.dlgUpdate(dt);
        this.updateWorldLight(dt);
      } else if (this.hitstop > 0) {
        this.hitstop -= dt;
        this.updateWorldLight(dt * .15);
      } else {
        this.update(dt);
      }
      this.playtime += dt;
    } else {
      /* menüde arka plan yine yaşasın */
      this.updateWorldLight(dt);
    }

    Cam.update(dt);
    UI.update(this.player, dt);
    this.render();
    Input.endFrame();
  },

  handleGlobalKeys() {
    if (Input.hit('escape')) {
      if (UI.dlg) { UI.closeDialogue(); }
      else if (this.mode === 'play') { this.pause(); Audio2.sfx.ui(); }
      else if (this.mode === 'paused') {
        if (['settings', 'help', 'credits'].includes(UI.current)) this.uiAction('back');
        else this.resume();
      }
    }
    if (this.mode === 'play' && !UI.dlg) {
      if (Input.hit('i')) { this.pause('inv'); }
      if (Input.hit('j')) { this.pause('journal'); }
      for (let i = 1; i <= 5; i++) if (Input.hit(String(i))) Inventory.useSlot(i - 1);
    } else if (this.mode === 'paused') {
      if (Input.hit('i') && UI.current === 'inv') this.resume();
      if (Input.hit('j') && UI.current === 'journal') this.resume();
    }
  },

  /* sadece görsel öğeler (menüde de akar) */
  updateWorldLight(dt) {
    World.update(dt, this.playtime);
    FX.update(dt);
    this.ambient(dt);
    for (let i = this.slashes.length - 1; i >= 0; i--) {
      const s = this.slashes[i]; s.t += dt;
      if (s.t >= s.life) this.slashes.splice(i, 1);
    }
  },

  ambient(dt) {
    const a = World.z.ambient; if (!a) return;
    this.ambT += dt * a.rate;
    while (this.ambT > .2) {
      this.ambT -= .2;
      const x = Cam.x + rnd(Cam.vw, -Cam.vw) * .55;
      const y = Cam.y + rnd(Cam.vh, -Cam.vh) * .55;
      if (a.type === 'ember') FX.ember(x, y, 1, a.color);
      else FX.parts.push({ x, y: y - 200, vx: rnd(26, -26), vy: rnd(40, 14), life: rnd(5, 3), t: 0,
        size: rnd(3, 1.4), color: a.color, drag: .3, grav: .4, glow: false });
    }
  },

  update(dt) {
    const p = this.player;
    if (!p) return;

    /* fare dünya koordinatı */
    const mw = this.is3d ? R3D.groundPoint(Input.mx, Input.my)
                         : Cam.toWorld(Input.mx / this.zoom, Input.my / this.zoom);
    Input.wx = mw.x; Input.wy = mw.y;

    p.update(dt);

    for (const e of this.enemies) e.update(dt, p);
    if (this.boss) this.boss.update(dt, p);

    for (const pr of this.projectiles) pr.update(dt, p);
    for (const pk of this.pickups) pk.update(dt, p);

    this.enemies = this.enemies.filter(e => !(e.dead && e.deadT > 1.2));
    this.projectiles = this.projectiles.filter(x => !x.dead);
    this.pickups = this.pickups.filter(x => !x.dead);

    /* patrona yakın dövüş vuruşu */
    if (this.boss && !this.boss.dead && p.state === 'attack' && p.hitList && !p.hitList.has(this.boss)) {
      const d = dist(p.x, p.y, this.boss.x, this.boss.y);
      const windup = p.combo === 3 ? .16 : .09, active = p.combo === 3 ? .16 : .11;
      if (p.t >= windup && p.t < windup + active && d < (p.combo === 3 ? 132 : 112) + this.boss.r) {
        if (Math.abs(angDiff(p.face, angTo(p.x, p.y, this.boss.x, this.boss.y))) < 1.0) {
          p.hitList.add(this.boss);
          this.boss.hurt((p.combo === 3 ? 30 : 17) + p.dmgBonus, p.face, 60, false);
          this.hitstop = Math.max(this.hitstop, .06); Cam.addShake(6); Audio2.sfx.hit();
          p.rage = Math.min(p.maxRage, p.rage + 7);
        }
      }
    }
    if (this.boss && !this.boss.dead && p.state === 'spin' && p.hitList && !p.hitList.has(this.boss)) {
      if (dist(p.x, p.y, this.boss.x, this.boss.y) < 170 + this.boss.r) {
        p.hitList.add(this.boss);
        this.boss.hurt(34 + p.dmgBonus * 2, angTo(p.x, p.y, this.boss.x, this.boss.y), 40, false);
        Cam.addShake(9);
      }
    }

    Waves.update(dt);
    this.updateWorldLight(dt);

    /* kamera: oyuncu + fare arası hafif kayma; patron varsa kadraja onu da al
       (3B'de perspektif yüzünden kayma daha az tutulur, yoksa oyuncu köşeye düşer) */
    const lead = this.is3d ? .07 : .16;
    let lx = lerp(p.x, Input.wx, lead), ly = lerp(p.y - (this.is3d ? 10 : 30), Input.wy, lead);
    if (this.boss && !this.boss.dead) {
      lx = lerp(lx, this.boss.x, .24);
      ly = lerp(ly, this.boss.y - 110, .32);
    }
    Cam.follow(lx, ly, dt);

    /* etkileşim ipucu */
    const near = World.nearestInteract(p.x, p.y);
    if (near) {
      let label = '';
      if (near.type === 'npc') label = `<b>E</b> — ${near.name} ile konuş`;
      else if (near.type === 'chest') label = '<b>E</b> — Sandığı aç';
      else if (near.type === 'brazier') label = '<b>E</b> — Ateş kulesini yak';
      else if (near.type === 'exit') label = `<b>E</b> — ${near.label}'ne geç`;
      UI.hint(label);
      if (Input.hit('e')) this.interact(near);
    } else UI.hint('');

    /* ölüm çukuru yok; sınır dışına düşme koruması */
    if (p.hp <= 0 && !p.dead) p.die();
  },

  /* ---------------------------------------------------------- */
  render() {
    if (this.is3d) { R3D.frame(this._dt || 1 / 60); this.overlay(); }
    else this.render2d();
  },

  /* 3B sahnenin üstündeki 2B katman: hasar sayıları, vinyet, nişan */
  overlay() {
    const ctx = this.fxctx; if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.fx2d.width, this.fx2d.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    /* uçuşan yazılar (hasar, +ÖFKE …) dünyadan ekrana yansıtılır */
    const pt = this._pt || (this._pt = { x: 0, y: 0, vis: false });
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const t of FX.texts) {
      if (t.y0 === undefined) t.y0 = t.y;
      R3D.project(t.x, 46 + (t.y0 - t.y) * .9, t.y0, pt);
      if (!pt.vis) continue;
      const k = 1 - t.t / t.life;
      ctx.globalAlpha = clamp(k * 1.6, 0, 1);
      ctx.font = `bold ${t.size}px "Trebuchet MS", sans-serif`;
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.85)';
      ctx.strokeText(t.str, pt.x, pt.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, pt.x, pt.y);
    }
    ctx.globalAlpha = 1;

    /* düşman can çubukları */
    for (const e of Game.enemies) {
      if (e.dead || e.hp >= e.maxHp) continue;
      R3D.project(e.x, e.h + 34, e.y, pt);
      if (!pt.vis) continue;
      const bw = 46;
      ctx.fillStyle = 'rgba(0,0,0,.6)';
      ctx.fillRect(pt.x - bw / 2, pt.y, bw, 5);
      ctx.fillStyle = e.stunT > 0 ? '#ffe9b0' : '#d8402c';
      ctx.fillRect(pt.x - bw / 2, pt.y, bw * (e.hp / e.maxHp), 5);
    }
    /* sersemleme yıldızları */
    if (this.boss && !this.boss.dead && this.boss.stunT > 0) {
      R3D.project(this.boss.x, this.boss.h + 40, this.boss.y, pt);
      if (pt.vis) {
        ctx.globalAlpha = .85; ctx.fillStyle = '#ffe9b0';
        ctx.font = 'bold 20px "Trebuchet MS", sans-serif';
        ctx.fillText('★ ★ ★', pt.x, pt.y);
        ctx.globalAlpha = 1;
      }
    }

    this.screenLayer(ctx);
  },

  /* vinyet + düşük can + nişan imleci (iki çizim yolunda da ortak) */
  screenLayer(ctx) {
    const g = ctx.createRadialGradient(this.cssW / 2, this.cssH / 2, Math.min(this.cssW, this.cssH) * .35,
                                       this.cssW / 2, this.cssH / 2, Math.max(this.cssW, this.cssH) * .72);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.62)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, this.cssW, this.cssH);

    const p = this.player;
    if (p && !p.dead && p.hp < p.maxHp * .3 && this.mode === 'play') {
      const pulse = .12 + Math.sin(performance.now() / 220) * .07;
      ctx.fillStyle = `rgba(180,20,10,${Math.max(0, pulse)})`;
      ctx.fillRect(0, 0, this.cssW, this.cssH);
    }
    if (this.mode === 'play' && p && !p.dead) {
      ctx.save();
      ctx.translate(Input.mx, Input.my);
      ctx.strokeStyle = 'rgba(255,210,160,.75)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-15, 0); ctx.lineTo(-5, 0); ctx.moveTo(5, 0); ctx.lineTo(15, 0);
      ctx.moveTo(0, -15); ctx.lineTo(0, -5); ctx.moveTo(0, 5); ctx.lineTo(0, 15);
      ctx.stroke();
      ctx.restore();
    }
  },

  /* ---------- WebGL yoksa: eski 2B çizim ---------- */
  render2d() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = '#07060a';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const s = this.dpr * this.zoom;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.save();
    Cam.apply(ctx);

    World.drawGround(ctx);
    World.drawWalls(ctx);

    /* y sıralı çizim */
    const list = [];
    World.collect(list);
    for (const pk of this.pickups) list.push({ y: pk.y, draw: c => pk.draw(c) });
    for (const e of this.enemies) list.push({ y: e.y, draw: c => e.draw(c) });
    if (this.boss) list.push({ y: this.boss.y, draw: c => this.boss.draw(c) });
    if (this.player) list.push({ y: this.player.y, draw: c => this.player.draw(c) });
    list.sort((a, b) => a.y - b.y);
    for (const it of list) it.draw(ctx);

    /* mızrak izleri */
    for (const sl of this.slashes) {
      const k = sl.t / sl.life;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (1 - k) * .8;
      ctx.strokeStyle = sl.color;
      ctx.lineWidth = 16 * (1 - k * .7);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(sl.x, sl.y, sl.r * (.6 + k * .5), sl.a - sl.half * (.4 + k), sl.a + sl.half * (.4 + k));
      ctx.stroke();
      ctx.restore();
    }

    for (const pr of this.projectiles) pr.draw(ctx);
    FX.draw(ctx);
    FX.drawTexts(ctx);

    ctx.restore();

    /* --- ekran üstü katman --- */
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.screenLayer(ctx);
  }
};

addEventListener('DOMContentLoaded', () => Game.init());
