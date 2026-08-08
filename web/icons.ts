import type { ItemType } from '../src/types/game';

/**
 * Hand-drawn emblems for each merge chain.
 *
 * Deliberately not emoji: emoji render differently on every platform, cannot
 * inherit the brass/patina palette, and would undercut the workshop look. These
 * are tiny two-tone SVGs on a 24x24 grid - `currentColor` for the body so a
 * tile's level ramp tints the emblem, plus a fixed shade for depth.
 */

interface Emblem {
  /** Markup inside a 0 0 24 24 viewBox. */
  readonly body: string;
}

const EMBLEMS: Readonly<Record<ItemType, Emblem>> = {
  nail: {
    body: `
      <rect x="6.6" y="3.4" width="10.8" height="2.6" rx=".8" fill="currentColor"/>
      <path d="M10.4 6h3.2l-.7 9.6L12 20.6l-.9-5z" fill="currentColor" opacity=".78"/>
      <path d="M6.6 5.2h10.8" stroke="rgba(0,0,0,.32)" stroke-width="1" fill="none"/>`,
  },
  plank: {
    body: `
      <rect x="2.5" y="7" width="19" height="10" rx="1.2" fill="currentColor"/>
      <path d="M5 10.2h14M5 13.8h11" stroke="rgba(0,0,0,.32)" stroke-width="1.1" stroke-linecap="round"/>
      <circle cx="18.2" cy="13.6" r="1" fill="rgba(0,0,0,.3)"/>`,
  },
  hammer: {
    body: `
      <path d="M4.2 6.6 8 3.4l5.6 4.2-2.2 2.9z" fill="currentColor"/>
      <rect x="10.8" y="9.4" width="3" height="11.2" rx="1.3" transform="rotate(-24 10.8 9.4)" fill="currentColor" opacity=".7"/>
      <path d="M4.2 6.6 8 3.4" stroke="rgba(0,0,0,.35)" stroke-width="1.1"/>`,
  },
  paint: {
    body: `
      <path d="M6 8h12v10.5a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" fill="currentColor"/>
      <rect x="5" y="5.2" width="14" height="3.2" rx="1" fill="currentColor" opacity=".65"/>
      <path d="M8 13.5c2.4 1.3 5.6 1.3 8 0v4.2c-2.4 1.2-5.6 1.2-8 0z" fill="rgba(0,0,0,.3)"/>`,
  },
  flower: {
    body: `
      <path d="M12 3.6c1.9 0 3 1.5 3 3s-1.1 2.6-3 2.6-3-1.1-3-2.6 1.1-3 3-3z" fill="currentColor"/>
      <path d="M6.6 8.1c1.4-1.3 3.2-.8 4.2.3M17.4 8.1c-1.4-1.3-3.2-.8-4.2.3" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>
      <circle cx="12" cy="10.4" r="1.7" fill="rgba(0,0,0,.35)"/>
      <path d="M12 11.8V21M12 16c-2.2 0-3.4-1.2-3.8-2.8 1.8-.5 3.2.4 3.8 1.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none" opacity=".75"/>`,
  },
  toolbox: {
    body: `
      <path d="M9 6.4A3 3 0 0 1 12 4a3 3 0 0 1 3 2.4" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/>
      <rect x="3" y="8.4" width="18" height="10.6" rx="1.8" fill="currentColor"/>
      <path d="M3 12.6h18" stroke="rgba(0,0,0,.34)" stroke-width="1.3"/>
      <rect x="10.2" y="10.8" width="3.6" height="3.6" rx=".8" fill="rgba(0,0,0,.34)"/>`,
  },
  lumberPile: {
    body: `
      <rect x="2.5" y="12.6" width="19" height="4.6" rx="1" fill="currentColor"/>
      <rect x="4.5" y="7.4" width="15" height="4.6" rx="1" fill="currentColor" opacity=".78"/>
      <circle cx="8" cy="9.7" r="1.1" fill="rgba(0,0,0,.32)"/>
      <circle cx="16" cy="14.9" r="1.1" fill="rgba(0,0,0,.32)"/>`,
  },
  paintCan: {
    body: `
      <rect x="5" y="7.6" width="14" height="12" rx="1.6" fill="currentColor"/>
      <path d="M5 9.6c3.6-2.6 10.4-2.6 14 0" stroke="rgba(0,0,0,.32)" stroke-width="1.2" fill="none"/>
      <path d="M6.4 7.4C7.6 4.6 16.4 4.6 17.6 7.4" stroke="currentColor" stroke-width="1.5" fill="none" opacity=".7"/>
      <rect x="8.6" y="12.4" width="6.8" height="3.4" rx=".8" fill="rgba(0,0,0,.3)"/>`,
  },
};

export function emblemSvg(itemType: ItemType, size = 30): string {
  const emblem = EMBLEMS[itemType];
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false">${emblem.body}</svg>`;
}
