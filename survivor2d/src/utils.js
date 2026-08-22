// Paylaşılan küçük yardımcılar: vektör/rastgele/clamp + nadirlik renk tablosu.
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const rnd = (a = 1, b = 0) => b + Math.random() * (a - b);
export const rndInt = (a, b) => Math.floor(rnd(a, b));
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
export const lerp = (a, b, t) => a + (b - a) * t;
export const TAU = Math.PI * 2;

// Nadirlik: renk + parlaklık (glow) — HUD, envanter ve seviye atlama kartlarında ortak kullanılır.
export const RARITY = {
  Common:    { color: '#9aa4b2', glow: 'rgba(154,164,178,.35)', order: 0 },
  Rare:      { color: '#4ea8ff', glow: 'rgba(78,168,255,.45)',  order: 1 },
  Epic:      { color: '#b475ff', glow: 'rgba(180,117,255,.5)',  order: 2 },
  Legendary: { color: '#ffd479', glow: 'rgba(255,212,121,.6)',  order: 3 },
};

export function vnorm(x, y) {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
}
