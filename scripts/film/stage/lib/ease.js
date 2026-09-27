// Easing and timing: pure functions of t, no state. Spec: FILM.md §4 (motion), §5.5.

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, u) => a + (b - a) * u;
export const invLerp = (a, b, x) => (b === a ? (x >= b ? 1 : 0) : (x - a) / (b - a));
/** 0..1 progress of t through [a, b], clamped. */
export const seg = (t, a, b) => clamp(invLerp(a, b, t));
export const smoothstep = (a, b, x) => {
  const u = seg(x, a, b);
  return u * u * (3 - 2 * u);
};

export const linear = (u) => u;
export const sineIn = (u) => 1 - Math.cos((u * Math.PI) / 2);
export const sineOut = (u) => Math.sin((u * Math.PI) / 2);
export const sineInOut = (u) => -(Math.cos(Math.PI * u) - 1) / 2;
export const quadIn = (u) => u * u;
export const quadOut = (u) => 1 - (1 - u) * (1 - u);
export const cubicIn = (u) => u * u * u;
export const cubicOut = (u) => 1 - (1 - u) ** 3;
export const cubicInOut = (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);
export const quintIn = (u) => u ** 5;
export const quintOut = (u) => 1 - (1 - u) ** 5;
export const quintInOut = (u) => (u < 0.5 ? 16 * u ** 5 : 1 - (-2 * u + 2) ** 5 / 2);
export const expoIn = (u) => (u <= 0 ? 0 : 2 ** (10 * u - 10));
export const expoOut = (u) => (u >= 1 ? 1 : 1 - 2 ** (-10 * u));
export const expoInOut = (u) =>
  u <= 0 ? 0 : u >= 1 ? 1 : u < 0.5 ? 2 ** (20 * u - 10) / 2 : (2 - 2 ** (-20 * u + 10)) / 2;

/** CSS-style cubic-bezier(x1, y1, x2, y2) as an easing function. */
export function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const x = (s) => ((ax * s + bx) * s + cx) * s;
  const dx = (s) => (3 * ax * s + 2 * bx) * s + cx;
  const y = (s) => ((ay * s + by) * s + cy) * s;
  return (u) => {
    if (u <= 0) return 0;
    if (u >= 1) return 1;
    let s = u;
    for (let i = 0; i < 8; i++) {
      const e = x(s) - u;
      const d = dx(s);
      if (Math.abs(e) < 1e-6 || Math.abs(d) < 1e-6) break;
      s -= e / d;
    }
    s = clamp(s);
    return y(s);
  };
}

/**
 * Closed-form damped spring from 0 to 1, t seconds after release.
 * `freq` in Hz (undamped), `damping` ratio (0.65-0.85 per §4 for one soft overshoot).
 */
export function spring(t, { freq = 1.6, damping = 0.75 } = {}) {
  if (t <= 0) return 0;
  const w = 2 * Math.PI * freq;
  const z = damping;
  if (z >= 1) {
    const e = Math.exp(-w * t);
    return 1 - e * (1 + w * t);
  }
  const wd = w * Math.sqrt(1 - z * z);
  const e = Math.exp(-z * w * t);
  return 1 - e * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t));
}

/** Eases `u` with `fn` (a function or a name exported here). */
const byName = {
  linear, sineIn, sineOut, sineInOut, quadIn, quadOut, cubicIn, cubicOut, cubicInOut,
  quintIn, quintOut, quintInOut, expoIn, expoOut, expoInOut,
};
export const ease = (fn, u) => (typeof fn === 'function' ? fn : byName[fn] ?? linear)(clamp(u));

/**
 * Keyframes: [[t0, v0], [t1, v1, ease], ...] — the ease on a key shapes the segment
 * arriving at it. Values may be numbers or arrays of numbers. Holds outside the range.
 */
export function kf(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1, fn] = keys[i];
    if (t <= t1) {
      const [t0, v0] = keys[i - 1];
      const u = ease(fn ?? sineInOut, invLerp(t0, t1, t));
      return Array.isArray(v0) ? v0.map((a, j) => lerp(a, v1[j], u)) : lerp(v0, v1, u);
    }
  }
  return keys[keys.length - 1][1];
}

/** Start time of item i in a staggered sequence. */
export const stagger = (t0, i, step = 0.06) => t0 + i * step;

/** Progress 0..1 of an eased move from a to a+dur. */
export const move = (t, a, dur, fn = quintInOut) => ease(fn, (t - a) / dur);
