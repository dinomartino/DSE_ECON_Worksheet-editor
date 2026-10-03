// "Marks add themselves up", re-inked (FILM.md §5 re-ink lift): the real Parts & marks panel
// holds (a) 4 and (b) 3 and reads "Total: 7 marks". Both Marks fields are traced on the footage,
// lift off it as vector fields at frame scale ("4 + 3"), and a copy of each number flies down
// into "Total: _ marks", which rolls 4 → 7. Every number is the panel's own value.
// Pure: update(t) writes styles from t only. Times are scene seconds (T, in pulses × P).
import { h, s, svg, show, place, f, C, FONT } from '../../lib/index.js';
import { clamp, lerp, prog, outSoft, inOutSoft, spring, sineInOut } from '../../lib/ease.js';
import * as reink from '../../lib/reink.js';

/** The fields' values in the footage (answer-lines: (a) 4, (b) 3, Total: 7 marks). */
export const VALUES = { a: 4, b: 3, total: 7 };

// Frame-scale layout (design px): the two fields over the total line.
const BOX_W = 280, GAP = 120, ROW_Y = 330, TOTAL_TOP = 600, TOTAL_SIZE = 160;
const PAD = 4; // the trace sits this far outside a field (footage px)

/**
 * marks(parent, { fieldA, fieldB, T }): fieldA/B = the Marks fields' rects in design px when
 * the push into the panel has settled; T = { trace, lift, plus, flyA, flyB, words, roll, pop,
 * hold: [from, to] } (scene s; spans as [from, to]).
 */
export function marks(parent, { fieldA, fieldB, T }) {
  const root = h('div', { class: 'marks', style: { position: 'absolute', inset: 0, pointerEvents: 'none' } }, parent);
  const group = h('div', { style: { position: 'absolute', inset: 0, transformOrigin: '960px 560px' } }, root);
  const ink = svg(root, {});
  const ring = (r) => s('rect', { x: f(r.x - PAD), y: f(r.y - PAD), width: f(r.w + 2 * PAD), height: f(r.h + 2 * PAD), rx: 9, fill: 'none', stroke: C.markBlue, 'stroke-width': 3 }, ink);
  const rings = [ring(fieldA), ring(fieldB)];

  // A field re-inked: white, a blue rim, the digit in the panel's face (Inter 500).
  const target = (i) => ({ x: 960 + (i ? GAP / 2 : -GAP / 2 - BOX_W), y: ROW_Y, w: BOX_W, h: (BOX_W * fieldA.h) / fieldA.w });
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
  const plusPaths = [
    s('path', { d: `M${960 - 26} ${ROW_Y + target(0).h / 2}h52`, stroke: C.ink, 'stroke-width': 5, 'stroke-linecap': 'round', fill: 'none' }, g2),
    s('path', { d: `M960 ${ROW_Y + target(0).h / 2 - 26}v52`, stroke: C.ink, 'stroke-width': 5, 'stroke-linecap': 'round', fill: 'none' }, g2),
  ];

  // "Total: _ marks" with a fixed slot for the rolling number (the 7 in the dot's blue).
  const row = h('div', { style: { position: 'absolute', left: 0, top: `${TOTAL_TOP}px`, width: '1920px', textAlign: 'center', whiteSpace: 'pre', font: `400 ${TOTAL_SIZE}px ${FONT.serif}`, letterSpacing: '-0.02em', lineHeight: '1', color: C.ink } }, group);
  const word = (text) => h('span', { text, style: { display: 'inline-block' } }, row);
  const w1 = word('Total: ');
  const slot = h('span', { style: { display: 'inline-block', textAlign: 'center', color: C.markBlue, width: `${TOTAL_SIZE * 0.56}px` } }, row);
  const w2 = word(' marks');
  const sc = [slot.offsetLeft + slot.offsetWidth / 2, TOTAL_TOP + TOTAL_SIZE * 0.52]; // the slot's centre
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
    boxes.forEach((el, i) => {
      if (!lifted) return show(el, 0);
      const from = i ? fieldB : fieldA;
      const L = reink.lift(t, from, target(i), { at: T.lift[0], dur: T.lift[1] - T.lift[0] });
      // lift() poses a layer at (0, 0); this box sits at its own corner: carry it there.
      el.style.transform = `translate(${f(L.x + from.x * L.scale, 2)}px, ${f(L.y + from.y * L.scale, 2)}px) scale(${f(L.scale, 5)})`;
      el.style.borderWidth = `${f(3 / L.scale, 3)}px`; // a 3 px rim at every scale
      el.style.borderRadius = `${f(9 / L.scale, 3)}px`;
      show(el, 1);
    });
    plusPaths.forEach((p, i) => reink.stroke(p, t, { at: T.plus[0] + i * 0.08, dur: T.plus[1] - T.plus[0] - 0.08 }));
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
      const cx = lerp(tg.x + tg.w / 2, sc[0], p), cy = lerp(tg.y + tg.h / 2, sc[1], p) - Math.sin(Math.PI * p) * 60;
      const o = t >= a && p < 1 ? clamp((t - a) / 0.08) * (i ? 1 - clamp((p - 0.6) / 0.4) : 1) : 0; // the 4 lands as itself; the 3 melts into the roll
      place(el, { x: cx - (fw[i][0] * k) / 2, y: cy - (fw[i][1] * k) / 2, scale: k, opacity: o });
    });
    // The slot: empty, then the first copy's 4, then 4 → 7 as the second lands, with a pop.
    const n = t < T.flyA[1] ? '' : t < T.roll[0] ? String(VALUES.a) : reink.roll(t, { from: VALUES.a, to: VALUES.total, at: T.roll[0], dur: T.roll[1] - T.roll[0] });
    slot.textContent = n;
    const bump = (at, k) => (t >= at ? k * (1 - spring(prog(t, at, at + 0.4))) : 0);
    const pop = 1 + bump(T.flyA[1], 0.06) + bump(T.pop, 0.12);
    slot.style.transform = `scale(${f(pop, 4)})`;
    // The whole frame keeps breathing until the cut.
    place(group, { scale: 1 + 0.02 * sineInOut(prog(t, T.lift[1], T.hold[1])) });
  }
  update(-1);
  return { root, update };
}
