import { clamp, rnd, dist, TAU } from '../utils.js';
import { EQUIPMENT_DATABASE, SLOTS } from '../data/equipment.js';

const WORLD_W = 1080, WORLD_H = 1920;
const BASE_STATS = { atk: 8, def: 2, maxHp: 100, spd: 220, atkSpeed: 1.0, crit: 0.05, magnet: 90, pierce: 0, projectiles: 1, regen: 0 };

const ENEMY_TYPES = [
  { id: 'slime',  r: 26, hp: 18,  spd: 90,  dmg: 6,  xp: 3, color: '#6fae4e' },
  { id: 'bat',    r: 20, hp: 12,  spd: 150, dmg: 5,  xp: 3, color: '#a15fd6' },
  { id: 'orc',    r: 34, hp: 55,  spd: 70,  dmg: 12, xp: 8, color: '#c65a3a' },
  { id: 'brute',  r: 46, hp: 140, spd: 55,  dmg: 20, xp: 18, color: '#8d5fb0' },
];

/* Chibi kahraman durumu + oto-saldırı/dalga spawn/XP orbu döngüsü.
   Render mantığı burada tutulur (bağımsız prototip — three.js/WebGL yok,
   yalnızca 2D Canvas), UI katmanları (HUD/InventoryModal/LevelUpModal)
   yalnızca bu sınıfın genel API'siyle konuşur. */
export class GameLoop {
  constructor(canvas, callbacks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cb = callbacks; // { onHudUpdate, onLevelUp, onGameOver }
    this.equip = { helmets: null, chest_armors: null, boots: null, weapons: null, rings: null };
    this.runUpgrades = [];
    this.reset();
    this._raf = null;
    this._last = 0;
    this._inputX = 0; this._inputY = 0;
  }

  reset() {
    this.hero = { x: WORLD_W / 2, y: WORLD_H / 2, level: 1, xp: 0, xpNext: 20, kills: 0, gold: 0, hp: 0, iframe: 0, atkTimer: 0, aimAngle: 0 };
    this.runUpgrades = [];
    this.recomputeStats();
    this.hero.hp = this.stats.maxHp;
    this.enemies = [];
    this.projectiles = [];
    this.orbs = [];
    this.time = 0;
    this.spawnTimer = 0;
    this.paused = false;
    this.gameOver = false;
  }

  // Denklem: temel + kuşanılan eşyalar + bu koşuda seçilen rogue-lite yükseltmeler.
  recomputeStats() {
    const s = { ...BASE_STATS, maxHp: BASE_STATS.maxHp };
    for (const slot of SLOTS) {
      const id = this.equip[slot.key];
      const it = id && EQUIPMENT_DATABASE[slot.key].find((x) => x.id === id);
      if (!it) continue;
      if (it.atk) s.atk += it.atk;
      if (it.def) s.def += it.def;
      if (it.hp) s.maxHp += it.hp;
      if (it.spd) s.spd += it.spd;
      if (it.dodge) s.crit += it.dodge * 0.004; // basit eşleme: dodge -> ekstra kritik şansı
    }
    for (const up of this.runUpgrades) up.apply(s);
    const hpRatio = this.hero.hp > 0 ? this.hero.hp / (this.stats?.maxHp || s.maxHp) : 1;
    this.stats = s;
    this.hero.hp = Math.min(s.maxHp, Math.round(s.maxHp * hpRatio) || s.maxHp);
  }

  equipItem(slotKey, id) {
    this.equip[slotKey] = id;
    this.recomputeStats();
  }

  applyUpgrade(up) {
    this.runUpgrades.push(up);
    this.recomputeStats();
  }

  setInput(x, y) { this._inputX = x; this._inputY = y; }

  start() {
    this._last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - this._last) / 1000);
      this._last = now;
      if (!this.paused && !this.gameOver) this.update(dt);
      this.render();
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }
  stop() { if (this._raf) cancelAnimationFrame(this._raf); }

  update(dt) {
    this.time += dt;
    const h = this.hero, s = this.stats;

    // Hareket
    const mv = Math.hypot(this._inputX, this._inputY);
    if (mv > 0.05) {
      h.x = clamp(h.x + (this._inputX / mv) * s.spd * dt * Math.min(1, mv), 40, WORLD_W - 40);
      h.y = clamp(h.y + (this._inputY / mv) * s.spd * dt * Math.min(1, mv), 40, WORLD_H - 40);
      h.aimAngle = Math.atan2(this._inputY, this._inputX);
    }
    if (h.iframe > 0) h.iframe -= dt;
    if (s.regen > 0) h.hp = Math.min(s.maxHp, h.hp + s.regen * dt);

    this.spawnWave(dt);
    this.updateEnemies(dt);
    this.updateAttack(dt);
    this.updateProjectiles(dt);
    this.updateOrbs(dt);

    if (this.cb.onHudUpdate) this.cb.onHudUpdate(this.getHudState());
    if (h.hp <= 0 && !this.gameOver) { this.gameOver = true; this.cb.onGameOver?.(this.getHudState()); }
  }

  spawnWave(dt) {
    this.spawnTimer -= dt;
    const cap = Math.min(80, 14 + Math.floor(this.time / 6));
    if (this.spawnTimer <= 0 && this.enemies.length < cap) {
      this.spawnTimer = Math.max(0.2, 1.1 - this.time * 0.01);
      const tierIdx = Math.min(ENEMY_TYPES.length - 1, Math.floor(this.time / 25));
      const type = ENEMY_TYPES[Math.min(tierIdx, Math.floor(Math.random() * (tierIdx + 1)))];
      const a = rnd(TAU);
      const R = Math.max(WORLD_W, WORLD_H) * 0.62;
      const x = clamp(this.hero.x + Math.cos(a) * R, -60, WORLD_W + 60);
      const y = clamp(this.hero.y + Math.sin(a) * R, -60, WORLD_H + 60);
      const scale = 1 + this.time * 0.01;
      this.enemies.push({ ...type, x, y, hp: type.hp * scale, maxHp: type.hp * scale, dmg: type.dmg * scale, flash: 0 });
    }
  }

  updateEnemies(dt) {
    const h = this.hero;
    for (const e of this.enemies) {
      if (e.flash > 0) e.flash -= dt;
      const d = dist(h.x, h.y, e.x, e.y) || 1;
      e.x += (h.x - e.x) / d * e.spd * dt;
      e.y += (h.y - e.y) / d * e.spd * dt;
      if (d < e.r + 30 && h.iframe <= 0) {
        h.hp -= Math.max(1, e.dmg - this.stats.def * 0.4);
        h.iframe = 0.5;
      }
    }
  }

  updateAttack(dt) {
    const h = this.hero, s = this.stats;
    h.atkTimer -= dt;
    if (h.atkTimer > 0) return;
    const target = this.nearestEnemy();
    if (!target) return;
    h.atkTimer = 1 / s.atkSpeed;
    const baseAngle = Math.atan2(target.y - h.y, target.x - h.x);
    const n = s.projectiles;
    for (let i = 0; i < n; i++) {
      const spread = n > 1 ? (i - (n - 1) / 2) * 0.18 : 0;
      const a = baseAngle + spread;
      this.projectiles.push({
        x: h.x, y: h.y, vx: Math.cos(a) * 640, vy: Math.sin(a) * 640,
        dmg: s.atk, crit: Math.random() < s.crit, pierce: s.pierce, life: 1.2,
      });
    }
  }

  nearestEnemy() {
    let best = null, bd = Infinity;
    for (const e of this.enemies) {
      const d = dist(this.hero.x, this.hero.y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  updateProjectiles(dt) {
    const list = this.projectiles;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      let dead = p.life <= 0;
      for (const e of this.enemies) {
        if (e.hp <= 0) continue;
        if (dist(p.x, p.y, e.x, e.y) < e.r) {
          const dmg = p.crit ? p.dmg * 2 : p.dmg;
          e.hp -= dmg; e.flash = 0.1;
          if (p.pierce > 0) p.pierce--; else dead = true;
          if (e.hp <= 0) this.killEnemy(e);
          if (dead) break;
        }
      }
      if (dead) list.splice(i, 1);
    }
    this.enemies = this.enemies.filter((e) => e.hp > 0);
  }

  killEnemy(e) {
    this.hero.kills++;
    this.hero.gold += 1 + ((Math.random() * 3) | 0);
    this.orbs.push({ x: e.x, y: e.y, xp: e.xp, vx: 0, vy: 0 });
  }

  updateOrbs(dt) {
    const h = this.hero, s = this.stats;
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      const d = dist(h.x, h.y, o.x, o.y) || 1;
      if (d < s.magnet) {
        o.x += (h.x - o.x) / d * 520 * dt;
        o.y += (h.y - o.y) / d * 520 * dt;
      }
      if (d < 24) {
        this.gainXp(o.xp);
        this.orbs.splice(i, 1);
      }
    }
  }

  gainXp(n) {
    const h = this.hero;
    h.xp += n;
    while (h.xp >= h.xpNext) {
      h.xp -= h.xpNext;
      h.level++;
      h.xpNext = Math.round(20 + h.level * 14 + h.level * h.level * 1.6);
      this.paused = true;
      this.cb.onLevelUp?.();
    }
  }

  getHudState() {
    return {
      level: this.hero.level, xp: this.hero.xp, xpNext: this.hero.xpNext,
      kills: this.hero.kills, gold: this.hero.gold, hp: Math.max(0, this.hero.hp), maxHp: this.stats.maxHp,
      time: this.time,
    };
  }

  // --- Render (2D Canvas, dünya WORLD_W×WORLD_H, kamera oyuncuyu merkezler) ---
  render() {
    const ctx = this.ctx, cv = this.canvas;
    const cx = cv.width / 2, cy = cv.height / 2;
    const camX = this.hero.x, camY = this.hero.y;
    ctx.fillStyle = '#141225';
    ctx.fillRect(0, 0, cv.width, cv.height);

    ctx.save();
    ctx.translate(cx - camX, cy - camY);

    // zemin ızgarası
    ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 2;
    const g = 80;
    for (let x = Math.floor((camX - cx) / g) * g; x < camX + cx; x += g) {
      ctx.beginPath(); ctx.moveTo(x, camY - cy); ctx.lineTo(x, camY + cy); ctx.stroke();
    }
    for (let y = Math.floor((camY - cy) / g) * g; y < camY + cy; y += g) {
      ctx.beginPath(); ctx.moveTo(camX - cx, y); ctx.lineTo(camX + cx, y); ctx.stroke();
    }

    // XP orbları
    for (const o of this.orbs) {
      ctx.fillStyle = '#7fe6ff';
      ctx.beginPath();
      ctx.moveTo(o.x, o.y - 8); ctx.lineTo(o.x + 8, o.y); ctx.lineTo(o.x, o.y + 8); ctx.lineTo(o.x - 8, o.y);
      ctx.closePath(); ctx.fill();
    }

    // düşmanlar
    for (const e of this.enemies) {
      ctx.fillStyle = e.flash > 0 ? '#ffffff' : e.color;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, TAU); ctx.fill();
      // can barı
      const w = e.r * 2, k = clamp(e.hp / e.maxHp, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(e.x - w / 2, e.y - e.r - 12, w, 5);
      ctx.fillStyle = '#ff5566'; ctx.fillRect(e.x - w / 2, e.y - e.r - 12, w * k, 5);
    }

    // mermiler
    for (const p of this.projectiles) {
      ctx.fillStyle = p.crit ? '#ffd479' : '#9ef1ff';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.crit ? 9 : 6, 0, TAU); ctx.fill();
    }

    // chibi kahraman: gövde + kafa + basit yön göstergesi
    const h = this.hero;
    ctx.fillStyle = h.iframe > 0 ? 'rgba(255,255,255,.7)' : '#ffcf9e';
    ctx.beginPath(); ctx.arc(h.x, h.y, 30, 0, TAU); ctx.fill();
    ctx.fillStyle = '#3a2a1a';
    ctx.beginPath(); ctx.arc(h.x, h.y - 34, 20, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#ffd479'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(h.x, h.y);
    ctx.lineTo(h.x + Math.cos(h.aimAngle) * 44, h.y + Math.sin(h.aimAngle) * 44); ctx.stroke();

    ctx.restore();
  }
}

export { WORLD_W, WORLD_H };
