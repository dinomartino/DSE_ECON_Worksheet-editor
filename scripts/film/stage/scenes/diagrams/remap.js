// Clip time remapping: a monotone cubic (Fritsch–Carlson) through [sceneT, clipT] keys, so
// the playback rate changes smoothly and never runs backwards. Keys sit on the clip's own
// events, which is how each gesture lands on a beat. A key's optional third value pins the
// rate there: two neighbouring keys pinned to 1 on a 1:1 secant play that stretch at
// exactly 1× (one captured frame per film frame: no blending on a drag).

/** Returns c(t): clip seconds at scene time t (holds the end rates linearly outside). */
export function remap(keys) {
  const n = keys.length;
  const x = keys.map((k) => k[0]);
  const y = keys.map((k) => k[1]);
  const pin = keys.map((k) => k[2]);
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
  for (let i = 0; i < n; i++) if (pin[i] != null) m[i] = pin[i];
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
  /** Playback rate at t (clip seconds per scene second). */
  f.rate = (t, h = 1 / 480) => (f(t + h) - f(t - h)) / (2 * h);
  return f;
}

/**
 * An edit of a clip: `map` (a remap, scene t → edit seconds) plays the clip with one stretch
 * cut out, from frame `cut.a` to frame `cut.b`, dissolving over `cut.dur` scene seconds from
 * `cut.at` (the scene time the edit reaches frame a). `clipAt(edit)` → clip seconds.
 */
export function edit(map, fps, cut = null) {
  const skip = cut ? (cut.b - cut.a) / fps : 0;
  const ca = cut ? cut.a / fps : Infinity;
  return {
    map, fps, cut, skip,
    clipAt: (e) => (e < ca ? e : e + skip),
    editAt: (c) => (c < ca ? c : c >= ca + skip ? c - skip : null), // null: cut out
  };
}

/**
 * Declares every clip event the edit plays, at its exact scene time, so the score's UI
 * sounds follow the rate changes and skip the cut. `range` = [t0, t1] scene seconds shown.
 */
export function placeEdit(ctx, clip, name, ed, [t0, t1]) {
  const seen = new Set();
  for (const e of clip.events ?? []) {
    const et = ed.editAt(e.t);
    if (et == null || seen.has(e.t)) continue;
    const at = ed.map.inverse(et);
    if (at < t0 || at > t1) continue;
    seen.add(e.t);
    ctx.placeClip(name, { at, from: e.t, rate: 1, dur: 0 });
  }
}
