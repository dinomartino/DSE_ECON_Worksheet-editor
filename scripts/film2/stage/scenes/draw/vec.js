// Vector primitives for the draw act's re-ink: geometry lives in footage CSS px and is posed
// through a camera-like pose { a: [x, y] design px, c: [x, y] CSS px, s: design px per CSS px },
// so a vector line lands exactly on the footage line it traces. Stroke widths are in design px
// (they do not scale with a transform). Builders run at setup; set*() only writes attributes.
import { s, show, C, FONT } from '../../lib/dom.js';
import { clamp, lerp } from '../../lib/ease.js';
import { f } from '../../lib/tween.js';

/** CSS px → design px under pose P. */
export const mapper = (P) => ([x, y]) => [P.a[0] + P.s * (x - P.c[0]), P.a[1] + P.s * (y - P.c[1])];
/** Between two poses at p (already eased): anchor and centre lerp, scale in log space. */
export const lerpPose = (A, B, p) => ({
  a: [lerp(A.a[0], B.a[0], p), lerp(A.a[1], B.a[1], p)],
  c: [lerp(A.c[0], B.c[0], p), lerp(A.c[1], B.c[1], p)],
  s: Math.exp(lerp(Math.log(A.s), Math.log(B.s), p)),
});
/** Scale pose P by k about its anchor (a drift that keeps the anchor still). */
export const scalePose = (P, k) => ({ ...P, s: P.s * k });
export const lerpPt = (a, b, p) => [lerp(a[0], b[0], p), lerp(a[1], b[1], p)];
/** Hex colour mix a → b by p. */
export function mixHex(a, b, p) {
  const n = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16));
  const [x, y] = [n(a), n(b)];
  return `#${x.map((v, i) => Math.round(lerp(v, y[i], clamp(p))).toString(16).padStart(2, '0')).join('')}`;
}

/** A full-frame SVG layer in `parent`. */
export function layer(parent) {
  return s('svg', { width: 1920, height: 1080, viewBox: '0 0 1920 1080', style: { position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' } }, parent);
}

/** A stroked path; set(A, B, { p, w, color, o, dash }) draws A → B (design px) to fraction p. */
export function line(g, attrs = {}) {
  const el = s('path', { fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', ...attrs }, g);
  return {
    el,
    set(A, B, { p = 1, w = 4, color = C.ink, o = 1, dash = null } = {}) {
      const q = clamp(p);
      el.setAttribute('d', `M${f(A[0], 2)} ${f(A[1], 2)}L${f(lerp(A[0], B[0], q), 2)} ${f(lerp(A[1], B[1], q), 2)}`);
      el.setAttribute('stroke', color);
      el.setAttribute('stroke-width', f(w, 3));
      if (dash) el.setAttribute('stroke-dasharray', dash.map((d) => f(d, 2)).join(' '));
      show(el, q > 0.001 ? o : 0);
    },
  };
}

/** A filled triangle arrowhead; set(tip, u, len, half, color, o) (design px, u a unit vector). */
export function head(g) {
  const el = s('path', {}, g);
  return {
    el,
    set(tip, u, len, half, color = C.ink, o = 1) {
      const b = [tip[0] - u[0] * len, tip[1] - u[1] * len];
      const n = [-u[1] * half, u[0] * half];
      el.setAttribute('d', `M${f(tip[0], 2)} ${f(tip[1], 2)}L${f(b[0] + n[0], 2)} ${f(b[1] + n[1], 2)}L${f(b[0] - n[0], 2)} ${f(b[1] - n[1], 2)}Z`);
      el.setAttribute('fill', color);
      show(el, len > 0.3 ? o : 0);
    },
  };
}

/** A filled polygon; set(points, fill, o). */
export function poly(g) {
  const el = s('path', {}, g);
  return {
    el,
    set(pts, fill, o = 1) {
      el.setAttribute('d', `${pts.map((p, i) => `${i ? 'L' : 'M'}${f(p[0], 2)} ${f(p[1], 2)}`).join('')}Z`);
      el.setAttribute('fill', fill);
      show(el, o);
    },
  };
}

/** A dot; set(c, r, color, o). */
export function dot(g, attrs = {}) {
  const el = s('circle', attrs, g);
  return {
    el,
    set([x, y], r, { color = C.markBlue, o = 1, ring = 0 } = {}) {
      el.setAttribute('cx', f(x, 2));
      el.setAttribute('cy', f(y, 2));
      el.setAttribute('r', f(Math.max(0, r), 3));
      if (ring) {
        el.setAttribute('fill', 'none');
        el.setAttribute('stroke', color);
        el.setAttribute('stroke-width', f(ring, 3));
      } else el.setAttribute('fill', color);
      show(el, r > 0.05 ? o : 0);
    },
  };
}

/**
 * A diagram label: `text` with an optional subscript (`sub`), serif; zh lines in PingFang.
 * set([x, y], { size, color, o, anchor }) places the baseline point.
 */
export function text(g, str, { sub = '', zh = false } = {}) {
  const el = s('text', { 'font-family': zh ? FONT.zh : FONT.serif }, g);
  el.textContent = '';
  const main = s('tspan', {}, el);
  main.textContent = str;
  const subEl = sub ? s('tspan', { 'baseline-shift': '-28%', 'font-size': '68%' }, el) : null;
  if (subEl) subEl.textContent = sub;
  return {
    el,
    set([x, y], { size = 28, color = C.ink, o = 1, anchor = 'start', halo = null } = {}) {
      if (halo) Object.assign(el.style, { paintOrder: 'stroke', stroke: halo, strokeWidth: `${f(size * 0.18, 2)}px`, strokeLinejoin: 'round' });
      el.setAttribute('x', f(x, 2));
      el.setAttribute('y', f(y, 2));
      el.setAttribute('font-size', f(size, 2));
      el.setAttribute('fill', color);
      el.setAttribute('text-anchor', anchor);
      show(el, o);
    },
  };
}

/**
 * Hatch segments of convex polygon `pts` (CSS px): lines of constant x − y ("\" on screen),
 * `gap` CSS px apart. Returns [[A, B], …] in sweep order (x − y rising).
 */
export function hatchSegments(pts, gap) {
  const ks = pts.map(([x, y]) => x - y);
  const [k0, k1] = [Math.min(...ks), Math.max(...ks)];
  const step = gap * Math.SQRT2;
  const out = [];
  for (let k = k0 + step / 2; k < k1; k += step) {
    const hits = [];
    pts.forEach((p, i) => {
      const q = pts[(i + 1) % pts.length];
      const f1 = p[0] - p[1] - k, f2 = q[0] - q[1] - k;
      if (f1 * f2 <= 0 && f1 !== f2) hits.push(lerpPt(p, q, f1 / (f1 - f2)));
    });
    if (hits.length >= 2) {
      hits.sort((a, b) => a[0] - b[0]);
      out.push([hits[0], hits[hits.length - 1]]);
    }
  }
  return out;
}
