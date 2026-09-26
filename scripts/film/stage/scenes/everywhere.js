// everywhere — bars 36–40, day. PLACEHOLDER until built (FILM.md §3).
import { COPY } from '../../timeline.mjs';
import { placeholder } from './_placeholder.js';

const c = COPY.everywhere;
export default placeholder({
  id: 'everywhere',
  world: 'day',
  cards: [
    ...c.chips.map((en, i) => ({ at: 0.5 + i * 0.5, until: 3.6, en, kind: 'sub', x: 520 + i * 220, y: 540, color: '#1D1D1F' })),
    { at: 4.0, until: 7.6, en: c.headline, zh: c.headlineZh, size: 96 },
  ],
  async subject(ctx) {
    const { lib } = ctx;
    const still = await ctx.load.texture('stills/editor-clean.png');
    const wins = ['browser', 'mac', 'windows'].map((variant) => {
      const w = lib.win.appWindow({ variant, width: 2.6, screen: still, shadowOpacity: 0.2, shadowColor: '#3A342E' });
      ctx.scene.add(w.group);
      return w;
    });
    return (t) => {
      wins.forEach((w, i) => {
        const k = lib.ease.expoOut(lib.ease.seg(t, 4 + i, 5 + i));
        w.group.position.set((i - 1) * 2.9, 0.55, -4 * (1 - k));
        w.group.rotation.set(0, (1 - i) * 0.12, 0);
        w.set({ opacity: k, shadowOpacity: 0.2 * k });
      });
    };
  },
});
