/**
 * Willow House, drawn as one scene that gains parts as rooms are restored.
 *
 * The whole meta layer exists to produce this picture, so it is built as a
 * single stack of layers rather than six separate illustrations: the ruin is
 * always underneath, and each restored room paints over a piece of it. That way
 * progress reads as repair, not as a slideshow.
 *
 * Layer order (back to front): sky, hills, ruin shell, per-room additions,
 * foreground grass. Room ids match `src/constants/house.ts`.
 */

const ROOM_ORDER = ['porch', 'kitchen', 'parlour', 'bedroom', 'glasshouse', 'roof'] as const;
export type RoomId = (typeof ROOM_ORDER)[number];

interface SceneOptions {
  /** Ids of rooms already restored. */
  readonly restored: readonly string[];
  readonly width?: number;
}

const SKY = `
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#241d2e"/>
      <stop offset=".55" stop-color="#4a3348"/>
      <stop offset="1" stop-color="#8a5a48"/>
    </linearGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffd98a"/><stop offset="1" stop-color="#f0a94e"/>
    </linearGradient>
    <radialGradient id="lamp" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="#ffce74" stop-opacity=".85"/>
      <stop offset="1" stop-color="#ffce74" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2f3a26"/><stop offset="1" stop-color="#1b2117"/>
    </linearGradient>
  </defs>
  <rect width="320" height="200" fill="url(#sky)"/>
  <circle cx="252" cy="150" r="26" fill="#f2b06a" opacity=".28"/>
  <path d="M0 148c34-13 60 6 92-2s52-20 86-13 46 16 66 12c30-6 46-14 76-20v75H0z" fill="#3a2b34" opacity=".9"/>
  <path d="M0 160c40-9 66 8 104 3s60-14 92-8 54 14 84 9v46H0z" fill="#2a2027"/>`;

/** The bones of the place: always visible, progressively covered up. */
const RUIN = `
  <path d="M62 178V96l68-38 68 38v82z" fill="#241c17"/>
  <path d="M62 96 130 58l68 38-8 5-60-33-60 33z" fill="#3b2d22"/>
  <path d="M56 100 130 60l74 40-6 6-68-36-68 36z" fill="#4a382a"/>
  <path d="M104 178v-40h30v40z" fill="#171310"/>
  <g fill="#2f251c">
    <rect x="78" y="112" width="26" height="24" rx="1"/>
    <rect x="150" y="112" width="26" height="24" rx="1"/>
    <rect x="112" y="76" width="22" height="18" rx="1"/>
  </g>
  <g stroke="#5b4634" stroke-width="3" stroke-linecap="round">
    <path d="M76 118l30 12M76 130l30-12"/>
    <path d="M148 118l30 12M148 130l30-12"/>
    <path d="M110 82l26 8"/>
  </g>
  <path d="M198 178v-58l40 22v36z" fill="#1e1813"/>
  <path d="M198 120l40 22-4 5-36-20z" fill="#332821"/>`;

const FOREGROUND = `
  <path d="M0 178h320v22H0z" fill="url(#grass)"/>
  <g stroke="#3f4d32" stroke-width="2" stroke-linecap="round" opacity=".8">
    <path d="M14 180v-7M22 181v-9M30 180v-6M292 180v-8M300 181v-6M308 180v-9"/>
  </g>`;

/** Each restored room paints one repair over the ruin. */
const ROOM_LAYERS: Readonly<Record<RoomId, string>> = {
  porch: `
    <path d="M96 178v-18h48v18z" fill="#4a3728"/>
    <path d="M96 160h48l-6-6h-36z" fill="#5d4633"/>
    <g stroke="#6d523a" stroke-width="3" stroke-linecap="round">
      <path d="M100 160v18M140 160v18M100 168h40"/>
    </g>
    <path d="M104 178v-34h22v34z" fill="#2a201a"/>
    <path d="M104 144h22v4h-22z" fill="#6d523a"/>
    <circle cx="122" cy="162" r="1.6" fill="#c9973f"/>
    <circle cx="150" cy="150" r="14" fill="url(#lamp)"/>
    <path d="M148 142h6v10h-6z" fill="#3a2d1f"/>
    <path d="M147.4 143h7.2l-1.2-4h-4.8z" fill="#ffce74"/>`,
  kitchen: `
    <rect x="78" y="112" width="26" height="24" rx="1" fill="url(#glass)"/>
    <path d="M78 112h26v24H78z" fill="none" stroke="#6d523a" stroke-width="2"/>
    <path d="M91 112v24M78 124h26" stroke="#6d523a" stroke-width="1.6"/>
    <circle cx="91" cy="124" r="22" fill="url(#lamp)" opacity=".55"/>`,
  parlour: `
    <rect x="150" y="112" width="26" height="24" rx="1" fill="url(#glass)"/>
    <path d="M150 112h26v24h-26z" fill="none" stroke="#6d523a" stroke-width="2"/>
    <path d="M163 112v24M150 124h26" stroke="#6d523a" stroke-width="1.6"/>
    <path d="M146 110h34v3h-34z" fill="#6d523a"/>
    <circle cx="163" cy="124" r="22" fill="url(#lamp)" opacity=".55"/>`,
  bedroom: `
    <rect x="112" y="76" width="22" height="18" rx="1" fill="url(#glass)"/>
    <path d="M112 76h22v18h-22z" fill="none" stroke="#6d523a" stroke-width="2"/>
    <path d="M123 76v18" stroke="#6d523a" stroke-width="1.6"/>
    <circle cx="123" cy="85" r="18" fill="url(#lamp)" opacity=".5"/>`,
  glasshouse: `
    <path d="M198 178v-58l40 22v36z" fill="#26333a"/>
    <path d="M198 120l40 22v6l-40-22z" fill="#4d6a72"/>
    <g stroke="#7fa8ad" stroke-width="1.4" opacity=".9">
      <path d="M206 178v-52M214 178v-47M222 178v-43M230 178v-38"/>
      <path d="M198 140h40M198 158h40"/>
    </g>
    <path d="M200 172h36v6h-36z" fill="#3f5a52"/>
    <g fill="#d98aa8"><circle cx="208" cy="170" r="2"/><circle cx="220" cy="169" r="2"/><circle cx="230" cy="170" r="2"/></g>`,
  roof: `
    <path d="M52 102 130 56l78 46-6 7-72-42-72 42z" fill="#6b4a3a"/>
    <path d="M58 104 130 62l72 42v6l-72-40-72 40z" fill="#7d5744"/>
    <g stroke="#513528" stroke-width="1.2" opacity=".8">
      <path d="M70 100l60-34M86 100l44-25M102 100l28-16M158 100l-28-16M174 100l-44-25M190 100l-60-34"/>
    </g>
    <rect x="160" y="62" width="14" height="30" rx="1.5" fill="#6b4a3a"/>
    <rect x="157" y="58" width="20" height="6" rx="1.5" fill="#7d5744"/>
    <g fill="#e9dcc9" opacity=".55">
      <circle cx="167" cy="48" r="5"/><circle cx="173" cy="38" r="6.5"/><circle cx="166" cy="27" r="8"/>
    </g>`,
};

/**
 * Builds the scene. Unrestored rooms are simply absent - the ruin underneath
 * shows through, which is what makes the "before" state legible.
 */
export function houseSceneSvg(options: SceneOptions): string {
  const restored = new Set(options.restored);
  const layers = ROOM_ORDER.filter((room) => restored.has(room))
    .map((room) => ROOM_LAYERS[room])
    .join('');

  return `<svg viewBox="0 0 320 200" width="100%" height="100%" preserveAspectRatio="xMidYMid slice"
    role="img" aria-label="Willow House, ${restored.size} of ${ROOM_ORDER.length} rooms restored">
    ${SKY}${RUIN}${layers}${FOREGROUND}
  </svg>`;
}
