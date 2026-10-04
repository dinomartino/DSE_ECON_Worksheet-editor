// The draw act's two re-ink lifts (FILM.md §5 "Re-ink lift"), illustration over the footage:
//   sd  the canvas's axes, D and S, traced in ink over the window, lifted to frame scale, the
//       arrowheads, the blue dot, the guides and the labels drawn on; then morphed onto the next
//       shot's lines (DRAWN → GIVEN) so the footage takes over exactly under them.
//   cs  the consumer-surplus triangle: outline traced over the CLOSE, lifted to frame scale on
//       cream, its hatch re-drawn line by line in the mark's blue, "CS" set in.
import { C } from '../../lib/dom.js';
import { clamp, lerp, outSoft } from '../../lib/ease.js';
import { DRAWN, GIVEN, ARROW, LINE, CS } from './geom.js';
import { layer, line, head, dot, text, mapper, lerpPt, mixHex, hatchSegments } from './vec.js';

const BLACK = '#000000';
const dashOf = (k) => [7.5 * k, 6.5 * k];

/** The supply-and-demand re-ink. set(P, st), st documented below. */
export function sdInk(parent) {
  const root = layer(parent);
  const L = { y: line(root), x: line(root), D: line(root), S: line(root) };
  const G = { y: line(root, { 'stroke-linecap': 'butt' }), x: line(root, { 'stroke-linecap': 'butt' }) };
  const H = { y: head(root), x: head(root) };
  const ripple = dot(root), blue = dot(root);
  const lab = {
    D: text(root, 'D'), S: text(root, 'S'),
    P: text(root, 'P', { sub: '0' }), Q: text(root, 'Q', { sub: '0' }),
  };
  /**
   * st = { m: DRAWN → GIVEN 0..1, o, w: width factor, hue: 0 blue pen … 1 ink, ink: 0 ink … 1 black,
   *        pen: { y, x, D, S } growth 0..1, heads 0..1, guides: { p, o }, dot: { s, ripple }, labels 0..1 }
   */
  function set(P, st) {
    const map = mapper(P);
    const k = P.s;
    const at = (a, b) => lerpPt(a, b, st.m);
    const g = {
      o: at(DRAWN.o, GIVEN.o), yTip: lerp(DRAWN.yTip, GIVEN.yTip, st.m), xTip: DRAWN.xTip,
      D: [at(DRAWN.D[0], GIVEN.D[0]), at(DRAWN.D[1], GIVEN.D[1])],
      S: [at(DRAWN.S[0], GIVEN.S[0]), at(DRAWN.S[1], GIVEN.S[1])],
      E: at(DRAWN.E, GIVEN.E),
    };
    const color = mixHex(mixHex(C.markBlue, C.ink, st.hue ?? 1), BLACK, st.ink); // a blue pen over the footage, ink once lifted
    const w = LINE * k * st.w;
    const ends = {
      y: [g.o, [g.o[0], g.yTip + ARROW.len * 0.6]], x: [g.o, [g.xTip - ARROW.len * 0.6, g.o[1]]],
      D: g.D, S: g.S,
    };
    for (const [key, el] of Object.entries(L)) el.set(map(ends[key][0]), map(ends[key][1]), { p: st.pen[key], w, color, o: st.o });
    const q = clamp(st.heads);
    H.y.set(map([g.o[0], g.yTip]), [0, -1], ARROW.len * k * q, ARROW.half * k * q, color, st.o);
    H.x.set(map([g.xTip, g.o[1]]), [1, 0], ARROW.len * k * q, ARROW.half * k * q, color, st.o);
    const e = map(g.E);
    const gd = { w: 2 * k, color: C.inkMuted, dash: dashOf(k) };
    G.y.set(e, map([g.o[0], g.E[1]]), { ...gd, p: st.guides.p, o: st.guides.o * st.o });
    G.x.set(e, map([g.E[0], g.o[1]]), { ...gd, p: st.guides.p, o: st.guides.o * st.o });
    const r = 6.5 * k;
    blue.set(e, r * st.dot.s, { o: st.o });
    const rp = clamp(st.dot.ripple);
    ripple.set(e, r * lerp(1.4, 6, outSoft(rp)), { ring: 2.4, o: rp > 0 && rp < 1 ? 0.55 * (1 - rp) * st.o : 0 });
    // Labels sit off the line ends and the guide feet, in design px, upright and unscaled.
    const lo = clamp(st.labels) * st.o;
    const d1 = map(g.D[1]), s1 = map(g.S[1]);
    lab.D.set([d1[0] + 14, d1[1] + 16], { size: 34, o: lo });
    lab.S.set([s1[0] + 14, s1[1] - 6], { size: 34, o: lo });
    lab.P.set([map(g.o)[0] - 16, e[1] + 11], { size: 30, o: lo, anchor: 'end', color: C.inkMuted });
    lab.Q.set([e[0], map(g.o)[1] + 40], { size: 30, o: lo, anchor: 'middle', color: C.inkMuted });
  }
  return { el: root, set };
}

/** The consumer-surplus lift. set(P, st): st = { o, trace 0..1, ink 0 blue … 1 ink, lines 0..1, hatch 0..1, label 0..1 }. */
export function csInk(parent) {
  const root = layer(parent);
  const ctxL = { y: line(root), S: line(root), D: line(root) };
  const p0 = line(root, { 'stroke-linecap': 'butt' });
  const edge = { top: line(root), bottom: line(root), left: line(root) };
  const segs = hatchSegments(CS, 7);
  const hatch = segs.map(() => line(root));
  const label = text(root, 'CS');
  function set(P, st) {
    const map = mapper(P);
    const k = P.s;
    const [A, E, B] = CS; // D's start, the equilibrium, the P0 corner
    const lo = clamp(st.lines) * st.o;
    ctxL.y.set(map([GIVEN.o[0], GIVEN.o[1]]), map([GIVEN.o[0], GIVEN.yTip]), { w: LINE * k * 0.8, color: C.ink, o: lo * 0.55 });
    ctxL.S.set(map(GIVEN.S[0]), map(GIVEN.S[1]), { w: LINE * k * 0.8, color: C.inkSubtle, o: lo * 0.7 });
    ctxL.D.set(map(GIVEN.D[0]), map(GIVEN.D[1]), { w: LINE * k, color: C.ink, o: st.o });
    p0.set(map([GIVEN.o[0], E[1]]), map(E), { w: 2.2 * Math.min(k, 2.6), color: C.inkMuted, dash: dashOf(Math.min(k, 2.6)), o: lo });
    // The outline: the pen goes round the triangle (D edge, P0 edge, left edge).
    const tr = clamp(st.trace) * 3;
    // The pen is blue over the footage (it must read against the black outline), ink once lifted.
    const ew = Math.max(4, LINE * k * 1.1), ec = mixHex(C.markBlue, C.ink, st.ink ?? 1);
    edge.top.set(map(A), map(E), { p: tr, w: ew, color: ec, o: st.o });
    edge.bottom.set(map(E), map(B), { p: tr - 1, w: ew, color: ec, o: st.o });
    edge.left.set(map(B), map(A), { p: tr - 2, w: ew, color: ec, o: st.o });
    const n = segs.length;
    const hw = Math.max(2.5, 0.9 * k);
    segs.forEach(([a, b], i) => {
      const q = clamp((st.hatch - (i / n) * 0.65) / 0.35);
      hatch[i].set(map(a), map(b), { p: outSoft(q), w: hw, color: C.markBlue, o: st.o });
    });
    const c = map([(A[0] + E[0] + B[0]) / 3 - 6, (A[1] + E[1] + B[1]) / 3 + 20]);
    label.set(c, { size: 30 * Math.max(1, k / 1.6), color: C.ink, o: clamp(st.label) * st.o, anchor: 'middle', halo: C.cream });
  }
  return { el: root, set };
}
