// The re-ink lift of the 題庫 (FILM.md §5): the twelve coverage bars leave their topic cards
// as vector and stand up as one coverage chart at frame scale. Each bar's MCQ (dark) and LQ
// (light) lengths are read off the app's own frame, so the chart says what the cards said.
import { s, C, FONT } from '../../lib/dom.js';
import { clamp, lerp, prog, inOutSoft, outSoft } from '../../lib/ease.js';
import { f } from '../../lib/tween.js';
import { roll } from '../../lib/reink.js';
import { CARDS, COUNTS, CHART, COLUMN_W, columnX, gridPt, GRID } from './geom.js';

const DARK = '#0076CC', LIGHT = '#93C2E0';

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
 * The chart layer: per card a dark and a light rect (they start as the card's bar, design px),
 * the topic letters under the columns and the counts over them.
 */
export function chart(parent, values, { k = 1, about = [960, 640] } = {}) {
  const svg = s('svg', { width: 1920, height: 1080, viewBox: '0 0 1920 1080', style: { position: 'absolute', left: 0, top: 0, overflow: 'visible' } }, parent);
  const g = s('g', {}, svg);
  const max = Math.max(...values.map((v) => v.total));
  const cols = CARDS.map((c, i) => {
    const v = values[i];
    // From: the bar on the card (CSS track → design px through the grid).
    // (k: the grid's push at the moment the vector bars take over, about its centre)
    const [gx, gy] = gridPt([c.bar.x / 2, c.bar.y / 2]);
    const [x0, y0] = [about[0] + (gx - about[0]) * k, about[1] + (gy - about[1]) * k];
    const tw = (c.bar.w / 2) * GRID.s * k, th = Math.max(8, (c.bar.h / 2) * GRID.s * k);
    // To: the column, its height the bar's length relative to the longest (C).
    const H = (CHART.h * v.total) / max, Hd = (CHART.h * v.dark) / max;
    const cx = columnX(i);
    const seg = (fill, from, to) => ({ el: s('rect', { fill, rx: 4 }, g), from, to });
    return {
      dark: seg(DARK, { x: x0, y: y0, w: tw * v.dark, h: th }, { x: cx, y: CHART.base - Hd, w: COLUMN_W, h: Hd }),
      light: seg(LIGHT, { x: x0 + tw * v.dark, y: y0, w: tw * (v.total - v.dark), h: th }, { x: cx, y: CHART.base - H, w: COLUMN_W, h: H - Hd }),
      letter: s('text', { x: f(cx + COLUMN_W / 2), y: CHART.base + 46, 'text-anchor': 'middle', fill: C.inkMuted, style: `font: 500 24px ${FONT.sans}; letter-spacing: 0.04em` }, svg),
      count: s('text', { x: f(cx + COLUMN_W / 2), y: f(CHART.base - H - 18), 'text-anchor': 'middle', fill: C.ink, style: `font: 400 40px ${FONT.serif}` }, svg),
      id: c.id,
    };
  });
  cols.forEach((c) => (c.letter.textContent = c.id));
  const base = s('line', { x1: CHART.x - 24, x2: CHART.x + CHART.w + 24, y1: CHART.base, y2: CHART.base, stroke: C.lineStrong, 'stroke-width': 2, 'stroke-linecap': 'round' }, svg);
  base.__len = CHART.w + 48;

  /** Poses the lift at scene time t: bars travel [at, at + dur] (staggered), labels after. */
  function at(t, { lift, dur, labels, drift }) {
    cols.forEach((c, i) => {
      const p = inOutSoft(prog(t, lift + i * 0.035, lift + i * 0.035 + dur));
      for (const sg of [c.dark, c.light]) {
        const r = { x: lerp(sg.from.x, sg.to.x, p), y: lerp(sg.from.y, sg.to.y, p), w: lerp(sg.from.w, sg.to.w, p), h: lerp(sg.from.h, sg.to.h, p) };
        sg.el.setAttribute('x', f(r.x));
        sg.el.setAttribute('y', f(r.y));
        sg.el.setAttribute('width', f(Math.max(0, r.w)));
        sg.el.setAttribute('height', f(Math.max(0, r.h)));
        sg.el.setAttribute('rx', f(lerp(3, 6, p)));
        sg.el.style.visibility = sg.from.w > 0.5 || sg.to.h > 0.5 ? 'visible' : 'hidden';
      }
      const q = outSoft(prog(t, labels + i * 0.05, labels + i * 0.05 + 0.5));
      c.letter.style.opacity = f(q, 3);
      c.count.style.opacity = f(q, 3);
      c.count.textContent = roll(t, { from: 0, to: COUNTS[c.id], at: labels + i * 0.05, dur: 0.75 });
    });
    const b = clamp(outSoft(prog(t, lift + dur * 0.5, lift + dur + 0.3)));
    base.setAttribute('stroke-dasharray', `${f(base.__len)} ${f(base.__len)}`);
    base.setAttribute('stroke-dashoffset', f(base.__len * (1 - b)));
    base.style.visibility = b > 0 ? 'visible' : 'hidden';
    // A slow push on the finished chart (alive through the hold).
    const k = 1 + 0.025 * inOutSoft(prog(t, lift + dur, drift));
    const [ox, oy] = [960, CHART.base - CHART.h / 2];
    svg.style.transform = `translate(${f(ox * (1 - k), 2)}px, ${f(oy * (1 - k), 2)}px) scale(${f(k, 5)})`;
    svg.style.transformOrigin = '0 0';
  }
  return { svg, at };
}
