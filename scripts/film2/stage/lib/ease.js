// Easing curves (FILM.md §5): the app's own cubics, solved exactly as CSS does
// (cubic-bezier with P0 = (0,0), P3 = (1,1); x(s) inverted by Newton, then bisection).

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, p) => a + (b - a) * p;
/** 0..1 progress of t through [a, b], clamped. */
export const prog = (t, a, b) => (b === a ? (t >= b ? 1 : 0) : clamp((t - a) / (b - a)));

/** A CSS cubic-bezier(x1, y1, x2, y2) as a function of progress 0..1. */
export function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (s) => ((ax * s + bx) * s + cx) * s;
  const Y = (s) => ((ay * s + by) * s + cy) * s;
  const dX = (s) => (3 * ax * s + 2 * bx) * s + cx;
  const solve = (x) => {
    let s = x;
    for (let i = 0; i < 8; i++) {
      const e = X(s) - x;
      if (Math.abs(e) < 1e-7) return s;
      const d = dX(s);
      if (Math.abs(d) < 1e-6) break;
      s -= e / d;
    }
    let lo = 0, hi = 1;
    s = x;
    for (let i = 0; i < 40; i++) {
      const v = X(s);
      if (Math.abs(v - x) < 1e-7) break;
      if (v < x) lo = s;
      else hi = s;
      s = (lo + hi) / 2;
    }
    return s;
  };
  const f = (p) => (p <= 0 ? 0 : p >= 1 ? 1 : Y(solve(p)));
  f.css = `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`;
  return f;
}

// The app's motion tokens (src/app/globals.css).
export const outSoft = cubicBezier(0.22, 1, 0.36, 1); // entrances
export const inOutSoft = cubicBezier(0.65, 0, 0.35, 1); // travel
export const spring = cubicBezier(0.34, 1.36, 0.64, 1); // pops, slight overshoot

// The splash's exact curves (src/launch/splash.css).
export const outCubic = cubicBezier(0.333, 1, 0.667, 1); // = 1 - (1 - t)^3
export const inCubic = cubicBezier(0.333, 0, 0.667, 0); // = t^3
/** The splash's curve draw: ease-in to the midpoint, ease-out after (two keyframe halves). */
export const inOutCubic = (p) => (p < 0.5 ? inCubic(p * 2) / 2 : 0.5 + outCubic(p * 2 - 1) / 2);
/** easeOutBack c1 = 1.9 as the splash's cubic-bezier(.333, 1.633, .667, 1). */
export const outBack = cubicBezier(0.333, 1.633, 0.667, 1);
/** The same curve in closed form (for reference and tests). */
export const outBackExact = (p, c1 = 1.9) => {
  const c3 = c1 + 1;
  return 1 + c3 * (p - 1) ** 3 + c1 * (p - 1) ** 2;
};
export const wordIn = cubicBezier(0.2, 0.7, 0.2, 1); // the splash's wordmark

export const linear = (p) => clamp(p);
export const sineInOut = (p) => -(Math.cos(Math.PI * clamp(p)) - 1) / 2;
