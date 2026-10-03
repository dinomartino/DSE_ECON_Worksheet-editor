// Act 1, the mark (FILM.md §3): "Draw the market" at hero scale on cream, exactly the
// launch splash (src/launch/) played ~3× slower, scaled so the blue dot pops on pulse 5;
// the tagline follows on pulse 7. The next act's iris opens out of the dot (timeline.mjs:
// write.in.at must stay MARK_DOT).
import { lockup, block, h, C } from '../lib/index.js';

export const SIZE = 360; // the mark, px
const EN = 110, ZH = 46;
const TAG = 38, TAG_ZH = 26, TAG_GAP = 60;
// Lockup + tagline, centred in the frame (measured heights: lockup 617, gap 60, tagline 87).
export const TOP = 158;
export const MARK_DOT = [960, TOP + SIZE / 2];

export default {
  setup(ctx) {
    h('div', { style: { position: 'absolute', inset: 0, background: C.cream } }, ctx.el);
    // ms of splash time per scene second: the dot (splash 740 ms) lands on pulse 5.
    ctx.k = 740 / (1000 * ctx.pulse(5));
    ctx.lock = lockup(ctx.el, { cx: 960, top: TOP, size: SIZE, en: EN, zh: ZH, copy: ctx.copy.word });
    ctx.tag = block(ctx.el, {
      ...ctx.copy.tagline, x: 960, y: ctx.lock.bottom + TAG_GAP, w: 1500, maxLines: 1, face: 'sans', weight: 500,
      size: TAG, tracking: 0, color: C.inkMuted, zhSize: TAG_ZH, zhTracking: 0.08, zhColor: C.inkSubtle, zhGap: 8, rise: 10,
    });
  },
  update(ctx, t) {
    ctx.lock.at(Math.max(0, t) * 1000 * ctx.k);
    ctx.tag.show(t, { at: ctx.pulse(7), dur: 0.8, stagger: 0.12 });
  },
};
