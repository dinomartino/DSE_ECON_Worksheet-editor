// Plays an edited clip (diagrams/remap.js edit) onto one window screen (diagrams/screen.js).
// Slower than 1× a fractional frame blends its two neighbours (no repeated frames); at 1×
// and faster it shows the nearest frame and the engine's shutter integrates the motion (a
// blend of two frames would print a ghost cursor). The edit's cut dissolves from its last
// frame before to the playing frames after. An instant UI change (a menu closing on "Add")
// fades the menu out like a native popover inside its rectangle, while the rest of the
// screen switches on one frame, as the app does.

const sineInOut = (u) => -(Math.cos(Math.PI * u) - 1) / 2;
const clamp = (x) => Math.min(1, Math.max(0, x));
const seg = (t, a, b) => clamp((t - a) / (b - a));

/**
 * `ed`: an edit (scene t → clip); `pops` = clip frame indices that change at once (the
 * frame where the new state first shows); `popRect` = [x0, y0, x1, y1] where the menu fades
 * (screen.js coordinates); `popFade` scene seconds, from the pop's own frame.
 */
export function player(clip, ed, { pops = [], popRect = null, popFade = 0.14 } = {}) {
  const fps = clip.fps;
  const last = clip.frames - 1;
  const frame = (t) => Math.min(last, Math.max(0, ed.clipAt(ed.map(t)) * fps));
  const tex = (i) => clip.frameAt(Math.min(last, Math.max(0, i)) / fps);
  const popAt = pops.map((f) => ({ f, t: ed.map.inverse(ed.editAt(f / fps)) }));
  const cut = ed.cut;

  return {
    /** { a, b, mix, mixIn, rect } for the window at scene time t. */
    at(t) {
      const x = frame(t);
      if (cut && t >= cut.at && t < cut.at + cut.dur) {
        return { a: tex(cut.a), b: tex(Math.round(x)), mix: sineInOut(seg(t, cut.at, cut.at + cut.dur)) };
      }
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
      // Never round or blend across a pop: that would show the new state early.
      if (i >= last || pops.includes(i + 1)) return { a: tex(i), b: null, mix: 0 };
      const sharp = clamp((ed.map.rate(t) - 0.8) / 0.2);
      const w = fr * (1 - sharp) + (fr >= 0.5 ? sharp : 0);
      if (w < 1e-3) return { a: tex(i), b: null, mix: 0 };
      if (w > 1 - 1e-3) return { a: tex(i + 1), b: null, mix: 0 };
      return { a: tex(i), b: tex(i + 1), mix: w };
    },
  };
}
