// Plays a retimed clip onto one window screen (diagrams/screen.js) with two kinds of
// smoothing: a fractional clip frame blends its two neighbours (even motion at any rate,
// no repeated frames when slowed); an instant UI change (a menu closing on "Add") fades the
// menu out like a native popover inside its rectangle, while the rest of the screen switches
// on one frame, as the app does.

const sineInOut = (u) => -(Math.cos(Math.PI * u) - 1) / 2;
const seg = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));

/**
 * `map`: remap (scene t → clip t); `pops` = clip frame indices that change at once (the
 * frame where the new state first shows); `popRect` = [x0, y0, x1, y1] where the menu fades
 * (screen.js coordinates); `popFade` scene seconds, from the pop's own frame.
 */
export function player(clip, { map, pops = [], popRect = null, popFade = 0.14 }) {
  const fps = clip.fps;
  const last = clip.frames - 1;
  const idx = (c) => Math.min(last, Math.max(0, c * fps));
  const tex = (i) => clip.frameAt(Math.min(last, Math.max(0, i)) / fps);
  const popAt = pops.map((f) => ({ f, t: map.inverse(f / fps) }));

  return {
    /** { a, b, mix, mixIn, rect } for the window at scene time t. */
    at(t) {
      const x = idx(map(t));
      for (const p of popAt) {
        if (t >= p.t && t < p.t + popFade) {
          // The new state everywhere from the pop's own frame; inside the menu's rectangle
          // the last frame with the menu fades out over it.
          const u = sineInOut(seg(t, p.t, p.t + popFade));
          return { a: tex(p.f - 1), b: tex(Math.max(Math.round(x), p.f)), mix: 1, mixIn: u, rect: popRect };
        }
      }
      const i = Math.floor(x);
      const fr = x - i;
      // Never blend across a pop: that would show both states at once for a frame.
      if (fr < 1e-3 || i >= last || pops.includes(i + 1)) return { a: tex(i), b: null, mix: 0 };
      return { a: tex(i), b: tex(i + 1), mix: fr };
    },
  };
}
