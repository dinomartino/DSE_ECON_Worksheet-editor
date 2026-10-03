// Pure tween helpers: every value is a function of t (no state, no clocks).
import { clamp, lerp, prog, outSoft } from './ease.js';

/** Eased progress of t through [at, at + dur]. */
export const tw = (t, at, dur, ease = outSoft) => ease(prog(t, at, at + dur));

/** a → b as t runs through [at, at + dur]. */
export const tween = (t, at, dur, a, b, ease = outSoft) => lerp(a, b, tw(t, at, dur, ease));

/**
 * Keyframes [[t, value, ease?], ...] sorted by t: holds the first value before, the last
 * after; `ease` on a key shapes the segment arriving at it. Values: numbers or same-length
 * number arrays.
 */
export function keys(t, frames) {
  if (t <= frames[0][0]) return frames[0][1];
  for (let i = 1; i < frames.length; i++) {
    const [t1, v1, e = outSoft] = frames[i];
    if (t <= t1) {
      const [t0, v0] = frames[i - 1];
      const p = e(prog(t, t0, t1));
      return Array.isArray(v0) ? v0.map((x, k) => lerp(x, v1[k], p)) : lerp(v0, v1, p);
    }
  }
  return frames[frames.length - 1][1];
}

/** In/out envelope: 0 before `a`, eased up over `inDur`, 1, eased down to 0 at `b`. */
export function env(t, a, b, inDur = 0.6, outDur = 0.45, ein = outSoft, eout = outSoft) {
  const up = ein(prog(t, a, a + inDur));
  const down = b == null ? 0 : eout(prog(t, b - outDur, b));
  return clamp(up - down);
}

/** Stagger: the i-th of n items starts `gap` s after the previous. */
export const stagger = (t, at, i, gap, dur, ease = outSoft) => tw(t, at + i * gap, dur, ease);

/** A number formatted for a CSS/SVG attribute (stable digits: identical frames diff to 0). */
export const f = (x, d = 3) => (Math.abs(x) < 1e-9 ? '0' : d > 0 ? x.toFixed(d).replace(/\.?0+$/, '') : x.toFixed(0));
