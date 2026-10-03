// Act 0's geometry and clock. Every time is a grid pulse (timeline.mjs pulse(n), film time;
// the act starts at 0 s, so scene time = film time). The act ends on pulse 12 = bar 1.5, the
// cut into the mark. Points are design px (frame), page points page px.
import { pulse } from '../../../timeline.mjs';
import { SIZE } from '../mark.js';

/** Scene time of grid pulse n (pulse 0 = the first downbeat, 1.795 s). */
export const P = (n) => pulse(n);

// The page: a flat sheet on the right, running off the frame.
// k: page px → frame px (the sheet is drawn at 700 px and shown larger, bleeding off the right
// and bottom edges).
export const PAGE = { x: 1090, y: 112, w: 700, h: 992, k: 1.3 };
export const pg = ([x, y]) => [PAGE.x + x * PAGE.k, PAGE.y + y * PAGE.k];

// The diagram on the page (page px): axes, the demand line already there, the supply line
// the teacher means to draw.
export const AX = { o: [120, 560], top: 262, right: 486 };
export const DEMAND = [[166, 300], [446, 528]];
export const SUPPLY = [[166, 528], [446, 300]];
export const CROOKED_END = [430, 322]; // where the first drag lets go
export const GRAB_END = [440, 306]; // the handle dragged towards the right place
export const SNAP_END = [458, 528]; // …and snapped onto the demand line's end instead
// Kinks the clumsy line tool leaves: [fraction along, px off the line].
export const KINKS = [[0.36, 26], [0.68, -12]];

// The toolbar (page px): four generic tools, line and text box used.
export const TOOLBAR = { x: 316, y: 196, w: 208, h: 46 };
export const TOOL = (i) => [TOOLBAR.x + 32 + i * 48, TOOLBAR.y + TOOLBAR.h / 2];
export const LINE_TOOL = 0, TEXT_TOOL = 2;

// The text box: placed by the line's end, then it jumps into the text below.
export const BOX = { w: 56, h: 52, home: [462, 252], jump: [66, 586] };
export const REFLOW = 66; // px the text under the diagram is pushed down

// The hand-off (scenes/mark.js at its start): the mark tile, SIZE px, starts centred in
// the frame; its first drawn stroke is the axis V 'M118 394V106' of the 512-unit tile,
// 20 units wide, cream at .34 over the tile (#3A342E) ≈ #7C7772.
const k = SIZE / 512;
const tileX = 960 - SIZE / 2, tileY = 540 - SIZE / 2;
export const AXIS = {
  base: [tileX + 118 * k, tileY + 394 * k],
  top: [tileX + 118 * k, tileY + 106 * k],
  width: 20 * k,
  color: '#7C7772',
};

/** Hex colour mix a → b by p. */
export function mix(a, b, p) {
  const c = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [c(a), c(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * Math.min(1, Math.max(0, p))).toString(16).padStart(2, '0')).join('')}`;
}
