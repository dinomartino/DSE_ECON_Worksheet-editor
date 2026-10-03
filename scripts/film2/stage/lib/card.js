// A flat window card for footage and panels (FILM.md §4): radius 16, a 1 px line, the
// app's paper shadow, an optional generic title bar. No tilt, no perspective, no gloss.
import { h, place, C, FONT, PAPER_SHADOW } from './dom.js';

/**
 * card(parent, { x, y, w, h, radius, bar: false | 'plain' | { title }, fill })
 * → { el, body, set({ x, y, scale, opacity }) }. `body` is the content box under the bar;
 * set() poses the card around its centre.
 */
export function card(parent, { x = 0, y = 0, w = 1280, h: ht = 800, radius = 16, bar = false, fill = C.panel, shadow = PAPER_SHADOW } = {}) {
  const el = h('div', { class: 'card', style: {
    position: 'absolute', left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${ht}px`,
    borderRadius: `${radius}px`, background: fill, border: `1px solid ${C.line}`,
    boxShadow: shadow, overflow: 'hidden', transformOrigin: '50% 50%', boxSizing: 'border-box',
  } }, parent);
  let top = 0;
  if (bar) {
    top = 44;
    const tb = h('div', { style: {
      position: 'absolute', left: 0, right: 0, top: 0, height: `${top}px`, background: C.raised,
      borderBottom: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', gap: '8px', padding: '0 18px',
      boxSizing: 'border-box',
    } }, el);
    for (let i = 0; i < 3; i++) h('span', { style: { width: '12px', height: '12px', borderRadius: '50%', background: C.line } }, tb);
    if (bar.title) {
      h('span', { text: bar.title, style: {
        position: 'absolute', left: 0, right: 0, textAlign: 'center', font: `500 17px ${FONT.sans}`, color: C.inkSubtle,
      } }, tb);
    }
  }
  const body = h('div', { class: 'card-body', style: { position: 'absolute', left: 0, right: 0, top: `${top}px`, bottom: 0, overflow: 'hidden' } }, el);
  return {
    el, body, w, h: ht, barHeight: top,
    set: (p) => place(el, p),
  };
}
