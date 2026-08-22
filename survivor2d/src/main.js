import { GameLoop } from './core/GameLoop.js';
import { HUD } from './ui/HUD.js';
import { InventoryModal } from './ui/InventoryModal.js';
import { LevelUpModal } from './ui/LevelUpModal.js';

const canvas = document.getElementById('game-canvas');
const hudRoot = document.getElementById('hud-root');
const invRoot = document.getElementById('inventory-root');
const lvlRoot = document.getElementById('levelup-root');

// GameLoop.render() kamerayı kahramana ortalar ve doğrudan canvas.width/height'i
// "ekran" olarak kullanır (WORLD_W/H yalnızca hareket sınırı/doğum yarıçapı içindir).
// Bilerek DPR supersampling YAPMIYORUZ: buffer'ı CSS boyutunun üstünde tutup ctx'i
// ayrıca ölçeklemek, GameLoop'un cv.width/height'i doğrudan ekran-uzayı sayan
// kamera matematiğiyle çakışıp koordinatları katlardı. Basit prototip için
// 1 canvas pikseli = 1 CSS pikseli yeterince net.
function fitCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width);
  canvas.height = Math.round(rect.height);
}

let game;
function boot() {
  game = new GameLoop(canvas, {
    onHudUpdate: (s) => hud.update(s),
    onLevelUp: () => levelUp.show(),
    onGameOver: (s) => {
      document.getElementById('gameover-root').classList.remove('hidden');
      document.getElementById('go-stats').textContent =
        `Level ${s.level} · ${s.kills} kills · ${Math.floor(s.time)}s`;
    },
  });
  // Prototip için başlangıç teçhizatı (test edilebilirlik açısından bir set önceden takılı)
  game.equipItem('weapons', 'rusty_sword');
  game.equipItem('helmets', 'leather_cap');

  const hud = new HUD(hudRoot, {
    onMove: (x, y) => game.setInput(x, y),
    onInventory: () => { inv.open(); game.paused = true; },
  });
  const inv = new InventoryModal(invRoot, game);
  invRoot.addEventListener('click', (e) => {
    if (e.target === invRoot.firstElementChild) { inv.close(); game.paused = false; }
  });
  const levelUp = new LevelUpModal(lvlRoot, game);

  window._survivorGame = game; // hızlı manuel test/debug için

  window.addEventListener('resize', fitCanvas);
  fitCanvas();
  game.start();

  document.getElementById('restart-btn').addEventListener('click', () => {
    document.getElementById('gameover-root').classList.add('hidden');
    game.reset();
    game.equipItem('weapons', 'rusty_sword');
    game.equipItem('helmets', 'leather_cap');
  });
}

boot();
