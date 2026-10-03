// The desk beat (P(-2)…P(5)): the iris opens on the mark's dot; the four paper kinds rise as
// flat sketches (illustration, PaperSketch geometry) and write themselves; the dot drops into
// the Classroom worksheet's diagram; that page opens into the window card and lands exactly
// where the real page sits in the footage, for the cut at P(5).
import { h, s, svg, sketch, place, show, C, PAPER_SHADOW, SKETCH_KINDS, ease, tw, f } from '../../lib/index.js';
import { P, DESK, deskX, DOT0, DOT1, DOT1_R, CARD, PAGE_IN_CARD, DESK_FILL } from './geom.js';

const { lerp, prog, outSoft, inOutSoft, spring } = ease;
const inQuad = (p) => p * p;
const IRIS_R = 44; // the engine's iris dot

export function buildDesk(parent) {
  const el = h('div', { style: { position: 'absolute', inset: 0 } }, parent);
  // The opening card: a container that grows from the sketch's box into the window card.
  // Built after the other three so it opens over them.
  const morph = h('div', { style: {
    position: 'absolute', overflow: 'hidden', boxSizing: 'border-box', border: '1px solid transparent',
  } });
  const pages = SKETCH_KINDS.map((kind, i) => sketch(i === 0 ? morph : el, kind, { x: i === 0 ? 0 : deskX(i), y: i === 0 ? 0 : DESK.y, w: DESK.w }));
  el.appendChild(morph);
  pages[0].el.style.transformOrigin = '0 0';
  const ov = svg(el, {});
  const ring = s('rect', { fill: 'none', stroke: C.markBlue, 'stroke-width': 3, rx: 9 }, ov);
  const ripple = s('circle', { cx: DOT1[0], cy: DOT1[1], fill: 'none', stroke: C.markBlue }, ov);
  const dot = s('circle', { r: IRIS_R, fill: C.markBlue }, ov);
  return { el, morph, pages, ring, ripple, dot };
}

/** The Classroom page's box (frame px) and the card's box at scene time t. */
function opening(t) {
  const lift = 1 + 0.03 * spring(prog(t, P(3), P(3.6)));
  const p = inOutSoft(prog(t, P(3.25), P(5)));
  const w0 = DESK.w * lift, h0 = DESK.h * lift;
  const x0 = deskX(0) - (w0 - DESK.w) / 2, y0 = DESK.y - (h0 - DESK.h) / 2;
  const page = {
    x: lerp(x0, CARD.x + PAGE_IN_CARD.x, p), y: lerp(y0, CARD.y + PAGE_IN_CARD.y, p),
    w: lerp(w0, PAGE_IN_CARD.w, p), h: lerp(h0, PAGE_IN_CARD.h, p),
  };
  const card = { x: lerp(x0, CARD.x, p), y: lerp(y0, CARD.y, p), w: lerp(w0, CARD.w, p), h: lerp(h0, CARD.h, p) };
  return { p, page, card };
}

export function updateDesk(d, t) {
  show(d.el, t < P(5) ? 1 : 0);
  if (t >= P(5)) return;

  // The four pages rise and write themselves; the other three leave as the first opens.
  d.pages.forEach((pg, i) => {
    const rise = tw(t, P(0) + i * 0.08, 0.75);
    pg.write(prog(t, P(0.3) + i * 0.08, P(2.4) + i * 0.08));
    if (i === 0) return;
    const away = tw(t, P(3) + (i - 1) * 0.06, 0.45, inOutSoft);
    place(pg.el, { y: 48 * (1 - rise) + 60 * away, opacity: rise * (1 - away) });
  });

  // The Classroom page: rises with the rest, lifts when the dot lands, opens into the card.
  const rise0 = tw(t, P(0), 0.75);
  const { p, page, card } = opening(t);
  Object.assign(d.morph.style, {
    left: `${f(card.x, 2)}px`, top: `${f(card.y + 48 * (1 - rise0), 2)}px`, width: `${f(card.w, 2)}px`, height: `${f(card.h, 2)}px`,
    borderRadius: `${f(lerp(3, 16, p), 2)}px`,
    background: p > 0 ? DESK_FILL : 'transparent',
    borderColor: p > 0.02 ? C.line : 'transparent',
    boxShadow: p > 0 ? PAPER_SHADOW : 'none',
  });
  show(d.morph, rise0);
  const k = page.w / DESK.w;
  d.pages[0].el.style.transform = `translate(${f(page.x - card.x, 2)}px, ${f(page.y - card.y, 2)}px) scale(${f(k, 5)})`;
  d.pages[0].el.style.boxShadow = p > 0 ? 'none' : PAPER_SHADOW;
  // Its sketched marks fade as it opens: a clean page lands where the real one is.
  show(d.pages[0].svg, 1 - outSoft(prog(p, 0.05, 0.7)));

  // The selection ring: springs in on the landing, fades as the page opens.
  const sel = spring(prog(t, P(3), P(3.5)));
  const pad = 8 * sel;
  d.ring.setAttribute('x', f(page.x - pad, 2));
  d.ring.setAttribute('y', f(page.y - pad, 2));
  d.ring.setAttribute('width', f(page.w + 2 * pad, 2));
  d.ring.setAttribute('height', f(page.h + 2 * pad, 2));
  show(d.ring, Math.min(sel, 1) * (1 - outSoft(prog(t, P(3.4), P(4.2)))));

  // The dot: the iris's dot shrinks to the mark's size, then drops into the diagram.
  const shrink = outSoft(prog(t, -0.36, P(1.2)));
  const fall = prog(t, P(2), P(3));
  const x = lerp(DOT0[0], DOT1[0], inOutSoft(fall));
  const y = lerp(DOT0[1], DOT1[1], inQuad(fall));
  const r = fall > 0 ? lerp(13, DOT1_R, outSoft(prog(fall, 0.6, 1))) : lerp(IRIS_R, 13, shrink);
  d.dot.setAttribute('cx', f(x, 2));
  d.dot.setAttribute('cy', f(y, 2));
  d.dot.setAttribute('r', f(r, 3));
  show(d.dot, t < P(3) ? 1 : 0);
  // The landing ripple (the splash's: grows out while fading).
  const pr = prog(t, P(3), P(3) + 0.55);
  d.ripple.setAttribute('r', f(lerp(6, 40, outSoft(pr)), 2));
  d.ripple.setAttribute('stroke-width', f(lerp(3, 1, pr), 3));
  show(d.ripple, pr > 0 && pr < 1 ? 0.6 * (1 - pr) : 0);
}
