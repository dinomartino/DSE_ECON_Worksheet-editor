// montage — bars 40–42. PLACEHOLDER until built (FILM.md §3): beat cuts with a push-in
// and alternating tilt per shot, on MONTAGE_CUTS.
import { MONTAGE_CUTS } from '../../timeline.mjs';
import { placeholder } from './_placeholder.js';

export default placeholder({
  id: 'montage',
  world: 'night',
  async subject(ctx) {
    const clip = await ctx.load.clip('type-mcq');
    const win = ctx.lib.win.appWindow({ variant: 'none', width: 4.2, shadow: false });
    ctx.scene.add(win.group);
    const cuts = MONTAGE_CUTS.map((s) => s - ctx.start);
    return (t) => {
      let i = 0;
      while (i + 1 < cuts.length && t >= cuts[i + 1]) i++;
      const local = t - cuts[i];
      const tilt = i % 2 ? 1 : -1;
      win.group.position.set(0, 0.5, 1.2 + 0.5 * local);
      win.group.rotation.set(0, tilt * 0.14, tilt * 0.02);
      win.set({ screen: clip.frameAt(((i * 0.37) % 2.5) + local) });
    };
  },
});
