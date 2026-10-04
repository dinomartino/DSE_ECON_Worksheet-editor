// Act 4, mark and papers (FILM.md §3), bars 14–20 (51.58–72.92 s), body rising into the lift.
// Enters by the axis chapter "Papers 試卷"; the bank's dot iris opens from the frame's centre.
// Beats (P(n) = scene pulse n, 0.4445 s; bar lines at P0, P8, … P48):
//   P-2–P4   CLOSE Parts & marks under the chapter: (a) 4, (b) 3, Total: 7 marks (frame 0: nothing
//            focused, no cursor); the chapter's wipe reveals it; one push −P1.5–P3; P3 the Marks
//            fields traced (CLOSE: no headline is owed while the chapter leaves)
//   P4–P11   re-ink lift (marks.js): the Marks column lifts (4 over + 3, a rule), the footage riding
//            along and fading (carry); copies drop into "Total: _ marks" (DISPLAY): 4, then 7 at P8;
//            HEADLINE "Marks add themselves up" P4.5–P11 (the card half gone)
//   P11–P16  CLOSE question 1, Student; P12 the Teacher click: answers in red (in place)
//   P16–P20  MEDIUM Marking scheme view, HKEAA style selected (its click on the cut);
//            HEADLINE "A marking scheme, HKEAA-style" until P24, over HKEAA style only
//   P20–P30  the printed key, 1240 px: HKEAA style P20, Classic P24, Suggested answers P26,
//            Detailed table P28; the left column lists the four (the app's names), the dot on
//            the one shown; the page rises into the headline's band once it has gone (P24–P25.5)
//   P30–P38  "Mock papers, cover to key": P1 cover, P2 cover, its answer page, the key, dealt P30–P36
//   P38–P40  MEDIUM Document setup at 2×: Versions 3 (its click on the cut), "Page shows A B C"
//   P40–P50  CLOSE Version A, B (P42), C (P44) full-bleed, swapped in place under one push that
//            gathers into the bank's iris (P46–P50)
import { block, HEADLINE, h, show, C } from '../lib/index.js';
import { camera, frame } from '../lib/camera.js';
import { PULSE } from '../../timeline.mjs';
import { marks } from './papers/marks.js';
import { prints } from './papers/print.js';

const P = (n) => n * PULSE;
const SRC = { w: 1440, h: 900 };

// answer-lines frame 0 (CSS px): Parts & marks, its rows (a) and (b) with their Marks fields, "+ Part";
// the Marks fields (a) and (b). Frame 0 is before the Lines click: no focus ring, no cursor.
const MARKS_FOCUS = [1056, 262, 380, 180]; // "Parts & marks" to "Total: 7 marks"
const MARKS_SAFE = [1052, 266, 284, 174]; // the title, both rows' labels and Marks fields, "+ Part"
const FIELD_A = [1286, 311, 46, 26], FIELD_B = [1286, 347, 46, 26];
const MARKS_END = { size: 'close', focus: MARKS_FOCUS, safe: MARKS_SAFE, zoom: 3.0 }; // the push settles here
// teacher-toggle: question 1, its options and (after the click) "Answer: C 答案：C".
// The push keeps its top edge at y 200, above the red "Teacher Version / 教師版" (y 204–219).
const Q1 = [400, 315, 480, 210], Q1_IN = [400, 291, 480, 210], Q1_SAFE = [344, 204, 420, 319];
// key-layouts: the toolbar, the page's title and the four style cards; then the title + cards.
const KEYS = [0, 0, 1440, 620], KEYS_IN = [200, 70, 1240, 535];
// versions: Document setup, its nav to the dialog's edge, the Versions row (Off 2 3 4 · Reshuffle ·
// Page shows A B C) at 2× in the C1 card: no word cut.
const VROW = [330, 404, 864, 372];

// Footage segments: clip time of scene time t (rate: clip s per scene s). Each click lands on its
// cut, or on its own pulse when the change happens in place (the Teacher toggle at P12).
const SEG = [
  { id: 'answer-lines', rig: 0, from: -P(2), to: P(6.5), rate: 0, ct: () => 0 }, // frame 0 held; carried off P5–P6.5
  { id: 'teacher-toggle', rig: 2, from: P(11), to: P(16), rate: 1, ct: (t) => 1.0 + (t - P(12)) },
  { id: 'key-layouts', rig: 2, from: P(16), to: P(20), rate: 0.6, ct: (t) => 1.0 + 0.6 * (t - P(16)) }, // HKEAA style 1.0–2.2
  { id: 'versions', rig: 1, from: P(38), to: P(40), rate: 0.85, ct: (t) => 1.6667 + 0.85 * (t - P(38)) }, // Versions 3 (frame 100); Close at 2.5
];

const T_MARKS = {
  trace: [P(3), P(4)], lift: [P(4), P(6)], plus: [P(5.5), P(6.25)], words: [P(5.75), P(6.5)],
  flyA: [P(6.25), P(7)], flyB: [P(7), P(8)], pop: P(8), hold: [P(8), P(11)], fade: P(1),
};
const T_PRINT = {
  keys: [P(20), P(30)], keyCuts: [P(20), P(24), P(26), P(28)], keyRise: [P(24), P(25.5)],
  mock: [P(30), P(38)], mockDeals: [P(30), P(32), P(34), P(36)],
  vers: [P(40), P(50)], verCuts: [P(40), P(42), P(44)],
};

/** A CSS rect under a framing's pose, in design px. */
const onScreen = (F, [x, y, w, ht]) => {
  const { a, c, s } = F.pose;
  return { x: a[0] + s * (x - c[0]), y: a[1] + s * (y - c[1]), w: s * w, h: s * ht };
};

const scene = {
  events: [
    { t: P(3), kind: 'pencil', label: 'the Marks fields traced on the footage' },
    { t: P(4), kind: 'whoosh', size: 's', label: 'the Marks column lifts off the footage' },
    { t: P(7), kind: 'snap', label: 'the 4 lands in the total' },
    { t: P(8), kind: 'pop', size: 's', label: 'Total: 7 marks' },
    { t: P(11), kind: 'whoosh', size: 's', label: 'back to the page: question 1, Student' },
    { t: P(20), kind: 'paper', label: 'the printed marking scheme' },
    ...[24, 26, 28].map((n) => ({ t: P(n), kind: 'page', label: 'the next layout' })),
    ...[30, 32, 34, 36].map((n) => ({ t: P(n), kind: 'paper', label: 'a mock paper is dealt' })),
    ...[40, 42, 44].map((n) => ({ t: P(n), kind: 'page', label: 'the next version' })),
  ],
  async setup(ctx) {
    for (const g of SEG) ctx.placeClip(g.id, { at: g.from, from: g.ct(g.from), rate: g.rate, dur: g.to - g.from });
    // The ground and the printed pages sit under the rigs; the rigs and their shot lists exist
    // in the dry pass too, so the doctor's shot budget sees them.
    const base = h('div', { style: { position: 'absolute', inset: 0 } }, ctx.el);
    // Three rigs, one per run of shots: each is entered from motion design or paper, not from
    // another shot (the marks CLOSE; the Teacher CLOSE → the scheme MEDIUM; the versions dialog).
    ctx.rigs = [camera(ctx, { src: SRC, name: 'papers' }), camera(ctx, { src: SRC, name: 'papers-versions' }), camera(ctx, { src: SRC, name: 'papers-teacher' })];
    ctx.rigs[0].shots([
      // 2.6: the page's cursor (bottom left, frame 0) stays below the frame; the push settles by P3.
      { at: -P(2), end: P(6.5), size: 'close', focus: MARKS_FOCUS, safe: MARKS_SAFE, zoom: 2.6, move: { at: P(0.5), dur: P(4.5), to: { zoom: MARKS_END.zoom } } },
    ]);
    ctx.rigs[2].shots([
      { at: P(11), end: P(16), size: 'close', focus: Q1, safe: Q1_SAFE, zoom: 2.45, move: { dur: P(5), to: { focus: Q1_IN, zoom: 2.75 } } },
      { at: P(16), end: P(20), size: 'medium', focus: KEYS, move: { dur: P(4), to: { focus: KEYS_IN, zoom: 1.39 } } },
    ]);
    ctx.rigs[1].shots([{ at: P(38), end: P(40), size: 'medium', focus: VROW, zoom: 2.0 }]);
    // Version A, B, C fill the frame (print.js): a full-bleed CLOSE of the printed page.
    ctx.registerShots('papers-print', [{ at: P(40), end: P(50), size: 'close', to: 'close', moveAt: P(40) }]);
    if (ctx.dry) return;
    h('div', { style: { position: 'absolute', inset: 0, background: C.cream } }, base);
    ctx.print = await prints(base, { url: (id) => ctx.load.url(id), T: T_PRINT });
    ctx.clips = [];
    for (const g of SEG) ctx.clips.push(await ctx.load.clip(g.id, ctx.rigs[g.rig].box, ctx.rigs[g.rig].content));
    const settled = frame(MARKS_END, SRC);
    ctx.marks = marks(ctx.el, { fieldA: onScreen(settled, FIELD_A), fieldB: onScreen(settled, FIELD_B), T: T_MARKS });

    const head = (c) => block(ctx.el, { ...HEADLINE, ...c });
    ctx.h1 = head(ctx.copy.marks);
    ctx.h2 = head(ctx.copy.scheme);
    ctx.h3 = head(ctx.copy.mock);
  },
  update(ctx, t) {
    // Footage: one rig, one clip at a time, hidden between its shots.
    const seg = SEG.findIndex((g) => t >= g.from && t < g.to);
    ctx.rigs.forEach((r, k) => {
      show(r.el, seg >= 0 && SEG[seg].rig === k ? 1 : 0);
      r.el.style.transform = 'none';
    });
    ctx.clips.forEach((c, i) => {
      c.el.style.visibility = i === seg ? 'visible' : 'hidden';
      if (i === seg) c.at(Math.min(c.duration - 1 / c.fps, SEG[i].ct(t)));
    });
    if (seg >= 0) ctx.rigs[SEG[seg].rig].update(t);
    if (seg === 0) ctx.marks.carry(t).apply(ctx.rigs[0].el); // the card rides with field (a), fading

    ctx.marks.update(t);
    ctx.print.update(t);

    ctx.h1.show(t, { at: P(4.5), dur: 0.45, out: P(11), outDur: 0.1 }); // with the lift: the footage is leaving
    ctx.h2.show(t, { at: P(16), dur: 0.5, out: P(24), outDur: 0.3 });
    ctx.h3.show(t, { at: P(30), dur: 0.5, out: P(40), outDur: 0.1 });
  },
};

export default scene;
