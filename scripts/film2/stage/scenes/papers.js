// Act 4, mark and papers (FILM.md §3), bars 14–20 (51.58–72.92 s), body rising into the lift.
// Enters by the axis chapter "Papers 試卷"; the bank's dot iris opens from the frame's centre.
// Beats (P(n) = scene pulse n, 0.4445 s; bar lines at P0, P8, … P48; the chapter owns x 96 /
// y 1008 until P6, so the first headline waits for it):
//   P-2–P5   NARROW answer-lines: Parts & marks (a) 4, (b) 3, Total: 7 marks; push P0–P4 (the one move)
//   P4–P10   re-ink lift (marks.js): the Marks fields traced, lifted to "4 + 3", copies fly
//            into "Total: 7 marks" (160 px), the roll lands P8; HEADLINE "Marks add themselves up"
//   P10–P11  WIDE Student page; P11 CLOSE: the Teacher click lands on the cut, answers in red
//   P16–P20  MEDIUM Marking scheme view, HKEAA style selected (its click on the cut);
//            HEADLINE "A marking scheme, HKEAA-style" until P24, over HKEAA style only
//   P20–P30  the printed key, 1240 px: HKEAA style P20, Classic P24, Suggested answers P26,
//            Detailed table P28, each named by the app's own layout name
//   P30–P38  "Mock papers, cover to key": P1 cover, P2 cover, its answer page, LQ, dealt P30–P36
//   P38–P40  MEDIUM Document setup at 2×: Versions 3 (its click on the cut), "Page shows A B C"
//   P40–P43  CLOSE Version A, B, C full-bleed, one per pulse (header + question 1 reshuffle)
//   P43–P50  cut to the version page at the centre of a five-sheet fan across the frame, the
//            rest dealt P44, P45; it spreads and pushes in, accelerating into the iris (P48)
import { block, HEADLINE, h, show, C } from '../lib/index.js';
import { camera, frame } from '../lib/camera.js';
import { PULSE } from '../../timeline.mjs';
import { marks } from './papers/marks.js';
import { prints } from './papers/print.js';

const P = (n) => n * PULSE;
const SRC = { w: 1440, h: 900 };

// answer-lines (CSS px): the question's parts and the panel; the Marks fields (a) and (b).
const LINES = [252, 90, 1188, 773]; // the page's parts (a), (b) and the panel, no word cut
const PANEL = [1040, 205, 400, 260]; // the panel alone, from its left border to the window's edge
const FIELD_A = [1286, 311, 46, 26], FIELD_B = [1286, 347, 46, 26];
const PANEL_SHOT = { size: 'narrow', focus: PANEL, zoom: 2.86 };
// teacher-toggle: question 1, its options and (after the click) "Answer: C 答案：C".
const Q1 = [400, 315, 480, 210], Q1_SAFE = [344, 318, 420, 205];
// key-layouts: the toolbar, the page's title and the four style cards; then the title + cards.
const KEYS = [0, 0, 1440, 620], KEYS_IN = [200, 70, 1240, 535];
// versions: Document setup, its nav to the dialog's edge, the Versions row (Off 2 3 4 · Reshuffle ·
// Page shows A B C) at 2× in the C1 card: no word cut.
const VROW = [330, 404, 864, 372];

// Footage segments: clip time of scene time t. Each click lands on its cut.
const LINES_AT = P(1) - 1.0; // the Lines click (1.0) at P1; frame 0 holds before
const SEG = [
  { id: 'answer-lines', rig: 0, from: -P(2), to: P(5), ct: (t) => Math.max(0, t - LINES_AT) },
  { id: 'teacher-toggle', rig: 0, from: P(10), to: P(16), ct: (t) => 1.0 + (t - P(11)) },
  { id: 'key-layouts', rig: 0, from: P(16), to: P(20), ct: (t) => 1.0 + 0.6 * (t - P(16)) }, // HKEAA style 1.0–2.2
  { id: 'versions', rig: 1, from: P(38), to: P(40), ct: (t) => 1.67 + 0.85 * (t - P(38)) }, // Versions 3; Close at 2.5
];

const T_MARKS = {
  trace: [P(4), P(5)], lift: [P(5), P(6.5)], plus: [P(6.25), P(7)], words: [P(6.5), P(7.25)],
  flyA: [P(6.5), P(7.25)], flyB: [P(6.75), P(7.5)], roll: [P(7.25), P(8)], pop: P(8), hold: [P(8), P(10)],
};
const T_PRINT = {
  keys: [P(20), P(30)], keyCuts: [P(20), P(24), P(26), P(28)],
  mock: [P(30), P(38)], mockDeals: [P(30), P(32), P(34), P(36)],
  vers: [P(40)], verCuts: [P(40), P(41), P(42)], open: P(43), deals: [P(44), P(45)], build: [P(45.5), P(48)],
};

/** A CSS rect under a framing's pose, in design px. */
const onScreen = (F, [x, y, w, ht]) => {
  const { a, c, s } = F.pose;
  return { x: a[0] + s * (x - c[0]), y: a[1] + s * (y - c[1]), w: s * w, h: s * ht };
};

const scene = {
  events: [
    { t: P(5), kind: 'pencil', label: 'the Marks fields lift off the footage' },
    { t: P(8), kind: 'pop', size: 's', label: 'Total: 7 marks' },
    { t: P(10), kind: 'whoosh', size: 's', label: 'back to the page' },
    { t: P(20), kind: 'paper', label: 'the printed marking scheme' },
    ...[24, 26, 28].map((n) => ({ t: P(n), kind: 'page', label: 'the next layout' })),
    ...[30, 32, 34, 36].map((n) => ({ t: P(n), kind: 'paper', label: 'a mock paper is dealt' })),
    ...[40, 41, 42].map((n) => ({ t: P(n), kind: 'page', label: 'the next version' })),
    { t: P(43), kind: 'paper', label: 'the fan: the version page at its centre' },
    { t: P(44), kind: 'paper', label: 'the fan: inner pair' },
    { t: P(45), kind: 'paper', label: 'the fan: outer pair' },
  ],
  async setup(ctx) {
    for (const g of SEG) ctx.placeClip(g.id, { at: g.from, from: g.ct(g.from), rate: g.id === 'key-layouts' ? 0.6 : g.id === 'versions' ? 0.85 : 1, dur: g.to - g.from });
    if (ctx.dry) return;
    h('div', { style: { position: 'absolute', inset: 0, background: C.cream } }, ctx.el);

    ctx.print = await prints(ctx.el, { url: (id) => ctx.load.url(id), T: T_PRINT });
    // Two rigs: the act's footage, and the versions dialog after the printed pages (its own
    // frame: the cut into it comes from paper, not from the MEDIUM before).
    ctx.rigs = [camera(ctx, { src: SRC, name: 'papers' }), camera(ctx, { src: SRC, name: 'papers-versions' })];
    ctx.clips = [];
    for (const g of SEG) ctx.clips.push(await ctx.load.clip(g.id, ctx.rigs[g.rig].box, ctx.rigs[g.rig].content));
    ctx.rigs[0].shots([
      { at: -P(2), end: P(5), size: 'narrow', focus: LINES, zoom: 0.963, move: { at: P(2), dur: P(4), to: PANEL_SHOT } },
      { at: P(10), end: P(11), size: 'wide' },
      { at: P(11), end: P(16), size: 'close', focus: Q1, safe: Q1_SAFE, zoom: 2.45, move: { dur: P(5), to: { zoom: 2.75 } } },
      { at: P(16), end: P(20), size: 'medium', focus: KEYS, move: { dur: P(4), to: { focus: KEYS_IN, zoom: 1.39 } } },
    ]);
    ctx.rigs[1].shots([{ at: P(38), end: P(40), size: 'medium', focus: VROW, zoom: 2.0 }]);
    // Version A, B, C fill the frame (print.js): a full-bleed CLOSE of the printed page.
    ctx.registerShots('papers-print', [{ at: P(40), end: P(43), size: 'close', to: 'close', moveAt: P(40) }]);
    const settled = frame(PANEL_SHOT, SRC);
    ctx.marks = marks(ctx.el, { fieldA: onScreen(settled, FIELD_A), fieldB: onScreen(settled, FIELD_B), T: T_MARKS });

    const head = (c) => block(ctx.el, { ...HEADLINE, ...c });
    ctx.h1 = head(ctx.copy.marks);
    ctx.h2 = head(ctx.copy.scheme);
    ctx.h3 = head(ctx.copy.mock);
  },
  update(ctx, t) {
    // Footage: one rig, one clip at a time, hidden between its shots.
    const seg = SEG.findIndex((g) => t >= g.from && t < g.to);
    ctx.rigs.forEach((r, k) => show(r.el, seg >= 0 && SEG[seg].rig === k ? 1 : 0));
    ctx.clips.forEach((c, i) => {
      c.el.style.visibility = i === seg ? 'visible' : 'hidden';
      if (i === seg) c.at(Math.min(c.duration - 1 / c.fps, SEG[i].ct(t)));
    });
    if (seg >= 0) ctx.rigs[SEG[seg].rig].update(t);

    ctx.marks.update(t);
    ctx.print.update(t);

    ctx.h1.show(t, { at: P(4.5), dur: 0.5, out: P(11), outDur: 0.1 });
    ctx.h2.show(t, { at: P(16), dur: 0.5, out: P(24), outDur: 0.3 });
    ctx.h3.show(t, { at: P(30), dur: 0.5, out: P(40), outDur: 0.1 });
  },
};

export default scene;
