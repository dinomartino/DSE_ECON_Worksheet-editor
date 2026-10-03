// Act 7, the end (FILM.md §3). Built: the lockup (the mark act's splash, at end-card scale)
// with "Free · No account needed", held to silence. Placeholder: the pull-back before it
// ("Less formatting / More teaching" as plain title lines).
import { lockup, block, h, show, C } from '../lib/index.js';

const SIZE = 220;

export default {
  setup(ctx) {
    h('div', { style: { position: 'absolute', inset: 0, background: C.cream } }, ctx.el);
    ctx.less = block(ctx.el, { ...ctx.copy.less, x: 960, y: 330, w: 1400, maxLines: 1, size: 96 });
    ctx.more = block(ctx.el, { ...ctx.copy.more, x: 960, y: 560, w: 1400, maxLines: 1, size: 96 });
    // The card: lockup + one line, centred (220 + 30 + 84 + 39 lockup, 56 gap, ~70 line).
    const top = 290;
    ctx.lock = lockup(ctx.el, { cx: 960, top, size: SIZE, en: 68, zh: 28, copy: ctx.copy.name });
    ctx.free = block(ctx.el, {
      ...ctx.copy.free, x: 960, y: ctx.lock.bottom + 56, w: 1400, maxLines: 1, face: 'sans', weight: 500,
      size: 32, tracking: 0, color: C.inkMuted, zhSize: 22, zhTracking: 0.08, zhColor: C.inkSubtle, zhGap: 8, rise: 10,
    });
    ctx.cardAt = ctx.bar(1.5); // the lockup starts drawing on the half-bar
  },
  update(ctx, t) {
    const out = ctx.cardAt - ctx.pulse(1);
    ctx.less.show(t, { at: ctx.pulse(1), out });
    ctx.more.show(t, { at: ctx.pulse(3), out });
    // The splash at 2× its own speed (ms of splash time per second: 500).
    const ms = Math.max(0, t - ctx.cardAt) * 500;
    ctx.lock.at(ms);
    show(ctx.lock.mark.el, t >= ctx.cardAt ? 1 : 0);
    ctx.free.show(t, { at: ctx.cardAt + ctx.pulse(6), dur: 0.8 });
  },
};
