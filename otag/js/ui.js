/* ============================================================
   ui.js : HUD, menüler, envanter, görev defteri, diyalog
   ============================================================ */
'use strict';

const UI = {
  el: {}, current: null, _toastT: 0, _poseT: 0, _pose: null, _hint: '',

  init() {
    const $ = id => document.getElementById(id);
    this.el = {
      hud: $('hud'), portrait: $('hudPortrait'),
      barHp: $('barHp'), barSt: $('barSt'), barRg: $('barRg'),
      hpText: $('hpText'), rgText: $('rgText'),
      zoneName: $('zoneName'), questTrack: $('questTrack'),
      bossBar: $('bossBar'), bossHp: $('bossHp'), bossPhase: $('bossPhase'),
      hotbar: $('hotbar'), toasts: $('toasts'), hint: $('hint'),
      dialogue: $('dialogue'), dlgName: $('dlgName'), dlgText: $('dlgText'), dlgPortrait: $('dlgPortrait'),
      fade: $('fade'),
      invGrid: $('invGrid'), invStats: $('invStats'), invDesc: $('invDesc'),
      journalList: $('journalList'),
      deadSub: $('deadSub'), winSub: $('winSub'),
      btnContinue: $('btnContinue'),
    };
    this.screens = {
      menu: $('scrMenu'), pause: $('scrPause'), settings: $('scrSettings'),
      help: $('scrHelp'), credits: $('scrCredits'), inv: $('scrInv'),
      journal: $('scrJournal'), dead: $('scrDead'), win: $('scrWin'), load: $('scrLoad'),
    };

    /* menü düğmeleri */
    document.querySelectorAll('.screen nav.menu button').forEach(b => {
      b.addEventListener('click', () => { Audio2.ensure(); Audio2.sfx.ui(); Game.uiAction(b.dataset.act); });
    });

    /* hotbar kutuları */
    for (let i = 0; i < 5; i++) {
      const d = document.createElement('div');
      d.className = 'slot empty';
      d.innerHTML = `<span class="num">${i + 1}</span>`;
      d.addEventListener('click', () => Inventory.useSlot(i));
      this.el.hotbar.appendChild(d);
    }

    this.bindSettings();
    this.refreshHotbar();
  },

  /* ------------------ ekranlar ------------------ */
  open(name) {
    for (const k in this.screens) this.screens[k].classList.add('hidden');
    if (name) { this.screens[name].classList.remove('hidden'); this.current = name; }
    else this.current = null;
    if (name === 'inv') this.buildInventory();
    if (name === 'journal') this.buildJournal();
    if (name === 'menu') this.el.btnContinue.disabled = !Save.exists();
  },
  closeAll() { this.open(null); },
  showHud(on) { this.el.hud.classList.toggle('hidden', !on); },

  fade(on) { this.el.fade.classList.toggle('on', on); },

  /* ------------------ HUD ------------------ */
  update(p, dt) {
    if (!p) return;
    this.el.barHp.style.transform = `scaleX(${clamp(p.hp / p.maxHp, 0, 1)})`;
    this.el.barSt.style.transform = `scaleX(${clamp(p.st / p.maxSt, 0, 1)})`;
    this.el.barRg.style.transform = `scaleX(${clamp(p.rage / p.maxRage, 0, 1)})`;
    this.el.hpText.textContent = `${Math.max(0, Math.ceil(p.hp))} / ${p.maxHp}`;
    this.el.rgText.textContent = p.rage >= 45 ? 'KIZIL GİRDAP HAZIR — Q' : 'ÖFKE';

    if (this._poseT > 0) { this._poseT -= dt; }
    const pose = this._poseT > 0 ? this._pose : p.pose;
    if (this.el.portrait.dataset.pose !== pose) this.el.portrait.dataset.pose = pose;
  },

  portraitPose(pose, secs) { this._pose = pose; this._poseT = secs; },

  setZone(name) { this.el.zoneName.textContent = name; },

  toast(msg, cls = '') {
    const d = document.createElement('div');
    d.className = 'toast ' + cls;
    d.textContent = msg;
    this.el.toasts.appendChild(d);
    setTimeout(() => { d.style.transition = 'opacity .4s, transform .4s'; d.style.opacity = 0; d.style.transform = 'translateY(-10px)'; }, 1700);
    setTimeout(() => d.remove(), 2200);
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
  },

  hint(text) {
    if (text === this._hint) return;
    this._hint = text;
    if (text) { this.el.hint.innerHTML = text; this.el.hint.classList.add('on'); }
    else this.el.hint.classList.remove('on');
  },

  refreshHotbar() {
    if (!this.el.hotbar) return;
    for (let i = 0; i < 5; i++) {
      const slot = this.el.hotbar.children[i];
      const s = Inventory.slots[i];
      if (!s) { slot.className = 'slot empty'; slot.innerHTML = `<span class="num">${i + 1}</span>`; continue; }
      const def = ITEMS[s.kind];
      slot.className = 'slot';
      slot.innerHTML = `<span class="num">${i + 1}</span>${def.icon}<span class="cnt">${s.n}</span>`;
      slot.title = def.name;
    }
  },
  flashSlot(i) {
    const el = this.el.hotbar.children[i];
    if (!el) return;
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  },

  /* ------------------ görev takibi ------------------ */
  refreshQuest() {
    const id = Quests.active;
    if (!id) { this.el.questTrack.innerHTML = ''; return; }
    const d = Quests.def(id), s = Quests.state[id];
    let html = `<div class="qt-title">${d.title}</div>`;
    for (const o of d.objs) {
      const have = s.prog[o.id] || 0;
      const done = have >= o.need;
      html += `<div class="qt-obj ${done ? 'done' : ''}">${o.text}${o.need > 1 ? ` (${have}/${o.need})` : ''}</div>`;
    }
    this.el.questTrack.innerHTML = html;
  },

  buildJournal() {
    let html = '';
    for (const d of QUEST_DEFS) {
      const s = Quests.state[d.id];
      if (!s.started) continue;
      html += `<div class="jq ${s.done ? 'done' : ''}"><h3>${d.title}</h3><div class="jdesc">${d.desc}</div>`;
      for (const o of d.objs) {
        const have = s.prog[o.id] || 0, done = have >= o.need;
        html += `<div class="jobj ${done ? 'done' : ''}">◆ ${o.text} — ${have}/${o.need}</div>`;
      }
      if (s.done && d.reward) html += `<div class="jobj" style="color:#ffcf7d">✦ ${d.reward}</div>`;
      html += '</div>';
    }
    this.el.journalList.innerHTML = html || '<div class="jq">Henüz görev yok.</div>';
  },

  /* ------------------ envanter ------------------ */
  buildInventory() {
    const g = this.el.invGrid;
    g.innerHTML = '';
    for (let i = 0; i < Inventory.SIZE; i++) {
      const s = Inventory.slots[i];
      const d = document.createElement('div');
      d.className = 'slot' + (s ? '' : ' empty');
      if (s) {
        const def = ITEMS[s.kind];
        d.innerHTML = `${def.icon}<span class="cnt">${s.n}</span>`;
        d.addEventListener('mouseenter', () => { this.el.invDesc.innerHTML = `<b style="color:#ffcf7d">${def.name}</b> — ${def.desc}`; });
        d.addEventListener('click', () => { Inventory.useSlot(i); this.buildInventory(); });
      }
      g.appendChild(d);
    }
    const p = Game.player;
    this.el.invStats.innerHTML = p ? `
      <div><b>Can:</b> ${Math.ceil(p.hp)} / ${p.maxHp}</div>
      <div><b>Mızrak hasarı:</b> ${17 + p.dmgBonus} <span style="opacity:.6">(ağır: ${30 + p.dmgBonus})</span></div>
      <div><b>Blok azaltma:</b> %${Math.round((0.78 + p.blockBonus) * 100)}</div>
      <div><b>Öldürülen gölge:</b> ${Game.kills}</div>
      <div><b>Parry:</b> ${p.parries}</div>
      <div><b>Süre:</b> ${UI.fmtTime(Game.playtime)}</div>` : '';
    this.el.invDesc.textContent = 'Bir eşyanın üzerine gel.';
  },

  fmtTime(s) {
    const m = Math.floor(s / 60), ss = Math.floor(s % 60);
    return `${m}:${String(ss).padStart(2, '0')}`;
  },

  /* ------------------ patron çubuğu ------------------ */
  showBoss(on) { this.el.bossBar.classList.toggle('hidden', !on); },
  setBossHp(f) { this.el.bossHp.style.transform = `scaleX(${clamp(f, 0, 1)})`; },
  setBossPhase(n) { this.el.bossPhase.textContent = n + '. EVRE'; },

  /* ------------------ diyalog ------------------ */
  dlg: null,
  dialogue(name, lines, pose, onEnd) {
    this.dlg = { name, lines, i: 0, char: 0, t: 0, onEnd, pose: pose || 'happy' };
    this.el.dlgName.textContent = name;
    this.el.dlgPortrait.dataset.pose = this.dlg.pose;
    this.el.dialogue.classList.remove('hidden');
  },
  dlgUpdate(dt) {
    const d = this.dlg; if (!d) return;
    const line = d.lines[d.i];
    if (d.char < line.length) {
      d.t += dt;
      while (d.t > 0.018 && d.char < line.length) { d.t -= 0.018; d.char++; }
      this.el.dlgText.textContent = line.slice(0, d.char);
    }
    if (Input.hit(' ', 'e') || Input.justL) {
      if (d.char < line.length) { d.char = line.length; this.el.dlgText.textContent = line; }
      else {
        d.i++; d.char = 0;
        if (d.i >= d.lines.length) { this.closeDialogue(); }
      }
    }
  },
  closeDialogue() {
    const cb = this.dlg && this.dlg.onEnd;
    this.dlg = null;
    this.el.dialogue.classList.add('hidden');
    cb && cb();
  },

  /* ------------------ ayarlar ------------------ */
  bindSettings() {
    const $ = id => document.getElementById(id);
    const s = Game.settings;
    const bind = (el, valEl, key, apply) => {
      el.value = Math.round(s[key] * 100);
      valEl.textContent = Math.round(s[key] * 100) + '%';
      el.addEventListener('input', () => {
        s[key] = el.value / 100;
        valEl.textContent = el.value + '%';
        apply && apply();
        Save.writeSettings(s);
      });
    };
    bind($('setMaster'), $('valMaster'), 'master', () => { Audio2.vol.master = s.master; Audio2.applyVolumes(); });
    bind($('setSfx'), $('valSfx'), 'sfx', () => { Audio2.vol.sfx = s.sfx; Audio2.applyVolumes(); });
    bind($('setMusic'), $('valMusic'), 'music', () => { Audio2.vol.music = s.music; Audio2.applyVolumes(); });
    bind($('setShake'), $('valShake'), 'shake', () => { Cam.userShake = s.shake; });

    const diff = $('setDiff');
    diff.value = s.difficulty;
    diff.addEventListener('change', () => { s.difficulty = diff.value; Game.applyDifficulty(); Save.writeSettings(s); });

    const dn = $('setDmgNum');
    dn.checked = s.dmgNum;
    dn.addEventListener('change', () => { s.dmgNum = dn.checked; Save.writeSettings(s); });
  }
};
