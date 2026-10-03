// A footage window with a 2D camera: one flat card (lib/card) whose content is the app at
// 1440×900 CSS, scaled by the card's width and a zoom z toward a point (cx, cy) in CSS px.
// The camera never shows past the frame's edges. Several clips share the card; one shows.
import { card, h, show, f } from '../../lib/index.js';

export const CSS_W = 1440, CSS_H = 900;

export function shot(parent) {
  const c = card(parent, { x: 0, y: 0, w: CSS_W, h: CSS_H });
  const cam = h('div', { style: { position: 'absolute', left: 0, top: 0, width: `${CSS_W}px`, height: `${CSS_H}px`, transformOrigin: '0 0' } }, c.body);
  const overlay = h('div', { style: { position: 'absolute', inset: 0, pointerEvents: 'none' } }, c.el);
  const clips = [];
  let view = { x: 0, y: 0, w: CSS_W, s: 1, tx: 0, ty: 0 };

  /** Poses the card (design px; height follows the 16:10 frame) and the camera. */
  function set({ x, y, w, z = 1, cx = CSS_W / 2, cy = CSS_H / 2, opacity = 1 }) {
    const ht = (w * CSS_H) / CSS_W;
    Object.assign(c.el.style, { left: `${f(x, 2)}px`, top: `${f(y, 2)}px`, width: `${f(w, 2)}px`, height: `${f(ht, 2)}px` });
    const s = (w / CSS_W) * z;
    const tx = Math.min(0, Math.max(w - CSS_W * s, w / 2 - cx * s));
    const ty = Math.min(0, Math.max(ht - CSS_H * s, ht / 2 - cy * s));
    cam.style.transform = `translate(${f(tx, 2)}px, ${f(ty, 2)}px) scale(${f(s, 5)})`;
    show(c.el, opacity);
    view = { x, y, w, h: ht, s, tx, ty };
  }

  /** Design px (relative to the card's parent) of CSS point (u, v) under the current pose. */
  const map = (u, v) => [view.x + view.tx + u * view.s, view.y + view.ty + v * view.s];
  /** Card-local px of CSS point (u, v): for overlays drawn inside the card. */
  const local = (u, v) => [view.tx + u * view.s, view.ty + v * view.s];

  /** Shows clip `i` (or none with -1) at clip time `ct`. */
  function play(i, ct) {
    clips.forEach((p, k) => {
      p.el.style.visibility = k === i ? 'visible' : 'hidden';
      if (k === i) p.at(Math.max(0, Math.min(p.duration - 1 / p.fps, ct)));
    });
  }

  return { card: c, el: c.el, cam, overlay, clips, set, map, local, play, get view() { return view; } };
}
