// "Marks add themselves up", re-inked (FILM.md §5 re-ink lift): the real Parts & marks panel
// holds (a) 4 and (b) 3 and reads "Total: 7 marks". Both Marks fields are traced on the footage,
// then the Marks column lifts off it as vector fields at frame scale, still a column (4 over + 3,
// a rule under it), the footage riding along and fading (reink carry); a copy of each number
// drops into "Total: _ marks" under the column: 4, then 7. Every number is the panel's own value.
// Pure: update(t) writes styles from t only. Times are scene seconds (T, in pulses × P).
import { h, s, svg, show, place, f, C, FONT } from '../../lib/index.js';
import { clamp, lerp, prog, outSoft, inOutSoft, spring, sineInOut } from '../../lib/ease.js';
import * as reink from '../../lib/reink.js';
import { DISPLAY } from '../../lib/type.js';

/** The fields' values in the footage (answer-lines: (a) 4, (b) 3, Total: 7 marks). */
export const VALUES = { a: 4, b: 3, total: 7 };

// Frame-scale layout (design px): the column of fields over a rule over the total line.
const BOX_W = 240, COL_TOP = 290, RULE_GAP = 26, TOTAL_GAP = 40, TOTAL_SIZE = DISPLAY.size; // lib/type.js DISPLAY
const PAD = 4; // the trace sits this far outside a field (footage px)

/**
 * marks(parent, { fieldA, fieldB, T }): fieldA/B = the Marks fields' rects in design px when
 * the push into the panel has settled; T = { trace, lift, plus, flyA, flyB, words, pop,
 * hold: [from, to], fade: the carried card's fade (s) } (scene s; spans as [from, to]).
 */
export function marks(parent, { fieldA, fieldB, T }) {
  const root = h('div', { class: 'marks', style: { position: 'absolute', inset: 0, pointerEvents: 'none' } }, parent);
  const group = h('div', { style: { position: 'absolute', inset: 0, transformOrigin: '960px 560px' } }, root);
  const ink = svg(root, {});
  const ring = (r) => s('rect', { x: f(r.x - PAD), y: f(r.y - PAD), width: f(r.w + 2 * PAD), height: f(r.h + 2 * PAD), rx: 9, fill: 'none', stroke: C.markBlue, 'stroke-width': 3 }, ink);
  const rings = [ring(fieldA), ring(fieldB)];

  // The column at frame scale: both fields keep their places relative to each other (one lift).
  const col = { x: fieldA.x, y: fieldA.y, w: fieldA.w, h: fieldB.y + fieldB.h - fieldA.y };
  const k = BOX_W / col.w, colBottom = COL_TOP + col.h * k;
  const ruleY = colBottom + RULE_GAP, TOTAL_TOP = ruleY + TOTAL_GAP;

  // "Total: _ marks" with a fixed slot for the number (the 7 in the dot's blue), under the column.
  const row = h('div', { style: { position: 'absolute', left: 0, top: `${f(TOTAL_TOP, 2)}px`, width: '1920px', textAlign: 'center', whiteSpace: 'pre', font: `400 ${TOTAL_SIZE}px ${FONT.serif}`, letterSpacing: `${DISPLAY.tracking}em`, lineHeight: String(DISPLAY.lh), color: DISPLAY.color } }, group);
  const word = (text) => h('span', { text, style: { display: 'inline-block' } }, row);
  const w1 = word('Total: ');
  const slot = h('span', { style: { display: 'inline-block', textAlign: 'center', color: C.markBlue, width: `${TOTAL_SIZE * 0.56}px` } }, row);
  const w2 = word(' marks');
  const sc = [slot.offsetLeft + slot.offsetWidth / 2, TOTAL_TOP + TOTAL_SIZE * 0.52]; // the slot's centre
  const colTo = { x: sc[0] - BOX_W / 2, y: COL_TOP, w: BOX_W, h: col.h * k }; // the column sits over the slot
  const target = (i) => { const r = i ? fieldB : fieldA; return { x: colTo.x, y: COL_TOP + (r.y - fieldA.y) * k, w: BOX_W, h: r.h * k }; };

  // A field re-inked: white, a blue rim, the digit in the panel's face (Inter 500).
  const field = (r, v) => {
    const el = h('div', { style: {
      position: 'absolute', left: 0, top: 0, width: `${f(r.w, 2)}px`, height: `${f(r.h, 2)}px`,
      boxSizing: 'border-box', background: C.paper, border: `3px solid ${C.markBlue}`, borderRadius: '9px', transformOrigin: '0 0',
      display: 'flex', alignItems: 'center', justifyContent: 'center', font: `500 ${f(r.h * 0.52, 2)}px ${FONT.sans}`, color: C.ink,
    } }, group);
    el.textContent = String(v);
    return el;
  };
  const boxes = [field(fieldA, VALUES.a), field(fieldB, VALUES.b)];
  const g2 = svg(group, {});
  const pc = [colTo.x - 52, target(1).y + target(1).h / 2]; // the plus, left of (b)
  const line = (d, w = 5) => s('path', { d, stroke: C.ink, 'stroke-width': w, 'stroke-linecap': 'round', fill: 'none' }, g2);
  const plusPaths = [line(`M${f(pc[0] - 22)} ${f(pc[1])}h44`), line(`M${f(pc[0])} ${f(pc[1] - 22)}v44`)];
  const rule = line(`M${f(pc[0] - 30)} ${f(ruleY)}H${f(colTo.x + BOX_W)}`, 4);
  const flyer = (v) => h('div', { text: String(v), style: { position: 'absolute', left: 0, top: 0, font: `400 ${TOTAL_SIZE}px ${FONT.serif}`, lineHeight: '1', color: C.markBlue, transformOrigin: '0 0', whiteSpace: 'pre' } }, group);
  const flyers = [flyer(VALUES.a), flyer(VALUES.b)];
  const fw = flyers.map((el) => [el.offsetWidth, el.offsetHeight]);
  group.prepend(...flyers); // behind the fields: a copy slides out from under its field

  const span = ([a, b], t, e = inOutSoft) => e(prog(t, a, b));
  function update(t) {
    const on = t >= T.trace[0] && t < T.hold[1];
    show(root, on ? 1 : 0);
    if (!on) return;
    const lifted = t >= T.lift[0];
    // The trace: rings draw round the footage fields, then hand over to the vector fields.
    rings.forEach((r, i) => {
      show(r, lifted ? 0 : 1);
      if (!lifted) reink.stroke(r, t, { at: T.trace[0] + i * 0.12, dur: T.trace[1] - T.trace[0] - 0.12 });
    });
    const L = reink.lift(t, col, colTo, { at: T.lift[0], dur: T.lift[1] - T.lift[0] });
    boxes.forEach((el, i) => {
      if (!lifted) return show(el, 0);
      const from = i ? fieldB : fieldA;
      // lift() poses a layer at (0, 0); this box sits at its own corner: carry it there.
      el.style.transform = `translate(${f(L.x + from.x * L.scale, 2)}px, ${f(L.y + from.y * L.scale, 2)}px) scale(${f(L.scale, 5)})`;
      el.style.borderWidth = `${f(3 / L.scale, 3)}px`; // a 3 px rim at every scale
      el.style.borderRadius = `${f(9 / L.scale, 3)}px`;
      show(el, 1);
    });
    plusPaths.forEach((p, i) => reink.stroke(p, t, { at: T.plus[0] + i * 0.08, dur: T.plus[1] - T.plus[0] - 0.08 }));
    reink.stroke(rule, t, { at: T.plus[0] + 0.1, dur: T.plus[1] - T.plus[0] });
    // The words of the total rise in; each copy flies from its field into the slot.
    const wp = span(T.words, t, outSoft);
    for (const el of [w1, w2]) {
      show(el, wp);
      el.style.transform = `translateY(${f((1 - wp) * 18, 2)}px)`;
    }
    flyers.forEach((el, i) => {
      const [a, b] = i ? T.flyB : T.flyA;
      const p = span([a, b], t);
      const tg = target(i);
      const k = lerp(0.5, 1, p);
      const cx = lerp(tg.x + tg.w / 2, sc[0], p), cy = lerp(tg.y + tg.h / 2, sc[1], p); // straight down, under the fields
      const o = t >= a && p < 1 ? clamp((t - a) / 0.08) * (i ? 1 - clamp((p - 0.6) / 0.4) : 1) : 0; // the 4 lands as itself; the 3 melts into the 7
      place(el, { x: cx - (fw[i][0] * k) / 2, y: cy - (fw[i][1] * k) / 2, scale: k, opacity: o });
    });
    // The slot: empty, then the first copy's 4, then 7 as the second lands, with a pop (no
    // in-between figures: only the panel's own values ever show).
    const n = t < T.flyA[1] ? '' : t < T.pop ? String(VALUES.a) : String(VALUES.total);
    slot.textContent = n;
    const bump = (at, k) => (t >= at ? k * (1 - spring(prog(t, at, at + 0.4))) : 0);
    const pop = 1 + bump(T.flyA[1], 0.06) + bump(T.pop, 0.12);
    slot.style.transform = `scale(${f(pop, 4)})`;
    // The whole frame keeps breathing until the cut.
    place(group, { scale: 1 + 0.03 * sineInOut(prog(t, T.lift[1], T.hold[1])) });
  }
  /** The footage card rides with field (a)'s lift and fades (reink carry): apply it to the rig. */
  const carry = (t) => reink.lift(t, col, colTo, { at: T.lift[0], dur: T.lift[1] - T.lift[0], carry: { fade: T.fade } }).carry;
  update(-1);
  return { root, update, carry };
}
