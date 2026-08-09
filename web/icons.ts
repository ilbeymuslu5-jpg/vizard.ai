import type { ItemType } from '../src/types/game';

/**
 * Item emblems, stored as primitive shapes rather than markup.
 *
 * The 3D board paints these into a canvas to texture the top of each chip, and
 * the DOM (request chips, shop rows) renders the same data as SVG. One source,
 * two renderers - so a chip on the board and its request chip can never drift.
 *
 * Deliberately not emoji: emoji render differently on every platform, cannot
 * take the chain palette, and would undercut the workshop look. Coordinates
 * live on a 24x24 grid.
 */

/** Sentinel meaning "the chain's colour", substituted at render time. */
const CC = '@chain';

type Shape =
  | { k: 'path'; d: string; fill?: string; stroke?: string; w?: number; op?: number }
  | { k: 'rect'; x: number; y: number; w: number; h: number; r?: number; fill: string; op?: number }
  | { k: 'circle'; cx: number; cy: number; r: number; fill: string; op?: number };

const SHADE = 'rgba(0,0,0,.32)';
const SHADE_SOFT = 'rgba(0,0,0,.3)';

const EMBLEMS: Readonly<Record<ItemType, readonly Shape[]>> = {
  nail: [
    { k: 'rect', x: 6.6, y: 3.4, w: 10.8, h: 2.6, r: 0.8, fill: CC },
    { k: 'path', d: 'M10.4 6h3.2l-.7 9.6L12 20.6l-.9-5z', fill: CC, op: 0.78 },
    { k: 'path', d: 'M6.6 5.2h10.8', stroke: SHADE, w: 1 },
  ],
  plank: [
    { k: 'rect', x: 2.5, y: 7, w: 19, h: 10, r: 1.2, fill: CC },
    { k: 'path', d: 'M5 10.2h14', stroke: SHADE, w: 1.1 },
    { k: 'path', d: 'M5 13.8h11', stroke: SHADE, w: 1.1 },
    { k: 'circle', cx: 18.2, cy: 13.6, r: 1, fill: SHADE_SOFT },
  ],
  hammer: [
    { k: 'path', d: 'M4.2 6.6 8 3.4l5.6 4.2-2.2 2.9z', fill: CC },
    { k: 'path', d: 'M10.4 9.6l2.8 1.2-3.4 9.6-2.8-1.2z', fill: CC, op: 0.72 },
    { k: 'path', d: 'M4.2 6.6 8 3.4', stroke: 'rgba(0,0,0,.35)', w: 1.1 },
  ],
  paint: [
    { k: 'path', d: 'M6 8h12v10.5a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z', fill: CC },
    { k: 'rect', x: 5, y: 5.2, w: 14, h: 3.2, r: 1, fill: CC, op: 0.65 },
    { k: 'path', d: 'M8 13.5c2.4 1.3 5.6 1.3 8 0v4.2c-2.4 1.2-5.6 1.2-8 0z', fill: SHADE_SOFT },
  ],
  flower: [
    { k: 'path', d: 'M12 3.6c1.9 0 3 1.5 3 3s-1.1 2.6-3 2.6-3-1.1-3-2.6 1.1-3 3-3z', fill: CC },
    { k: 'path', d: 'M6.6 8.1c1.4-1.3 3.2-.8 4.2.3', stroke: CC, w: 2 },
    { k: 'path', d: 'M17.4 8.1c-1.4-1.3-3.2-.8-4.2.3', stroke: CC, w: 2 },
    { k: 'circle', cx: 12, cy: 10.4, r: 1.7, fill: 'rgba(0,0,0,.35)' },
    { k: 'path', d: 'M12 11.8V21', stroke: CC, w: 1.6, op: 0.75 },
    { k: 'path', d: 'M12 16c-2.2 0-3.4-1.2-3.8-2.8 1.8-.5 3.2.4 3.8 1.6', stroke: CC, w: 1.6, op: 0.75 },
  ],
  toolbox: [
    { k: 'path', d: 'M9 6.4A3 3 0 0 1 12 4a3 3 0 0 1 3 2.4', stroke: CC, w: 1.8 },
    { k: 'rect', x: 3, y: 8.4, w: 18, h: 10.6, r: 1.8, fill: CC },
    { k: 'path', d: 'M3 12.6h18', stroke: 'rgba(0,0,0,.34)', w: 1.3 },
    { k: 'rect', x: 10.2, y: 10.8, w: 3.6, h: 3.6, r: 0.8, fill: 'rgba(0,0,0,.34)' },
  ],
  lumberPile: [
    { k: 'rect', x: 2.5, y: 12.6, w: 19, h: 4.6, r: 1, fill: CC },
    { k: 'rect', x: 4.5, y: 7.4, w: 15, h: 4.6, r: 1, fill: CC, op: 0.78 },
    { k: 'circle', cx: 8, cy: 9.7, r: 1.1, fill: SHADE },
    { k: 'circle', cx: 16, cy: 14.9, r: 1.1, fill: SHADE },
  ],
  paintCan: [
    { k: 'rect', x: 5, y: 7.6, w: 14, h: 12, r: 1.6, fill: CC },
    { k: 'path', d: 'M5 9.6c3.6-2.6 10.4-2.6 14 0', stroke: SHADE, w: 1.2 },
    { k: 'path', d: 'M6.4 7.4C7.6 4.6 16.4 4.6 17.6 7.4', stroke: CC, w: 1.5, op: 0.7 },
    { k: 'rect', x: 8.6, y: 12.4, w: 6.8, h: 3.4, r: 0.8, fill: SHADE_SOFT },
  ],
  gardenBed: [
    { k: 'path', d: 'M3 14.6h18l-1.6 5.4H4.6z', fill: CC },
    { k: 'path', d: 'M3 14.6h18l-1 3.2H4z', fill: 'rgba(0,0,0,.28)' },
    { k: 'path', d: 'M8 14.4c-.4-3.4 1-5.6 3-6.4', stroke: CC, w: 1.5 },
    { k: 'path', d: 'M16 14.4c.4-3.2-.8-5.4-2.6-6.2', stroke: CC, w: 1.5 },
    { k: 'circle', cx: 10.6, cy: 6.6, r: 2.2, fill: CC },
    { k: 'circle', cx: 14.6, cy: 8.4, r: 1.8, fill: CC, op: 0.75 },
  ],
};

/**
 * Chain identity colours.
 *
 * The emblem keeps its chain colour at every level while the frame (DOM) or the
 * chip rim (3D) carries the level ramp. Splitting the two means a glance answers
 * both questions at once — what is it, and how far along — instead of one hue
 * trying to say both.
 */
export const CHAIN_COLORS: Readonly<Record<ItemType, string>> = {
  nail: '#d3dae1',
  plank: '#d9a05f',
  hammer: '#b9c6d2',
  paint: '#7fc9cf',
  flower: '#eb9ab8',
  toolbox: '#e8b45c',
  lumberPile: '#e8b45c',
  paintCan: '#e8b45c',
  gardenBed: '#e8b45c',
};

function resolve(color: string | undefined, chain: string): string | undefined {
  return color === CC ? chain : color;
}

// ---------------------------------------------------------------------------
// SVG renderer (DOM)
// ---------------------------------------------------------------------------

export function emblemSvg(itemType: ItemType, size = 30, color = 'currentColor'): string {
  const body = EMBLEMS[itemType]
    .map((shape) => {
      const opacity = shape.op !== undefined ? ` opacity="${shape.op}"` : '';
      if (shape.k === 'rect') {
        return `<rect x="${shape.x}" y="${shape.y}" width="${shape.w}" height="${shape.h}" rx="${
          shape.r ?? 0
        }" fill="${resolve(shape.fill, color)}"${opacity}/>`;
      }
      if (shape.k === 'circle') {
        return `<circle cx="${shape.cx}" cy="${shape.cy}" r="${shape.r}" fill="${resolve(
          shape.fill,
          color,
        )}"${opacity}/>`;
      }
      const fill = shape.fill !== undefined ? resolve(shape.fill, color) : 'none';
      const stroke =
        shape.stroke !== undefined
          ? ` stroke="${resolve(shape.stroke, color)}" stroke-width="${shape.w ?? 1}" stroke-linecap="round"`
          : '';
      return `<path d="${shape.d}" fill="${fill}"${stroke}${opacity}/>`;
    })
    .join('');

  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false">${body}</svg>`;
}

// ---------------------------------------------------------------------------
// Canvas renderer (3D chip textures)
// ---------------------------------------------------------------------------

/**
 * Paints an emblem into a 2D context, scaled from the 24x24 grid to `size`.
 * Used to build the chip-top textures for the WebGL board.
 */
export function drawEmblem(
  ctx: CanvasRenderingContext2D,
  itemType: ItemType,
  size: number,
  color: string,
): void {
  const scale = size / 24;
  ctx.save();
  ctx.scale(scale, scale);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  for (const shape of EMBLEMS[itemType]) {
    ctx.globalAlpha = shape.op ?? 1;
    if (shape.k === 'rect') {
      ctx.fillStyle = resolve(shape.fill, color) ?? color;
      ctx.beginPath();
      ctx.roundRect(shape.x, shape.y, shape.w, shape.h, shape.r ?? 0);
      ctx.fill();
      continue;
    }
    if (shape.k === 'circle') {
      ctx.fillStyle = resolve(shape.fill, color) ?? color;
      ctx.beginPath();
      ctx.arc(shape.cx, shape.cy, shape.r, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    const path = new Path2D(shape.d);
    if (shape.fill !== undefined) {
      ctx.fillStyle = resolve(shape.fill, color) ?? color;
      ctx.fill(path);
    }
    if (shape.stroke !== undefined) {
      ctx.strokeStyle = resolve(shape.stroke, color) ?? color;
      ctx.lineWidth = shape.w ?? 1;
      ctx.stroke(path);
    }
  }

  ctx.restore();
  ctx.globalAlpha = 1;
}
