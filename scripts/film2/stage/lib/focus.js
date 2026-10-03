// Focus: dim everything but a rounded spotlight, and callout lines that draw on to a label.
import { h, s, svg as svgEl, drawable, show, C, FONT } from './dom.js';
import { f } from './tween.js';
import { lerp, prog, inOutSoft } from './ease.js';

/** The film-wide cap on any dim (motion review: 0.42 greyed whole cards). */
export const FOCUS_MAX = 0.16;

/**
 * The dim's envelope: 0 before `on`, inOutSoft up over `dur`, 1, inOutSoft down to 0 at `off`
 * (both ends ease in and out: no pop on onset or release).
 */
export const focusEnv = (t, on, off, dur = 0.5) => Math.max(0, Math.min(1, inOutSoft(prog(t, on, on + dur)) - inOutSoft(prog(t, off - dur, off))));

/**
 * focus(parent) → { el, set({ x, y, w, h, r, amount }) }: a spotlight rectangle in design
 * px; `amount` 0..1 is how much the rest dims (to ink at ≤ 16 %, FOCUS_MAX). Use it on
 * MEDIUM frames only (camera.js); CLOSE crops instead of dimming.
 */
export function focus(parent, { color = '42 38 32', max = FOCUS_MAX } = {}) {
  const el = h('div', { class: 'focus', style: { position: 'absolute', pointerEvents: 'none' } }, parent);
  const top = Math.min(max, FOCUS_MAX);
  function set({ x = 0, y = 0, w = 100, h: ht = 100, r = 16, amount = 1 }) {
    Object.assign(el.style, {
      left: `${f(x, 2)}px`, top: `${f(y, 2)}px`, width: `${f(w, 2)}px`, height: `${f(ht, 2)}px`,
      borderRadius: `${f(r, 2)}px`, boxShadow: `0 0 0 4000px rgb(${color} / ${f(top * amount, 4)})`,
    });
    show(el, amount > 0.001 ? 1 : 0);
  }
  set({ amount: 0 });
  return { el, set };
}

/**
 * callout(parent, { from: [x, y], to: [x, y], label, side }) → { set(p) }: a hairline from a
 * dot at `from` to `to` (an elbow when they are not aligned), drawn on by p 0..1, then the
 * label fades in at `to`.
 */
export function callout(parent, { from, to, label = '', color = C.ink, side = 'right', size = 26 }) {
  const root = svgEl(parent, { style: { position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' } });
  const [x0, y0] = from, [x1, y1] = to;
  const mid = [lerp(x0, x1, 0.5), y0];
  const d = x0 === x1 || y0 === y1 ? `M${x0} ${y0}L${x1} ${y1}` : `M${x0} ${y0}L${mid[0]} ${y0}L${mid[0]} ${y1}L${x1} ${y1}`;
  const len = Math.abs(x1 - x0) + Math.abs(y1 - y0);
  const path = s('path', { d, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, root);
  const draw = drawable(path, len);
  const dot = s('circle', { cx: x0, cy: y0, r: 6, fill: C.markBlue }, root);
  const text = h('div', { text: label, style: {
    position: 'absolute', top: `${y1 - size * 0.7}px`, font: `500 ${size}px ${FONT.sans}`, color, whiteSpace: 'pre',
    ...(side === 'right' ? { left: `${x1 + 14}px` } : { right: `${1920 - x1 + 14}px` }),
  } }, parent);
  function set(p) {
    dot.setAttribute('transform', `translate(${x0} ${y0}) scale(${f(Math.min(1, p * 5), 4)}) translate(${-x0} ${-y0})`);
    draw(Math.min(1, Math.max(0, (p - 0.1) / 0.6)));
    show(text, Math.max(0, (p - 0.65) / 0.35));
  }
  set(0);
  return { set, path, dot, text };
}
