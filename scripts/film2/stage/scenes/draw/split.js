// The answer layer as a split screen (story.json): two paper panels in the C1 band, Student
// and Teacher, the tax diagram re-inked from answer-layer's Teacher geometry (the answer that
// answer-draw has just drawn). Student keeps its blank axes; on Teacher the model answer draws
// on in red from 1.5 pulses after the cut: D, S0, E0, then S1 slides up from S0 by t (the Shift
// a copy of the footage) with the t arrow, E1, the P1 / P1 − t / Q1 guides, the price-up and
// quantity-down arrows. Four pulses; illustration: the CLOSE on the real Teacher copy follows.
import { h, show, C } from '../../lib/dom.js';
import { label, LABEL } from '../../lib/type.js';
import { clamp, prog, outSoft, spring, inOutSoft, sineInOut } from '../../lib/ease.js';
import { f } from '../../lib/tween.js';
import { TAX } from './geom.js';
import { layer, line, head, dot, text, mapper, lerpPt } from './vec.js';

const PANEL = { y: 264, w: 840, h: 744, xs: [96, 984] };
const S = 1.45; // design px per CSS px inside a panel
const RED = C.red;
const SHADOW = '0 1px 2px rgb(0 0 0 / 0.07), 0 8px 24px -6px rgb(0 0 0 / 0.13), 0 24px 48px -12px rgb(0 0 0 / 0.11)';

/** split(parent, copy) → { el, set(t) } with t in pulses from the cut. copy: { student, teacher }. */
export function split(parent, copy) {
  const el = h('div', { style: { position: 'absolute', inset: 0, transformOrigin: '960px 636px' } }, parent);
  const panels = PANEL.xs.map((x, i) => {
    const card = h('div', { style: { position: 'absolute', left: `${x}px`, top: `${PANEL.y}px`, width: `${PANEL.w}px`, height: `${PANEL.h}px`, background: C.paper, borderRadius: '16px', border: `1px solid ${C.line}`, boxSizing: 'border-box', boxShadow: SHADOW } }, el);
    const tag = label(el, { ...LABEL, ...(i ? copy.teacher : copy.student), x: x + 40, y: PANEL.y + 58 });
    return { x, tag, card, P: { a: [x + PANEL.w / 2, PANEL.y + 80 + (PANEL.h - 80) / 2], c: [TAX.box.x + TAX.box.w / 2, TAX.box.y + TAX.box.h / 2], s: S } };
  });
  const svg = layer(el);
  // Both panels: axes and their labels.
  const axes = panels.map(() => ({
    y: line(svg), x: line(svg), hy: head(svg), hx: head(svg),
    price: text(svg, 'Price'), jia: text(svg, '價格', { zh: true }),
    qty: text(svg, 'Quantity'), shu: text(svg, '數量', { zh: true }), zero: text(svg, '0'),
  }));
  // Teacher: the red answer.
  const r = {
    D: line(svg), S0: line(svg), S1: line(svg), tax: line(svg), up: line(svg), left: line(svg),
    hTax: head(svg), hUp: head(svg), hLeft: head(svg),
    gP0: line(svg, { 'stroke-linecap': 'butt' }), gQ0: line(svg, { 'stroke-linecap': 'butt' }),
    gP1: line(svg, { 'stroke-linecap': 'butt' }), gQ1: line(svg, { 'stroke-linecap': 'butt' }), gPt: line(svg, { 'stroke-linecap': 'butt' }),
    E0: dot(svg), E1: dot(svg),
    lD: text(svg, 'D'), lS0: text(svg, 'S', { sub: '0' }), lS1: text(svg, 'S', { sub: '1' }), lt: text(svg, 't'),
    lP0: text(svg, 'P', { sub: '0' }), lQ0: text(svg, 'Q', { sub: '0' }), lP1: text(svg, 'P', { sub: '1' }),
    lQ1: text(svg, 'Q', { sub: '1' }), lPt: text(svg, 'P', { sub: '1' }), lPt2: text(svg, '− t'),
  };
  const w = (css) => css * S;
  const dash = [6 * S, 5 * S];

  function set(t) {
    const k = 1 + 0.04 * sineInOut(prog(t, 0.5, 4.2)); // a slow push on both panels while the answer draws
    el.style.transform = `scale(${f(k, 5)})`;
    const pe = (a, d) => outSoft(prog(t, a, a + d));
    panels.forEach((p, i) => {
      p.tag.show(pe(0.6, 1.4));
      const m = mapper(p.P), A = axes[i];
      const ga = pe(0.5, 1.4);
      const ci = outSoft(prog(t, i * 0.3, i * 0.3 + 1.6)); // the panels rise in, Teacher a beat later
      show(p.card, ci);
      p.card.style.transform = ci < 1 ? `translateY(${f((1 - ci) * 36, 2)}px)` : 'none';
      A.y.set(m(TAX.o), m([TAX.o[0], TAX.yTip + 6]), { p: ga, w: w(2.6), color: C.ink });
      A.x.set(m(TAX.o), m([TAX.xTip - 6, TAX.o[1]]), { p: ga, w: w(2.6), color: C.ink });
      const q = spring(prog(t, 1.3, 2));
      A.hy.set(m([TAX.o[0], TAX.yTip]), [0, -1], w(10) * q, w(5) * q, C.ink);
      A.hx.set(m([TAX.xTip, TAX.o[1]]), [1, 0], w(10) * q, w(5) * q, C.ink);
      const lo = pe(1.0, 1.0);
      A.price.set(m([450, 182.5]), { size: 25, o: lo });
      A.jia.set(m([451, 205]), { size: 23, o: lo });
      A.qty.set(m([842.5, 561]), { size: 25, o: lo });
      A.shu.set(m([842.5, 584]), { size: 23, o: lo });
      A.zero.set(m([450.5, 580]), { size: 25, o: lo, anchor: 'middle' });
    });
    // The answer, on Teacher only, from pulse 1.5 (48.70 s); R maps round 2's 5-pulse times onto 4 so
    // the last labels settle by pulse 3.9.
    const m = mapper(panels[1].P);
    const R = (x) => (x < 3 ? x - 0.5 : 2.5 + (x - 3) * 0.8);
    const red = { w: w(3), color: RED };
    r.D.set(m(TAX.D[0]), m(TAX.D[1]), { ...red, p: inOutSoft(prog(t, R(2), R(2.7))) });
    r.S0.set(m(TAX.S0[0]), m(TAX.S0[1]), { ...red, p: inOutSoft(prog(t, R(2.15), R(2.85))) });
    // S1: a copy of S0 slides up by t while the tax arrow grows with it.
    const sh = inOutSoft(prog(t, R(3.1), R(3.8)));
    const dy = (TAX.S1[0][1] - TAX.S0[0][1]) * sh;
    const on = t >= R(3.1) ? 1 : 0;
    r.S1.set(m([TAX.S0[0][0], TAX.S0[0][1] + dy]), m([TAX.S0[1][0], TAX.S0[1][1] + dy]), { ...red, o: on });
    const tipY = TAX.tax[0][1] + (TAX.tax[1][1] - TAX.tax[0][1]) * sh;
    r.tax.set(m(TAX.tax[0]), m([TAX.tax[0][0], tipY + 8]), { w: w(2.6), color: RED, o: sh > 0.15 ? 1 : 0 });
    r.hTax.set(m([TAX.tax[0][0], tipY]), [0, -1], sh > 0.15 ? w(11) : 0, w(6), RED);
    // Equilibria, guides, arrows.
    const pop = (a) => spring(prog(t, a, a + 0.5));
    r.E0.set(m(TAX.E0), w(4) * pop(R(2.8)), { color: RED });
    r.E1.set(m(TAX.E1), w(4) * pop(R(3.8)), { color: RED });
    const gd = { w: w(1.6), color: RED, dash };
    const g0 = pe(R(2.8), 0.6), g1 = pe(R(3.8), 0.6);
    r.gP0.set(m(TAX.E0), m([TAX.o[0], TAX.E0[1]]), { ...gd, p: g0 });
    r.gQ0.set(m(TAX.E0), m([TAX.E0[0], TAX.o[1]]), { ...gd, p: g0 });
    r.gP1.set(m(TAX.E1), m([TAX.o[0], TAX.E1[1]]), { ...gd, p: g1 });
    r.gQ1.set(m(TAX.E1), m([TAX.E1[0], TAX.o[1]]), { ...gd, p: g1 });
    r.gPt.set(m([TAX.E1[0], TAX.Pt]), m([TAX.o[0], TAX.Pt]), { ...gd, p: g1 });
    const ar = pe(R(4.0), 0.5);
    r.up.set(m(TAX.up[0]), m(lerpPt(TAX.up[0], TAX.up[1], 0.75)), { w: w(2.2), color: RED, p: ar });
    r.hUp.set(m(lerpPt(TAX.up[0], TAX.up[1], ar)), [0, -1], w(9) * clamp(ar * 3), w(5), RED);
    r.left.set(m(TAX.left[0]), m(lerpPt(TAX.left[0], TAX.left[1], 0.75)), { w: w(2.2), color: RED, p: ar });
    r.hLeft.set(m(lerpPt(TAX.left[0], TAX.left[1], ar)), [-1, 0], w(9) * clamp(ar * 3), w(5), RED);
    // Labels set in as their lines land.
    const L = (el, at, pt, o = {}) => el.set(m(pt), { size: 24, color: RED, o: pe(at, 0.6), ...o });
    L(r.lD, R(2.6), [766, 525]);
    L(r.lS0, R(2.8), [682, 342]);
    L(r.lS1, R(3.7), [682, 259]);
    L(r.lt, R(3.6), [641, 317]);
    L(r.lP0, R(3.0), [457, 396], { anchor: 'end' });
    L(r.lQ0, R(3.0), [624.4, 582], { anchor: 'middle' });
    L(r.lP1, R(4.0), [457, 356.5], { anchor: 'end' });
    L(r.lQ1, R(4.0), [581.4, 582], { anchor: 'middle' });
    L(r.lPt, R(4.0), [432, 440], { anchor: 'end' });
    L(r.lPt2, R(4.0), [457, 440], { anchor: 'end' });
  }
  return { el, set };
}
