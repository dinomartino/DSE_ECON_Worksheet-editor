// Act 5's measurements and camera. Footage is 1440×900 CSS (frames 2880×1800): every rect
// here is in FRAME px of the clip frames (measured from bank-screen 2.5 s / check-terms 1.6 s),
// so canvas crops land on whole pixels. CSS px = frame px / 2.
import { lerp, prog, inOutSoft } from '../../lib/ease.js';
import { PULSE } from '../../../timeline.mjs';

/** Scene-local seconds of pulse n (the act starts on bar 20, so pulses are on the grid). */
export const P = (n) => n * PULSE;

// The window card the footage plays in (design px), under a one-line headline.
export const WIN = { x: 96, y: 252, w: 1728, h: 756 };
export const BODY = [WIN.x + 1, WIN.y + 1]; // the card's 1 px border
export const HEAD = { x: 96, y: 84, size: 68, zhSize: 31 };

// bank-screen: the twelve topic cards (4 × 3), their coverage bars, the coverage chart.
const COLS = [160, 806, 1452, 2098];
const ROWS = [[423, 266], [711, 298], [1031, 298]];
const CARD_W = 622;
const BAR_Y = [[646, 18], [916, 14], [1236, 14]]; // the bar strip per row (top, height)
export const CARDS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'EL1', 'EL2'].map((id, i) => {
  const col = i % 4, row = Math.floor(i / 4);
  const [y, h] = ROWS[row];
  // D's bar sits higher: it has a "Only 3. Worth adding more" line under it.
  const bar = id === 'D' ? [596, 16] : BAR_Y[row];
  return {
    id, col, row, x: COLS[col], y, w: CARD_W, h,
    bar: { x: COLS[col] + 26, y: bar[0], w: 562, h: bar[1] },
    // EL1 is crossed by the pointer at 2.5 s: take it from 1.0 s, when the pointer is on E.
    frame: id === 'EL1' ? 60 : 150,
    ring: Math.max(Math.abs(col - 2), row), // distance from C, the card the act opens on
  };
});
export const CARD_C = CARDS[2];
/** The coverage chart's twelve columns (bars only; the letters come with the window). */
export const CHART = CARDS.map((c, i) => ({ id: c.id, x: Math.round(414 + 188.9 * i) - 44, y: 108, w: 88, h: 104 }));

// check-terms: the three wavy underlines Check terms draws (Q1 D, Q3, Q4), as strips of the
// frame before the click that wipe away left to right.
export const UNDERLINES = [
  { x: 820, y: 760, w: 380, h: 26 },
  { x: 730, y: 1036, w: 720, h: 24 },
  { x: 730, y: 1252, w: 1010, h: 24 },
];

// ---- camera ----------------------------------------------------------------------------
// A pose { a: [x, y] design px, c: [x, y] CSS px, s }: CSS point c sits at screen point a,
// content scaled s. Keys [t, pose, ease]; between keys a, c lerp and s lerps in log space.
const A0 = [960, 540]; // frame centre: the iris opens here
const AW = [WIN.x + WIN.w / 2, WIN.y + WIN.h / 2]; // the window's centre
const pose = (a, c, s) => ({ a, c, s });
const cC = [830, 286]; // C's title, "23 questions" and its bar, which draws through the iris
export const GRID_POSE = pose(AW, [720, 333], 1.13);
export const CAMERA = [
  // bank: C fills the iris, the grid assembles around it, the window, push to C, the topic
  [P(-2), pose(A0, cC, 2.75)],
  [P(0.6), pose(A0, cC, 2.55)],
  [P(1.5), pose(A0, cC, 2.5)],
  [P(4.5), GRID_POSE, inOutSoft],
  [P(8), pose(AW, [800, 300], 1.45), inOutSoft],
  [P(8.4), pose(AW, [790, 290], 1.5)],
  [P(10.6), pose(AW, [412, 186], 2.1), inOutSoft],
  [P(12) - 1e-3, pose(AW, [404, 184], 2.16)],
  // drag: the 題庫 tab, follow the drag onto the page, then the toast
  [P(12), pose(AW, [1046, 286], 2.2)],
  [P(13.4), pose(AW, [1040, 290], 2.2)],
  [P(16.6), pose(AW, [690, 432], 1.75), inOutSoft],
  [P(19.4), pose(AW, [680, 452], 1.83)],
  [P(21), pose(AW, [592, 712], 1.92), inOutSoft],
  [P(22) - 1e-3, pose(AW, [590, 714], 1.95)],
  // check terms: the menu item, the page as the underlines draw, the finding
  [P(22), pose(AW, [1092, 150], 2.6)],
  [P(23.2), pose(AW, [1088, 152], 2.6)],
  [P(24.6), pose(AW, [620, 505], 1.85), inOutSoft],
  [P(26.2), pose(AW, [625, 500], 1.9)],
  [P(27.8), pose(AW, [630, 458], 2.55), inOutSoft],
  [P(32), pose(AW, [630, 458], 2.7)],
];

/** The camera pose at scene time t. */
export function camera(t, keys = CAMERA) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, b, e = (p) => p] = keys[i];
    if (t > t1) continue;
    const [t0, a] = keys[i - 1];
    const p = e(prog(t, t0, t1));
    return {
      a: [lerp(a.a[0], b.a[0], p), lerp(a.a[1], b.a[1], p)],
      c: [lerp(a.c[0], b.c[0], p), lerp(a.c[1], b.c[1], p)],
      s: Math.exp(lerp(Math.log(a.s), Math.log(b.s), p)),
    };
  }
  return keys[keys.length - 1][1];
}

/** The CSS transform that puts content (CSS px, origin 0 0) under pose `q`, relative to `origin`. */
export function camTransform(q, origin = [0, 0]) {
  const x = q.a[0] - q.s * q.c[0] - origin[0];
  const y = q.a[1] - q.s * q.c[1] - origin[1];
  return `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${q.s.toFixed(5)})`;
}
