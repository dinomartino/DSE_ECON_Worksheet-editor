// opening — bars 0–8, night (FILM.md §3). The mark assembles in darkness on the piano
// motif: a breathing blue point; "Supply." (1.5 s) and "Demand." (3.5 s) strokes; the
// point drops into the crossing at 5.5 s; the axis lands on 7.5 s; the tile extrudes
// behind it on the 8.0 s whoosh as the camera pulls back; title at 10.0 s. From the 12.0 s
// riser the camera pushes toward the dot, accelerating through the breath (15.5 s) until
// blue fills the frame at the cut.
import { COPY, cue, cueAt, sceneStart, sceneEnd } from '../../timeline.mjs';
import { cubicBezier } from '../lib/ease.js';
import { pick } from '../lib/format.js';

const C = COPY.opening;
const START = sceneStart('opening');
const at = (id) => cueAt(id) - START;

// Beat map (scene seconds = film seconds here); the cued moments come from CUES.
const T = {
  dotIn: 0.15,
  supply: at('opening.supply'),
  demand: at('opening.demand'),
  drop: at('opening.land') - 0.55,
  land: at('opening.land'),
  axis: [6.2, 7.5],
  tile: at('opening.tile'),
  pullEnd: 9.9,
  sweep: [9.0, 10.8],
  title: at('opening.title'),
  sub: at('opening.title') + 0.7,
  exit: 14.0, // bar 7: the type clears before the push takes the frame
  riser: at('opening.riser'),
  push: cue('opening.riser').to - START, // the breath
  cut: sceneEnd('opening') - START,
};

// Layout per frame (design px). Portrait (FILM-9x16.md): the mark builds at y≈820 with its
// words under it; the tile at y≈760 with the title and sub stacked below. `shift` is the
// lens shift of pose A / B (frame fractions), `k` scales pose A / B's distance.
const L = pick({
  landscape: {
    word: { y: 812, size: 120 }, title: { y: 760, size: 124 },
    sub: { y: 884, size: 38, zhSize: 30, zhGap: 14 },
    shift: [0.09, 0.125], k: [1, 1],
  },
  portrait: {
    word: { y: 1300, size: 104 }, title: { y: 1240, size: 104 },
    sub: { y: 1372, size: 36, zhSize: 32, zhGap: 14 },
    shift: [0.073, 0.104], k: [1.08, 0.92],
  },
});
// Fast but from rest: the 8.0 s whoosh must not start at full speed (a visible jolt).
const whoosh = cubicBezier(0.3, 0, 0.06, 1);
const DOT_HOVER = [0, 0.66, 0.16];
const PUSH = Math.log(3); // image scale gained by the breath
const END = 0.19; // camera distance to the dot at the cut

// Camera poses: A frames the mark as it builds, B the tile and title. Each carries its own
// slow dolly and arc, so no hold is ever a freeze.
const poseA = (t) => ({ dist: 5.4 * L.k[0] * Math.exp(-0.022 * t), az: -7 + 1.4 * t, el: 1.5 + 0.25 * t });
const poseB = (t) => ({ dist: 10.4 * L.k[1] * Math.exp(-0.012 * (t - 10)), az: -17 + 0.9 * (t - 10), el: 6.5 - 0.2 * (t - 10) });

/** Log-scale push: cubic from rest on the riser to 3× at the breath, then a C2 run into the dot. */
function pushLog(t, total) {
  const L = T.push - T.riser;
  if (t <= T.riser) return 0;
  if (t <= T.push) return PUSH * ((t - T.riser) / L) ** 3;
  const v0 = (3 * PUSH) / L, a0 = (6 * PUSH) / (L * L), D = T.cut - T.push;
  const c = (total - PUSH - v0 * D - 0.5 * a0 * D * D) / D ** 3;
  const x = t - T.push;
  return PUSH + v0 * x + 0.5 * a0 * x * x + c * x ** 3;
}

/** A stroke's cross-section (0..1): it grows from a point instead of popping in whole. */
function taper(bar, k) {
  const [body, c0, c1] = bar.children;
  body.scale.y = body.scale.z = k;
  c0.scale.setScalar(k);
  c1.scale.setScalar(k);
}

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
    // Front fill from higher up: its clear-coat glint sits ~0.42·(camera distance) above the
    // camera's foot point, so it stays off the tile until the push has dimmed it.
    ctx.rig.front.position.set(0.8, 3.4, 8);

    const T_ = lib.type;
    s.words = [C.supply, C.demand, C.equilibrium].map((en) => T_.headline(ctx.el, { en, ...L.word, world: 'night' }));
    s.title = T_.headline(ctx.el, { en: C.title, ...L.title, world: 'night' });
    s.sub = T_.sub(ctx.el, { en: C.sub, zh: C.subZh, ...L.sub, world: 'night' });
  },

  update(t, ctx) {
    const { lib, camera, post } = ctx;
    const { ease: E, camera: cam } = lib;
    const { ICON } = lib.logo;
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
    // Each stroke starts as a point: its radius is capped by half its drawn length and
    // eases up over the first frames; the faint axis fades in over its first stretch.
    const r = ICON.strokeR, len = Math.hypot(ICON.supply[1][0] - ICON.supply[0][0], ICON.supply[1][1] - ICON.supply[0][1]);
    const grain = (p, t0) => Math.min(1, (p * len) / (2 * r), E.smoothstep(t0, t0 + 0.1, t));
    taper(logo.supply, grain(supply, T.supply - 0.04));
    taper(logo.demand, grain(demand, T.demand - 0.04));
    logo.materials.axis.uniforms.uOpacity.value = ICON.axisOpacity * E.smoothstep(0, 0.12, axis);
    // The sweep crosses once the tile has settled; a second, fainter pass rides the riser.
    const sw = E.seg(t, T.sweep[0], T.sweep[1]);
    const sw2 = E.seg(t, 12.6, 14.6);
    if (sw > 0 && sw < 1) logo.set({ sweep: { p: E.sineInOut(sw), amount: 0.32 * Math.sin(Math.PI * sw) } });
    else if (sw2 > 0 && sw2 < 1) logo.set({ sweep: { p: E.sineInOut(sw2), amount: 0.12 * Math.sin(Math.PI * sw2) } });
    else logo.set({ sweep: null });

    // Camera: A (close on the strokes, a slow push and arc) whooshes back to B as the tile
    // extrudes; B arcs on through the title. From the riser a log-space push closes on the
    // dot, gathering pace with the music and rushing in through the breath.
    const pull = whoosh(E.seg(t, T.tile - 0.05, T.pullEnd + 0.5));
    const riser = E.sineInOut(E.seg(t, T.riser, T.push));
    const d = cam.drift(t, 3, { amp: 0.9, rate: 0.06, roll: 0.1, dolly: 0.006 });
    const calm = 1 - E.sineInOut(E.seg(t, 14.2, T.push)); // drift fades before the rush
    const A = poseA(t), B = poseB(t);
    const into = E.cubicIn(E.seg(t, T.push, T.cut)); // the last beat: orbit unwinds to face the dot
    const push = pushLog(t, Math.log(poseB(T.cut).dist / END));
    const dist = E.lerp(A.dist, B.dist, pull) * Math.exp(-push) * (1 + (d.dist - 1) * calm);
    const az = (E.lerp(A.az, B.az, pull) + 11 * riser + d.az * calm) * (1 - into);
    const el = (E.lerp(A.el, B.el, pull) - 2.5 * riser + d.el * calm) * (1 - into);
    const shift = E.lerp(L.shift[0], L.shift[1], pull) * (1 - E.sineInOut(E.seg(t, 14.3, 15.9)));
    const fov = 30;
    const target = [0, 0, E.lerp(0.04, rest.z, E.sineInOut(E.seg(t, 14.5, 15.8)))];
    cam.orbit(camera, { target, dist, az, el, roll: d.roll * calm, fov, shift: [0, shift] });

    // Floor, dust, glow.
    s.floor.set({ opacity: E.sineInOut(E.seg(t, T.tile + 0.2, T.tile + 1.8)) });
    const camDist = camera.position.distanceTo(logo.group.position);
    s.dust.set({ time: t, focus: camDist, bright: (0.48 + 0.2 * riser) * appear, fov, H: ctx.renderH });
    const pushGlow = E.expoIn(E.seg(t, T.push, T.cut));
    // The breath: the studio dims on beat 4 of bar 7 and only the dot keeps its light. The
    // glossy highlights go with it, so no specular point races the dot during the rush.
    const dimK = E.sineInOut(E.seg(t, T.push - 0.35, T.push + 0.2));
    const dim = 1 - 0.8 * dimK;
    const gloss = 1 - E.sineInOut(E.seg(t, T.push - 0.2, T.push + 0.15));
    ctx.rig.set({ key: 1 - 0.97 * dimK, front: dim * gloss, env: dim, rim: dim });
    logo.materials.tile.clearcoat = Math.max(1e-3, gloss); // > 0: no shader switch
    logo.materials.cream.clearcoat = Math.max(1e-3, 0.35 * gloss);
    logo.materials.dot.uniforms.uGlow.value *= 1 + 0.5 * (1 - dim);
    // The lone point gets a wide soft halo that eases back as the lines arrive.
    const halo = 1 - E.sineInOut(E.seg(t, 1.2, 3.0));
    post.bloom = {
      strength: 1.2 + 0.9 * halo + 0.5 * (1 - E.sineInOut(E.seg(t, T.tile, T.tile + 1.2))) + 1.4 * pushGlow,
      radius: 0.62 + 0.2 * halo,
      threshold: 1,
      knee: 0.45,
    };
    post.vignette = 0.24;
    post.exposure = 1 + 0.3 * pushGlow;
    // Fast moves get more motion-blur sub-frames in final renders.
    post.samples = t > T.push - 0.3 ? 24 : t > 14.6 ? 12 : t > T.tile && t < T.tile + 1.2 ? 10 : 0;

    // --- type ------------------------------------------------------------------------
    s.words[0].set(t, T.supply, T.demand - 0.36);
    s.words[1].set(t, T.demand, T.land - 0.36);
    s.words[2].set(t, T.land, T.axis[1] + 0.05);
    s.title.set(t, T.title, T.exit);
    s.sub.set(t, T.sub, T.exit + 0.05);
  },
};

export default scene;
