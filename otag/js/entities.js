/* ============================================================
   entities.js : oyuncu, düşmanlar, patron, mermiler, toplananlar
   ============================================================ */
'use strict';

/* ==========================================================
   OYUNCU
   ========================================================== */
class Player {
  constructor(x, y) {
    this.x = x; this.y = y; this.r = 22; this.h = 112;
    this.vx = 0; this.vy = 0;
    this.face = 0;                 // nişan açısı
    this.flip = false;
    this.maxHp = 100; this.hp = 100;
    this.maxSt = 100; this.st = 100;
    this.rage = 0; this.maxRage = 100;
    this.state = 'idle'; this.t = 0;
    this.combo = 0; this.comboTimer = 0;
    this.iframe = 0; this.hurtFlash = 0;
    this.dashCd = 0; this.stRegenDelay = 0;
    this.blockTime = 0; this.parryFlash = 0;
    this.idleTime = 0; this.dead = false;
    this.hitList = null;
    this.kills = 0; this.parries = 0; this.dmgTaken = 0;
    this.bobT = 0; this.squash = { x: 1, y: 1 };
  }

  get dmgBonus() { return (Game.inv.count('spearRune') || 0) * 7; }
  get blockBonus() { return (Game.inv.count('shieldRune') || 0) * .06; }

  /* ---------------- güncelleme ---------------- */
  update(dt) {
    this.t += dt;
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.iframe = Math.max(0, this.iframe - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 3);
    this.parryFlash = Math.max(0, this.parryFlash - dt * 2.5);
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    if (this.comboTimer <= 0) this.combo = 0;
    this.squash.x = damp(this.squash.x, 1, 12, dt);
    this.squash.y = damp(this.squash.y, 1, 12, dt);

    if (this.dead) { this.vx = damp(this.vx, 0, 8, dt); this.vy = damp(this.vy, 0, 8, dt); this.move(dt); return; }

    /* nişan (fare dünya koordinatı main.js tarafından güncellenir) */
    this.face = angTo(this.x, this.y, Input.wx, Input.wy);
    this.flip = Math.cos(this.face) < 0;

    /* dayanıklılık yenilenmesi */
    this.stRegenDelay = Math.max(0, this.stRegenDelay - dt);
    if (this.stRegenDelay <= 0 && this.state !== 'block')
      this.st = Math.min(this.maxSt, this.st + 34 * dt);

    switch (this.state) {
      case 'idle': case 'run': this.stateMove(dt); break;
      case 'attack': this.stateAttack(dt); break;
      case 'block': this.stateBlock(dt); break;
      case 'dash': this.stateDash(dt); break;
      case 'spin': this.stateSpin(dt); break;
      case 'hurt': this.stateHurt(dt); break;
    }
    this.move(dt);
  }

  move(dt) {
    this.x += this.vx * dt; this.y += this.vy * dt;
    World.resolve(this);
  }

  canAct() { return ['idle', 'run'].includes(this.state); }

  stateMove(dt) {
    const a = Input.axis();
    const spd = 268;
    this.vx = damp(this.vx, a.x * spd, 16, dt);
    this.vy = damp(this.vy, a.y * spd, 16, dt);
    const moving = Math.hypot(this.vx, this.vy) > 30;
    this.state = moving ? 'run' : 'idle';
    this.idleTime = moving ? 0 : this.idleTime + dt;
    this.bobT += dt * (moving ? 11 : 3);

    /* girdiler */
    if (Input.justL) this.attack();
    else if ((Input.mouseR || Input.down(' ')) && this.st > 6) this.startBlock();
    else if (Input.hit('shift') && this.dashCd <= 0 && this.st >= 22) this.dash();
    else if (Input.hit('q') && this.rage >= 45) this.spin();
  }

  attack() {
    if (this.st < 8) { Audio2.sfx.ui(); return; }
    this.state = 'attack'; this.t = 0;
    this.combo = this.comboTimer > 0 ? (this.combo % 3) + 1 : 1;
    this.comboTimer = .75;
    this.hitList = new Set();
    this.st -= 8; this.stRegenDelay = .35;
    Audio2.sfx.swing();
    const lunge = this.combo === 3 ? 340 : 210;
    this.vx = Math.cos(this.face) * lunge; this.vy = Math.sin(this.face) * lunge;
    this.squash.x = 1.12; this.squash.y = .9;
  }

  stateAttack(dt) {
    const c = this.combo;
    const windup = c === 3 ? .16 : .09;
    const active = c === 3 ? .16 : .11;
    const total  = c === 3 ? .58 : .34;
    this.vx = damp(this.vx, 0, c === 3 ? 6 : 9, dt);
    this.vy = damp(this.vy, 0, c === 3 ? 6 : 9, dt);

    if (this.t >= windup && this.t < windup + active) {
      const reach = c === 3 ? 132 : 112;
      const half  = c === 3 ? 1.15 : .82;
      const dmg   = (c === 3 ? 30 : 17) + this.dmgBonus;
      this.meleeHit(reach, half, dmg, c === 3 ? 420 : 230, c === 3);
      if (this.t < windup + dt * 1.5) this.slashFx(c);
    }
    if (this.t >= total) { this.state = 'idle'; this.t = 0; }
  }

  slashFx(c) {
    const d = c === 3 ? 1.15 : .8, reach = c === 3 ? 132 : 112;
    Game.slashes.push({ x: this.x, y: this.y - 40, a: this.face, half: d, r: reach, t: 0,
      life: c === 3 ? .3 : .2, color: c === 3 ? '#ff8a3c' : '#ffd9a8' });
    FX.spark(this.x + Math.cos(this.face) * reach * .7, this.y - 40 + Math.sin(this.face) * reach * .7,
      c === 3 ? 10 : 5, '#ffca8a', 220, .3, 2.4, this.face, 1.6);
  }

  meleeHit(reach, half, dmg, kb, heavy) {
    for (const e of Game.enemies) {
      if (e.dead || this.hitList.has(e)) continue;
      const d = dist(this.x, this.y, e.x, e.y);
      if (d > reach + e.r) continue;
      if (Math.abs(angDiff(this.face, angTo(this.x, this.y, e.x, e.y))) > half) continue;
      this.hitList.add(e);
      const back = Math.abs(angDiff(e.face, this.face)) < 1.1;   // arkadan vuruş
      const finalDmg = Math.round(dmg * (back ? 1.6 : 1));
      e.hurt(finalDmg, this.face, kb, back);
      this.rage = Math.min(this.maxRage, this.rage + (heavy ? 9 : 6));
      Game.hitstop = Math.max(Game.hitstop, heavy ? .09 : .05);
      Cam.addShake(heavy ? 9 : 5);
      back ? Audio2.sfx.crit() : Audio2.sfx.hit();
    }
    /* mermileri de kesebilir */
    for (const p of Game.projectiles) {
      if (p.dead || p.friendly) continue;
      if (dist(this.x, this.y - 30, p.x, p.y) < reach * .8) {
        if (Math.abs(angDiff(this.face, angTo(this.x, this.y, p.x, p.y))) < half) {
          p.dead = true; FX.spark(p.x, p.y, 6, '#ffd9a8', 200, .3, 2);
        }
      }
    }
  }

  startBlock() {
    this.state = 'block'; this.t = 0; this.blockTime = 0;
    this.vx *= .3; this.vy *= .3;
    Audio2.sfx.ui();
  }

  stateBlock(dt) {
    this.blockTime += dt;
    const a = Input.axis();
    const spd = 96;
    this.vx = damp(this.vx, a.x * spd, 10, dt);
    this.vy = damp(this.vy, a.y * spd, 10, dt);
    this.st -= 12 * dt;
    this.stRegenDelay = .35;
    if (chance(dt * 6)) FX.ember(this.x + Math.cos(this.face) * 34, this.y - 48, 1, '#ff5c3c');
    if (this.st <= 0) { this.st = 0; this.state = 'idle'; FX.text(this.x, this.y - 130, 'KALKAN KIRILDI!', '#ff8a6a', 16); Audio2.sfx.hurt(); return; }
    if (!(Input.mouseR || Input.down(' '))) { this.state = 'idle'; this.t = 0; }
    if (Input.justL) { this.attack(); }
  }

  /* saldırı bu yönden geliyorsa kalkan tutuyor mu? */
  blocking(fromAngle) {
    if (this.state !== 'block') return false;
    const arc = 1.35 + this.blockBonus * 4;
    return Math.abs(angDiff(this.face, fromAngle)) < arc;
  }
  get parrying() { return this.state === 'block' && this.blockTime < .2; }

  dash() {
    this.state = 'dash'; this.t = 0;
    const a = Input.axis();
    const ang = a.len > 0 ? Math.atan2(a.y, a.x) : this.face;
    this.vx = Math.cos(ang) * 760; this.vy = Math.sin(ang) * 760;
    this.st -= 22; this.stRegenDelay = .55;
    this.iframe = .26;
    this.squash.x = .82; this.squash.y = 1.16;
    Audio2.sfx.dash();
    FX.dust(this.x, this.y, 10, '#8a7355');
  }
  stateDash(dt) {
    this.vx = damp(this.vx, 0, 7, dt); this.vy = damp(this.vy, 0, 7, dt);
    if (chance(dt * 40)) FX.spark(this.x, this.y - 30, 1, '#c9a97a', 40, .3, 2);
    if (this.t >= .26) { this.state = 'idle'; this.dashCd = .32; this.t = 0; }
  }

  spin() {
    this.state = 'spin'; this.t = 0; this.rage -= 45;
    this.hitList = new Set();
    this.iframe = .35;
    Audio2.sfx.spin(); Cam.addShake(16);
    FX.ring(this.x, this.y - 20, 20, 190, .5, '#ff7a3c', 8);
  }
  stateSpin(dt) {
    this.vx = damp(this.vx, 0, 5, dt); this.vy = damp(this.vy, 0, 5, dt);
    const R0 = 60, R1 = 170;
    const reach = lerp(R0, R1, clamp(this.t / .34, 0, 1));
    if (chance(dt * 60)) FX.ember(this.x + rnd(70, -70), this.y - rnd(80, 10), 1, '#ff6a2c');
    for (const e of Game.enemies) {
      if (e.dead || this.hitList.has(e)) continue;
      if (dist(this.x, this.y, e.x, e.y) < reach + e.r) {
        this.hitList.add(e);
        e.hurt(34 + this.dmgBonus * 2, angTo(this.x, this.y, e.x, e.y), 520, false);
        Cam.addShake(8); Audio2.sfx.hit();
      }
    }
    for (const p of Game.projectiles) {
      if (!p.friendly && dist(this.x, this.y - 30, p.x, p.y) < reach) p.dead = true;
    }
    if (this.t >= .55) { this.state = 'idle'; this.t = 0; }
  }

  stateHurt(dt) {
    this.vx = damp(this.vx, 0, 6, dt); this.vy = damp(this.vy, 0, 6, dt);
    if (this.t >= .28) { this.state = 'idle'; this.t = 0; }
  }

  /* ---------------- hasar alma ---------------- */
  hurt(dmg, fromAngle, kb = 260, unblockable = false) {
    if (this.dead || this.iframe > 0) return false;
    const incoming = angDiff(0, fromAngle + Math.PI); // saldırının geldiği yön (oyuncudan kaynağa)
    const towards = fromAngle + Math.PI;

    if (!unblockable && this.blocking(towards)) {
      if (this.parrying) {
        this.parries++; this.parryFlash = 1;
        this.rage = Math.min(this.maxRage, this.rage + 22);
        this.st = Math.min(this.maxSt, this.st + 20);
        this.iframe = .3;
        Game.hitstop = Math.max(Game.hitstop, .13);
        Cam.addShake(13);
        Audio2.sfx.parry();
        FX.ring(this.x, this.y - 40, 26, 130, .35, '#ffe9b0', 6);
        FX.spark(this.x + Math.cos(towards) * 40, this.y - 45, 18, '#ffe9b0', 340, .45, 3);
        FX.text(this.x, this.y - 140, 'PARRY!', '#ffe9b0', 22);
        /* saldıranı sersemlet */
        for (const e of Game.enemies) if (!e.dead && dist(this.x, this.y, e.x, e.y) < 190) e.stun(1.6);
        return 'parry';
      }
      const red = Math.round(dmg * (0.22 - this.blockBonus));
      this.hp -= Math.max(1, red);
      this.st -= 16;
      this.stRegenDelay = .6;
      this.vx += Math.cos(towards) * -kb * .3; this.vy += Math.sin(towards) * -kb * .3;
      Audio2.sfx.block(); Cam.addShake(6);
      FX.spark(this.x + Math.cos(towards) * 40, this.y - 45, 8, '#cfd8ff', 220, .3, 2.4);
      if (Game.settings.dmgNum) FX.text(this.x, this.y - 120, String(Math.max(1, red)), '#9fb6ff', 15);
      if (this.st <= 0) { this.st = 0; this.state = 'idle'; }
      if (this.hp <= 0) this.die();
      return 'block';
    }

    this.hp -= dmg; this.dmgTaken += dmg;
    this.iframe = .55; this.hurtFlash = 1;
    this.state = 'hurt'; this.t = 0;
    this.rage = Math.min(this.maxRage, this.rage + 8);
    this.vx = Math.cos(towards) * -kb; this.vy = Math.sin(towards) * -kb;
    Audio2.sfx.hurt(); Cam.addShake(11);
    Game.hitstop = Math.max(Game.hitstop, .07);
    FX.spark(this.x, this.y - 50, 12, '#ff5a4a', 260, .5, 3);
    if (Game.settings.dmgNum) FX.text(this.x, this.y - 125, String(dmg), '#ff6a5a', 20);
    if (this.hp <= 0) this.die();
    return 'hit';
  }

  die() {
    this.hp = 0; this.dead = true; this.state = 'dead';
    Audio2.sfx.die();
    FX.spark(this.x, this.y - 50, 26, '#c4553a', 300, .9, 4);
    Game.onPlayerDeath();
  }

  heal(v) {
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + v);
    FX.text(this.x, this.y - 120, '+' + Math.round(this.hp - before), '#8ce87f', 20);
    FX.spark(this.x, this.y - 40, 14, '#8ce87f', 160, .7, 3);
    Audio2.sfx.heal();
  }

  /* ---------------- görsel poz seçimi ---------------- */
  get pose() {
    if (this.dead) return 'dead';
    if (this.state === 'spin') return 'spin';
    if (this.state === 'block') return 'block';
    if (this.state === 'attack') return 'angry';
    if (this.state === 'hurt') return this.hp < this.maxHp * .3 ? 'sad' : 'surprised';
    if (this.state === 'dash') return 'angry';
    const danger = (Game.boss && !Game.boss.dead) ||
      Game.enemies.some(e => !e.dead && dist2(e.x, e.y, this.x, this.y) < 460 * 460);
    if (this.rage >= 45) return 'rage';
    if (this.hp < this.maxHp * .3) return 'sad';
    if (danger) return 'angry';
    if (this.idleTime > 12) return 'sleep';
    return 'idle';
  }

  draw(ctx) {
    const bob = this.state === 'run' ? Math.abs(Math.sin(this.bobT)) * 6 : Math.sin(this.bobT * .6) * 2;
    let x = this.x, y = this.y, rot = 0, h = this.h;

    if (this.state === 'attack') {
      const k = clamp(this.t / .18, 0, 1);
      const push = Math.sin(k * Math.PI) * (this.combo === 3 ? 26 : 16);
      x += Math.cos(this.face) * push; y += Math.sin(this.face) * push;
    }
    if (this.state === 'spin') rot = this.t * 22;
    if (this.dead) { rot = 0; }

    Sprites.shadow(ctx, this.x, this.y, 30 * (this.state === 'dash' ? 1.2 : 1), .42);

    /* öfke halesi */
    if (this.rage >= 45 && !this.dead) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = .12 + Math.sin(this.t * 8) * .04;
      ctx.fillStyle = '#ff4a1c';
      ctx.beginPath(); ctx.ellipse(this.x, this.y - 50, 52, 66, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
    /* parry parıltısı */
    if (this.parryFlash > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = this.parryFlash * .5; ctx.fillStyle = '#ffe9b0';
      ctx.beginPath(); ctx.arc(this.x, this.y - 50, 70, 0, TAU); ctx.fill();
      ctx.restore();
    }

    Sprites.draw(ctx, this.pose, x, y - bob, h, {
      flip: this.flip, rot,
      flash: Math.max(this.hurtFlash, this.iframe > 0 && this.state !== 'dash' ? .0 : 0),
      flashColor: '#ff6a5a',
      alpha: this.iframe > 0 && this.state !== 'dash' && !this.dead ? (Math.sin(this.t * 40) > 0 ? .55 : 1) : 1,
      squash: this.squash
    });

    /* kalkan yönü göstergesi */
    if (this.state === 'block') {
      ctx.save();
      ctx.globalAlpha = .35 + (this.parrying ? .4 : 0);
      ctx.strokeStyle = this.parrying ? '#ffe9b0' : '#9fb6ff';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(this.x, this.y - 48, 56, this.face - 1.1, this.face + 1.1);
      ctx.stroke();
      ctx.restore();
    }
  }
}

/* ==========================================================
   DÜŞMAN TÜRLERİ
   ========================================================== */
const ENEMY_TYPES = {
  grunt: { name: 'Gölge', hp: 42, spd: 158, dmg: 11, r: 20, h: 74, color: '#2a1420', eye: '#ff4a3a',
           range: 54, windup: .42, active: .12, recover: .5, kbRes: 0, xp: 1 },
  archer:{ name: 'Kül Okçusu', hp: 30, spd: 128, dmg: 9, r: 18, h: 70, color: '#20222e', eye: '#ff8a4a',
           range: 330, windup: .55, active: .1, recover: .9, kbRes: 0, ranged: true, keep: 300, xp: 1 },
  brute: { name: 'Balyoz', hp: 135, spd: 96, dmg: 24, r: 32, h: 108, color: '#241016', eye: '#ff2a1a',
           range: 86, windup: .95, active: .18, recover: .95, kbRes: .65, aoe: 108, xp: 3 },
};

class Enemy {
  constructor(type, x, y) {
    const c = ENEMY_TYPES[type];
    this.type = type; this.cfg = c;
    this.x = x; this.y = y; this.r = c.r; this.h = c.h;
    this.maxHp = Math.round(c.hp * Game.diff.hp); this.hp = this.maxHp;
    this.vx = 0; this.vy = 0;
    this.state = 'spawn'; this.t = 0;
    this.face = 0; this.flip = false;
    this.flash = 0; this.stunT = 0; this.dead = false; this.deadT = 0;
    this.cd = rnd(1.2, .3);
    this.bob = rnd(TAU);
    this.hitDone = false;
    this.wander = rnd(TAU);
  }

  update(dt, p) {
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 4);
    if (this.dead) { this.deadT += dt; this.vx = damp(this.vx, 0, 6, dt); this.vy = damp(this.vy, 0, 6, dt); this.integrate(dt); return; }

    this.bob += dt * 6;
    const d = dist(this.x, this.y, p.x, p.y);
    const toP = angTo(this.x, this.y, p.x, p.y);
    if (!['windup', 'attack'].includes(this.state)) this.face = toP;
    this.flip = Math.cos(this.face) < 0;

    if (this.stunT > 0) {
      this.stunT -= dt;
      this.vx = damp(this.vx, 0, 6, dt); this.vy = damp(this.vy, 0, 6, dt);
      if (chance(dt * 8)) FX.spark(this.x + rnd(20, -20), this.y - this.h * .8, 1, '#ffe9b0', 30, .5, 2);
      this.integrate(dt); return;
    }

    switch (this.state) {
      case 'spawn':
        this.vx = this.vy = 0;
        if (this.t > .45) { this.state = 'chase'; this.t = 0; }
        break;

      case 'chase': {
        const c = this.cfg;
        let tx = 0, ty = 0;
        if (c.ranged) {
          /* mesafeyi koru + yana kay */
          const want = c.keep;
          const push = d < want - 40 ? -1 : (d > want + 40 ? 1 : 0);
          const strafe = Math.sin(this.t * 1.1 + this.wander) * .9;
          tx = Math.cos(toP) * push + Math.cos(toP + Math.PI / 2) * strafe;
          ty = Math.sin(toP) * push + Math.sin(toP + Math.PI / 2) * strafe;
          const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
          if (this.cd <= 0 && d < c.range && !World.lineBlocked(this.x, this.y - 30, p.x, p.y - 30)) {
            this.state = 'windup'; this.t = 0; this.hitDone = false;
          }
        } else {
          /* diğer düşmanlardan hafif ayrış */
          tx = Math.cos(toP); ty = Math.sin(toP);
          for (const o of Game.enemies) {
            if (o === this || o.dead) continue;
            const dd = dist2(this.x, this.y, o.x, o.y);
            if (dd < 3600 && dd > 1) {
              const a = angTo(o.x, o.y, this.x, this.y);
              tx += Math.cos(a) * .7; ty += Math.sin(a) * .7;
            }
          }
          const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
          if (d < c.range + p.r) { this.state = 'windup'; this.t = 0; this.hitDone = false; }
        }
        this.cd = Math.max(0, this.cd - dt);
        const spd = this.cfg.spd * Game.diff.spd;
        this.vx = damp(this.vx, tx * spd, 9, dt);
        this.vy = damp(this.vy, ty * spd, 9, dt);
        break;
      }

      case 'windup':
        this.vx = damp(this.vx, 0, 8, dt); this.vy = damp(this.vy, 0, 8, dt);
        this.face = damp(this.face, this.face + angDiff(this.face, toP), 6, dt);
        if (this.t >= this.cfg.windup) { this.state = 'attack'; this.t = 0; this.doAttack(p); }
        break;

      case 'attack':
        if (!this.cfg.ranged && !this.cfg.aoe) {
          this.vx = Math.cos(this.face) * 330; this.vy = Math.sin(this.face) * 330;
          if (this.t < this.cfg.active && !this.hitDone) this.meleeCheck(p);
        } else {
          this.vx = damp(this.vx, 0, 10, dt); this.vy = damp(this.vy, 0, 10, dt);
        }
        if (this.t >= this.cfg.active) { this.state = 'recover'; this.t = 0; }
        break;

      case 'recover':
        this.vx = damp(this.vx, 0, 7, dt); this.vy = damp(this.vy, 0, 7, dt);
        if (this.t >= this.cfg.recover) { this.state = 'chase'; this.t = 0; this.cd = rnd(2.4, 1.2); }
        break;
    }
    this.integrate(dt);
  }

  integrate(dt) {
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (!this.dead) World.resolve(this);
  }

  doAttack(p) {
    const c = this.cfg;
    if (c.ranged) {
      Audio2.sfx.arrow();
      Game.projectiles.push(new Projectile(this.x, this.y - 34, this.face, 440,
        Math.round(c.dmg * Game.diff.dmg), 'arrow'));
    } else if (c.aoe) {
      Audio2.sfx.hit(); Cam.addShake(12);
      FX.ring(this.x, this.y, 20, c.aoe, .35, '#ff5a2a', 7);
      FX.dust(this.x, this.y, 18, '#5a4436');
      if (dist(this.x, this.y, p.x, p.y) < c.aoe + p.r)
        p.hurt(Math.round(c.dmg * Game.diff.dmg), angTo(this.x, this.y, p.x, p.y), 420);
    } else {
      Audio2.sfx.swing();
    }
  }

  meleeCheck(p) {
    if (dist(this.x, this.y, p.x, p.y) < this.r + p.r + 26) {
      this.hitDone = true;
      const res = p.hurt(Math.round(this.cfg.dmg * Game.diff.dmg), angTo(this.x, this.y, p.x, p.y), 300);
      if (res === 'parry') this.stun(1.6);
      FX.spark(p.x, p.y - 40, 6, '#ff7a5a', 200, .3, 2.4);
    }
  }

  stun(dur) {
    if (this.dead) return;
    this.stunT = Math.max(this.stunT, dur);
    this.state = 'chase'; this.t = 0;
    FX.text(this.x, this.y - this.h - 16, 'SERSEM', '#ffe9b0', 14);
  }

  hurt(dmg, fromAngle, kb, back) {
    if (this.dead) return;
    this.hp -= dmg; this.flash = 1;
    const k = kb * (1 - this.cfg.kbRes);
    this.vx += Math.cos(fromAngle) * k; this.vy += Math.sin(fromAngle) * k;
    if (this.stunT > 0) this.stunT = Math.max(0, this.stunT - .25);
    FX.spark(this.x, this.y - this.h * .55, back ? 14 : 8, back ? '#ffd27a' : '#ff5a4a', 260, .45, 3, fromAngle, 1.8);
    if (Game.settings.dmgNum)
      FX.text(this.x + rnd(14, -14), this.y - this.h - 8, String(dmg) + (back ? '!' : ''), back ? '#ffd27a' : '#ffffff', back ? 22 : 17);
    if (this.hp <= 0) this.die(fromAngle);
  }

  die(fromAngle) {
    this.dead = true; this.deadT = 0; this.state = 'dead';
    this.vx = Math.cos(fromAngle || 0) * 260; this.vy = Math.sin(fromAngle || 0) * 260;
    FX.spark(this.x, this.y - this.h * .5, 20, this.cfg.eye, 300, .8, 3.4);
    FX.ring(this.x, this.y, 8, 70, .4, this.cfg.eye, 3);
    Audio2.sfx.hit();
    Game.onEnemyKilled(this);
  }

  /* ---------------- çizim: gölge otağı silueti ---------------- */
  draw(ctx) {
    const c = this.cfg;
    let a = 1, yOff = 0, sc = 1;
    if (this.dead) {
      a = clamp(1 - this.deadT / .7, 0, 1);
      sc = 1 - this.deadT * .5; yOff = this.deadT * 26;
      if (sc <= .05) return;
      if (chance(.4)) FX.ember(this.x, this.y - 20, 1, c.eye);
    }
    const breathe = this.dead ? 0 : Math.sin(this.bob) * 3;
    const h = this.h * sc, w = h * .82;
    const x = this.x, y = this.y + yOff;

    Sprites.shadow(ctx, x, this.y, w * .45, .4 * a);

    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(x, y - breathe);
    if (this.state === 'windup') {
      const k = this.t / c.windup;
      ctx.translate(-Math.cos(this.face) * k * 12, -Math.sin(this.face) * k * 8);
      ctx.scale(1 + k * .1, 1 - k * .08);
    }
    ctx.scale(this.flip ? -1 : 1, 1);

    /* gövde: sivri çadır silueti, tırtıklı etek */
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.moveTo(0, -h);
    ctx.lineTo(w * .52, -h * .12);
    const seg = 6;
    for (let i = seg; i >= 0; i--) {
      const px = -w * .52 + (w * 1.04) * (i / seg);
      ctx.lineTo(px, -h * .12 + (i % 2 ? 10 : 0));
    }
    ctx.closePath(); ctx.fill();

    /* iç gölge / hacim */
    ctx.fillStyle = 'rgba(255,255,255,.05)';
    ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(w * .16, -h * .12); ctx.lineTo(-w * .2, -h * .12); ctx.closePath(); ctx.fill();

    /* tepe dikeni */
    ctx.strokeStyle = c.color; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(w * .12, -h - 18); ctx.stroke();

    /* gözler */
    const glow = this.state === 'windup' ? 1 : .65;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = c.eye; ctx.globalAlpha = a * glow;
    ctx.beginPath(); ctx.ellipse(-w * .17, -h * .55, w * .1, h * .045, .2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(w * .17, -h * .55, w * .1, h * .045, -.2, 0, TAU); ctx.fill();
    ctx.globalAlpha = a * .16;
    ctx.beginPath(); ctx.arc(0, -h * .55, w * .55, 0, TAU); ctx.fill();
    ctx.restore();

    /* türe özel eklentiler */
    if (this.type === 'archer') {
      ctx.strokeStyle = '#7d6a4a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(w * .5, -h * .5, h * .3, -1.1, 1.1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(w * .5 + Math.cos(-1.1) * h * .3, -h * .5 + Math.sin(-1.1) * h * .3);
      ctx.lineTo(w * .5 + Math.cos(1.1) * h * .3, -h * .5 + Math.sin(1.1) * h * .3);
      ctx.strokeStyle = '#cfc0a0'; ctx.lineWidth = 1.4; ctx.stroke();
    }
    if (this.type === 'brute') {
      ctx.fillStyle = '#3a2028';
      ctx.beginPath(); ctx.moveTo(-w * .5, -h * .95); ctx.lineTo(-w * .78, -h * 1.12); ctx.lineTo(-w * .42, -h * .82); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(w * .5, -h * .95); ctx.lineTo(w * .78, -h * 1.12); ctx.lineTo(w * .42, -h * .82); ctx.closePath(); ctx.fill();
      /* balyoz */
      ctx.save();
      ctx.translate(w * .55, -h * .45);
      ctx.rotate(this.state === 'windup' ? -1.1 + this.t / c.windup * 1.6 : -.5);
      ctx.fillStyle = '#4a3a30'; ctx.fillRect(-4, -6, 46, 8);
      ctx.fillStyle = '#2a2028'; ctx.fillRect(38, -18, 22, 32);
      ctx.restore();
    }
    ctx.restore();

    /* hasar parlaması */
    if (this.flash > .02) {
      ctx.save();
      ctx.globalAlpha = this.flash * .75; ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(x, y - h - breathe); ctx.lineTo(x + w * .52, y - h * .12); ctx.lineTo(x - w * .52, y - h * .12); ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    /* saldırı telegrafı */
    if (this.state === 'windup' && !this.dead) {
      const k = this.t / c.windup;
      ctx.save();
      ctx.globalAlpha = .25 + k * .5;
      ctx.strokeStyle = c.eye; ctx.lineWidth = 3;
      if (c.aoe) {
        ctx.beginPath(); ctx.arc(this.x, this.y, c.aoe * k, 0, TAU); ctx.stroke();
        ctx.globalAlpha = .05 + k * .07; ctx.fillStyle = c.eye;
        ctx.beginPath(); ctx.arc(this.x, this.y, c.aoe * k, 0, TAU); ctx.fill();
      } else if (c.ranged) {
        ctx.globalAlpha = .18 + k * .3;
        ctx.beginPath(); ctx.moveTo(this.x, this.y - 34);
        ctx.lineTo(this.x + Math.cos(this.face) * 520, this.y - 34 + Math.sin(this.face) * 520);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(this.x, this.y, 74, this.face - .5, this.face + .5); ctx.stroke();
      }
      ctx.restore();
    }

    /* can çubuğu */
    if (!this.dead && this.hp < this.maxHp) {
      const bw = Math.max(34, w * .9);
      ctx.fillStyle = 'rgba(0,0,0,.6)';
      ctx.fillRect(x - bw / 2, y - h - 26, bw, 5);
      ctx.fillStyle = this.stunT > 0 ? '#ffe9b0' : '#d8402c';
      ctx.fillRect(x - bw / 2, y - h - 26, bw * (this.hp / this.maxHp), 5);
    }
  }
}

/* ==========================================================
   PATRON : KARA OTAĞ
   ========================================================== */
class Boss {
  constructor(x, y) {
    this.x = x; this.y = y; this.r = 52; this.h = 210;
    this.maxHp = Math.round(900 * Game.diff.hp); this.hp = this.maxHp;
    this.vx = 0; this.vy = 0;
    this.state = 'intro'; this.t = 0; this.phase = 1;
    this.face = Math.PI / 2; this.flip = false;
    this.flash = 0; this.dead = false; this.deadT = 0;
    this.cd = 2.2; this.stunT = 0; this.bob = 0;
    this.isBoss = true; this.cfg = { eye: '#ff2a14', kbRes: .95, name: 'Kara Otağ' };
    this.summons = 0;
    this.hitDone = false;
    /* gövde çatlakları bir kez üretilir (her karede titrememesi için) */
    this.cracks = [];
    for (let i = 0; i < 6; i++) {
      const pts = [];
      let px = rnd(.3, -.3);
      for (let s = 0; s <= 3; s++) { pts.push([px, -.92 + s * .27]); px += rnd(.16, -.16); }
      this.cracks.push(pts);
    }
  }

  get phaseSpeed() { return this.phase === 3 ? 1.5 : this.phase === 2 ? 1.22 : 1; }

  update(dt, p) {
    this.t += dt; this.bob += dt * 2.4;
    this.flash = Math.max(0, this.flash - dt * 4);
    if (this.dead) { this.deadT += dt; return; }

    /* evre geçişleri */
    const f = this.hp / this.maxHp;
    if (this.phase === 1 && f <= .66) this.enterPhase(2);
    else if (this.phase === 2 && f <= .33) this.enterPhase(3);

    if (this.stunT > 0) { this.stunT -= dt; this.vx = damp(this.vx, 0, 6, dt); this.vy = damp(this.vy, 0, 6, dt); this.integrate(dt); return; }

    const d = dist(this.x, this.y, p.x, p.y), toP = angTo(this.x, this.y, p.x, p.y);
    if (!['charge', 'burst'].includes(this.state)) this.face = damp(this.face, this.face + angDiff(this.face, toP), 5, dt);
    this.flip = Math.cos(this.face) < 0;

    switch (this.state) {
      case 'intro':
        if (this.t > 2.2) { this.state = 'idle'; this.t = 0; }
        break;

      case 'idle': {
        const spd = 74 * this.phaseSpeed;
        const want = d > 260 ? 1 : (d < 150 ? -.6 : 0);
        this.vx = damp(this.vx, Math.cos(toP) * spd * want, 5, dt);
        this.vy = damp(this.vy, Math.sin(toP) * spd * want, 5, dt);
        this.cd -= dt * this.phaseSpeed;
        if (this.cd <= 0) this.chooseAttack(d);
        break;
      }

      case 'slamWind': {
        this.vx = damp(this.vx, 0, 8, dt); this.vy = damp(this.vy, 0, 8, dt);
        if (this.t >= .9) { this.state = 'slam'; this.t = 0; this.slam(p); }
        break;
      }
      case 'slam':
        if (this.t >= .7) { this.state = 'idle'; this.t = 0; this.cd = rnd(2.6, 1.4) / this.phaseSpeed; }
        break;

      case 'burstWind':
        this.vx = damp(this.vx, 0, 8, dt); this.vy = damp(this.vy, 0, 8, dt);
        if (chance(dt * 30)) FX.ember(this.x + rnd(50, -50), this.y - 120, 1, '#ff3a1a');
        if (this.t >= 1.0) { this.state = 'burst'; this.t = 0; this.burst(); }
        break;
      case 'burst':
        if (this.phase === 3 && this.t > .35 && !this.hitDone) { this.hitDone = true; this.burst(.4); }
        if (this.t >= .8) { this.state = 'idle'; this.t = 0; this.hitDone = false; this.cd = rnd(2.8, 1.6) / this.phaseSpeed; }
        break;

      case 'chargeWind':
        this.vx = damp(this.vx, 0, 9, dt); this.vy = damp(this.vy, 0, 9, dt);
        this.face = damp(this.face, this.face + angDiff(this.face, toP), 8, dt);
        if (this.t >= .85) {
          this.state = 'charge'; this.t = 0; this.hitDone = false;
          this.vx = Math.cos(this.face) * 720; this.vy = Math.sin(this.face) * 720;
          Audio2.sfx.roar();
        }
        break;
      case 'charge': {
        this.vx = damp(this.vx, 0, 1.6, dt); this.vy = damp(this.vy, 0, 1.6, dt);
        FX.dust(this.x, this.y, 2, '#4a2a26');
        if (dist(this.x, this.y, p.x, p.y) < this.r + p.r + 12 && !this.hitDone) {
          this.hitDone = true;
          p.hurt(Math.round(26 * Game.diff.dmg), angTo(this.x, this.y, p.x, p.y), 640);
        }
        const hitWall = World.blockedAt(this.x + this.vx * dt * 3, this.y + this.vy * dt * 3, this.r);
        if (hitWall && Math.hypot(this.vx, this.vy) > 300) {
          this.stun(2.4); Cam.addShake(22); Audio2.sfx.hit();
          FX.ring(this.x, this.y, 10, 150, .5, '#ffa06a', 6);
          FX.dust(this.x, this.y, 24, '#5a3a30');
          this.vx = this.vy = 0;
          FX.text(this.x, this.y - 220, 'SERSEMLEDİ!', '#ffe9b0', 24);
        }
        if (this.t >= 1.5) { this.state = 'idle'; this.t = 0; this.cd = rnd(2.4, 1.2) / this.phaseSpeed; }
        break;
      }

      case 'summonWind':
        this.vx = damp(this.vx, 0, 8, dt); this.vy = damp(this.vy, 0, 8, dt);
        if (this.t >= 1.1) { this.state = 'idle'; this.t = 0; this.summon(); this.cd = rnd(3.4, 2.2) / this.phaseSpeed; }
        break;
    }
    this.integrate(dt);
  }

  integrate(dt) { this.x += this.vx * dt; this.y += this.vy * dt; World.resolve(this); }

  chooseAttack(d) {
    const opts = ['slam', 'burst', 'charge'];
    if (this.phase >= 2 && Game.enemies.filter(e => !e.dead).length < 3) opts.push('summon', 'summon');
    if (d > 300) opts.push('charge', 'burst');
    if (d < 160) opts.push('slam');
    const a = pick(opts);
    this.state = a + 'Wind'; this.t = 0;
    if (a === 'slam' || a === 'charge') Audio2.tone(90, .5, 'sawtooth', .16, 60);
    if (a === 'summon') Audio2.sfx.roar();
  }

  slam(p) {
    Audio2.sfx.roar(); Cam.addShake(24);
    const rings = this.phase === 3 ? 3 : 2;
    for (let i = 0; i < rings; i++) {
      const r = 150 + i * 110;
      setTimeout(() => {
        if (this.dead) return;
        FX.ring(this.x, this.y, r - 90, r, .45, '#ff5a2a', 9);
        FX.dust(this.x, this.y, 14, '#4a2a26');
        Cam.addShake(10);
        const pd = dist(this.x, this.y, Game.player.x, Game.player.y);
        if (Math.abs(pd - r * .8) < 70)
          Game.player.hurt(Math.round(20 * Game.diff.dmg), angTo(this.x, this.y, Game.player.x, Game.player.y), 460);
      }, i * 220);
    }
  }

  burst(offset = 0) {
    Audio2.sfx.arrow();
    const n = this.phase === 3 ? 16 : this.phase === 2 ? 12 : 9;
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + offset + this.t;
      Game.projectiles.push(new Projectile(this.x, this.y - 90, a, 300, Math.round(13 * Game.diff.dmg), 'shard'));
    }
    FX.ring(this.x, this.y - 90, 10, 120, .3, '#ff3a1a', 5);
  }

  summon() {
    const n = this.phase === 3 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const sp = World.spawnPoint(Game.player, 260);
      Game.spawnEnemy(chance(.35) ? 'archer' : 'grunt', sp.x, sp.y);
    }
    FX.text(this.x, this.y - 240, 'GÖLGE ÇAĞIRDI', '#ff8a6a', 20);
  }

  enterPhase(n) {
    this.phase = n; this.state = 'idle'; this.t = 0; this.cd = 1.2;
    this.stunT = 0;
    Audio2.sfx.roar(); Cam.addShake(26);
    FX.ring(this.x, this.y - 60, 20, 380, .8, '#ff3a1a', 12);
    Game.player.iframe = Math.max(Game.player.iframe, .5);
    UI.toast(n + '. EVRE', 'quest');
    UI.setBossPhase(n);
  }

  stun(d) { this.stunT = Math.max(this.stunT, d); this.state = 'idle'; this.t = 0; this.cd = .6; }

  hurt(dmg, fromAngle, kb, back) {
    if (this.dead) return;
    const mult = this.stunT > 0 ? 1.75 : 1;
    const real = Math.round(dmg * mult);
    this.hp -= real; this.flash = 1;
    this.vx += Math.cos(fromAngle) * kb * .05; this.vy += Math.sin(fromAngle) * kb * .05;
    FX.spark(this.x + rnd(30, -30), this.y - this.h * .5, 10, mult > 1 ? '#ffd27a' : '#ff5a4a', 280, .5, 3.4, fromAngle, 1.8);
    if (Game.settings.dmgNum) FX.text(this.x + rnd(30, -30), this.y - this.h - 10, String(real), mult > 1 ? '#ffd27a' : '#fff', mult > 1 ? 24 : 18);
    UI.setBossHp(this.hp / this.maxHp);
    if (this.hp <= 0) this.die();
  }

  die() {
    this.dead = true; this.deadT = 0;
    Audio2.sfx.die(); Cam.addShake(30);
    FX.ring(this.x, this.y - 80, 20, 420, 1.2, '#ff6a2a', 14);
    Game.onBossKilled();
  }

  draw(ctx) {
    let a = 1, sc = 1;
    if (this.dead) { a = clamp(1 - this.deadT / 2.2, 0, 1); sc = 1 - this.deadT * .12; if (chance(.7)) FX.ember(this.x + rnd(80, -80), this.y - rnd(180, 0), 1, '#ff5a2a'); }
    if (sc <= .05) return;

    const h = this.h * sc, w = h * .95;
    const breathe = Math.sin(this.bob) * 6;
    const y = this.y;

    Sprites.shadow(ctx, this.x, this.y, w * .5, .45 * a);

    /* aura — yumuşak radyal, gövdeyi bastırmasın */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a * (.5 + Math.sin(this.bob * 3) * .06);
    const au = ctx.createRadialGradient(this.x, y - h * .45, h * .1, this.x, y - h * .45, h * .62);
    const k = .07 + (this.phase - 1) * .045;
    au.addColorStop(0, `rgba(255,60,20,${k})`);
    au.addColorStop(.55, `rgba(200,30,10,${k * .5})`);
    au.addColorStop(1, 'rgba(120,10,0,0)');
    ctx.fillStyle = au;
    ctx.beginPath(); ctx.ellipse(this.x, y - h * .45, w * .95, h * .8, 0, 0, TAU); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(this.x, y - breathe);
    if (this.state.endsWith('Wind')) { const k = this.t; ctx.scale(1 + Math.sin(k * 14) * .02, 1 - Math.sin(k * 14) * .02); }
    ctx.scale(this.flip ? -1 : 1, 1);

    /* gövde */
    const bodyG = ctx.createLinearGradient(-w * .5, -h, w * .5, 0);
    bodyG.addColorStop(0, '#4a2a33'); bodyG.addColorStop(.45, '#2a1620'); bodyG.addColorStop(1, '#3d2028');
    ctx.beginPath();
    ctx.moveTo(0, -h);
    ctx.lineTo(w * .58, -h * .1);
    const seg = 8;
    for (let i = seg; i >= 0; i--) ctx.lineTo(-w * .58 + w * 1.16 * (i / seg), -h * .1 + (i % 2 ? 16 : 0));
    ctx.closePath();
    ctx.fillStyle = bodyG; ctx.fill();
    ctx.strokeStyle = '#0b0508'; ctx.lineWidth = 4; ctx.stroke();     // dış hat
    /* dokusal kirişler */
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 2;
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath(); ctx.moveTo(0, -h * .97); ctx.lineTo(i * w * .16, -h * .12); ctx.stroke();
    }
    /* kenar ışığı — siluet okunsun */
    ctx.strokeStyle = 'rgba(255,140,80,.5)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(w * .58, -h * .1); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,140,80,.22)';
    ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(-w * .58, -h * .1); ctx.stroke();

    /* çatlaklar (sabit desen, evreye göre parlar) */
    ctx.strokeStyle = `rgba(255,60,26,${.3 + this.phase * .14 + Math.sin(this.bob * 2) * .06})`;
    ctx.lineWidth = 2.5;
    for (const pts of this.cracks) {
      ctx.beginPath();
      pts.forEach(([px, py], i) => { const X = px * w * .55, Y = py * h; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
      ctx.stroke();
    }
    /* taç */
    ctx.fillStyle = '#2a1218';
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * w * .18 - 8, -h * .98);
      ctx.lineTo(i * w * .18, -h * 1.16 - Math.abs(i) * -8);
      ctx.lineTo(i * w * .18 + 8, -h * .98);
      ctx.closePath(); ctx.fill();
    }
    /* gözler */
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#ff2a14'; ctx.globalAlpha = a * (this.state.endsWith('Wind') ? 1 : .7);
    ctx.beginPath(); ctx.ellipse(-w * .19, -h * .58, w * .12, h * .035, .22, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(w * .19, -h * .58, w * .12, h * .035, -.22, 0, TAU); ctx.fill();
    ctx.globalAlpha = a * .2;
    ctx.beginPath(); ctx.arc(0, -h * .58, w * .6, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.restore();

    if (this.flash > .02) {
      ctx.save(); ctx.globalAlpha = this.flash * .6; ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.moveTo(this.x, y - h - breathe); ctx.lineTo(this.x + w * .58, y - h * .1); ctx.lineTo(this.x - w * .58, y - h * .1); ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    /* telegraf */
    if (this.state === 'slamWind') {
      const k = this.t / .9;
      ctx.save(); ctx.globalAlpha = .18 + k * .35; ctx.strokeStyle = '#ff5a2a'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(this.x, this.y, 150 * k, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(this.x, this.y, 260 * k, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    if (this.state === 'chargeWind') {
      const k = this.t / .85;
      ctx.save(); ctx.globalAlpha = .16 + k * .4; ctx.strokeStyle = '#ff3a1a'; ctx.lineWidth = 6 + k * 8;
      ctx.beginPath(); ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x + Math.cos(this.face) * 700, this.y + Math.sin(this.face) * 700);
      ctx.stroke(); ctx.restore();
    }
    if (this.stunT > 0 && !this.dead) {
      ctx.save(); ctx.globalAlpha = .8; ctx.fillStyle = '#ffe9b0';
      ctx.font = 'bold 20px "Trebuchet MS"'; ctx.textAlign = 'center';
      ctx.fillText('★ ★ ★', this.x, this.y - this.h - 24);
      ctx.restore();
    }
  }
}

/* ==========================================================
   MERMİLER
   ========================================================== */
class Projectile {
  constructor(x, y, a, spd, dmg, kind = 'arrow', friendly = false) {
    this.x = x; this.y = y; this.a = a; this.spd = spd; this.dmg = dmg;
    this.kind = kind; this.friendly = friendly; this.dead = false; this.t = 0;
    this.vx = Math.cos(a) * spd; this.vy = Math.sin(a) * spd;
  }
  update(dt, p) {
    this.t += dt;
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (this.t > 4) this.dead = true;
    if (this.kind === 'shard' && chance(dt * 30)) FX.ember(this.x, this.y, 1, '#ff5a2a');
    if (World.blockedAt(this.x, this.y, 4)) {
      this.dead = true;
      FX.spark(this.x, this.y, 5, '#c9a97a', 140, .25, 2);
    }
    if (!this.friendly) {
      if (dist(this.x, this.y, p.x, p.y - 40) < p.r + 8 && !p.dead) {
        const res = p.hurt(this.dmg, this.a, 220);
        if (res === 'parry') {
          /* yansıt */
          this.friendly = true; this.dead = false;
          this.a += Math.PI; this.vx = -this.vx * 1.5; this.vy = -this.vy * 1.5; this.dmg *= 3;
          return;
        }
        this.dead = true;
      }
    } else {
      for (const e of Game.enemies) {
        if (e.dead) continue;
        if (dist(this.x, this.y, e.x, e.y - e.h * .5) < e.r + 10) {
          e.hurt(this.dmg, this.a, 200, false); this.dead = true; break;
        }
      }
      if (Game.boss && !Game.boss.dead && dist(this.x, this.y, Game.boss.x, Game.boss.y - 100) < 70) {
        Game.boss.hurt(this.dmg, this.a, 100, false); this.dead = true;
      }
    }
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y); ctx.rotate(this.a);
    if (this.kind === 'arrow') {
      ctx.strokeStyle = this.friendly ? '#ffe9b0' : '#d8c49a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(10, 0); ctx.stroke();
      ctx.fillStyle = this.friendly ? '#ffe9b0' : '#8d7a5a';
      ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(6, -4); ctx.lineTo(6, 4); ctx.closePath(); ctx.fill();
    } else {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = this.friendly ? '#ffd27a' : '#ff4a20';
      ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(0, -7); ctx.lineTo(-10, 0); ctx.lineTo(0, 7); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = .3;
      ctx.beginPath(); ctx.arc(0, 0, 16, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
}

/* ==========================================================
   YERDEKİ TOPLANABİLİRLER
   ========================================================== */
class Pickup {
  constructor(x, y, kind) {
    this.x = x; this.y = y; this.kind = kind; this.t = rnd(TAU);
    this.dead = false; this.vy = -60; this.z = 0; this.life = 0;
    this.vx = rnd(90, -90); this.vz = rnd(150, 60);
  }
  update(dt, p) {
    this.t += dt; this.life += dt;
    this.z += this.vz * dt; this.vz -= 420 * dt;
    if (this.z < 0) { this.z = 0; this.vz *= -.35; this.vx *= .5; }
    this.x += this.vx * dt; this.vx = damp(this.vx, 0, 3, dt);
    const d = dist(this.x, this.y, p.x, p.y);
    if (this.life > .35 && d < 120) {
      const a = angTo(this.x, this.y, p.x, p.y - 30);
      const pull = clamp((120 - d) / 120, 0, 1) * 620;
      this.x += Math.cos(a) * pull * dt; this.y += Math.sin(a) * pull * dt;
    }
    if (this.life > .3 && d < 34) this.collect(p);
    if (this.life > 26) this.dead = true;
  }
  collect(p) {
    this.dead = true;
    if (this.kind === 'hp') { p.heal(18); }
    else if (this.kind === 'rage') {
      p.rage = Math.min(p.maxRage, p.rage + 25);
      FX.text(p.x, p.y - 110, '+ÖFKE', '#ffb45c', 16);
      Audio2.sfx.pickup();
    } else { Game.inv.add(this.kind, 1); Audio2.sfx.pickup(); }
    FX.spark(this.x, this.y, 8, this.kind === 'hp' ? '#8ce87f' : '#ffb45c', 150, .4, 2.4);
  }
  draw(ctx) {
    const y = this.y - this.z - 14 - Math.sin(this.t * 3) * 3;
    const col = this.kind === 'hp' ? '#8ce87f' : this.kind === 'rage' ? '#ffb45c' : '#9fd8ff';
    Sprites.shadow(ctx, this.x, this.y, 10, .3);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = .3; ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(this.x, y, 18, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(this.x, y, 7, 0, TAU); ctx.fill();
    ctx.restore();
  }
}
