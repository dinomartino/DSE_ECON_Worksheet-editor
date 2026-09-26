// opening — bars 0–8, night (FILM.md §3). The mark assembles in darkness on the piano
// motif: a breathing blue point; "Supply." (1.5 s) and "Demand." (3.5 s) strokes; the
// point drops into the crossing at 5.5 s; the axis lands on 7.5 s; the tile extrudes
// behind it on the 8.0 s whoosh as the camera pulls back; title at 10.0 s; on beat 4 of
// bar 7 (15.5 s) the camera pushes into the dot until blue fills the frame at the cut.
import { COPY } from '../../timeline.mjs';
import { cubicBezier } from '../lib/ease.js';

const C = COPY.opening;

// Beat map (scene seconds = film seconds here).
const T = {
  dotIn: 0.15,
  supply: 1.5,
  demand: 3.5,
  drop: 4.95,
  land: 5.5,
  axis: [6.2, 7.5],
  tile: 8.0,
  pullEnd: 9.9,
  sweep: [9.0, 10.8],
  title: 10.0,
  sub: 10.7,
  exit: 14.85,
  riser: 12.0,
  push: 15.5,
  cut: 16.0,
};

const WORD_Y = 812;
// Fast but from rest: the 8.0 s whoosh must not start at full speed (a visible jolt).
const whoosh = cubicBezier(0.3, 0, 0.06, 1);
const DOT_HOVER = [0, 0.66, 0.16];

const scene = {
  id: 'opening',
  world: 'night',
  async setup(ctx) {
    const { lib, scene } = ctx;
    const s = (ctx.state = {});
    s.logo = lib.logo.createLogo();
    scene.add(s.logo.group);
    s.floor = lib.floor.nightFloor({ W: ctx.renderW, H: ctx.renderH, y: -1.32, reflect: 0.2, blur: 10 * (ctx.renderH / 1080), near: 0.4, far: 3.6, sheenR: 2.4 });
    scene.add(s.floor.mesh);
    ctx.onPrepass((...a) => s.floor.prepass(...a), { once: true });
    s.dust = lib.particles.dust({
      count: 110, seed: 11, H: ctx.renderH,
      box: [[-9, -1.4, -14], [9, 5, 3.5]], size: 0.012, aperture: 0.2, bright: 0.75, drift: 0.22, rise: 0.012, minPx: 5,
    });
    scene.add(s.dust.mesh);
    ctx.rig.key.position.set(-3, 5, 7);
    ctx.rig.key.lookAt(0, 0, 0);

    const T_ = lib.type;
    s.words = [C.supply, C.demand, C.equilibrium].map((en) => T_.headline(ctx.el, { en, y: WORD_Y, size: 120, world: 'night' }));
    s.title = T_.headline(ctx.el, { en: C.title, y: 760, size: 124, world: 'night' });
    s.sub = T_.sub(ctx.el, { en: C.sub, zh: C.subZh, y: 884, size: 38, zhSize: 30, zhGap: 14, world: 'night' });
  },

  update(t, ctx) {
    const { lib, camera, post } = ctx;
    const { ease: E, camera: cam } = lib;
    const s = ctx.state;
    const logo = s.logo;

    // --- the mark ---------------------------------------------------------------
    const supply = E.expoOut(E.seg(t, T.supply - 0.04, T.supply + 1.25));
    const demand = E.expoOut(E.seg(t, T.demand - 0.04, T.demand + 1.25));
    const axis = E.quintInOut(E.seg(t, T.axis[0], T.axis[1]));

    // The point: breathes at the centre, floats up as the lines arrive, then falls
    // (accelerating) back into the crossing — the price settling at equilibrium.
    const appear = E.sineOut(E.seg(t, T.dotIn, T.dotIn + 1.4));
    const breath = Math.sin((2 * Math.PI * t) / 2 - Math.PI / 2) * 0.5 + 0.5; // one breath per bar
    const lift = E.quintInOut(E.seg(t, 0.85, 1.95));
    const fall = E.cubicIn(E.seg(t, T.drop, T.land));
    const since = Math.max(0, t - T.land);
    const settle = E.spring(since, { freq: 2.4, damping: 0.62 });
    // After landing: a small dip and rebound that starts from zero (no one-frame step).
    const dip = 0.016 * Math.sin(2 * Math.PI * 2.2 * since) * Math.exp(-since / 0.14);
    const bob = lift * (1 - fall) * 0.03 * Math.sin(t * 1.3);
    const rest = logo.dotRest;
    const up = lift * (1 - fall);
    const pos = [
      0,
      E.lerp(0, DOT_HOVER[1], up) + bob - dip,
      E.lerp(rest.z + 0.05, DOT_HOVER[2], up),
    ];
    const hoverScale = 0.5 + 0.06 * breath;
    const dotScale = E.lerp(hoverScale, 1, E.quadIn(fall)) * appear;
    const flash = (1 - Math.exp(-since / 0.035)) * Math.exp(-since / 0.4); // fast attack, soft decay
    const dotGlow = (2.1 + 1.0 * breath * (1 - fall)) * appear + 1.3 * flash + 0.2 * E.smoothstep(0, 0.6, since);

    // --- tile, camera ------------------------------------------------------------
    const grow = whoosh(E.seg(t, T.tile, T.tile + 1.5));
    const extrude = E.quintOut(E.seg(t, T.tile + 0.05, T.tile + 1.7));
    const lightUp = E.sineOut(E.seg(t, T.tile, T.tile + 0.8));
    logo.materials.tile.userData.exposure.value = lightUp;
    logo.set({
      supply, demand, axis,
      tile: { visible: t >= T.tile, scale: E.lerp(0.14, 1, grow), extrude, face: lightUp },
      puck: settle,
      dot: { position: pos, scale: dotScale, glow: dotGlow },
    });
    // The sweep crosses once the tile has settled; a second, fainter pass rides the riser.
    const sw = E.seg(t, T.sweep[0], T.sweep[1]);
    const sw2 = E.seg(t, 12.6, 14.6);
    if (sw > 0 && sw < 1) logo.set({ sweep: { p: E.sineInOut(sw), amount: 0.32 * Math.sin(Math.PI * sw) } });
    else if (sw2 > 0 && sw2 < 1) logo.set({ sweep: { p: E.sineInOut(sw2), amount: 0.12 * Math.sin(Math.PI * sw2) } });
    else logo.set({ sweep: null });

    // Camera: close on the strokes (0–8), pull back and orbit as the tile extrudes, a slow
    // push through the riser, then the push into the dot on the last beat.
    const pull = whoosh(E.seg(t, T.tile - 0.05, T.pullEnd + 0.5));
    const riser = E.sineInOut(E.seg(t, T.riser, T.push));
    const d = cam.drift(t, 3, { amp: 0.9, rate: 0.06, roll: 0.1, dolly: 0.006 });
    const calm = 1 - E.sineInOut(E.seg(t, 14.2, T.push)); // drift fades before the push
    let dist = E.lerp(5.4 - 0.05 * t, 10.4, pull) - 0.9 * riser;
    let az = E.lerp(-3 + 0.7 * t, -17, pull) + 11 * riser + d.az * calm;
    let el = E.lerp(1.5, 6.5, pull) - 2.5 * riser + d.el * calm;
    let shift = E.lerp(0.09, 0.125, pull);
    let fov = 30;
    let target = [0, 0, 0.04];
    if (t > T.push) {
      // Log-space dolly: the image scale grows smoothly, then rushes into the dot.
      const u = E.cubicIn(E.seg(t, T.push, T.cut));
      const end = 0.19;
      dist = dist * Math.pow(end / dist, u);
      shift *= 1 - E.sineIn(E.seg(t, T.push, T.cut));
      target = [0, 0, E.lerp(0.04, rest.z, E.sineInOut(E.seg(t, T.push, T.push + 0.3)))];
      az *= 1 - u;
      el *= 1 - u;
    }
    cam.orbit(camera, { target, dist: dist * (1 + (d.dist - 1) * calm), az, el, roll: d.roll * calm, fov, shift: [0, shift] });

    // Floor, dust, glow.
    s.floor.set({ opacity: E.sineInOut(E.seg(t, T.tile + 0.2, T.tile + 1.8)) });
    const camDist = camera.position.distanceTo(logo.group.position);
    s.dust.set({ time: t, focus: camDist, bright: (0.42 + 0.25 * riser) * appear, fov, H: ctx.renderH });
    const pushGlow = E.expoIn(E.seg(t, T.push, T.cut));
    // The breath: the studio dims on beat 4 of bar 7 and only the dot keeps its light.
    const dimK = E.sineInOut(E.seg(t, T.push - 0.35, T.push + 0.2));
    const dim = 1 - 0.8 * dimK;
    ctx.rig.set({ key: 1 - 0.97 * dimK, front: dim, env: dim, rim: dim });
    logo.materials.dot.uniforms.uGlow.value *= 1 + 0.5 * (1 - dim);
    post.bloom = { strength: 1.2 + 0.5 * (1 - E.sineInOut(E.seg(t, T.tile, T.tile + 1.2))) + 1.4 * pushGlow, radius: 0.62, threshold: 1, knee: 0.45 };
    post.vignette = 0.24;
    post.exposure = 1 + 0.3 * pushGlow;
    // Fast moves get more motion-blur sub-frames in final renders.
    post.samples = t > T.push ? 24 : t > T.tile && t < T.tile + 1.2 ? 10 : 0;

    // --- type ------------------------------------------------------------------------
    s.words[0].set(t, T.supply, T.demand - 0.36);
    s.words[1].set(t, T.demand, T.land - 0.36);
    s.words[2].set(t, T.land, T.axis[1] + 0.05);
    s.title.set(t, T.title, T.exit);
    s.sub.set(t, T.sub, T.exit + 0.05);
  },
};

export default scene;
