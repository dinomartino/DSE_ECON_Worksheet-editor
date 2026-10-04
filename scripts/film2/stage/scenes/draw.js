// Act 3, draw (FILM.md §3, the hero): from blank axes to the model answer in red. Scene pulses
// P(n) (the act starts on bar 8, so every P(n) is on the grid). The axis chapter owns P-2..P4.
//   P-2..P10  CLOSE, full-bleed: the canvas's origin is pinned to the chapter's own axes (x 96,
//             y 1008); the page opens out of that corner as the x axis draws (P0.5..P2.5), the
//             margins and the Quantity side open as the chapter's strokes retract (P2.5..P3.8);
//             D is dragged in from P2, S from P6.5 (the clip at ×0.96) under a push about the
//             origin (from P1, still moving at the cut); the Point tool's click is the cut
//   P10..P13  C1 narrow, "Draw it in seconds"; E0 placed on P11
//   P11..P19.9 re-ink: a blue pen traces the lines, the window falls away, the diagram lifts to
//             frame scale in ink, arrowheads, the blue dot, the guides and labels draw on; it lands
//             exactly on the shade canvas's lines (P17.5..P19) and the footage returns under it
//   P17.8..   "Shade any area in one click": MEDIUM, Shade ▾ opens (P22.2)
//   P24..P28  the Consumer surplus click is the cut to CLOSE: the hatch lands; the pen traces the
//             triangle; it lifts from where it sits (P25, the card carried and fading) to frame
//             scale on cream, its hatch re-drawn in blue, "CS" set in
//   P28..P32  the Templates wall: twelve real template cards dealt full frame, held ≥ 1 s
//   P32..P40  "The answer, on the same axes": MEDIUM on the tax question's Teacher canvas. The
//             Draw answer click is the cut; S0 selected, Shift up by 26 %, Shift a copy (P37) draws
//             S1, the shift arrow, P1 and Q1 in red; the arrow dragged onto the tax wedge
//   P40..P44  Student | Teacher split (the clip's Teacher click sounds on the cut): Student keeps
//             its blank axes; on Teacher the same answer draws on in red, S1 sliding up from S0 by
//             t, then E1, P1 and P1 − t, Q1 left of Q0
//   P44..P48  CLOSE on the real Teacher copy (answer-layer), that answer held; the papers chapter
//             wipes in from P46
import { h, C } from '../lib/dom.js';
import { block, HEADLINE } from '../lib/type.js';
import { camera, frame } from '../lib/camera.js';
import { lerp, prog, outSoft, inOutSoft, spring, sineInOut } from '../lib/ease.js';
import { f } from '../lib/tween.js';
import { PULSE } from '../../timeline.mjs';
import * as G from './draw/geom.js';
import { sdInk, csInk } from './draw/reink.js';
import { split } from './draw/split.js';
import { wall } from './draw/wall.js';
import { lerpPose, scalePose } from './draw/vec.js';
import * as reink from '../lib/reink.js';

const P = (n) => n * PULSE;

// Footage: clip time follows `keys` [[scene s, clip s], …] (linear between, held at both ends);
// the rig shows in [show). Each key segment is one placement (its clicks and keys sound).
// draw-diagram: D's drag (clip 1.0) starts on P2 and the Point tool's click (4.40) lands on the
// P10 cut (×0.956, the drags read at their own speed); E0 (4.85) on P11; held from 5.25.
const DR = 3.4 / P(8);
// answer-draw: the Draw answer click (0.8) is the P32 cut; ×1.4 through S0, Shift up, 26 % and
// Shift a copy (3.9) on P37; ×2 while the cursor walks to the arrow; its drag (4.9–5.52) at ×1.0.
const AS = P(37);
const CLIPS = {
  draw: { id: 'draw-diagram', show: [-Infinity, P(13)], keys: [[P(2) - 1.0 / DR, 0], [P(10), 4.4], [P(10) + 0.85, 5.25]] },
  // Shade ▾ (0.8) on P22.2, Consumer surplus (1.6) on the P24 cut; carried until the lift fades it.
  shade: { id: 'shade-area', show: [P(18), P(27)], keys: [[P(19), 0], [P(24) - 0.8, 0.8], [P(24) + 1.1, 2.7]] },
  answer: { id: 'answer-draw', show: [P(32), P(40)], keys: [[P(32), 0.8], [AS, 3.9], [AS + 0.5, 4.9], [AS + 1.12, 5.52], [P(40), 5.52 + P(40) - AS - 1.12]] },
  // Its Teacher click (1.5 s) lands on the P40 cut into the split; the CLOSE shows it from P44.
  layer: { id: 'answer-layer', show: [P(44), Infinity], keys: [[P(40), 1.5], [P(40) + 4.3, 5.8]] },
};
function clipT(c, t) {
  const k = c.keys;
  if (t <= k[0][0]) return k[0][1];
  const i = k.findIndex(([x]) => x >= t);
  if (i < 0) return k[k.length - 1][1];
  return lerp(k[i - 1][1], k[i][1], prog(t, k[i - 1][0], k[i][0]));
}

const SHOTS = {
  draw: [
    { at: -P(2), size: 'close', ...G.DRAW_CLOSE, move: { at: P(3), dur: P(11), to: { zoom: 2.62 } } }, // a push about the origin from P1, still moving at the P10 cut
    { at: P(10), size: 'narrow', ...G.DRAW_NARROW, drift: 0.03, end: P(13) },
  ],
  // The Consumer surplus click is the cut to CLOSE (no push: round 2's push peaked at MAD 6.6).
  shade: [
    { at: P(18), size: 'medium', focus: G.TOP, drift: 0.03 },
    { at: P(24), size: 'close', ...G.SHADE_CLOSE, drift: 0.02, end: P(25) },
  ],
  // A slow tilt down from the toolbar (the Draw answer click) to the whole diagram from P33, still
  // travelling as S1 lands (P37), as the arrow is dragged and at the cut (it would end at P40.5).
  answer: [{ at: P(32), size: 'medium', focus: G.TOP, move: { at: P(1), dur: P(7.5), to: { focus: G.ANSWER_DOWN } }, end: P(40) }],
  layer: [{ at: P(44), size: 'close', ...G.LAYER_CLOSE, drift: 0.03, end: P(50) }],
};

// Re-ink poses (design px ← CSS px).
const NARROW = scalePose(frame({ size: 'narrow', ...G.DRAW_NARROW }).pose, 1.03); // at the drift's end
const SHADE_A = frame({ size: 'medium', focus: G.TOP }).pose;
const MIDC = [(G.DRAWN.o[0] + G.DRAWN.xTip) / 2, (G.DRAWN.yTip + G.DRAWN.o[1]) / 2];
const T1 = { s: 1.56, c: MIDC, a: [860 + 1.56 * (MIDC[0] - G.DRAWN.o[0]), 990 - 1.56 * (G.DRAWN.o[1] - MIDC[1])] }; // origin at (860, 990)
// The CS lift: from the triangle's box as it sits in the CLOSE (2.45×) to that box at 3.5×
// centred on (860, 640) (its D edge runs on off the right of the frame). inOutSoft over 2.5
// pulses, the card carried and gone in 1: never small on cream, and no whip (outSoft over 2
// pulses with the hatch-dense card peaked at MAD ≈ 11; this peaks ≈ 5.5).
const CS_BOX = (() => {
  const xs = G.CS.map((p) => p[0]), ys = G.CS.map((p) => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
})();
const CSC = G.CS.reduce((a, p) => [a[0] + p[0] / 3, a[1] + p[1] / 3], [0, 0]);
const CS_K = 3.5;
const CS_TO = { x: 860 + CS_K * (CS_BOX.x - CSC[0]), y: 640 + CS_K * (CS_BOX.y - CSC[1]), w: CS_K * CS_BOX.w, h: CS_K * CS_BOX.h };
const LIFT = { at: P(25), dur: P(2.5), ease: inOutSoft };

function sdPose(t, land) {
  if (t < P(13)) return NARROW;
  if (t < P(15)) return lerpPose(NARROW, T1, inOutSoft(prog(t, P(13), P(15))));
  const T1d = scalePose(T1, 1 + 0.03 * sineInOut(prog(t, P(15), P(17.5))));
  return t < P(17.5) ? T1d : lerpPose(T1d, land, inOutSoft(prog(t, P(17.5), P(19))));
}
/** Pose Pz under the lift's transform (design p → k p + [x, y]). */
const lifted = (Pz, L) => ({ a: [L.scale * Pz.a[0] + L.x, L.scale * Pz.a[1] + L.y], c: Pz.c, s: Pz.s * L.scale });

const scene = {
  events: [
    { t: P(11), kind: 'pencil', label: 'the pen traces the canvas lines' },
    // The lift and the landing move on inOutSoft (fastest at P14 and P18.25): each whoosh starts
    // half a pulse in, so its body is on the fastest motion (round 2: 0.4 s early).
    { t: P(13.5), kind: 'whoosh', size: 's', label: 'the diagram lifts to frame scale' },
    { t: P(14.5), kind: 'pop', label: 'the equilibrium dot' },
    { t: P(17.75), kind: 'whoosh', size: 's', label: 'the diagram lands on the shade canvas' },
    { t: P(24.2), kind: 'pencil', label: 'the pen traces the consumer-surplus triangle' },
    { t: P(25.6), kind: 'whoosh', size: 's', label: 'the triangle lifts from where it sits (on its fastest growth)' },
    { t: P(25.3), kind: 'pencil', label: 'its hatch is re-drawn' },
    { t: P(28), kind: 'shutter', label: 'the Templates wall deals in' },
    { t: P(41.5), kind: 'pencil', label: 'the red answer draws on the Teacher panel' },
  ],
  async setup(ctx) {
    h('div', { style: { position: 'absolute', inset: 0, background: C.cream } }, ctx.el);
    ctx.rigs = {};
    for (const [k, c] of Object.entries(CLIPS)) {
      const rig = camera(ctx, { name: `draw.${k}` });
      rig.clip = await ctx.load.clip(c.id, rig.box, rig.content);
      ctx.rigs[k] = rig;
      const end = Math.min(c.show[1], ctx.window.end - ctx.from);
      c.keys.slice(1).forEach(([t1, c1], i) => {
        const [t0, c0] = c.keys[i];
        if (t0 < end) ctx.placeClip(c.id, { at: t0, from: c0, rate: (c1 - c0) / (t1 - t0), dur: Math.min(t1, end) - t0 - 1e-6 });
      });
    }
    ctx.problems = Object.entries(SHOTS).flatMap(([k, list]) => ctx.rigs[k].shots(list));
    ctx.veil = h('div', { style: { position: 'absolute', left: '1390px', top: 0, width: '530px', height: '1080px', background: C.cream } }, ctx.el);
    ctx.sd = sdInk(ctx.el);
    ctx.cs = csInk(ctx.el);
    const tp = await ctx.load.clip('template-picker', { x: 0, y: 0, w: 1, h: 1 }, ctx.el);
    tp.el.style.display = 'none';
    ctx.wall = wall(ctx.el, (i) => tp.url(i));
    await ctx.wall.ready;
    ctx.split = split(ctx.el, {
      student: ctx.copy.student ?? { en: 'Student', zh: '學生版' },
      teacher: ctx.copy.teacher ?? { en: 'Teacher', zh: '教師版' },
    });
    ctx.h1 = block(ctx.el, { ...HEADLINE, ...ctx.copy.draw });
    ctx.h2 = block(ctx.el, { ...HEADLINE, ...ctx.copy.shade });
    ctx.h3 = block(ctx.el, { ...HEADLINE, ...ctx.copy.answer });
  },
  update(ctx, t) {
    for (const [k, c] of Object.entries(CLIPS)) {
      const rig = ctx.rigs[k];
      const on = t >= c.show[0] && t < c.show[1];
      rig.el.style.display = on ? 'block' : 'none';
      if (!on) continue;
      rig.update(t);
      rig.clip.at(clipT(c, t));
    }
    // The page opens out of the chapter's corner as its x axis draws (P0.5..P2.5); the margins
    // open as the chapter's strokes retract onto the canvas's own axes (P2.5..P3.5); right of
    // x 1390 it fades in once the retracting axis has cleared Quantity (≈P3.1), so no word is cut.
    const ax = lerp(96, 1824, outSoft(prog(t, 0, P(2))));
    const e1 = inOutSoft(prog(t, P(0.5), P(2.5))), em = inOutSoft(prog(t, P(2.5), P(3.5))), e2 = inOutSoft(prog(t, P(3.1), P(3.8)));
    const x0 = lerp(96, 0, em), x1 = e2 > 0 ? 1920 : Math.min(ax, 1390);
    const y0 = lerp(1008, 0, e1), y1 = lerp(1008, 1080, em);
    const dr = ctx.rigs.draw.el.style;
    const rect = (a, b) => `M${f(a, 2)} ${f(y0, 2)}H${f(b, 2)}V${f(y1, 2)}H${f(a, 2)}Z`;
    dr.clipPath = em >= 1 && e1 >= 1 ? 'none' : `path('${rect(x0, x1)}')`;
    ctx.veil.style.display = e2 < 1 ? 'block' : 'none';
    ctx.veil.style.opacity = f(1 - e2, 4);
    dr.opacity = String(1 - outSoft(prog(t, P(11.95), P(13)))); // the window falls away
    const sh = ctx.rigs.shade.el.style;
    sh.opacity = String(inOutSoft(prog(t, P(18.9), P(19.6)))); // once the vector has landed
    sh.transform = 'none';
    sh.visibility = '';

    // Re-ink 1: supply and demand.
    const sdOn = t >= P(11) && t < P(19.95);
    ctx.sd.el.style.display = sdOn ? 'block' : 'none';
    if (sdOn) {
      const lift = inOutSoft(prog(t, P(13), P(15))), land = inOutSoft(prog(t, P(17.5), P(19)));
      const onto = t >= P(18) ? ctx.rigs.shade.state.frame.pose : SHADE_A; // the shade card's live pose
      ctx.sd.el.style.clipPath = t > P(17.5) ? 'inset(0 0 72px 0)' : 'none';
      ctx.sd.set(t < P(13) ? ctx.rigs.draw.state.frame.pose : sdPose(t, onto), {
        m: land, ink: land, hue: inOutSoft(prog(t, P(12.2), P(13.2))), o: 1 - outSoft(prog(t, P(19.5), P(19.95))),
        w: t < P(17.5) ? lerp(1.45, 1.15, lift) : lerp(1.15, 1, land),
        pen: {
          y: outSoft(prog(t, P(11), P(11.55))), x: outSoft(prog(t, P(11.1), P(11.65))),
          D: outSoft(prog(t, P(11.25), P(11.85))), S: outSoft(prog(t, P(11.4), P(12))),
        },
        heads: spring(prog(t, P(14), P(14.7))),
        guides: { p: outSoft(prog(t, P(14.4), P(15.4))), o: 1 },
        dot: { s: spring(prog(t, P(14.5), P(15.2))) * (1 - inOutSoft(prog(t, P(17.5), P(18.2)))), ripple: prog(t, P(14.6), P(14.6) + 1.1) },
        labels: outSoft(prog(t, P(14.8), P(15.8))) * (1 - outSoft(prog(t, P(17.1), P(17.7)))),
      });
    }

    // Re-ink 2: the consumer-surplus triangle, traced over the CLOSE, then lifted from where it
    // sits with the card carried along (fading over 1.5 pulses), so it is never small on cream.
    const csOn = t >= P(24.2) && t < P(28);
    ctx.cs.el.style.display = csOn ? 'block' : 'none';
    if (csOn) {
      const cam = ctx.rigs.shade;
      cam.update(Math.min(t, LIFT.at)); // the CLOSE is still from LIFT.at (its shot ends there)
      const L = reink.lift(t, { cam, rect: CS_BOX }, CS_TO, { ...LIFT, carry: { fade: P(1) } }); // the card is gone before the fastest growth
      if (t >= LIFT.at) L.carry.apply(cam.el);
      const k = 1 + 0.02 * sineInOut(prog(t, P(26.6), P(28.4)));
      ctx.cs.set(t < LIFT.at ? cam.state.frame.pose : scalePose(lifted(cam.state.frame.pose, L), k), {
        o: 1, trace: prog(t, P(24.2), P(25)), ink: prog(t, LIFT.at, LIFT.at + P(0.6)), lines: t >= LIFT.at ? 1 : 0,
        hatch: prog(t, P(25.3), P(26.9)), label: outSoft(prog(t, P(26.5), P(27.2))),
      });
    }

    const wOn = t >= P(28) && t < P(32);
    ctx.wall.el.style.display = wOn ? 'block' : 'none';
    if (wOn) ctx.wall.set(t - P(28));
    const sOn = t >= P(40) && t < P(44);
    ctx.split.el.style.display = sOn ? 'block' : 'none';
    if (sOn) ctx.split.set((t - P(40)) / PULSE);

    // h2 and h3 leave with the cut into a CLOSE (no headline there), not before it.
    const hd = { dur: 0.5, stagger: 0.06, outDur: 0.3 };
    ctx.h1.show(t, { ...hd, at: P(10), out: P(17.5) });
    ctx.h2.show(t, { ...hd, at: P(17.8), out: P(24), outDur: 0.034 });
    ctx.h3.show(t, { ...hd, at: P(32), out: P(44), outDur: 0.034 });
  },
};

export default scene;
