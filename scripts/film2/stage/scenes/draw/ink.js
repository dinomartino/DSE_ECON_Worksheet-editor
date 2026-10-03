// The re-ink: the canvas's lines as clean vector strokes on cream, posed through the same
// camera as the footage (map: CSS px → design px, k = design px per CSS px). Two layers:
// `lift` — the lines as they were in the window (DRAWN), fading to a pencil grey; `ink` — the
// same diagram redrawn in ink over them (GIVEN), growing from each line's start like a pen.
// Illustration, not UI: warm ink, round caps, the blue equilibrium dot and its ripple.
import { s, show, C } from '../../lib/dom.js';
import { lerp, clamp, outCubic } from '../../lib/ease.js';
import { f } from '../../lib/tween.js';
import { DRAWN, GIVEN, ARROW } from './geom.js';

const seg = (a, b, p) => `M${f(a[0], 2)} ${f(a[1], 2)}L${f(lerp(a[0], b[0], p), 2)} ${f(lerp(a[1], b[1], p), 2)}`;

/** Hex colour mix a → b by p. */
export function mixHex(a, b, p) {
  const n = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [n(a), n(b)];
  return `#${x.map((v, i) => Math.round(lerp(v, y[i], clamp(p))).toString(16).padStart(2, '0')).join('')}`;
}

export function ink(parent) {
  const root = s('svg', { width: 1920, height: 1080, viewBox: '0 0 1920 1080', style: { position: 'absolute', left: 0, top: 0, overflow: 'visible' } }, parent);
  const line = (g, attrs = {}) => s('path', { fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', ...attrs }, g);
  const lift = s('g', {}, root);
  const L = { y: line(lift), x: line(lift), D: line(lift), S: line(lift) };
  const guides = s('g', {}, root);
  const G = { y: line(guides, { 'stroke-linecap': 'butt' }), x: line(guides, { 'stroke-linecap': 'butt' }) };
  const pen = s('g', {}, root);
  const I = { y: line(pen), x: line(pen), D: line(pen), S: line(pen) };
  const heads = { y: s('path', {}, pen), x: s('path', {}, pen) };
  const ripple = s('circle', { fill: 'none', stroke: C.markBlue }, root);
  const dot = s('circle', { fill: C.markBlue }, root);

  /** An axis arrowhead at `tip` pointing along unit `u`, scaled by q (0..1). */
  function head(el, map, k, tip, u, q, color) {
    const len = ARROW.len * q, half = ARROW.half * q;
    const t = map(tip);
    const b = [t[0] - u[0] * len * k, t[1] - u[1] * len * k];
    const n = [-u[1] * half * k, u[0] * half * k];
    el.setAttribute('d', `M${f(t[0], 2)} ${f(t[1], 2)}L${f(b[0] + n[0], 2)} ${f(b[1] + n[1], 2)}L${f(b[0] - n[0], 2)} ${f(b[1] - n[1], 2)}Z`);
    el.setAttribute('fill', color);
    show(el, q > 0.001 ? 1 : 0);
  }

  /**
   * set(map, k, st): st = {
   *   lift: { o, w, color }                       the lines as they were (DRAWN)
   *   ink: { o, w, color, y, x, D, S, heads }     the pen: growth 0..1 per line, arrowheads 0..1
   *   guides: { p, o, w, color }                  dashed drops from E to the axes
   *   dot: { s, ripple, o }                       the blue dot (scale) and its ripple (0..1)
   * }
   */
  function set(map, k, st) {
    const { lift: l, ink: p, guides: g, dot: d } = st;
    // The lift: exactly the window's lines.
    const dl = { y: [DRAWN.o, [DRAWN.o[0], DRAWN.yTip]], x: [DRAWN.o, [DRAWN.xTip, DRAWN.o[1]]], D: DRAWN.D, S: DRAWN.S };
    for (const [key, el] of Object.entries(L)) {
      el.setAttribute('d', seg(map(dl[key][0]), map(dl[key][1]), 1));
      el.setAttribute('stroke', l.color);
      el.setAttribute('stroke-width', f(l.w, 3));
      el.setAttribute('stroke-linecap', 'butt');
      show(el, l.o);
    }
    // The pen: GIVEN, each line growing from its start.
    const gl = {
      y: [GIVEN.o, [GIVEN.o[0], GIVEN.yTip + ARROW.len * 0.6]],
      x: [GIVEN.o, [GIVEN.xTip - ARROW.len * 0.6, GIVEN.o[1]]],
      D: GIVEN.D, S: GIVEN.S,
    };
    for (const [key, el] of Object.entries(I)) {
      const q = clamp(p[key]);
      el.setAttribute('d', seg(map(gl[key][0]), map(gl[key][1]), q));
      el.setAttribute('stroke', p.color);
      el.setAttribute('stroke-width', f(p.w, 3));
      show(el, q > 0 ? p.o : 0);
    }
    head(heads.y, map, k, [GIVEN.o[0], GIVEN.yTip], [0, -1], p.heads * p.o, p.color);
    head(heads.x, map, k, [GIVEN.xTip, GIVEN.o[1]], [1, 0], p.heads * p.o, p.color);
    // Guides: dashed, from E out to each axis.
    const e = map(GIVEN.E);
    const gy = map([GIVEN.o[0], GIVEN.E[1]]), gx = map([GIVEN.E[0], GIVEN.o[1]]);
    for (const [el, to] of [[G.y, gy], [G.x, gx]]) {
      el.setAttribute('d', seg(e, to, clamp(g.p)));
      el.setAttribute('stroke', g.color);
      el.setAttribute('stroke-width', f(g.w, 3));
      el.setAttribute('stroke-dasharray', `${f(7.5 * k, 2)} ${f(6.5 * k, 2)}`);
      show(el, g.p > 0 ? g.o : 0);
    }
    // The dot and its ripple (the mark's: grows .3 → 1 while fading .55 → 0).
    const r = 6.5 * k;
    dot.setAttribute('cx', f(e[0], 2));
    dot.setAttribute('cy', f(e[1], 2));
    dot.setAttribute('r', f(Math.max(0, r * d.s), 3));
    show(dot, d.s > 0.001 ? d.o : 0);
    const rp = clamp(d.ripple);
    ripple.setAttribute('cx', f(e[0], 2));
    ripple.setAttribute('cy', f(e[1], 2));
    ripple.setAttribute('r', f(r * lerp(1.4, 6, outCubic(rp)), 3));
    ripple.setAttribute('stroke-width', f(2.2, 3));
    show(ripple, rp > 0 && rp < 1 ? 0.55 * (1 - rp) * d.o : 0);
  }
  return { el: root, set };
}
