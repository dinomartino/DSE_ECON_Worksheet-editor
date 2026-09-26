// Glass chips on the DOM overlay: frosted pills that spring in (one soft overshoot) and
// leave with the type exit. Pure per frame: pose(el, t) from the chip's own times.
import { spring, clamp, quintIn, expoOut } from '../../lib/ease.js';

let styled = false;
function injectStyle() {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = `
.chip{position:absolute;left:0;top:0;display:inline-flex;align-items:center;white-space:nowrap;
  height:100px;padding:0 44px;border-radius:50px;box-sizing:border-box;
  font:600 46px/1 -apple-system,"SF Pro Display",system-ui,sans-serif;letter-spacing:-0.02em;color:#1D1D1F;
  background:linear-gradient(180deg,rgba(255,255,255,.78),rgba(255,255,255,.52));
  -webkit-backdrop-filter:blur(22px) saturate(1.7);backdrop-filter:blur(22px) saturate(1.7);
  border:1.5px solid rgba(255,255,255,.95);
  box-shadow:inset 0 1px 0 rgba(255,255,255,1),inset 0 -10px 24px rgba(214,204,190,.22),
    0 22px 48px rgba(58,52,46,.16),0 3px 8px rgba(58,52,46,.08);
  -webkit-font-smoothing:antialiased;transform-origin:50% 60%;will-change:auto}`;
  document.head.appendChild(s);
}

export function chip(parent, text) {
  injectStyle();
  const el = document.createElement('div');
  el.className = 'chip';
  el.textContent = text;
  parent.appendChild(el);
  return el;
}

/** Measured size (px) after layout; system fonts are local, so setup-time is fine. */
export const sizeOf = (el) => ({ w: el.offsetWidth, h: el.offsetHeight });

/**
 * Poses a chip centred at (x, y) design px: springs in from t0, exits from t1.
 * Returns its opacity.
 */
export function poseChip(el, t, { x, y, t0, t1 = Infinity, w, h }) {
  const s = spring(t - t0, { freq: 2.5, damping: 0.64 });
  const fade = expoOut(clamp((t - t0) / 0.3));
  const e = quintIn(clamp((t - t1) / 0.3));
  const op = fade * (1 - e);
  const scale = (0.55 + 0.45 * s) * (1 - 0.08 * e);
  const rise = 26 * (1 - s) - 18 * e;
  const blur = 9 * (1 - fade) + 8 * e;
  const st = el.style;
  st.visibility = op > 0.001 ? 'visible' : 'hidden';
  st.opacity = op > 0.999 ? '1' : op.toFixed(4);
  st.transform = `translate3d(${(x - w / 2).toFixed(2)}px, ${(y - h / 2 + rise).toFixed(2)}px, 0) scale(${scale.toFixed(5)})`;
  st.filter = blur < 0.05 ? 'none' : `blur(${blur.toFixed(2)}px)`;
  return op;
}
