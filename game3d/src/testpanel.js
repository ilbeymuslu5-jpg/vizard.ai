/* ==============================================================
   TEST PANELİ — yalnızca test paketinde bulunur
   --------------------------------------------------------------
   `node build.mjs cikti.html --test` ile derlenen pakete girer;
   normal pakette bu dosya hiç import EDİLMEZ (build.mjs farklı bir
   giriş noktası kullanır), yani üretim paketinde tek satırı yoktur.

   Oyun koduna hiç dokunmaz: her şeyi window.__game üzerinden yapar.
   Böylece test sürümü ile gerçek sürüm birebir aynı oyunu çalıştırır.
   ============================================================== */

const CSS = `
#tp{ position:fixed; z-index:11; left:0; top:0; bottom:0; width:236px;
  background:rgba(8,10,18,.93); border-right:1px solid rgba(255,255,255,.14);
  color:#e9edf5; font:12px/1.3 "Trebuchet MS",system-ui,sans-serif;
  padding:calc(env(safe-area-inset-top,0px) + 8px) 8px calc(env(safe-area-inset-bottom,0px) + 8px);
  overflow-y:auto; -webkit-overflow-scrolling:touch; display:none; }
#tp.show{ display:block; }
#tpBtn{ position:fixed; z-index:12; left:8px; top:calc(env(safe-area-inset-top,0px) + 28px);
  width:38px; height:38px; border-radius:10px; border:1px solid rgba(120,255,190,.4);
  background:rgba(10,26,20,.82); color:#7fe6bd; font-size:17px; cursor:pointer;
  display:flex; align-items:center; justify-content:center; }
#tpBtn.on{ left:244px; }
#tpBadge{ position:fixed; z-index:11; right:8px; bottom:calc(env(safe-area-inset-bottom,0px) + 6px);
  font:700 10px/1 monospace; letter-spacing:1px; color:#7fe6bd;
  background:rgba(8,10,18,.7); border:1px solid rgba(120,255,190,.3);
  border-radius:5px; padding:4px 7px; pointer-events:none; }
#tp h4{ font-size:10px; letter-spacing:2px; color:#7f8aa6; font-weight:800;
  margin:11px 0 5px; border-top:1px solid rgba(255,255,255,.09); padding-top:8px; }
#tp h4:first-of-type{ border-top:none; margin-top:6px; }
#tp .tpTitle{ font-size:12px; font-weight:900; letter-spacing:1.5px; color:#7fe6bd;
  display:flex; justify-content:space-between; align-items:center; }
#tp .row{ display:flex; flex-wrap:wrap; gap:4px; }
#tp button.b{ flex:1 1 auto; min-width:0; font-family:inherit; font-size:11px; font-weight:700;
  padding:6px 7px; border-radius:6px; border:1px solid rgba(255,255,255,.12);
  background:rgba(255,255,255,.07); color:#dbe2f0; cursor:pointer;
  white-space:normal; overflow-wrap:anywhere; line-height:1.25; }
#tp button.b:active{ transform:scale(.96); }
#tp button.b.on{ background:rgba(93,255,160,.18); border-color:#5dffa0; color:#5dffa0; }
#tp button.b.wide{ flex-basis:100%; }
#tp button.b.half{ flex-basis:calc(50% - 2px); }
#tp button.b.danger{ border-color:rgba(255,110,120,.4); color:#ff9aa4; }
#tp .note{ font-size:10px; color:#6f7896; margin-top:6px; line-height:1.35; }
`;

export function initTestPanel() {
  const g = window.__game;
  if (!g) { console.warn('test paneli: __game yok'); return; }

  document.head.appendChild(Object.assign(document.createElement('style'), { textContent: CSS }));

  const badge = document.createElement('div');
  badge.id = 'tpBadge'; badge.textContent = 'TEST SÜRÜMÜ';
  const btn = document.createElement('button');
  btn.id = 'tpBtn'; btn.textContent = '🧪'; btn.title = 'Test paneli';
  const panel = document.createElement('div');
  panel.id = 'tp';
  document.body.append(badge, btn, panel);
  btn.onclick = () => {
    panel.classList.toggle('show');
    btn.classList.toggle('on', panel.classList.contains('show'));
    if (panel.classList.contains('show')) render();
  };

  /* ---- Her şeyi aç: tüm teçhizat sahiplenilir, kasa doldurulur.
     metaSave ÇAĞRILMAZ; test sürümü gerçek kaydı bozmasın. ---- */
  function unlockAll() {
    g.META.bank = Math.max(g.META.bank, 99999);
    for (const id in g.META.up) g.META.up[id] = 5;      // kalıcı yükseltmeler tam
    g.META.heir = 6;                                    // her koşuya deri setle başla
    for (const slot of g.GEAR_SLOTS) for (const it of g.ITEMS[slot]) g.META.seen[it.id] = 1;
    g.renderShop();
  }
  unlockAll();

  /* ---- Sürekli etkiler: oyun koduna bayrak eklemeden, dışarıdan
     her karede durumu geri yazarak uygulanıyor. ---- */
  const T = { god: false, noSpawn: false, freeze: false, frozenAt: 0, savedMax: 0 };
  setInterval(() => {
    if (g.G.state !== 'PLAY') return;
    // startGame() maks. canı sıfırladığı için ölümsüzlük her karede yeniden uygulanır
    if (T.god) { if (g.P.maxHp < 99999) { T.savedMax = g.P.maxHp; g.P.maxHp = 99999; } g.P.hp = 99999; }
    if (T.noSpawn) { g.G.spawnTimer = 9; g.G.nextBossAt = g.G.time + 1e6; }
    if (T.freeze) g.G.time = T.frozenAt;
  }, 50);

  const playing = () => g.G.state === 'PLAY' || g.G.state === 'LEVELUP' || g.G.state === 'PAUSED';

  // --- eylemler ---
  const A = {
    // Yuvadaki eşyayı tur tur gez: yok -> 1..6 -> yok
    gearNext(slot) {
      const list = g.ITEMS[slot];
      const i = list.findIndex(x => x.id === g.P.eq[slot]);
      g.equipItem(slot, i + 1 >= list.length ? null : list[i + 1].id);
    },
    gearRar(rar) {                       // her yuvaya o nadirlikten bir eşya tak
      for (const slot of g.GEAR_SLOTS) {
        const it = g.ITEMS[slot].filter(x => x.rar === rar).pop();
        if (it) g.equipItem(slot, it.id);
      }
    },
    gearNone() { for (const slot of g.GEAR_SLOTS) g.equipItem(slot, null); },
    bagFill() { for (let i = 0; i < 8; i++) g.addItem(g.rollItem(g.G.level).id); },
    chestDrop() { g.dropChest(g.P.x + 1.2, g.P.z, 5); },   // yere 5 kasa bırak
    inv() { g.openInventory(); },
    weapon(id) {
      const w = g.getWeapon(id);
      if (!w) g.addWeapon(id);
      else if (w.lv < 5) w.lv++;
      else if (!w.evolved) { w.evolved = true; w.timer = 0; }
    },
    allMax() {
      for (const id in g.WEAPONS) if (!g.getWeapon(id)) g.addWeapon(id);
      for (const w of g.P.weapons) w.lv = 5;
    },
    allEvo() {
      A.allMax();
      for (const id in g.WEAPONS) { const w = g.getWeapon(id); if (w && !w.evolved) g.applyCard({ kind: 'evo', id }); }
    },
    weaponsClear() { g.P.weapons.length = 0; g.addWeapon('bolt'); },
    passivesMax() {
      for (const id in g.PASSIVES) {
        const need = g.PASSIVES[id].max - (g.P.passives[id] || 0);
        for (let i = 0; i < need; i++) g.applyCard({ kind: 'passive', id });
      }
    },
    passivesClear() { for (const id in g.PASSIVES) g.P.passives[id] = 0; g.recomputeStats(); },
    god() {
      T.god = !T.god;
      if (T.god) { T.savedMax = g.P.maxHp; g.P.maxHp = 99999; g.P.hp = 99999; }
      else { g.P.maxHp = T.savedMax || 100; g.P.hp = g.P.maxHp; }
    },
    heal() { g.P.hp = g.P.maxHp; },
    levelCard() { g.gainXp(g.G.xpNext - g.G.xp); },        // kart ekranı açılır
    level5() {                                              // kartsız 5 seviye
      for (let i = 0; i < 5; i++) { g.G.level++; g.G.xp = 0; g.G.xpNext = 6 + g.G.level * 5 + g.G.level * g.G.level * 0.35 | 0; }
    },
    spawn(n) { for (let i = 0; i < n; i++) g.spawnEnemy(null, Math.random() * Math.PI * 2); },
    boss() { g.spawnEnemy(null, Math.random() * Math.PI * 2, true); },
    finalBoss() { g.G.bossIdx = 4; g.G.finalSpawned = true; g.spawnEnemy(null, Math.random() * Math.PI * 2, true, true); },
    killAll() { for (const e of g.enemies.active.slice()) if (!e.dead) g.hitEnemy(e, 1e9, g.P.x, g.P.z, 0, false); },
    noSpawn() { T.noSpawn = !T.noSpawn; },
    time(sec) { g.G.time += sec; T.frozenAt = g.G.time; },
    freeze() { T.freeze = !T.freeze; T.frozenAt = g.G.time; },
    gold(n) { g.G.gold += n; g.META.bank += n; g.renderShop(); },
    // Yeni oyuncu deneyimini denemek için: her şey kilitli, kasa boş
    wipe() {
      try { localStorage.removeItem('hordeSurvivor3D.meta'); } catch (e) {}
      g.META.bank = 0; g.META.heir = 0; g.META.seen = {};
      for (const id in g.META.up) g.META.up[id] = 0;
      for (const slot of g.GEAR_SLOTS) g.equipItem(slot, null);
      g.P.bag.length = 0;
      g.renderShop();
    },
    unlock() { unlockAll(); g.renderGear(); },   // kilitliden geri dönüş yolu
  };

  // --- panel çizimi (etiketler her eylemden sonra tazelenir) ---
  const esc = s => String(s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  function render() {
    const gearRow = g.GEAR_SLOTS.map(slot => {
      const it = g.itemOf(g.P.eq[slot]);
      return `<button class="b half${it ? ' on' : ''}" data-a="gearNext" data-x="${slot}">` +
             `${g.GEAR[slot].icon} ${esc(it ? it.name : g.GEAR[slot].name + ': yok')}</button>`;
    }).join('');
    const wRow = Object.keys(g.WEAPONS).map(id => {
      const w = g.getWeapon(id), d = g.WEAPONS[id];
      const lv = !w ? '—' : w.evolved ? 'EVO' : 'Sv.' + w.lv;
      return `<button class="b half${w ? ' on' : ''}" data-a="weapon" data-x="${id}">${w && w.evolved ? d.evoIcon : d.icon} ${esc(d.name.split(' ')[0].slice(0, 9))} ${lv}</button>`;
    }).join('');
    panel.innerHTML = `
      <div class="tpTitle"><span>🧪 TEST PANELİ</span></div>
      <div class="note">Her şey açık: tüm teçhizat sahiplenildi, kasa dolu,
        kalıcı yükseltmeler tam.</div>

      <h4>TEÇHİZAT <span style="color:#5a6379">(tıkla: kademe gez)</span></h4>
      <div class="row">${gearRow}</div>
      <div class="row" style="margin-top:4px">
        ${['common', 'rare', 'epic', 'legend'].map(r =>
          `<button class="b" data-a="gearRar" data-x="${r}">${g.RAR[r].name}</button>`).join('')}
      </div>
      <div class="row" style="margin-top:4px">
        <button class="b half" data-a="gearNone">Hepsini çıkar</button>
        <button class="b half" data-a="bagFill">Çantaya 8 eşya</button>
        <button class="b half" data-a="chestDrop">Yere 5 kasa</button>
        <button class="b half" data-a="inv">Envanteri aç</button>
      </div>

      <h4>SİLAHLAR <span style="color:#5a6379">(tıkla: +1 sv → EVO)</span></h4>
      <div class="row">${wRow}</div>
      <div class="row" style="margin-top:4px">
        <button class="b" data-a="allMax">Hepsi Sv.5</button>
        <button class="b" data-a="allEvo">Hepsi EVO</button>
        <button class="b danger" data-a="weaponsClear">Sıfırla</button>
      </div>

      <h4>PASİFLER</h4>
      <div class="row">
        <button class="b half" data-a="passivesMax">Hepsi tam</button>
        <button class="b half danger" data-a="passivesClear">Sıfırla</button>
      </div>

      <h4>OYUNCU</h4>
      <div class="row">
        <button class="b half${T.god ? ' on' : ''}" data-a="god">${T.god ? '✓ Ölümsüz' : 'Ölümsüz'}</button>
        <button class="b half" data-a="heal">Canı doldur</button>
        <button class="b half" data-a="levelCard">+1 Sv (kart)</button>
        <button class="b half" data-a="level5">+5 Sv kartsız</button>
      </div>

      <h4>DÜŞMAN</h4>
      <div class="row">
        <button class="b half" data-a="spawn" data-x="30">+30 düşman</button>
        <button class="b half" data-a="spawn" data-x="150">+150 düşman</button>
        <button class="b half" data-a="boss">Boss çağır</button>
        <button class="b half" data-a="finalBoss">Final boss</button>
        <button class="b half danger" data-a="killAll">Hepsini öldür</button>
        <button class="b half${T.noSpawn ? ' on' : ''}" data-a="noSpawn">Doğum: ${T.noSpawn ? 'KAPALI' : 'açık'}</button>
      </div>

      <h4>ZAMAN <span style="color:#5a6379">(boss her 3 dk)</span></h4>
      <div class="row">
        <button class="b half" data-a="time" data-x="60">+1 dakika</button>
        <button class="b half" data-a="time" data-x="180">+3 dakika</button>
        <button class="b wide${T.freeze ? ' on' : ''}" data-a="freeze">Zaman: ${T.freeze ? 'DONDU' : 'akıyor'}</button>
      </div>

      <h4>DİĞER</h4>
      <div class="row">
        <button class="b half" data-a="gold" data-x="2000">+2000 altın</button>
        <button class="b half" data-a="unlock">Her şeyi aç</button>
        <button class="b wide danger" data-a="wipe">Kilitli başlat (yeni oyuncu gibi)</button>
      </div>
      <div class="note">Düşman/silah düğmeleri koşu sırasında çalışır.
        Menüdeyken önce OYUNA BAŞLA'ya bas.</div>`;

    for (const el of panel.querySelectorAll('button[data-a]')) {
      el.onclick = () => {
        const fn = A[el.dataset.a];
        if (!fn) return;
        // koşu gerektiren eylemler menüde sessizce atlanmasın
        const runOnly = ['weapon', 'allMax', 'allEvo', 'weaponsClear', 'passivesMax',
                         'passivesClear', 'god', 'heal', 'levelCard', 'level5',
                         'spawn', 'boss', 'finalBoss', 'killAll', 'time', 'freeze',
                         'gearNext', 'gearRar', 'gearNone', 'bagFill', 'chestDrop', 'inv'];
        if (runOnly.indexOf(el.dataset.a) >= 0 && !playing()) { g.startGame(); }
        fn(el.dataset.x !== undefined ? (isNaN(+el.dataset.x) ? el.dataset.x : +el.dataset.x) : undefined);
        if (g.recomputeStats) g.recomputeStats();
        render();
      };
    }
  }
  render();

  // Klavye kısayolu: T
  addEventListener('keydown', e => {
    if (e.code === 'KeyT' && !e.repeat) btn.click();
  });

  console.log('test paneli hazır — 🧪 düğmesi veya T tuşu');
}
