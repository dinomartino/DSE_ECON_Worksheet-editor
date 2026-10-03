// Act 1, the mark (FILM.md §3): "Draw the market" at hero scale on cream, exactly the
// launch splash (src/launch/) played ~3× slower, scaled so the blue dot pops on pulse 5.
// The mark draws centred in the frame; as the wordmark arrives the whole lockup glides up
// (pulses 4–7) to make room for the tagline (pulse 6). The next act's iris opens out of the
// dot: timeline.mjs write.in.at must equal MARK_DOT (doctor checks).
import { lockup, block, h, place, tween, ease, C } from '../lib/index.js';

export const SIZE = 360; // the mark, px
const EN = 110, ZH = 46;
const TAG = 38, TAG_ZH = 26, TAG_GAP = 60;
// Lockup + tagline, centred in the frame (measured heights: lockup 617, gap 60, tagline 87).
export const TOP = 158;
export const MARK_DOT = [960, TOP + SIZE / 2];
const DROP = 540 - MARK_DOT[1]; // the mark starts centred

export default {
  setup(ctx) {
    h('div', { style: { position: 'absolute', inset: 0, background: C.cream } }, ctx.el);
    ctx.group = h('div', { style: { position: 'absolute', inset: 0, transformOrigin: `${MARK_DOT[0]}px ${MARK_DOT[1]}px` } }, ctx.el);
    // Splash ms per scene second: the dot (splash 740 ms) lands on pulse 5.
    ctx.msPerS = 740 / ctx.pulse(5);
    ctx.lock = lockup(ctx.group, { cx: 960, top: TOP, size: SIZE, en: EN, zh: ZH, copy: ctx.copy.word });
    ctx.tag = block(ctx.group, {
      ...ctx.copy.tagline, x: 960, y: ctx.lock.bottom + TAG_GAP, w: 1500, maxLines: 1, face: 'sans', weight: 500,
      size: TAG, tracking: 0, color: C.inkMuted, zhSize: TAG_ZH, zhTracking: 0.08, zhColor: C.inkSubtle, zhGap: 8, rise: 10,
    });
  },
  update(ctx, t) {
    ctx.lock.at(Math.max(0, t) * ctx.msPerS);
    // A slow push-in towards the dot keeps the held lockup alive until the iris takes it.
    const push = 1 + 0.02 * ease.sineInOut(t / ctx.dur);
    place(ctx.group, { y: tween(t, ctx.pulse(4), ctx.pulse(3), DROP, 0, ease.inOutSoft), scale: push });
    ctx.tag.show(t, { at: ctx.pulse(6), dur: 0.8, stagger: 0.12 });
  },
};
