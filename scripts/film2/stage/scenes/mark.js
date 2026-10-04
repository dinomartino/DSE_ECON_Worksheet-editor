// Act 1, the mark (FILM.md §3): "Draw the market" at hero scale on cream, the launch splash
// (src/launch/) played ~3× slower, scaled so the blue dot pops on pulse 5 (cue mark.dot).
// The hand-off from the cold open: its line docks on the cut as this mark's vertical axis, so
// the act opens with axis V already drawn (solid, the colour it has on the tile) and the tile
// grows out of that line around it; the rest of the splash runs on its own clock.
// Beats (scene pulses, P0 = bar 1.5 = 7.13 s):
//   P0..P1.4  the tile grows out of the axis      P0.75..P2.75 the mark glides up from the centre
//   P2        "Econ Studio 經濟備課室" rises         P2.5       the tagline (read 2.4 s)
//   P5        knock + dot (the pop), the ripple    P1.5..end  one push (1 → PUSH) on the dot at
//                                                             constant speed: alive on every frame
//   P7..P10.5 the dot swells (1 → DOT_SWELL) inside its knock: the iris (engine, from P10) grows
//             out of it, one object      P10..P11.5 the words track out, leaving the tile
// The next act's iris opens out of the dot: timeline.mjs write.in.at must equal MARK_DOT.
import { lockup, block, h, s, place, show, tween, ease, f, C, END_CARD } from '../lib/index.js';

export const SIZE = 360; // the mark, px
const EN = 110, ZH = 46;
const TAG = 38, TAG_ZH = 26, TAG_GAP = 60;
// Lockup + tagline, centred in the frame (measured heights: lockup 617, gap 60, tagline 87).
export const TOP = 158;
export const MARK_DOT = [960, TOP + SIZE / 2];
const DROP = 540 - MARK_DOT[1]; // the mark starts centred
// Axis V on the tile: cream at .34 over the tile (#3A342E) is exactly #7C7772.
export const AXIS_COLOR = '#7C7772';
const GROW = 0.62; // s: the tile grows out of the axis (the splash's own tile phase is 0.48 s)
// The dot's pop reads ~3 frames after its first frame: run the splash that much early so the
// dot is visible on the pop sound (cue mark.dot, sync review #7).
const LEAD = 0.05;
const PUSH = 1.08;
const DOT_SWELL = 1.4; // r 30 → 42 tile units, inside the knock (r 46)

/**
 * 0..1 through [t0, t1]: accelerates over `r` s, then constant speed, so a slow push or drift
 * moves visibly on every frame (sineInOut crawls for a second at each end and reads as frozen).
 */
export function ramp(t, t0, t1, r) {
  const x = t <= t0 ? 0 : t < t0 + r ? (t - t0) ** 2 / (2 * r) : r / 2 + (t - t0 - r);
  return Math.min(1, x / (t1 - t0 - r / 2));
}

const scene = {
  setup(ctx) {
    h('div', { style: { position: 'absolute', inset: 0, background: C.cream } }, ctx.el);
    ctx.group = h('div', { style: { position: 'absolute', inset: 0, transformOrigin: `${MARK_DOT[0]}px ${MARK_DOT[1]}px` } }, ctx.el);
    // Splash ms per scene second: the dot (splash 740 ms) lands on pulse 5.
    ctx.msPerS = 740 / ctx.pulse(5);
    ctx.lock = lockup(ctx.group, { cx: 960, top: TOP, size: SIZE, en: EN, zh: ZH, copy: ctx.copy.word });
    ctx.tag = block(ctx.group, {
      ...ctx.copy.tagline, x: 960, y: ctx.lock.bottom + TAG_GAP, w: 1500, maxLines: 1, face: 'sans', weight: 500,
      size: TAG, tracking: 0, color: C.inkMuted, zhSize: TAG_ZH, zhTracking: END_CARD.tagline.zhTracking, zhColor: C.inkMuted, zhGap: 8, rise: 10,
    });
    // Axis V drawn solid from the first frame (under the curves, like the original).
    const { g, axes, axisV } = ctx.lock.mark.parts;
    axisV.remove();
    ctx.axisV = s('path', { d: 'M118 394V106', fill: 'none', stroke: AXIS_COLOR, 'stroke-width': 20, 'stroke-linecap': 'round' });
    g.insertBefore(ctx.axisV, axes);
  },
  update(ctx, t) {
    const P = ctx.pulse;
    ctx.lock.at(Math.max(0, t + LEAD) * ctx.msPerS);
    // The tile: full opacity and scale from the start, its rect growing out of the axis line
    // (x 108–128, y 96–404: the stroke's own outline) to the 512 tile.
    const { g, tile } = ctx.lock.mark.parts;
    g.removeAttribute('transform');
    g.setAttribute('opacity', '1');
    g.style.visibility = 'visible';
    const p = ease.outSoft(ease.prog(t, 0, GROW));
    const r = (a, b) => f(ease.lerp(a, b, p), 3);
    tile.setAttribute('x', r(108, 0));
    tile.setAttribute('y', r(96, 0));
    tile.setAttribute('width', r(20, 512));
    tile.setAttribute('height', r(308, 512));
    tile.setAttribute('rx', r(10, 114));
    // The words: in on P2 (wordmark) and P3.5 (tagline), out from P10 so the iris opens on the
    // tile alone.
    const out = ease.outSoft(ease.prog(t, P(10), P(11.5)));
    const word = ease.outSoft(ease.prog(t, P(2), P(2) + 0.9));
    ctx.lock.wordAt(word);
    show(ctx.lock.word.el, word * (1 - out));
    ctx.lock.word.el.style.transform = `translateY(${f((1 - word) * 6 * ctx.lock.k - 16 * out, 2)}px)`;
    ctx.tag.show(t, { at: P(2.5), dur: 0.8, stagger: 0.12, out: P(11.5), outDur: P(1.5) });
    // The dot swells into the iris (after the splash has posed it at full size).
    const swell = ramp(t, P(7), P(10.5), P(1));
    if (swell > 0) ctx.lock.mark.parts.dot.setAttribute('transform', `translate(256 256) scale(${f(ease.lerp(1, DOT_SWELL, swell), 5)}) translate(-256 -256)`);
    // The mark glides up from the centre as the words arrive; one push towards the dot, at
    // constant speed, keeps the lockup alive until the iris takes it.
    const push = ease.lerp(1, PUSH, ramp(t, P(1.5), ctx.window.end - ctx.from, P(1.5)));
    place(ctx.group, { y: tween(t, P(0.75), P(2), DROP, 0, ease.inOutSoft), scale: push });
  },
};

export default scene;
