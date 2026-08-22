// Üst HUD (XP barı, seviye, süre, öldürme/altın) + ekranın alt yarısında
// her dokunulan yerde beliren dinamik joystick. Tailwind utility class'larıyla
// biçimlendirilir; DOM state'i burada tutulur, oyun mantığına dokunmaz.
export class HUD {
  constructor(root, { onMove, onInventory } = {}) {
    this.root = root;
    this.onMove = onMove || (() => {});
    this.onInventory = onInventory || (() => {});
    this.build();
    this.bindJoystick();
  }

  build() {
    this.root.innerHTML = `
      <div class="pointer-events-none absolute inset-x-0 top-0 p-3 flex flex-col gap-1.5 z-20">
        <div class="flex items-center gap-2">
          <div class="shrink-0 w-9 h-9 rounded-full bg-gradient-to-b from-amber-300 to-amber-600 border-2 border-yellow-200 flex items-center justify-center font-black text-[13px] text-amber-950 shadow-lg">
            <span data-lvl>1</span>
          </div>
          <div class="relative flex-1 h-5 rounded-full bg-black/50 border-2 border-yellow-400/80 overflow-hidden shadow-inner">
            <div data-xpbar class="h-full bg-gradient-to-r from-sky-400 to-blue-600 transition-[width] duration-200" style="width:0%"></div>
          </div>
        </div>
        <div class="flex items-center justify-center gap-4 text-[12px] font-bold text-white/90 [text-shadow:0_1px_2px_rgba(0,0,0,.8)]">
          <span data-time>00:00</span>
          <span class="text-rose-300">☠ <span data-kills>0</span></span>
          <span class="text-yellow-300">💰 <span data-gold>0</span></span>
        </div>
      </div>

      <div class="pointer-events-none absolute left-1/2 top-16 -translate-x-1/2 w-[70%] max-w-xs z-20">
        <div class="h-3 rounded-full bg-black/50 border border-rose-400/70 overflow-hidden">
          <div data-hpbar class="h-full bg-gradient-to-r from-rose-500 to-rose-300 transition-[width] duration-150" style="width:100%"></div>
        </div>
      </div>

      <button data-inv-btn class="pointer-events-auto absolute right-3 top-[70px] z-20 w-11 h-11 rounded-xl
        bg-white/10 backdrop-blur-md border-2 border-yellow-400/70 shadow-lg
        flex items-center justify-center text-xl active:scale-90 transition-transform">🎒</button>

      <div data-joy-zone class="absolute inset-x-0 bottom-0 h-1/2 z-10"></div>
      <div data-joy-base class="hidden absolute z-30 w-28 h-28 rounded-full border-2 border-yellow-300/70 bg-white/10 backdrop-blur-sm pointer-events-none"></div>
      <div data-joy-knob class="hidden absolute z-30 w-12 h-12 rounded-full bg-gradient-to-b from-yellow-200 to-yellow-500 border-2 border-yellow-100 shadow-lg pointer-events-none"></div>
    `;
    this.$lvl = this.root.querySelector('[data-lvl]');
    this.$xpbar = this.root.querySelector('[data-xpbar]');
    this.$hpbar = this.root.querySelector('[data-hpbar]');
    this.$time = this.root.querySelector('[data-time]');
    this.$kills = this.root.querySelector('[data-kills]');
    this.$gold = this.root.querySelector('[data-gold]');
    this.root.querySelector('[data-inv-btn]').addEventListener('click', () => this.onInventory());
  }

  update(s) {
    this.$lvl.textContent = s.level;
    this.$xpbar.style.width = Math.min(100, (s.xp / s.xpNext) * 100) + '%';
    this.$hpbar.style.width = Math.max(0, (s.hp / s.maxHp) * 100) + '%';
    this.$kills.textContent = s.kills;
    this.$gold.textContent = s.gold;
    const t = Math.floor(s.time);
    this.$time.textContent = String((t / 60) | 0).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
  }

  // Joystick: alt yarının HERHANGİ bir noktasına dokunulunca orada belirir
  // (sabit bir konumu yok), parmak sürüklendikçe taban merkezine göre yön/oran hesaplanır.
  bindJoystick() {
    const zone = this.root.querySelector('[data-joy-zone]');
    const base = this.root.querySelector('[data-joy-base]');
    const knob = this.root.querySelector('[data-joy-knob]');
    let active = false, ox = 0, oy = 0, id = null;
    const RADIUS = 56;

    const show = (x, y) => {
      base.style.left = x - 56 + 'px'; base.style.top = y - 56 + 'px';
      knob.style.left = x - 24 + 'px'; knob.style.top = y - 24 + 'px';
      base.classList.remove('hidden'); knob.classList.remove('hidden');
    };
    const move = (x, y) => {
      let dx = x - ox, dy = y - oy;
      const d = Math.hypot(dx, dy);
      if (d > RADIUS) { dx = (dx / d) * RADIUS; dy = (dy / d) * RADIUS; }
      knob.style.left = ox + dx - 24 + 'px'; knob.style.top = oy + dy - 24 + 'px';
      this.onMove(dx / RADIUS, dy / RADIUS);
    };
    const end = () => {
      active = false; id = null;
      base.classList.add('hidden'); knob.classList.add('hidden');
      this.onMove(0, 0);
    };

    zone.addEventListener('pointerdown', (e) => {
      active = true; id = e.pointerId; ox = e.clientX; oy = e.clientY;
      show(ox, oy);
      zone.setPointerCapture(id);
    });
    zone.addEventListener('pointermove', (e) => {
      if (!active || e.pointerId !== id) return;
      move(e.clientX, e.clientY);
    });
    zone.addEventListener('pointerup', (e) => { if (e.pointerId === id) end(); });
    zone.addEventListener('pointercancel', () => end());
  }
}
