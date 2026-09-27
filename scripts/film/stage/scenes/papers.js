// papers — bars 28–32, day (FILM.md §3). From the teacher's copy marks hands over, on the
// 56.0 whoosh the camera pulls back and tips over the desk while the pack fans out from
// under the student copy: covers, booklet pages, LQ worksheets, versions A/B/C, the
// diagram page — one arc over the headline, the camera orbiting. On the 62.0 whoosh the
// fan closes into one neat stack, and the lights go down to near-black by 64.0 (hard cut).
import { COPY } from '../../timeline.mjs';
import { cubicBezier } from '../lib/ease.js';
import { stop, mixPose, withDrift, applyPose, haze } from './marks/kit.js';
import { S_POS, S_ROT, tPose, holdCam, hazeAt, HAZE_BAND, dofAt, SHEET } from './papers/deck.js';
import { ORDER, S_K, T_K, STEP, TH_S, SP_OPEN, SP_SHUT, SP_STACK, PHI_OPEN, PHI_STACK, at, lin, sheetTexture } from './papers/fan.js';

const C = COPY.papers;
const F0T = 56; // film time of t = 0
const DEG = Math.PI / 180;

// Beat map (scene seconds).
const T = {
  pull: [0.0, 1.75], // camera: pull back and tip over the desk
  open: [0.04, 1.45], // the fan opens (per-sheet stagger on top)
  turn: [0.0, 1.7], // the turntable centres the fan
  head: [1.0, 5.62],
  sub: [1.75, 5.66],
  close: [6.0, 7.05], // 62.0 whoosh: the fan closes into the stack
  frame: [6.0, 7.35], // camera onto the stack
  rack: [1.9, 5.3], // focus travels from the quiz end to the covers
  room: [6.3, 7.45], // lights down: the room first, to a warm pool on the stack…
  pool: [6.85, 7.95], // …then the pool
};

// Camera: the open fan over the type band; then the stack.
const WIDE = stop([...at(0), S_POS[2]], 368, 960, 336, { az: 6, el: -24 }); // orbits to az −6
const STACK = stop([...at(0), S_POS[2]], 445, 960, 410, { az: 2, el: -13 }); // ≈ word's first frame
const DAY = { top: [0xf5, 0xf1, 0xea], bottom: [0xe8, 0xe1, 0xd5], glow: [0xf8, 0xf5, 0xef] };
const EMBER = [0xff, 0xe2, 0xbc]; // the pool warms as it dims, like a tungsten lamp

const pullEase = cubicBezier(0.42, 0, 0.1, 1); // from rest, long landing
const openEase = cubicBezier(0.36, 0, 0.14, 1);
const closeEase = cubicBezier(0.55, 0, 0.18, 1);
const lerp = (a, b, u) => a + (b - a) * u;
const bump = (u) => 0.5 - 0.5 * Math.cos(2 * Math.PI * Math.min(1, Math.max(0, u))); // 0→1→0, flat ends

const scene = {
  id: 'papers',
  world: 'day',
  async setup(ctx) {
    const { lib, scene } = ctx;
    const s = (ctx.state = {});
    const maps = await Promise.all(ORDER.map((n, k) =>
      k >= S_K ? ctx.load.texture(`sheets/${n}.png`) : sheetTexture(ctx, n, 1400)));
    s.sheets = maps.map((map, k) => {
      const sh = lib.paper.sheet({ map, width: 1, ...SHEET });
      sh.group.name = ORDER[k];
      sh.group.rotation.order = 'ZXY';
      scene.add(sh.group);
      return sh;
    });
    s.haze = haze(ctx);
    s.v = new ctx.THREE.Vector3();
    const T_ = lib.type;
    s.head = T_.headline(ctx.el, { en: C.headline, zh: C.headlineZh, y: 832, size: 104, zhSize: 44, world: 'day' });
    s.sub = T_.sub(ctx.el, { en: C.sub, y: 968, size: 38, world: 'day' });
  },

  update(t, ctx) {
    const { lib, camera, post } = ctx;
    const { ease: E } = lib;
    const s = ctx.state;
    const f = F0T + t;

    // ---- the fan ---------------------------------------------------------------------------
    const uc = closeEase(E.seg(t, ...T.close));
    const phi = lerp(PHI_OPEN * E.quintInOut(E.seg(t, ...T.turn)) + 3 * DEG * E.seg(t, 1.5, 6.4), PHI_STACK, uc);
    const lift = 0.1 * bump(E.seg(t, T.open[0], T.open[1] + 0.3)) + 0.06 * bump(E.seg(t, T.close[0], T.close[1] + 0.1));
    const roomK = E.sineInOut(E.seg(t, ...T.room));
    const poolK = E.sineInOut(E.seg(t, ...T.pool));
    const paperB = lerp(1, 0.066, 0.25 * roomK + 0.75 * poolK); // display brightness
    const flat = E.smoothstep(0.15, 1.3, t); // lying on the desk: flat, shadows between layers

    s.sheets.forEach((sh, k) => {
      let pos, rot, sp;
      if (k === T_K) {
        const g = TH_S - STEP + phi;
        const fan = [...at(g), S_POS[2] + lerp(SP_OPEN, SP_STACK, uc) + lift];
        const uT = openEase(E.seg(t, 0.0, 1.35));
        const m = tPose(f);
        pos = m.pos.map((v, i) => lerp(v, fan[i], uT));
        rot = [lerp(m.rot[0], 0, uT), lerp(m.rot[1], 0, uT), lerp(m.rot[2], g, uT)];
        sp = SP_OPEN;
      } else {
        const d = 0.032 * (8 - Math.min(8, k));
        const uo = k === S_K ? 1 : openEase(E.seg(t, T.open[0] + d, T.open[1] + d));
        const a = lerp(TH_S + (S_K - k) * STEP * uo, TH_S - STEP, uc);
        sp = lerp(lerp(SP_SHUT, SP_OPEN, uo), SP_STACK, uc);
        const g = a + phi;
        const z = S_POS[2] - (S_K - k) * sp + lift;
        pos = [...at(g), z];
        const u0 = E.quintInOut(E.seg(t, 0, 1.2)); // the hinge settles flat
        rot = [S_ROT[0] * (1 - u0), S_ROT[1] * (1 - u0), g];
        // Hidden sheets cast nothing until they leave the hinge.
        sh.shadowK = k === S_K ? 1 : E.smoothstep(0, 0.25, uo);
      }
      sh.group.position.set(...pos);
      sh.group.rotation.set(rot[0], rot[1], rot[2]);
      const bend = 0.012 * (1 - flat);
      sh.set({ bend });
      // Shadow: a world-fixed offset (left, toward the viewer) so each sheet shades the one
      // under its left edge; it sits between the layers once the sheets lie flat.
      const c = Math.cos(-rot[2]), si = Math.sin(-rot[2]);
      const [ox, oy] = [-0.02, -0.016];
      const lx = lerp(0.018, ox * c - oy * si, flat), ly = lerp(-0.03, ox * si + oy * c, flat);
      sh.shadow.position.set(lx, ly, lerp(-0.02, -(bend + 0.45 * sp), flat));
      sh.shadow.material.opacity = 0.15 * (sh.shadowK ?? 1) * (1 - roomK); // no shadows in the dark
      const b = lin(paperB); // display brightness → linear multiplier
      sh.material.color.setScalar(b);
      sh.edge.material.color.set('#D9D4CB').multiplyScalar(b);
    });

    // ---- camera ----------------------------------------------------------------------------
    const orbitAz = -12 * E.seg(t, 1.2, 6.6);
    const wide = { ...WIDE, az: WIDE.az + orbitAz };
    let p = mixPose(holdCam(lib, f), wide, pullEase(E.seg(t, ...T.pull)));
    const stack = { ...STACK, dist: STACK.dist * (1 - 0.025 * E.seg(t, 7.0, 8.2)) };
    p = mixPose(p, stack, E.quintInOut(E.seg(t, ...T.frame)));
    const d = lib.camera.drift(f, 29, { amp: 0.4, rate: 0.07, roll: 0.05, dolly: 0.004 });
    p = withDrift(p, d, E.smoothstep(0.1, 1.6, t));
    applyPose(lib, camera, p);

    // ---- world, post, type ----------------------------------------------------------------
    // Lights down: the room goes dark around a pool of light on the stack, then the pool.
    const bu = ctx.backdrop.material.uniforms;
    const room = lerp(1, 0.012, roomK), pool = lerp(1, 0.075, poolK);
    const rgb = (u, c, k) => u.value.setRGB((c[0] / 255) * k, (c[1] / 255) * k, (c[2] / 255) * k, ctx.THREE.SRGBColorSpace);
    rgb(bu.uTop, DAY.top, room);
    rgb(bu.uBottom, DAY.bottom, room);
    const warm = DAY.glow.map((c, i) => lerp(c, EMBER[i], poolK));
    rgb(bu.uGlow, warm, pool);
    s.v.set(...at(0), S_POS[2]).project(camera);
    bu.uCenter.value.set(lerp(0.5, s.v.x * 0.5 + 0.5, roomK), lerp(0.62, s.v.y * 0.5 + 0.5, roomK));
    bu.uGlowAmount.value = lerp(0.55, 1, roomK);
    bu.uRadius.value = lerp(0.6, 0.34, roomK);
    const hz = Math.max(hazeAt(f), E.sineInOut(E.seg(t, 0.55, 1.2)) * (1 - E.sineInOut(E.seg(t, 5.6, 6.3))));
    s.haze.set({ amount: hz, ...HAZE_BAND });
    // Depth of field: onto the quiz end as the fan lands, then a slow rack to the covers.
    const depth = (k) => -s.v.copy(s.sheets[k].group.position).applyMatrix4(camera.matrixWorldInverse).z;
    const dofWide = E.sineInOut(E.seg(t, 0.4, 1.6));
    const onFan = lerp(depth(T_K), depth(0), E.sineInOut(E.seg(t, ...T.rack)));
    const focus = lerp(p.dist, lerp(onFan, p.dist, E.sineInOut(E.seg(t, 6.0, 6.9))), dofWide);
    post.dof = t < 0.4 ? dofAt(p.dist, 1) : { focus, aperture: lerp(130, 230, dofWide) * lerp(1, 0.5, E.seg(t, 6.0, 6.9)), maxBlur: 12 };
    post.vignette = lerp(0.06, 0.4, roomK);
    post.bloom = null;
    const moving = (a, b) => t > a && t < b;
    post.samples = moving(0.0, 1.7) || moving(T.close[0], T.frame[1]) ? 14 : 0;

    s.head.set(t, T.head[0], T.head[1]);
    s.sub.set(t, T.sub[0], T.sub[1]);
  },
};

export default scene;
