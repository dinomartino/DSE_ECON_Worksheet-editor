// The re-ink lift of the 題庫 (FILM.md §5): the twelve coverage bars leave their topic cards
// as vector and stand up as one coverage chart at frame scale. Each bar's MCQ (dark) and LQ
// (light) lengths are read off the app's own frame, so the chart says what the cards said.
// One group per column (the light part always continues the dark one, never apart): the
// baseline and the topic letters draw first; every bar travels flat to the baseline, lying to
// the right of its column, then stands up about its bottom-left end like a lever, rippling
// left to right. A count appears only once its bar is at 85 %, and only the card's own number.
import { s, C, FONT } from '../../lib/dom.js';
import { clamp, lerp, prog, inOutSoft, outSoft } from '../../lib/ease.js';
import { f } from '../../lib/tween.js';
import { PULSE } from '../../../timeline.mjs';
import { CARDS, COUNTS, CHART, COLUMN_W, columnX, gridPt, GRID } from './geom.js';

const DARK = '#0076CC', LIGHT = '#93C2E0';
/** The lift's beats, seconds from `lift`: travel together, then the stand-up ripple. */
export const LIFT = { travel: 0.45, stand: 0.42, standAt: 0.4, stagger: PULSE / 6, base: 0.4 };
/** When the last column has stood up, seconds after `lift`. */
export const LIFT_END = LIFT.standAt + 11 * LIFT.stagger + LIFT.stand;
const LIE_MAX = 104; // px: a lying bar never reaches the next lying bar (columns 120 px apart)

/** { dark, total } of a coverage bar as fractions of its track, read along its middle row. */
export function measureBar(img, bar) {
  const cv = document.createElement('canvas');
  cv.width = bar.w;
  cv.height = 1;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, bar.x, bar.y + Math.floor(bar.h / 2), bar.w, 1, 0, 0, bar.w, 1);
  const d = g.getImageData(0, 0, bar.w, 1).data;
  let dark = 0, total = 0;
  for (let x = 0; x < bar.w; x++) {
    const [r, gg, b] = [d[4 * x], d[4 * x + 1], d[4 * x + 2]];
    const isDark = b > 150 && r < 70, isLight = b > 190 && r > 100 && r < 190 && gg > 160;
    if (isDark) dark = x + 1;
    if (isDark || isLight) total = x + 1;
  }
  return { dark: dark / bar.w, total: total / bar.w };
}

/**
 * The chart layer: per card one group (light under dark, in the group's own frame: x along the
 * bar from its pivot, y = −thickness..0), the topic letters under the columns, the counts over.
 * k / about: the grid's push at the moment the vector bars take over, so they start exactly on
 * the cards' bars.
 */
export function chart(parent, values, { k = 1, about = [960, 640] } = {}) {
  const svg = s('svg', { width: 1920, height: 1080, viewBox: '0 0 1920 1080', style: { position: 'absolute', left: 0, top: 0, overflow: 'visible', transformOrigin: '0 0' } }, parent);
  const base = s('line', { x1: CHART.x - 24, x2: CHART.x + CHART.w + 24, y1: CHART.base, y2: CHART.base, stroke: C.lineStrong, 'stroke-width': 2, 'stroke-linecap': 'round' }, svg);
  base.__len = CHART.w + 48;
  const max = Math.max(...values.map((v) => v.total));
  const cols = CARDS.map((c, i) => {
    const v = values[i];
    const [gx, gy] = gridPt([c.bar.x / 2, c.bar.y / 2]);
    const tw = (c.bar.w / 2) * GRID.s * k, th = Math.max(8, (c.bar.h / 2) * GRID.s * k);
    const cardLen = tw * v.total;
    const g = s('g', {}, svg);
    const cx = columnX(i);
    return {
      g,
      light: s('rect', { fill: LIGHT }, g),
      dark: s('rect', { fill: DARK }, g),
      // pivot = the bar's bottom-left end: on the card, then the column's bottom-right corner
      from: { x: about[0] + (gx - about[0]) * k, y: about[1] + (gy - about[1]) * k + th, L: cardLen, T: th },
      lie: { x: cx + COLUMN_W, y: CHART.base, L: Math.min(cardLen, LIE_MAX), T: COLUMN_W * 0.5 },
      to: { L: (CHART.h * v.total) / max, T: COLUMN_W },
      darkShare: v.total > 0 ? v.dark / v.total : 0,
      letter: s('text', { x: f(cx + COLUMN_W / 2), y: CHART.base + 44, 'text-anchor': 'middle', fill: C.inkMuted, style: `font: 500 22px ${FONT.sans}; letter-spacing: 0.04em` }, svg),
      count: s('text', { x: f(cx + COLUMN_W / 2), y: f(CHART.base - (CHART.h * v.total) / max - 18), 'text-anchor': 'middle', fill: C.ink, style: `font: 400 40px ${FONT.serif}` }, svg),
      id: c.id,
    };
  });
  cols.forEach((c) => {
    c.letter.textContent = c.id;
    c.count.textContent = String(COUNTS[c.id]); // the card's number, never a count-up
  });

  /** Poses the lift at scene time t: lift = the first flight frame; drift = the next cut. */
  function at(t, { lift, drift }) {
    const b = outSoft(prog(t, lift, lift + LIFT.base));
    base.setAttribute('stroke-dasharray', `${f(base.__len)} ${f(base.__len)}`);
    base.setAttribute('stroke-dashoffset', f(base.__len * (1 - b)));
    base.style.visibility = t >= lift ? 'visible' : 'hidden';
    const p = inOutSoft(prog(t, lift, lift + LIFT.travel));
    cols.forEach((c, i) => {
      const a0 = lift + LIFT.standAt + i * LIFT.stagger;
      const q = inOutSoft(prog(t, a0, a0 + LIFT.stand));
      const x = lerp(c.from.x, c.lie.x, p), y = lerp(c.from.y, c.lie.y, p);
      const L = q > 0 ? lerp(c.lie.L, c.to.L, q) : lerp(c.from.L, c.lie.L, p);
      const T = q > 0 ? lerp(c.lie.T, c.to.T, q) : lerp(c.from.T, c.lie.T, p);
      c.g.setAttribute('transform', `translate(${f(x, 2)} ${f(y, 2)}) rotate(${f(-90 * q, 3)})`);
      const r = f(Math.min(T / 2, lerp(3, 5, Math.max(p, q))), 2);
      for (const [el, len] of [[c.light, L], [c.dark, L * c.darkShare]]) {
        el.setAttribute('x', '0');
        el.setAttribute('y', f(-T, 2));
        el.setAttribute('width', f(Math.max(0, len), 2));
        el.setAttribute('height', f(T, 2));
        el.setAttribute('rx', r);
        el.style.visibility = len > 0.5 ? 'visible' : 'hidden';
      }
      // Letters from the first flight frame, following the baseline's draw.
      c.letter.style.opacity = f(outSoft(prog(t, lift + (i / 11) * LIFT.base, lift + (i / 11) * LIFT.base + 0.25)), 3);
      // The count once the bar stands at 85 % (eased progress), in over the last 15 %.
      c.count.style.opacity = f(clamp((q - 0.85) / 0.15), 3);
    });
    // A slow push at a constant rate from the last stand-up to the cut (alive through the hold).
    const end = lift + LIFT_END - LIFT.stand;
    const kk = 1 + 0.045 * prog(t, end, drift);
    const [ox, oy] = [960, CHART.base - CHART.h / 2];
    svg.style.transform = kk > 1 ? `translate(${f(ox * (1 - kk), 2)}px, ${f(oy * (1 - kk), 2)}px) scale(${f(kk, 5)})` : 'none';
  }
  return { svg, at };
}
