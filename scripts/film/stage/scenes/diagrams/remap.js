// Clip time remapping: a monotone cubic (Fritsch–Carlson) through [sceneT, clipT] keys, so
// the playback rate changes smoothly and never runs backwards. Keys sit on the clip's own
// events, which is how each gesture lands on a beat.

/** Returns c(t): clip seconds at scene time t (holds the end rates linearly outside). */
export function remap(keys) {
  const n = keys.length;
  const x = keys.map((k) => k[0]);
  const y = keys.map((k) => k[1]);
  const d = []; // secant slopes
  for (let i = 0; i < n - 1; i++) d.push((y[i + 1] - y[i]) / (x[i + 1] - x[i]));
  const m = new Array(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i], b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      m[i] = k * a * d[i];
      m[i + 1] = k * b * d[i];
    }
  }
  const f = (t) => {
    if (t <= x[0]) return y[0] + m[0] * (t - x[0]);
    if (t >= x[n - 1]) return y[n - 1] + m[n - 1] * (t - x[n - 1]);
    let i = 0;
    while (t > x[i + 1]) i++;
    const h = x[i + 1] - x[i];
    const u = (t - x[i]) / h;
    const u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * y[i] + (u3 - 2 * u2 + u) * h * m[i] + (-2 * u3 + 3 * u2) * y[i + 1] + (u3 - u2) * h * m[i + 1];
  };
  /** Scene time at which clip time c plays (bisection; c(t) is monotone). */
  f.inverse = (c) => {
    let lo = x[0] - 10, hi = x[n - 1] + 10;
    for (let k = 0; k < 60; k++) {
      const mid = (lo + hi) / 2;
      if (f(mid) < c) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  return f;
}

/**
 * Declares every clip event a remapped segment plays, at its exact scene time, so the
 * score's UI sounds follow the rate changes. `range` = [t0, t1] scene seconds shown.
 */
export function placeRemapped(ctx, clip, name, f, [t0, t1]) {
  const c0 = f(t0), c1 = f(t1);
  const seen = new Set();
  for (const e of clip.events ?? []) {
    if (e.t < c0 || e.t > c1 || seen.has(e.t)) continue;
    seen.add(e.t);
    ctx.placeClip(name, { at: f.inverse(e.t), from: e.t, rate: 1, dur: 0 });
  }
}
