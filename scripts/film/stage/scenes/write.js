// write — bars 8–16, day. PLACEHOLDER until built (FILM.md §3): the real clip in a window.
import { COPY } from '../../timeline.mjs';
import { placeholder } from './_placeholder.js';

const c = COPY.write;
export default placeholder({
  id: 'write',
  world: 'day',
  cards: [
    { at: 1.0, until: 6.6, en: c.headline, zh: c.headlineZh },
    { at: 8.5, until: 14.6, en: c.langs.join(' ') },
  ],
  async subject(ctx) {
    const clip = await ctx.load.clip('type-mcq');
    const win = ctx.lib.win.appWindow({ variant: 'mac', width: 3.4, shadowOpacity: 0.22, shadowColor: '#3A342E' });
    ctx.scene.add(win.group);
    ctx.placeClip('type-mcq', { at: 0.5, from: 0, rate: 1 });
    return (t) => {
      win.group.position.set(0, 0.45, 0);
      win.group.rotation.set(-0.06, 0.22 - 0.018 * t, 0);
      win.set({ screen: clip.frameAt(Math.max(0, t - 0.5)) });
    };
  },
});
