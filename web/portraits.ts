import type { CrewId } from '../src/types/game';

/**
 * Crew portraits.
 *
 * Each member is drawn as a flat-vector bust in a 64x64 roundel, and gains
 * detail in three tiers as you level them: plain (1-2), equipped (3-5),
 * decorated (6-8). The portrait is the only place the player *sees* the money
 * they sank into a character, so the tier change has to be obvious at thumbnail
 * size - a new silhouette element, not a shade of the same colour.
 */

export function portraitTier(level: number): 1 | 2 | 3 {
  if (level >= 6) return 3;
  if (level >= 3) return 2;
  return 1;
}

interface Palette {
  readonly skin: string;
  readonly hair: string;
  readonly cloth: string;
  readonly clothDark: string;
  readonly accent: string;
}

const PALETTES: Readonly<Record<CrewId, Palette>> = {
  apprentice: { skin: '#e8b892', hair: '#4a2f22', cloth: '#7f8f5e', clothDark: '#5d6a45', accent: '#e5c46a' },
  carpenter: { skin: '#d9a578', hair: '#8d8378', cloth: '#8a5a3c', clothDark: '#6b432b', accent: '#c9973f' },
  gardener: { skin: '#c88b62', hair: '#241a17', cloth: '#5c8a72', clothDark: '#446553', accent: '#9fd17f' },
  curator: { skin: '#eccBa6', hair: '#cfc6bb', cloth: '#5d5a7a', clothDark: '#454162', accent: '#9fd7ff' },
};

/** Shared roundel: dusk ground, vignette, then the figure on top. */
function frame(inner: string, accent: string): string {
  return `
    <defs>
      <clipPath id="clip"><circle cx="32" cy="32" r="30"/></clipPath>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#3a2e22"/><stop offset="1" stop-color="#1d1712"/>
      </linearGradient>
    </defs>
    <circle cx="32" cy="32" r="30" fill="url(#bg)"/>
    <g clip-path="url(#clip)">${inner}</g>
    <circle cx="32" cy="32" r="30" fill="none" stroke="${accent}" stroke-width="1.4" opacity=".75"/>`;
}

function figure(palette: Palette, extras: string): string {
  return `
    <path d="M12 64c0-11 9-17 20-17s20 6 20 17z" fill="${palette.cloth}"/>
    <path d="M22 50c3 6 17 6 20 0l3 3c-4 7-22 7-26 0z" fill="${palette.clothDark}"/>
    <path d="M25 38h14v10c0 3-14 3-14 0z" fill="${palette.skin}"/>
    <ellipse cx="32" cy="28" rx="12" ry="13" fill="${palette.skin}"/>
    <circle cx="27.5" cy="27" r="1.5" fill="#2a1c14"/>
    <circle cx="36.5" cy="27" r="1.5" fill="#2a1c14"/>
    <path d="M29 33c2 1.6 4 1.6 6 0" stroke="#2a1c14" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    ${extras}`;
}

function apprentice(tier: number, p: Palette): string {
  const hair = `<path d="M20 26c0-9 6-13 12-13s12 4 12 13c-3-5-7-6-12-6s-9 1-12 6z" fill="${p.hair}"/>`;
  const cap = tier >= 2
    ? `<path d="M18 24c2-9 8-12 14-12s12 3 14 12c-9-4-19-4-28 0z" fill="${p.accent}"/>
       <rect x="17" y="23" width="30" height="3" rx="1.5" fill="#3a2f1d"/>`
    : '';
  const pencil = tier >= 3
    ? `<rect x="43" y="20" width="2.4" height="9" rx="1" transform="rotate(12 43 20)" fill="#e3d3ae"/>
       <path d="M44.8 29.4l1.6 2.6-2.6-.6z" fill="#c9973f"/>`
    : '';
  return figure(p, `${hair}${cap}${pencil}`);
}

function carpenter(tier: number, p: Palette): string {
  const hair = `<path d="M19 27c1-10 7-14 13-14s12 4 13 14c-2-4-5-6-13-6s-11 2-13 6z" fill="${p.hair}"/>
                <path d="M23 36c0 5 4 8 9 8s9-3 9-8c-3 3-15 3-18 0z" fill="${p.hair}" opacity=".85"/>`;
  const strap = tier >= 2
    ? `<path d="M22 50l6 14M42 50l-6 14" stroke="${p.clothDark}" stroke-width="3" stroke-linecap="round"/>
       <rect x="26" y="55" width="12" height="7" rx="1.5" fill="#6b4a2e"/>`
    : '';
  const pencilEar = tier >= 3
    ? `<rect x="43.5" y="26" width="6.5" height="2.2" rx="1" fill="#d9c08a"/>
       <path d="M43.5 26l-2.2 1.1 2.2 1.1z" fill="#c9973f"/>`
    : '';
  return figure(p, `${hair}${strap}${pencilEar}`);
}

function gardener(tier: number, p: Palette): string {
  const hair = `<path d="M20 28c0-10 6-14 12-14s12 4 12 14c-1-6-4-8-6-6-3-4-11-4-14 1-2-1-3 1-4 5z" fill="${p.hair}"/>`;
  const hat = tier >= 2
    ? `<ellipse cx="32" cy="20" rx="21" ry="5.5" fill="#c8a86a"/>
       <path d="M21 20c0-7 5-11 11-11s11 4 11 11z" fill="#dcbb78"/>
       <path d="M21 19.5h22" stroke="#8f7443" stroke-width="1.6"/>`
    : '';
  const sprig = tier >= 3
    ? `<path d="M46 34c4-2 7-1 8 2-3 2-6 2-8-2z" fill="${p.accent}"/>
       <path d="M46 34c-1-4 1-7 4-7 1 3 0 6-4 7z" fill="#7fb06a"/>`
    : '';
  return figure(p, `${hair}${hat}${sprig}`);
}

function curator(tier: number, p: Palette): string {
  const hair = `<path d="M19 29c0-11 6-16 13-16s13 5 13 16c-2-2-3-6-4-8-4 3-14 3-18 0-1 2-2 6-4 8z" fill="${p.hair}"/>
                <ellipse cx="32" cy="14" rx="9" ry="5" fill="${p.hair}"/>`;
  const glasses = tier >= 2
    ? `<circle cx="27.5" cy="27" r="4" fill="none" stroke="${p.accent}" stroke-width="1.3"/>
       <circle cx="36.5" cy="27" r="4" fill="none" stroke="${p.accent}" stroke-width="1.3"/>
       <path d="M31.5 27h1" stroke="${p.accent}" stroke-width="1.3"/>`
    : '';
  const brooch = tier >= 3
    ? `<circle cx="32" cy="52" r="3.2" fill="#c9973f"/><circle cx="32" cy="52" r="1.3" fill="#3a2b12"/>
       <path d="M18 47c8-4 20-4 28 0" stroke="${p.accent}" stroke-width="1.2" fill="none" opacity=".7"/>`
    : '';
  return figure(p, `${hair}${glasses}${brooch}`);
}

const DRAWERS: Readonly<Record<CrewId, (tier: number, palette: Palette) => string>> = {
  apprentice,
  carpenter,
  gardener,
  curator,
};

/** Full portrait markup at the given crew level (0 = not hired: shown dimmed). */
export function portraitSvg(id: CrewId, level: number, size = 64): string {
  const palette = PALETTES[id];
  const tier = portraitTier(level);
  // Unhired members are drawn at their *final* tier and dimmed, not blanked:
  // the card has to show what the coins would buy, or it is just a grey circle.
  const inner = DRAWERS[id](level <= 0 ? 3 : tier, palette);
  const accent = level <= 0 ? '#5a4830' : palette.accent;
  return `<svg viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true" focusable="false"
    style="${level <= 0 ? 'filter:saturate(.3) brightness(.62);' : ''}">${frame(inner, accent)}</svg>`;
}
