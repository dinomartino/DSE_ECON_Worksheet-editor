// Re-ink lifts (FILM.md §7 "Re-ink"): after a footage proof, the proven element leaves the
// screen as vector art at frame scale. Builders run at setup; every `at`/update is a pure
// function of t (attributes only, no state). Sound the lift with a pencil event.
//   lift(t, from, to, { at, dur })    the pose that carries a traced element from its footage
//                                     rect (design px) to frame scale (fitRect: ≤ 1400 px wide)
//   stroke(path, t, { at, dur })      animated stroke draw (dash offset, round caps hidden at 0)
//   hatch(svg, { points, gap })       45° hatch fill of a polygon, revealed line by line
//   roll(t, { from, to, at, dur })    a number rolling to its total ('7', '7.5'), for marks
//   bars(svg, { x, y, w, h, values }) a bar chart growing from its baseline (coverage bars)
//   wavyPath(x, y, w) / wavy(svg, …)  the Check terms dotted-wave underline, drawn on
import { s } from './dom.js';
import { clamp, lerp, prog, outSoft, inOutSoft } from './ease.js';
import { f } from './tween.js';

/** Eased progress through [at, at + dur]. */
let hatchN = 0;
const pr = (t, at, dur, ease) => ease(prog(t, at, at + dur));

/** The rect `r` scaled to fit `box` (default: 1400 wide max inside the title-safe area), centred. */
export function fitRect(r, { box = { x: 96, y: 72, w: 1728, h: 936 }, maxW = 1400 } = {}) {
  const k = Math.min(maxW / r.w, box.w / r.w, box.h / r.h);
  const w = r.w * k, h = r.h * k;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h, k };
}

/**
 * The lift: a transform pose { x, y, scale } that, applied to an element drawn at `from`'s
 * geometry (origin 0 0 = from.x, from.y), carries it to `to` over [at, at + dur] on inOutSoft.
 * CSS: `translate(x, y) scale(scale)` with transform-origin 0 0 on a layer at (0, 0).
 */
export function lift(t, from, to, { at = 0, dur = 0.89, ease = inOutSoft } = {}) {
  const p = pr(t, at, dur, ease);
  const k = Math.exp(lerp(0, Math.log(to.w / from.w), p));
  const x = lerp(from.x, to.x, p), y = lerp(from.y, to.y, p);
  return { x: x - from.x * k, y: y - from.y * k, scale: k, p, css: `translate(${f(x - from.x * k, 2)}px, ${f(y - from.y * k, 2)}px) scale(${f(k, 5)})` };
}

/** Draws the first p of `path`'s length (any SVG geometry element); hidden at 0. */
export function strokeP(path, p) {
  const L = (path.__len ??= path.getTotalLength());
  const q = clamp(p);
  path.setAttribute('stroke-dasharray', `${f(L)} ${f(L)}`);
  path.setAttribute('stroke-dashoffset', f(L * (1 - q)));
  path.style.visibility = q > 0 ? 'visible' : 'hidden';
  return q;
}
/** Animated stroke draw at time t; `reverse` retracts it from the far end back to the start. */
export const stroke = (path, t, { at = 0, dur = 0.89, ease = outSoft, reverse = false } = {}) => {
  const p = pr(t, at, dur, ease);
  return strokeP(path, reverse ? 1 - p : p);
};

/**
 * A 45° (or `angle`) hatch inside polygon `points` ([[x, y], …] in the svg's units), lines `gap`
 * apart. Returns { el, lines, at(t, { at, dur, ease }) }: the lines draw on in sweep order.
 */
export function hatch(parent, { points, gap = 14, angle = 45, color = '#1E7FD4', width = 2.5, opacity = 0.9, id = `hatch-${++hatchN}` }) {
  const g = s('g', { opacity }, parent);
  const cp = s('clipPath', { id }, g);
  s('polygon', { points: points.map((p) => p.join(',')).join(' ') }, cp);
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const a = (angle * Math.PI) / 180, dx = Math.cos(a), dy = -Math.sin(a);
  const span = Math.hypot(x1 - x0, y1 - y0);
  const inner = s('g', { 'clip-path': `url(#${id})` }, g);
  const lines = [];
  // Lines perpendicular to (−dy, dx), stepping across the bounding box's diagonal.
  for (let d = -span; d <= span; d += gap) {
    const cx = (x0 + x1) / 2 + -dy * d, cy = (y0 + y1) / 2 + dx * d;
    const l = s('line', { x1: f(cx - dx * span), y1: f(cy - dy * span), x2: f(cx + dx * span), y2: f(cy + dy * span), stroke: color, 'stroke-width': width, 'stroke-linecap': 'round' }, inner);
    l.__len = 2 * span;
    lines.push(l);
  }
  return {
    el: g, lines,
    at(t, { at = 0, dur = 1.33, ease = outSoft, each = 0.35 } = {}) {
      const n = lines.length;
      lines.forEach((l, i) => strokeP(l, ease(prog(t, at + (dur - dur * each) * (i / Math.max(1, n - 1)), at + (dur - dur * each) * (i / Math.max(1, n - 1)) + dur * each))));
    },
  };
}

/** A number rolling from `from` to `to` over [at, at + dur] (outSoft), as text with `decimals`. */
export function roll(t, { from = 0, to = 1, at = 0, dur = 0.89, ease = outSoft, decimals = 0 } = {}) {
  const v = lerp(from, to, pr(t, at, dur, ease));
  return decimals ? v.toFixed(decimals) : String(Math.round(v));
}

/**
 * A bar chart: `values` (0..1) as bars across w, growing up from baseline y (svg units).
 * Returns { el, rects, at(t, { at, dur, stagger, ease }) }.
 */
export function bars(parent, { x, y, w, h, values, gap = 0.3, color = '#0076CC', radius = 3, track = null }) {
  const g = s('g', {}, parent);
  const bw = w / (values.length + gap * (values.length - 1));
  const rects = values.map((v, i) => {
    const bx = x + i * bw * (1 + gap);
    if (track) s('rect', { x: f(bx), y: f(y - h), width: f(bw), height: f(h), rx: radius, fill: track }, g);
    return { el: s('rect', { x: f(bx), y: f(y), width: f(bw), height: 0, rx: radius, fill: color }, g), v };
  });
  return {
    el: g, rects,
    at(t, { at = 0, dur = 0.67, stagger = 0.0741, ease = outSoft } = {}) {
      rects.forEach(({ el, v }, i) => {
        const hh = h * v * pr(t, at + i * stagger, dur, ease);
        el.setAttribute('y', f(y - hh));
        el.setAttribute('height', f(hh));
      });
    },
  };
}

/** The d of a wavy underline from (x, y), w long: amplitude `amp`, wavelength `wave`. */
export function wavyPath(x, y, w, { amp = 4, wave = 16 } = {}) {
  const n = Math.max(1, Math.round(w / wave)), step = w / n;
  let d = `M${f(x)} ${f(y)}`;
  for (let i = 0; i < n; i++) d += ` q${f(step / 4)} ${f(-amp * 2)} ${f(step / 2)} 0 t${f(step / 2)} 0`;
  return d;
}
/** A wavy underline path in `parent`; draw it with stroke(path, t, …). */
export const wavy = (parent, { x, y, w, amp, wave, color = '#DC2626', width = 2.5 }) =>
  s('path', { d: wavyPath(x, y, w, { amp, wave }), fill: 'none', stroke: color, 'stroke-width': width, 'stroke-linecap': 'round' }, parent);
