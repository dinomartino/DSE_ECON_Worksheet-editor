// Act 0's geometry and clock. Every time is a grid pulse (timeline.mjs pulse(n), film time;
// the act starts at 0 s, so scene time = film time). The act ends on pulse 12 = bar 1.5, the
// cut into the mark. Frame points are design px; page points are page px (the sheet is drawn
// 700 × 992 and posed by the camera below).
import { pulse } from '../../../timeline.mjs';
import { SIZE, AXIS_COLOR } from '../mark.js';

/** Scene time of grid pulse n (pulse 0 = the first downbeat, 1.795 s). */
export const P = (n) => pulse(n);

export const PAGE = { w: 700, h: 992 };

// The diagram on the page (page px), set near the sheet's left margin so the camera can hold
// the whole struggle in the sheet's left half while the statement sits on the cream beside it.
export const AX = { o: [70, 540], top: 250, right: 410 };
export const DEMAND = [[110, 288], [394, 516]];
export const SUPPLY = [[110, 516], [394, 288]];
export const CROOKED_END = [376, 312]; // where the first drag lets go
export const GRAB_END = [386, 296]; // the handle dragged towards the right place
export const SNAP_END = [404, 516]; // …and snapped onto the demand line's end instead
// Kinks the clumsy line tool leaves: [fraction along, px off the line].
export const KINKS = [[0.34, 22], [0.66, -11]];
export const LINE_W = 3.6; // page px

// The text box: placed by the line's end, then it jumps into the text below.
export const BOX = { w: 56, h: 52, home: [328, 232], jump: [24, 556] };
export const FLOW_Y = 588; // question 2's first line, pushed down by REFLOW
export const REFLOW = 58;

// The camera: the sheet's pose { k (frame px per page px), at: the frame point where the
// anchor page point sits }. A: an extreme close-up on the drag, full-bleed (the sheet's edge
// is off the frame); B: the sheet slides right so its left edge stands on C2's object edge
// (x 1008) and the statement takes the cream; the diagram centred on y 540, question 1's first
// line just above the slot's top (y 96); B2: the slow push under the struggle (about ANCHOR,
// the Q label stays left of x 1824); C: the pull-back, the whole sheet in C2's object slot.
// The sheet is seen through VIEW (scenes/open.js): C2's object rect, bleeding off the bottom.
export const ANCHOR = [244, 414];
export const CAM = {
  A: { k: 3.9, at: [940, 470] },
  B: { k: 1.75, at: [1008 + 244 * 1.75, -178 + 414 * 1.75] },
  B2: { k: 1.88 },
  C: { k: 0.9, at: [1101 + 244 * 0.9, 96 + 414 * 0.9] },
};
/** C2's object slot (lib/layout.js C2.object), open at the bottom: the sheet's window from P0.5. */
export const VIEW = { x: 1008, y: 96, r: 1824, b: 1e4 };

// The hand-off (scenes/mark.js at its start): the mark tile, SIZE px, starts centred in
// the frame; its first drawn stroke is the axis V 'M118 394V106' of the 512-unit tile,
// 20 units wide, cream at .34 over the tile (#3A342E) ≈ #7C7772.
const k = SIZE / 512;
const tileX = 960 - SIZE / 2, tileY = 540 - SIZE / 2;
export const AXIS = {
  base: [tileX + 118 * k, tileY + 394 * k],
  top: [tileX + 118 * k, tileY + 106 * k],
  width: 20 * k,
  color: AXIS_COLOR,
};

/** Hex colour mix a → b by p. */
export function mix(a, b, p) {
  const c = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [c(a), c(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * Math.min(1, Math.max(0, p))).toString(16).padStart(2, '0')).join('')}`;
}
