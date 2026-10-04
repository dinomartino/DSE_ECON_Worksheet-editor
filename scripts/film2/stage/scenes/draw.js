// Act 3, draw (FILM.md §3, the hero): from blank axes to the model answer in red. Scene pulses
// P(n) (the act starts on bar 8, so every P(n) is on the grid). The axis chapter owns P-2..P6.
//   P-2..P12  CLOSE, full-bleed: the canvas's origin is pinned to the chapter's own axes (x 96,
//             y 1008); the page opens out of that corner (P2..P4) and the chapter's strokes
//             retract onto the canvas axes (P4..P6); D and S are dragged in; a pull to C1
//             narrow lands as E0 is placed; "Draw it in seconds"
//   P13..P21  re-ink: the pen traces the lines, the window falls away, the diagram lifts to
//             frame scale, arrowheads, the blue dot, the guides and labels draw on; it lands on
//             the shade canvas's lines and the footage takes over under them
//   P19.5..   "Shade any area in one click": MEDIUM, Shade ▾ → Consumer surplus lands on P23;
//             push to CLOSE on the hatch (P25.5..P27.5)
//   P27.5..   re-ink lift: the CS triangle is traced, lifted to frame scale, its hatch re-drawn
//   P31..P34  the Templates wall: twelve real template cards dealt full frame
//   P34..P40  "The answer, on the same axes": MEDIUM answer-draw, Draw answer, Shift a copy → D1
//   P40..P45  Student | Teacher split; the red answer draws on Teacher from P42 (48.91 s)
//   P45..P48  CLOSE on the real Teacher copy, the red answer held; the papers chapter wipes in
import { h, C } from '../lib/dom.js';
import { block, HEADLINE } from '../lib/type.js';
import { camera, frame } from '../lib/camera.js';
import { clamp, lerp, prog, outSoft, inOutSoft, spring, sineInOut } from '../lib/ease.js';
import { f } from '../lib/tween.js';
import { PULSE } from '../../timeline.mjs';
import * as G from './draw/geom.js';
import { sdInk, csInk } from './draw/reink.js';
import { split } from './draw/split.js';
import { wall } from './draw/wall.js';
import { lerpPose, scalePose } from './draw/vec.js';

const P = (n) => n * PULSE;

// Footage: clip time follows `keys` [[scene s, clip s], …] (linear between, held at both ends);
// the rig shows in [show). Each key segment is one placement (its clicks and keys sound).
const D5 = P(5); // draw-diagram's D drag starts on P5
const CLIPS = {
  draw: { id: 'draw-diagram', show: [-Infinity, P(13)], keys: [
    [D5 - 0.8, 0], [D5 + 0.496, 1.62], // ×1.25: the Curve click, D dragged in
    [D5 + 1.369, 2.93], // ×1.5 through the label and the walk back to the toolbar
    [D5 + 1.865, 3.55], // ×1.25: S dragged in (P8.1)
    [D5 + 2.515, 4.85], // ×2 while the cursor is off the canvas (label, Point tool): E0 placed on P10.66
    [D5 + 2.835, 5.25],
  ] },
  shade: { id: 'shade-area', show: [P(18), P(27)], keys: [[P(23) - 1.6, 0], [P(23) + 1.1, 2.7]] }, // Consumer surplus on P23
  answer: { id: 'answer-draw', show: [P(33), P(40)], keys: [[P(33), 0.5], [P(33) + 3.4, 3.9]] }, // Shift a copy on P38.6
  // Its Teacher click (1.5 s) lands on the P40 cut into the split; the CLOSE shows it from P45.
  layer: { id: 'answer-layer', show: [P(45), Infinity], keys: [[P(40), 1.5], [P(40) + 4.3, 5.8]] },
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
    { at: -P(2), size: 'close', ...G.DRAW_CLOSE, move: { at: P(5), dur: P(7), to: { zoom: 2.52 } } }, // a slow push about the origin, P3..P10
    { at: P(10), size: 'narrow', ...G.DRAW_NARROW, drift: 0.03, end: P(13) },
  ],
  shade: [{ at: P(18), size: 'medium', focus: G.TOP, move: { at: P(5.8), dur: P(2), to: { size: 'close', ...G.SHADE_CLOSE } }, end: P(27) }],
  answer: [{ at: P(33), size: 'medium', focus: G.TOP, move: { at: P(3), dur: P(2), to: { ...G.ANSWER_IN } }, end: P(40) }],
  layer: [{ at: P(45), size: 'close', ...G.LAYER_CLOSE, drift: 0.03, end: P(50) }],
};
/** An extra content drift on a MEDIUM card whose shot spends its one move on the push: [from, to, peak, back?]. */
const EXTRA = {
  // up while the headline is read, back to 0 under the push (the CLOSE pose is the CS lift's
  // start), then a second drift through the CLOSE hold
  shade: (t) => 1 + 0.02 * (sineInOut(prog(t, P(19), P(23.8))) - inOutSoft(prog(t, P(23.8), P(25.8)))) + 0.015 * sineInOut(prog(t, P(25.8), P(27.6))),
  answer: (t) => 1 + 0.025 * sineInOut(prog(t, P(33), P(40))),
};
/** Pose P scaled by k about design point O (the content drift above, about the card centre). */
const about = (Pz, k, O) => ({ a: [O[0] + k * (Pz.a[0] - O[0]), O[1] + k * (Pz.a[1] - O[1])], c: Pz.c, s: Pz.s * k });

// Re-ink poses (design px ← CSS px).
const NARROW = scalePose(frame({ size: 'narrow', ...G.DRAW_NARROW }).pose, 1.03); // at the drift's end
const SHADE_A = frame({ size: 'medium', focus: G.TOP }).pose;
const SHADE_B = frame({ size: 'close', ...G.SHADE_CLOSE }).pose;
const MIDC = [(G.DRAWN.o[0] + G.DRAWN.xTip) / 2, (G.DRAWN.yTip + G.DRAWN.o[1]) / 2];
const T1 = { s: 1.56, c: MIDC, a: [860 + 1.56 * (MIDC[0] - G.DRAWN.o[0]), 990 - 1.56 * (G.DRAWN.o[1] - MIDC[1])] }; // origin at (860, 990)
const CSC = G.CS.reduce((a, p) => [a[0] + p[0] / 3, a[1] + p[1] / 3], [0, 0]);
const T2 = { s: 4.0, c: CSC, a: [860, 640] }; // the triangle's box centred in the frame

function sdPose(t) {
  if (t < P(13)) return NARROW;
  if (t < P(15)) return lerpPose(NARROW, T1, inOutSoft(prog(t, P(13), P(15))));
  const T1d = scalePose(T1, 1 + 0.03 * sineInOut(prog(t, P(15), P(17.5))));
  return t < P(17.5) ? T1d : lerpPose(T1d, SHADE_A, inOutSoft(prog(t, P(17.5), P(19))));
}
function csPose(t) {
  const B = about(SHADE_B, EXTRA.shade(Math.min(t, P(27))), [960, 540]);
  if (t < P(27)) return B;
  return scalePose(lerpPose(B, T2, inOutSoft(prog(t, P(27), P(28.5)))), 1 + 0.025 * sineInOut(prog(t, P(28.5), P(30))));
}

const scene = {
  events: [
    { t: P(11), kind: 'pencil', label: 'the pen traces the canvas lines' },
    { t: P(13), kind: 'whoosh', size: 's', label: 'the diagram lifts to frame scale' },
    { t: P(14.5), kind: 'pop', label: 'the equilibrium dot' },
    { t: P(17.5), kind: 'whoosh', size: 's', label: 'the diagram lands on the shade canvas' },
    { t: P(27), kind: 'whoosh', size: 's', label: 'the consumer-surplus triangle lifts' },
    { t: P(27.3), kind: 'pencil', label: 'its hatch is re-drawn' },
    { t: P(30), kind: 'shutter', label: 'the Templates wall deals in' },
    { t: P(42), kind: 'pencil', label: 'the red answer draws on the Teacher panel' },
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
      const x = EXTRA[k];
      if (x) {
        const kx = x(t);
        const r = rig.state.frame.rect, cx = r.w / 2, cy = r.h / 2;
        rig.content.style.transform = `translate(${f(cx, 2)}px, ${f(cy, 2)}px) scale(${f(kx, 5)}) translate(${f(-cx, 2)}px, ${f(-cy, 2)}px) ${rig.content.style.transform}`;
      }
    }
    // The page opens out of the chapter's corner as its x axis draws (P0..P3), right of x 1372
    // once the retracting axis has cleared Quantity (P4.7), then the margins (P5.2..P6.2).
    const ax = lerp(96, 1824, outSoft(prog(t, 0, P(2))));
    const e1 = prog(t, P(0.5), P(4.3)), em = inOutSoft(prog(t, P(5.2), P(6.2))), e2 = inOutSoft(prog(t, P(4.3), P(5.3)));
    const x0 = lerp(96, 0, em), x1 = Math.min(ax, 1372), xr = lerp(1920, 1372, e2); // the right part wipes in from the edge
    const y0 = lerp(1008, 0, e1), y1 = lerp(1008, 1080, em);
    const dr = ctx.rigs.draw.el.style;
    const rect = (a, b) => `M${f(a, 2)} ${f(y0, 2)}H${f(b, 2)}V${f(y1, 2)}H${f(a, 2)}Z`;
    dr.clipPath = e2 >= 1 && em >= 1 && e1 >= 1 ? 'none' : `path('${rect(x0, x1)}${rect(xr, 1920)}')`;
    dr.opacity = String(1 - outSoft(prog(t, P(11.95), P(13)))); // the window falls away
    ctx.rigs.shade.el.style.opacity = String(inOutSoft(prog(t, P(18.1), P(18.9))));

    // Re-ink 1: supply and demand.
    const sdOn = t >= P(11) && t < P(19.4);
    ctx.sd.el.style.display = sdOn ? 'block' : 'none';
    if (sdOn) {
      const lift = inOutSoft(prog(t, P(13), P(15))), land = inOutSoft(prog(t, P(17.5), P(19)));
      ctx.sd.el.style.clipPath = t > P(17.5) ? 'inset(0 0 72px 0)' : 'none';
      ctx.sd.set(t < P(13) ? ctx.rigs.draw.state.frame.pose : sdPose(t), {
        m: land, ink: land, hue: inOutSoft(prog(t, P(12.2), P(13.2))), o: 1 - outSoft(prog(t, P(18.95), P(19.4))),
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

    // Re-ink 2: the consumer-surplus triangle.
    const csOn = t >= P(25.8) && t < P(30);
    ctx.cs.el.style.display = csOn ? 'block' : 'none';
    if (csOn) {
      ctx.cs.set(csPose(t), {
        o: 1, trace: prog(t, P(25.8), P(26.6)), ink: prog(t, P(27), P(27.6)), lines: t >= P(27) ? 1 : 0,
        hatch: prog(t, P(27.3), P(28.9)), label: outSoft(prog(t, P(28.4), P(29.2))),
      });
    }

    const wOn = t >= P(30) && t < P(33);
    ctx.wall.el.style.display = wOn ? 'block' : 'none';
    if (wOn) ctx.wall.set(t - P(30));
    const sOn = t >= P(40) && t < P(45);
    ctx.split.el.style.display = sOn ? 'block' : 'none';
    if (sOn) ctx.split.set((t - P(40)) / PULSE);

    const hd = { dur: 0.5, stagger: 0.06, outDur: 0.3 };
    ctx.h1.show(t, { ...hd, at: P(10), out: P(17.5) });
    ctx.h2.show(t, { ...hd, at: P(17.8), out: P(24.3) });
    ctx.h3.show(t, { ...hd, at: P(33), out: P(45) });
  },
};

export default scene;
