import { EQUIPMENT_DATABASE, SLOTS } from '../data/equipment.js';
import { RARITY } from '../utils.js';

// RPG teçhizat ızgarası: Miğfer/Göğüslük/Bot/Silah/Yüzük, her yuva için
// nadirlik renkli kart seçimi + üstte hesaplanmış toplam karakter statları.
export class InventoryModal {
  constructor(root, game) {
    this.root = root;
    this.game = game;
    this.build();
  }

  build() {
    this.root.innerHTML = `
      <div class="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center">
        <div class="w-full sm:max-w-md max-h-[88%] overflow-y-auto rounded-t-2xl sm:rounded-2xl
          bg-gradient-to-b from-slate-900/95 to-slate-950/95 border-2 border-yellow-400/60 shadow-2xl p-4">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-lg font-black text-yellow-300 tracking-wide">EQUIPMENT</h2>
            <button data-close class="w-8 h-8 rounded-full bg-white/10 border border-white/20 text-white/80 active:scale-90">✕</button>
          </div>
          <div data-stats class="grid grid-cols-4 gap-2 mb-4"></div>
          <div data-slots class="flex flex-col gap-4"></div>
        </div>
      </div>
    `;
    this.root.querySelector('[data-close]').addEventListener('click', () => this.close());
    this.$stats = this.root.querySelector('[data-stats]');
    this.$slots = this.root.querySelector('[data-slots]');
    this.root.classList.add('hidden');
  }

  open() { this.refresh(); this.root.classList.remove('hidden'); }
  close() { this.root.classList.add('hidden'); }

  refresh() {
    const s = this.game.stats;
    const statCard = (label, val, icon) => `
      <div class="rounded-lg bg-white/5 border border-yellow-400/30 backdrop-blur-md py-2 text-center">
        <div class="text-[10px] text-white/60">${icon} ${label}</div>
        <div class="text-sm font-bold text-yellow-200">${Math.round(val)}</div>
      </div>`;
    this.$stats.innerHTML =
      statCard('ATK', s.atk, '⚔️') + statCard('DEF', s.def, '🛡️') +
      statCard('HP', s.maxHp, '❤️') + statCard('SPD', s.spd, '👟');

    this.$slots.innerHTML = '';
    for (const slot of SLOTS) {
      const wrap = document.createElement('div');
      const equippedId = this.game.equip[slot.key];
      wrap.innerHTML = `<div class="text-[11px] font-bold text-white/70 tracking-wide mb-1.5">${slot.icon} ${slot.label.toUpperCase()}</div>
        <div class="grid grid-cols-4 gap-2" data-row></div>`;
      const row = wrap.querySelector('[data-row]');
      for (const it of EQUIPMENT_DATABASE[slot.key]) {
        const r = RARITY[it.tier];
        const on = it.id === equippedId;
        const card = document.createElement('button');
        card.className = `relative flex flex-col items-center gap-1 rounded-lg p-2 border-2 backdrop-blur-md transition-transform active:scale-95 ${on ? 'bg-white/15' : 'bg-white/5'}`;
        card.style.borderColor = r.color;
        card.style.boxShadow = on ? `0 0 14px ${r.glow}` : 'none';
        card.innerHTML = `
          ${on ? '<span class="absolute -top-1.5 -right-1.5 text-[10px] bg-emerald-400 text-emerald-950 rounded-full w-4 h-4 flex items-center justify-center font-black">✓</span>' : ''}
          <span class="text-xl">${it.icon}</span>
          <span class="text-[9px] font-semibold text-center leading-tight" style="color:${r.color}">${it.name}</span>`;
        card.addEventListener('click', () => {
          this.game.equipItem(slot.key, on ? null : it.id);
          this.refresh();
        });
        row.appendChild(card);
      }
      this.$slots.appendChild(wrap);
    }
  }
}
