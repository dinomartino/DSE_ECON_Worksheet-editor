// Act 2's geometry and clock. The act starts on bar 3 (a downbeat), so scene time of pulse n
// is n × PULSE and every P(n) sits on the grid. Footage is 1440×900 CSS; the window card
// shows it at K and a 2D camera (zoom z about a CSS point) scales it inside the card.
import { PULSE } from '../../../timeline.mjs';
import { clamp } from '../../lib/ease.js';

/** Scene time of pulse n (pulse 0 = the act's first downbeat, bar 3). */
export const P = (n) => n * PULSE;

// The demo frame: the headline in a column top-left, the window card to its right, centred
// vertically (safe area 96…1824).
export const K = 0.9;
export const CARD = { x: 1824 - 1440 * K, y: 540 - (900 * K) / 2, w: 1440 * K, h: 900 * K };
export const HEAD = { x: 96, y: CARD.y - 8, w: CARD.x - 96 - 52, size: 68, zhSize: 30 };

/** Camera pose for zoom z centred on CSS point (cx, cy), clamped to the footage. */
export function camera(z, cx, cy) {
  const S = K * z;
  const tx = clamp(CARD.w / 2 - cx * S, CARD.w - 1440 * S, 0);
  const ty = clamp(CARD.h / 2 - cy * S, CARD.h - 900 * S, 0);
  return { S, tx, ty, at: ([x, y]) => [tx + x * S, ty + y * S] };
}

// The desk: the four paper kinds as sketches in a row; the dot drops into the Classroom
// worksheet's diagram (its equilibrium dot, sketch units 39, 131 of 120 × 170).
export const DESK = { w: 300, gap: 76, y: 420 };
DESK.h = (DESK.w * 170) / 120;
DESK.x0 = 960 - (4 * DESK.w + 3 * DESK.gap) / 2;
export const deskX = (i) => DESK.x0 + i * (DESK.w + DESK.gap);
export const DOT0 = [960, 338]; // the mark's dot (scenes/mark.js MARK_DOT): the iris opens here
export const DOT1 = [deskX(0) + (39 * DESK.w) / 120, DESK.y + (131 * DESK.h) / 170];
export const DOT1_R = (2.3 * DESK.w) / 120;

// The real page in type-mcq at camera z = 1 (CSS 100, 111; A4 at 130 % = 1032 CSS wide).
export const PAGE_IN_CARD = { x: 100 * K, y: 111 * K, w: 1032 * K };
PAGE_IN_CARD.h = (PAGE_IN_CARD.w * 170) / 120;
export const DESK_FILL = '#CDC9BE'; // the editor's desk behind the page (sampled)

// Footage timing (clip seconds). type-mcq: the double-click lands on P(6); the options are
// pasted at 1.5× from 4.6 s so the last one lands before the cut at P(18).
export const TYPE = { at: P(5), from: 0.72 - PULSE, fast: 4.6, rate2: 1.5, end: P(18) };
TYPE.t1 = TYPE.at + (TYPE.fast - TYPE.from);
export const typeClipT = (t) => (t < TYPE.t1 ? TYPE.from + (t - TYPE.at) : TYPE.fast + (t - TYPE.t1) * TYPE.rate2);

// language-toggle: EN (1.0), 中文 (2.5), EN+中 (4.0) land on P(19), P(22), P(25).
export const LANG = { at: P(18), rate: 1.5 / (3 * PULSE), exit: P(26), end: P(27.5) };
LANG.from = 1.0 - LANG.rate * PULSE;
export const langClipT = (t) => LANG.from + (t - LANG.at) * LANG.rate;
export const LANG_CLICKS = [[P(19), [307.5, 27]], [P(22), [353, 27]], [P(25), [432, 27]]];

// zh-interface: 繁體中文 (3.0) on P(33), 完成 (4.4) on P(36); held from 6.55 s.
export const UI = { at: P(31), rate: 1.4 / (3 * PULSE), hold: 6.55 };
UI.from = 3.0 - 2 * PULSE * UI.rate;
export const uiClipT = (t) => Math.min(UI.hold, UI.from + (t - UI.at) * UI.rate);
export const UI_CLICKS = [[P(33), [868, 213]], [P(36), [1273, 842]]];

// The printed sheets, one per language, side by side (A4 2379 × 3366).
// They fill the card's place: x CARD.x … 1824.
export const SHEET = { gap: 42 };
SHEET.w = (CARD.w - 2 * SHEET.gap) / 3;
SHEET.h = (SHEET.w * 3366) / 2379;
SHEET.x0 = CARD.x;
SHEET.y = 540 - SHEET.h / 2;
