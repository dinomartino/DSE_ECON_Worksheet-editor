// Stand-in scenes until each is built for real: the right world, the scene's copy set
// with the shared type helpers on a beat schedule, a slow camera drift, and a simple
// subject from the library so the whole film renders end to end.

/**
 * `cards`: [{ at, until, en, zh?, kind?, y? }] in scene seconds. `subject(ctx)` builds an
 * optional object and returns update(t) for it.
 */
export function placeholder({ id, world, cards = [], subject, events }) {
  const state = {};
  return {
    id,
    world,
    events,
    async setup(ctx) {
      const { lib } = ctx;
      state.cards = cards.map((c) =>
        lib.type.text(ctx.el, { world, y: c.y ?? (c.kind === 'sub' ? 900 : 860), ...c }),
      );
      if (world === 'night') {
        state.floor = lib.floor.nightFloor({ W: ctx.renderW, H: ctx.renderH, y: -1.2, reflect: 0.35 });
        ctx.scene.add(state.floor.mesh);
        ctx.onPrepass((...a) => state.floor.prepass(...a), { once: true });
        state.dust = lib.particles.dust({ count: 70, seed: id.length * 31, H: ctx.renderH, bright: 0.35 });
        ctx.scene.add(state.dust.mesh);
      }
      state.subject = subject ? await subject(ctx) : null;
    },
    update(t, ctx) {
      const { lib } = ctx;
      const d = lib.camera.drift(t, id.length, { amp: 1.2 });
      lib.camera.orbit(ctx.camera, {
        target: [0, 0.2, 0],
        dist: lib.camera.dolly(t, ctx.dur, 9.4, 9.0) * d.dist,
        az: -6 + (12 * t) / ctx.dur + d.az,
        el: 4 + d.el,
        roll: d.roll,
        fov: 30,
        shift: [0, 0.14],
      });
      state.dust?.set({ time: t, focus: 9.2 });
      state.subject?.(t, ctx);
      cards.forEach((c, i) => state.cards[i].set(t, c.at, c.until));
    },
  };
}

/** A blank floating sheet (day stand-in). */
export const sheetSubject = (opts = {}) => async (ctx) => {
  const s = ctx.lib.paper.sheet({ width: 2.1, shadowOpacity: 0.16, ...opts });
  ctx.scene.add(s.group);
  return (t) => {
    s.group.rotation.set(-0.12, 0.18 - 0.02 * t, 0.02);
    s.group.position.set(0, 0.35 + 0.02 * Math.sin(t * 0.6), 0);
    s.set({ bend: 0.04, curl: 0.05 });
  };
};

/** The logo tile, turning slowly (night stand-in). */
export const tileSubject = () => async (ctx) => {
  const logo = ctx.lib.logo.createLogo();
  logo.group.scale.setScalar(0.9);
  ctx.scene.add(logo.group);
  ctx.post.bloom = { strength: 0.6, radius: 1, threshold: 1, knee: 0.4 };
  return (t) => {
    logo.group.position.set(0, 0.55, 0);
    logo.group.rotation.set(0.05, -0.35 + 0.03 * t, 0);
    logo.set({ dot: { glow: 1.6 } });
  };
};
