// Act 2's geometry and clock. The act starts on bar 3 (a downbeat), so scene time of pulse n
// is n × PULSE and every P(n) sits on the grid. Footage is 1440×900 CSS; rects below are in
// the clip's CSS px (lib/camera.js shots), frame rects in design px.
import { PULSE } from '../../../timeline.mjs';
import { clamp } from '../../lib/ease.js';

/** Scene time of pulse n (pulse 0 = the act's first downbeat, bar 3). */
export const P = (n) => n * PULSE;

// The beats (cuts on pulses; each beat = its CLOSE money shot, then the frame that names it).
export const BEAT = {
  dive: P(2), // the dot has landed: the camera dives into the Classroom page
  type: P(5), // cut: CLOSE on the stem as it is typed (the double-click lands on the cut)
  typeMed: P(11), // cut: MEDIUM, "Type right on the page", the 中文 line and the options land
  lang: P(17), // cut: CLOSE locked on Q1: EN (on the cut), 中文 P19, EN+中 P21
  print: P(23), // cut: the three printed Q1s, "English, 中文, or both"
  ui: P(29), // cut: CLOSE on Settings › Language; 繁體中文 on P31
  uiWide: P(33), // cut on 完成: WIDE, the start screen in 中文, "An interface in 中文 too"
  end: P(40), // the draw act's axis wipes in over P38…P40
};

// The desk: the four paper kinds, 400 px wide, filling the frame's width (illustration).
export const DESK = { w: 400, gap: 40 };
DESK.h = (DESK.w * 170) / 120;
DESK.x0 = 960 - (4 * DESK.w + 3 * DESK.gap) / 2;
DESK.y = 540 - DESK.h / 2 + 24;
export const deskX = (i) => DESK.x0 + i * (DESK.w + DESK.gap);
export const DOT0 = [960, 338]; // the mark's dot (scenes/mark.js MARK_DOT): the iris opens here
// The dot lands in the Classroom page's diagram (its equilibrium dot, sketch units 39, 131).
export const DOT1 = [deskX(0) + (39 * DESK.w) / 120, DESK.y + (131 * DESK.h) / 170];
export const DOT1_R = (2.3 * DESK.w) / 120;

// type-mcq (page at 130 %: A4 = 1032 CSS wide from x 100, y 111). The stem line is y 383.
export const TYPE_STEM = [250, 360, 520, 46]; // "Which of the following is a positive statement?"
export const TYPE_CLOSE = [180, 250, 740, 330];
export const TYPE_MED = [0, 150, 1440, 620];
export const TYPE_Q1 = [100, 280, 1000, 360]; // Q1 with its options (the MEDIUM's push)
export const TYPE_DBL = [287, 382]; // the double-click into the stem
// Clip time: the double-click (0.72/0.80) on the cut; from 4.5 s (between the 中文 line and the
// options) the pasted options run at 1.6×, the rate ramping over half a second.
export const TYPE = { at: BEAT.type, from: 0.78, s: 4.5, rate2: 1.6, ramp: 0.25 };
TYPE.tS = TYPE.at + (TYPE.s - TYPE.from);
export function typeClipT(t) {
  const a = TYPE.tS - TYPE.ramp, b = TYPE.tS + TYPE.ramp, k = TYPE.rate2 - 1;
  const R = t < a ? 0 : t < b ? (t - a) ** 2 / (2 * (b - a)) : t - TYPE.tS;
  return TYPE.from + (t - TYPE.at) + k * R;
}

// language-toggle: EN (1.0) on the cut P17, 中文 (2.5) on P19, EN+中 (4.0) on P21. The
// page reflows when the pages rail comes back (EN+中): it moves by REFLOW, so the camera's
// content is shifted back and Q1 holds still in the locked frame.
export const LANG = { at: BEAT.lang, from: 1.0, rate: 1.5 / (2 * PULSE) };
export const langClipT = (t) => LANG.from + (t - LANG.at) * LANG.rate;
export const LANG_STATES = [[BEAT.lang, 'EN'], [P(19), '中文'], [P(21), 'EN+中']];
export const REFLOW = [86, 29]; // CSS px the page moves in the EN+中 state
// The locked CLOSE pins CSS y 497.5 (under Q2 in every state: EN's Q3 starts at 500, EN+中's
// Q2 中文 line ends at 494) to the frame's bottom edge, so its slow push never cuts a line.
export const LANG_CLOSE = [236, 397.5, 674, 200];
export const LANG_ANCHOR = [960, 1080];
export const LANG_SAFE = [252, 270, 500, 170];

// zh-interface: from 1.85 (the Language panel has settled: frames ≤ 108 are the AI panel and
// a blank), 繁體中文 (3.0) on P31, 完成 (4.4) on P33.
export const UI = { at: BEAT.ui, from: 1.85, r1: 1.15 / (2 * PULSE), r2: 1.4 / (2 * PULSE), end: 6.6 };
UI.mid = UI.at + P(2);
// (The CLOSE never reaches 完成's frame: the start screen appears only with the cut to WIDE.)
export const uiClipT = (t) => Math.min(UI.end, t < UI.mid ? UI.from + (t - UI.at) * UI.r1 : t < BEAT.uiWide ? Math.min(4.38, 3.0 + (t - UI.mid) * UI.r2) : 4.4 + (t - BEAT.uiWide));
// Settings › Language: the heading 語言 and the two cards (the sidebar, with its AI row, stays out).
export const UI_CLOSE = [309, 106, 800, 450];
export const UI_SAFE = [322, 126, 726, 150];
export const UI_TOGGLE = [868, 213];
export const UI_RAIL = [0, 60, 1150, 500]; // the start screen's left rail and heading, in 中文

// The printed Q1 (A4 2379 × 3366 px) at 0.6 × (a 1427 px page: legible, FILM.md print rule):
// EN over 中文 in the left column, EN+中 (twice as tall) on the right. src = image px.
export const PRINT_K = 0.6;
export const PRINTS = [
  { id: 'sheets-en', label: { en: 'EN', zh: '' }, src: [250, 260, 1290, 560], at: [96, 270] },
  { id: 'sheets-zh', label: { en: '', zh: '中文' }, src: [270, 260, 930, 560], at: [96, 660] },
  { id: 'sheets-bi', label: { en: 'EN+中', zh: '' }, src: [270, 260, 1260, 900], at: [918, 270] },
];

export { clamp };
