// Plays a retimed clip onto one window screen (diagrams/screen.js) with three kinds of
// smoothing: a fractional clip frame blends its two neighbours (even motion at any rate,
// no repeated frames when slowed); a skipped stretch dissolves between its two sides; an
// instant UI change (a menu closing on "Add") cross-fades over a few frames.

const sineInOut = (u) => -(Math.cos(Math.PI * u) - 1) / 2;
const seg = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));

/**
 * `a`, `b`: remaps (scene t → clip t) before and after the skip; `skip` = [t0, t1] scene
 * seconds of the dissolve between them; `pops` = clip frame indices that change at once
 * (the frame where the new state first shows); `popHalf` scene seconds each side.
 */
export function player(clip, { a, b, skip, pops = [], popHalf = 0.05 }) {
  const fps = clip.fps;
  const last = clip.frames - 1;
  const idx = (c) => Math.min(last, Math.max(0, c * fps));
  const tex = (i) => clip.frameAt(Math.min(last, Math.max(0, i)) / fps);
  // Pop windows in scene time, from whichever remap plays them.
  const popAt = pops.map((f) => {
    const c = f / fps;
    const f2 = skip && c >= b(skip[0]) ? b : a;
    return { f, t: f2.inverse(c) };
  });

  /** One remap's picture at t: [texA, texB, mix]. */
  function frames(map, t) {
    const x = idx(map(t));
    for (const p of popAt) {
      if (Math.abs(t - p.t) < popHalf) {
        const u = sineInOut(seg(t, p.t - popHalf, p.t + popHalf));
        return [tex(Math.min(Math.round(x), p.f - 1)), tex(Math.max(Math.round(x), p.f)), u];
      }
    }
    const i = Math.floor(x);
    const fr = x - i;
    if (fr < 1e-3 || i >= last) return [tex(i), null, 0];
    return [tex(i), tex(i + 1), fr];
  }

  return {
    /** { a, b, mix } for the window at scene time t. */
    at(t) {
      if (!skip || t <= skip[0]) return pack(frames(a, t));
      if (t >= skip[1]) return pack(frames(b, t));
      // Across the skip: each side at its nearest frame, dissolved.
      const u = sineInOut(seg(t, skip[0], skip[1]));
      return { a: tex(Math.round(idx(a(t)))), b: tex(Math.round(idx(b(t)))), mix: u };
    },
  };
}

const pack = ([a, b, mix]) => ({ a, b, mix: b ? mix : 0 });
