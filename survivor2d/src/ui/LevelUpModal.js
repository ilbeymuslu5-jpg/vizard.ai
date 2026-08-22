import { rollUpgrades } from '../data/upgrades.js';
import { RARITY } from '../utils.js';

// Seviye atlama: 3 kart, rastgele nadirlik. Kart seçilene kadar oyun duraklı
// kalır (GameLoop.paused zaten onLevelUp çağrılmadan önce true yapılmış olur).
export class LevelUpModal {
  constructor(root, game) {
    this.root = root;
    this.game = game;
    this.root.classList.add('hidden');
  }

  show() {
    const picks = rollUpgrades(3);
    this.root.innerHTML = `
      <div class="absolute inset-0 bg-black/75 backdrop-blur-sm flex flex-col items-center justify-center gap-5 p-4">
        <div class="text-2xl font-black text-yellow-300 tracking-widest [text-shadow:0_2px_8px_rgba(255,180,60,.6)]">LEVEL UP!</div>
        <div class="flex flex-col sm:flex-row gap-3 w-full max-w-sm sm:max-w-2xl" data-cards></div>
      </div>
    `;
    const cardsEl = this.root.querySelector('[data-cards]');
    for (const up of picks) {
      const r = RARITY[up.tier];
      const card = document.createElement('button');
      card.className = 'flex-1 rounded-xl border-2 p-4 flex flex-col items-center gap-2 bg-gradient-to-b from-white/10 to-white/5 backdrop-blur-md active:scale-95 transition-transform';
      card.style.borderColor = r.color;
      card.style.boxShadow = `0 0 22px ${r.glow}`;
      card.innerHTML = `
        <span class="text-[10px] font-black tracking-widest" style="color:${r.color}">${up.tier.toUpperCase()}</span>
        <span class="text-3xl">${up.icon}</span>
        <span class="text-sm font-bold text-white text-center">${up.name}</span>
        <span class="text-[11px] text-white/70 text-center">${up.desc}</span>`;
      card.addEventListener('click', () => {
        this.game.applyUpgrade(up);
        this.game.paused = false;
        this.root.classList.add('hidden');
      });
      cardsEl.appendChild(card);
    }
    this.root.classList.remove('hidden');
  }
}
