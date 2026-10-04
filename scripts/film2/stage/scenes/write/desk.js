// The desk (P(-2)…P(5)): the iris opens on a composed frame, the four paper kinds already on
// the desk at full opacity (illustration, PaperSketch geometry), writing themselves; the dot
// shrinks to the mark's size, hops and drops into the Classroom worksheet's diagram (P3);
// then the camera dives into that page (P3.25…P5) so its first question lands where the real
// stem is in the CLOSE that follows: the cut is a push-in onto the same line.
import { h, s, svg, sketch, show, C, SKETCH_KINDS, ease, f } from '../../lib/index.js';
import { P, BEAT, DESK, deskX, DOT0, DOT1, DOT1_R } from './geom.js';

const { lerp, prog, outSoft, inOutSoft, spring, sineInOut } = ease;
const inQuad = (p) => p * p;
const IRIS_R = 44; // the engine's iris dot
const STEM = [20, 46.3]; // the Classroom sketch's first question bar (sketch units)

export function buildDesk(parent) {
  const el = h('div', { style: { position: 'absolute', inset: 0 } }, parent);
  const group = h('div', { style: { position: 'absolute', inset: 0, transformOrigin: '0 0' } }, el);
  const pages = SKETCH_KINDS.map((kind, i) => sketch(group, kind, { x: deskX(i), y: DESK.y, w: DESK.w }));
  const ov = svg(group, {});
  const ring = s('rect', { fill: 'none', stroke: C.markBlue, 'stroke-width': 3, rx: 9 }, ov);
  const ripple = s('circle', { cx: DOT1[0], cy: DOT1[1], fill: 'none', stroke: C.markBlue }, ov);
  const dot = s('circle', { r: IRIS_R, fill: C.markBlue }, ov);
  return { el, group, pages, ring, ripple, dot };
}

/** target: { x, y, k } the stem's screen point and the page's px per sketch unit in the CLOSE. */
export function updateDesk(d, t, target) {
  show(d.el, t < BEAT.type ? 1 : 0);
  if (t >= BEAT.type) return;

  // The pages write themselves (left to right, 90 ms apart) as the iris opens.
  d.pages.forEach((pg, i) => pg.write(prog(t, P(-1) + i * 0.09, P(2.2) + i * 0.09)));

  // The camera: a slow breath on the desk, then the dive into the Classroom page.
  const sx = deskX(0) + (STEM[0] * DESK.w) / 120, sy = DESK.y + (STEM[1] * DESK.h) / 170;
  const breath = 1 + 0.02 * sineInOut(prog(t, P(-2), BEAT.dive));
  const p = inOutSoft(prog(t, BEAT.dive + P(0.25), BEAT.type));
  const k1 = target.k / (DESK.w / 120);
  const k = Math.exp(lerp(Math.log(breath), Math.log(k1), p));
  // The stem point travels from its breathing place to the target, on the same curve.
  const bx = 960 + (sx - 960) * breath, by = 540 + (sy - 540) * breath;
  const x = lerp(bx, target.x, p), y = lerp(by, target.y, p);
  d.group.style.transform = `translate(${f(x - sx * k, 2)}px, ${f(y - sy * k, 2)}px) scale(${f(k, 5)})`;
  // The sketched marks stay to the cut: the first question's bar becomes the real stem.

  // The selection ring springs in on the landing and fades as the dive starts.
  const sel = spring(prog(t, P(3), P(3.5)));
  const pad = 8 * sel;
  d.ring.setAttribute('x', f(deskX(0) - pad, 2));
  d.ring.setAttribute('y', f(DESK.y - pad, 2));
  d.ring.setAttribute('width', f(DESK.w + 2 * pad, 2));
  d.ring.setAttribute('height', f(DESK.h + 2 * pad, 2));
  show(d.ring, Math.min(sel, 1) * (1 - outSoft(prog(t, P(3.4), P(4.2)))));

  // The dot: the iris's dot shrinks to the mark's size, hops and drops into the diagram.
  // Its path is drawn in the frame, so the breath's scale is undone for its first part.
  const shrink = outSoft(prog(t, -0.36, P(1.2)));
  const fall = prog(t, P(1.5), P(3));
  const ox = x - sx * k, oy = y - sy * k; // the group's origin in the frame
  const dx = lerp(DOT0[0], ox + DOT1[0] * k, inOutSoft(fall));
  const dy = lerp(DOT0[1], oy + DOT1[1] * k, inQuad(fall)) - 150 * fall * (1 - fall);
  const [gx, gy] = [(dx - ox) / k, (dy - oy) / k]; // frame → group units
  const r = (fall > 0 ? lerp(13, DOT1_R, outSoft(prog(fall, 0.6, 1))) : lerp(IRIS_R, 13, shrink)) / k;
  d.dot.setAttribute('cx', f(gx, 2));
  d.dot.setAttribute('cy', f(gy, 2));
  d.dot.setAttribute('r', f(r, 3));
  show(d.dot, t < P(3) ? 1 : 0);
  const pr = prog(t, P(3), P(3) + 0.55);
  d.ripple.setAttribute('r', f(lerp(6, 40, outSoft(pr)), 2));
  d.ripple.setAttribute('stroke-width', f(lerp(3, 1, pr), 3));
  show(d.ripple, pr > 0 && pr < 1 ? 0.6 * (1 - pr) : 0);
}
