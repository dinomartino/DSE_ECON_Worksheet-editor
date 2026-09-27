// end — bars 42–47, night (FILM.md §3). On the 84.0 s hit: black, the tile turned away,
// only its rim and the blue dot lit — already swinging to face camera under a light sweep
// while the studio comes up; "Econ Worksheet". The camera pulls back into a lockup as the
// tagline lands on the 86.0 s tick; "Free. No account needed." blooms in on the 88.0 s
// swell; the hold keeps arcing in; the engine fades to black over the last bar (92–94 s).
import { COPY, cueAt, sceneStart } from '../../timeline.mjs';

const C = COPY.end;
const START = sceneStart('end');
const at = (id) => cueAt(id) - START;

// Scene seconds (film − 84); the tagline and the small line land on their cues.
const T = {
  turn: 2.2,
  sweep: [0.35, 2.1],
  sweep2: [4.6, 7.4], // a faint second pass after the swell: the hold breathes
  lights: [0.05, 1.6],
  title: 0.3,
  lockup: [1.45, 2.55],
  tagline: at('end.tagline'),
  small: at('end.swell'),
  swell: at('end.swell'),
};

// Lockup geometry in design px: tile centre y / size, then title y and scale.
const HERO = { tileY: 392, tileH: 410, titleY: 772 };
const LOCK = { tileY: 262, tileH: 212, titleY: 432, titleScale: 0.44 };

const scene = {
  id: 'end',
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
      count: 120, seed: 42, H: ctx.renderH,
      box: [[-12, -1.3, -18], [12, 7, 4]], size: 0.012, aperture: 0.2, bright: 0.7, drift: 0.3, rise: 0.01, minPx: 5,
    });
    scene.add(s.dust.mesh);
    const T_ = lib.type;
    s.title = T_.headline(ctx.el, { en: C.title, y: HERO.titleY, size: 128, world: 'night' });
    s.tagline = T_.headline(ctx.el, { en: C.tagline, zh: C.taglineZh, y: 672, size: 104, world: 'night', gradient: 3 });
    // Top-aligned ~50 px under the tagline's Chinese line, so it reads as part of the lockup.
    s.small = T_.small(ctx.el, { en: C.small, zh: C.smallZh, y: 800, valign: 'top', size: 36, world: 'night' });
  },

  update(t, ctx) {
    const { lib, camera, post } = ctx;
    const { ease: E, camera: cam } = lib;
    const s = ctx.state;
    const logo = s.logo;

    // The turn: already swinging on the hit (expoOut starts at full speed), settling from
    // edge-on to facing the camera with no overshoot.
    const away = 1 - E.expoOut(E.seg(t, 0, T.turn));
    logo.group.rotation.set(0.1 * away, -1.25 * away, -0.05 * away);
    logo.set({
      supply: 1, demand: 1, axis: 1, puck: 1,
      tile: { scale: 1, extrude: 1, face: 1 },
      dot: { position: [0, 0, logo.dotRest.z], scale: 1 },
    });
    const breath = 0.5 + 0.5 * Math.sin((2 * Math.PI * t) / 4);
    const swell = Math.exp(-(((t - T.swell - 0.8) / 1.1) ** 2));
    const hit = Math.exp(-Math.max(0, t) / 0.45); // the 84.0 s impact
    logo.materials.dot.uniforms.uGlow.value = 2.0 + 0.25 * breath + 0.5 * swell + 1.4 * hit;
    const sw = E.seg(t, T.sweep[0], T.sweep[1]);
    const sw2 = E.seg(t, T.sweep2[0], T.sweep2[1]);
    if (sw > 0 && sw < 1) logo.set({ sweep: { p: E.sineInOut(sw), amount: 0.3 * Math.sin(Math.PI * sw) } });
    else if (sw2 > 0 && sw2 < 1) logo.set({ sweep: { p: E.sineInOut(sw2), amount: 0.14 * Math.sin(Math.PI * sw2) } });
    else logo.set({ sweep: null });

    // Lights come up from rim-only on the hit.
    const up = E.sineInOut(E.seg(t, T.lights[0], T.lights[1]));
    ctx.rig.set({ key: 0.15 + 0.85 * up, front: 0.1 + 0.9 * up, env: 0.25 + 0.75 * up, rim: 1.4 - 0.4 * up });
    logo.materials.tile.userData.exposure.value = 0.55 + 0.45 * up;

    // Camera: hero framing, then a pull back into the lockup. Under it all a continuous
    // push (~5% across the hold) and a ~10° arc, so the held card visibly lives.
    const lock = E.quintInOut(E.seg(t, T.lockup[0], T.lockup[1]));
    const tileY = E.lerp(HERO.tileY, LOCK.tileY, lock);
    const tileH = E.lerp(HERO.tileH, LOCK.tileH, lock);
    const fov = 30;
    const d = cam.drift(t, 9, { amp: 0.8, rate: 0.05, roll: 0.08 });
    const creep = 1 - 0.065 * E.seg(t, 0, 10);
    const dist = (cam.distFor(fov, (2 * 1080) / tileH) * creep) * d.dist;
    cam.orbit(camera, {
      target: [0, 0, 0.04],
      dist,
      az: -6 + 10 * E.seg(t, 0, 10) + d.az,
      el: 3.5 + d.el,
      roll: d.roll,
      fov,
      shift: [0, (540 - tileY) / 1080],
    });

    s.floor.set({ opacity: 1 });
    s.dust.set({ time: START + t, focus: camera.position.length(), bright: 0.34 + 0.16 * up, fov, H: ctx.renderH });
    post.bloom = { strength: 1.35 + 0.5 * swell + 0.6 * hit, radius: 0.62, threshold: 1, knee: 0.45 };
    post.vignette = 0.24;
    post.samples = t < 1.2 ? 8 : 0;

    // Type: the title reads large, then rides up and shrinks into the lockup label.
    s.title.set(t, T.title);
    s.title.place({ y: E.lerp(HERO.titleY, LOCK.titleY, lock), scale: E.lerp(1, LOCK.titleScale, lock) });
    s.tagline.set(t, T.tagline);
    s.small.set(t, T.small);
  },
};

export default scene;
