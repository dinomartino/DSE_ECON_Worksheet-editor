// papers — bars 28–32, day (FILM.md §3). From the pair marks hands over, on the 56.0
// whoosh the camera pulls back and tips over the desk while the pack fans out to the right
// from under the diagram page: its teacher copy, a quiz, Version A, an LQ worksheet, a
// booklet page, the Paper 2 and Paper 1 covers: quiz to mock paper, left to right, landing
// on 57.5. On the 62.0 whoosh the fan folds back under the diagram page, which ends on top
// of the stack (63.0) where word opens; the room goes dark around a warm pool of light on
// it, then the pool and the paper go down together by 64.0 (hard cut).
import { COPY } from '../../timeline.mjs';
import { cubicBezier } from '../lib/ease.js';
import { stop, mixPose, withDrift, applyPose, haze } from './marks/kit.js';
import { S_POS, S_ROT, tPose, holdCam, hazeAt, HAZE_BAND, dofAt, SHEET } from './papers/deck.js';
import { PACK, S_K, T_K, TH_S, SP_OPEN, SP_SHUT, SP_STACK, PHI_OPEN, PHI_STACK, at, lin, sheetTexture } from './papers/fan.js';

const C = COPY.papers;
const F0T = 56; // film time of t = 0

// Beat map (scene seconds).
const T = {
  pull: [0.0, 1.5], // camera: pull back and tip over the desk (57.5)
  open: [0.04, 1.5], // the fan opens, the last sheet settling on 57.5
  turn: [0.0, 1.5], // the turntable centres the fan
  head: [1.0, 5.62],
  sub: [2.0, 5.66],
  dolly: [1.7, 5.6], // while the fan holds: a slow push, tilt and spread
  rack: [1.9, 4.3], // focus travels from the diagram page to the covers (60.3)
  close: [6.0, 7.0], // 62.0 whoosh: the fan folds back under the diagram page (63.0)
  frame: [6.0, 7.1], // camera onto the stack, centred…
  settle: [6.9, 8.0], // …then up into word's first framing as the lights go
  room: [6.3, 7.4], // lights down: the room goes warm, then near black
  pool: [7.3, 7.9], // then the pool and the paper together
};

// Camera: the open fan over the type band; the stack, centred; word's first frame.
const WIDE = stop([...at(0), S_POS[2]], 335, 935, 235, { az: 6, el: -24 }); // orbits to az −6
const STACK_MID = stop([...at(0), S_POS[2]], 420, 960, 520, { az: 3, el: -14 });
const STACK = stop([...at(0), S_POS[2]], 452, 965, 405, { az: 2, el: -10 }); // ≈ word at 64.0

// Lights (display sRGB). The room dims through a warm tungsten brown to near black; the
// pool on the stack turns a warm white (the paper, pure white, is always the brightest
// thing); then pool and paper dim together like one lamp, warming, neutral at the end.
const ROOM = [
  { top: [0xf5, 0xf1, 0xea], bottom: [0xe8, 0xe1, 0xd5] },
  { top: [0xdc, 0xc6, 0xa6], bottom: [0xcf, 0xb6, 0x94] },
  { top: [0x94, 0x70, 0x4c], bottom: [0x78, 0x59, 0x3b] },
  { top: [0x05, 0x05, 0x05], bottom: [0x02, 0x02, 0x02] }, // neutral: a hue this dark bands green in 4:2:0
];
const POOL = { day: [0xf8, 0xf5, 0xef], lamp: [0xf6, 0xea, 0xda] };
const EMBER = { pool: [1, 0.8, 0.58], paper: [1, 0.93, 0.84] }; // a dimming tungsten lamp

const pullEase = cubicBezier(0.42, 0, 0.1, 1); // from rest, long landing
const openEase = cubicBezier(0.36, 0, 0.14, 1);
const closeEase = cubicBezier(0.55, 0, 0.18, 1);
const lerp = (a, b, u) => a + (b - a) * u;
const bump = (u) => 0.5 - 0.5 * Math.cos(2 * Math.PI * Math.min(1, Math.max(0, u))); // 0→1→0, flat ends
const toLin = (c) => c.map((v) => lin(v / 255));
/** Piecewise-linear blend of sRGB keys in linear light, u in 0..1 over the keys. */
function keysLin(keys, u) {
  const n = keys.length - 1;
  const i = Math.min(n - 1, Math.floor(u * n));
  const a = toLin(keys[i]), b = toLin(keys[i + 1]);
  const v = u * n - i;
  return a.map((x, j) => lerp(x, b[j], v));
}

const scene = {
  id: 'papers',
  world: 'day',
  async setup(ctx) {
    const { lib, scene } = ctx;
    const s = (ctx.state = {});
    // The pair is seen close in marks: full-size maps; the rest are seen small.
    const maps = await Promise.all(PACK.map(({ path }, k) =>
      (k <= T_K ? ctx.load.texture(path) : sheetTexture(ctx, path, 1400))));
    s.sheets = maps.map((map, k) => {
      const sh = lib.paper.sheet({ map, width: 1, ...SHEET, shadowBlur: 0.04 });
      sh.group.name = PACK[k].path;
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
    const phi = lerp(PHI_OPEN * E.quintInOut(E.seg(t, ...T.turn)), PHI_STACK, uc);
    const lift = 0.1 * bump(E.seg(t, T.open[0], T.open[1] + 0.3)) + 0.06 * bump(E.seg(t, T.close[0], T.close[1] + 0.1));
    const roomK = E.sineInOut(E.seg(t, ...T.room));
    const poolK = E.sineInOut(E.seg(t, ...T.pool));
    const flat = E.smoothstep(0.15, 1.3, t); // lying on the desk: flat, shadows between layers
    const u0 = E.quintInOut(E.seg(t, 0, 1.2)); // the hinge settles flat
    const spT = lerp(SP_OPEN, SP_STACK, uc); // the teacher copy's gap under the hinge
    const hold = E.sineInOut(E.seg(t, ...T.dolly)); // the held fan: a slow push, tilt and spread
    const spread = 1 + 0.03 * hold;

    s.sheets.forEach((sh, k) => {
      let pos, rot;
      if (k === S_K) {
        const g = TH_S + phi;
        pos = [...at(g), S_POS[2] + lift];
        rot = [S_ROT[0] * (1 - u0), S_ROT[1] * (1 - u0), g];
      } else if (k === T_K) {
        const g = TH_S + lerp(PACK[k].off * spread, 0, uc) + phi;
        const fan = [...at(g), S_POS[2] - spT + lift];
        const uT = openEase(E.seg(t, 0.0, 1.35));
        const m = tPose(f);
        pos = m.pos.map((v, i) => lerp(v, fan[i], uT));
        rot = [lerp(m.rot[0], 0, uT), lerp(m.rot[1], 0, uT), lerp(m.rot[2], g, uT)];
      } else {
        // Farther sheets leave the hinge a touch later; all land together on 57.5.
        const uo = openEase(E.seg(t, T.open[0] + 0.035 * (k - T_K - 1), T.open[1]));
        const sp = lerp(lerp(SP_SHUT, SP_OPEN, uo), SP_STACK, uc);
        const g = TH_S + lerp(PACK[k].off * uo * spread, 0, uc) + phi;
        pos = [...at(g), S_POS[2] - spT - (PACK[k].depth - 1) * sp + lift];
        rot = [S_ROT[0] * (1 - u0), S_ROT[1] * (1 - u0), g];
        // Hidden sheets cast nothing until they leave the hinge.
        sh.shadowK = E.smoothstep(0, 0.25, uo);
      }
      sh.group.position.set(...pos);
      sh.group.rotation.set(rot[0], rot[1], rot[2]);
      const bend = 0.012 * (1 - flat);
      sh.set({ bend });
      // Shadow: nearly under the sheet, so its soft rim shades the sheets under both its edges
      // (the V overlaps both ways); it sits between the layers once the sheets lie flat.
      const c = Math.cos(-rot[2]), si = Math.sin(-rot[2]);
      const [ox, oy] = [0.006, -0.012];
      const lx = lerp(0.018, ox * c - oy * si, flat), ly = lerp(-0.03, ox * si + oy * c, flat);
      sh.shadow.position.set(lx, ly, lerp(-0.02, -(bend + 0.45 * SP_OPEN), flat));
      sh.shadow.material.opacity = lerp(0.15, 0.26, flat) * (sh.shadowK ?? 1) * (1 - roomK);
    });

    // ---- camera ----------------------------------------------------------------------------
    const orbitAz = -12 * E.seg(t, 1.2, 6.6);
    const wide = { ...WIDE, az: WIDE.az + orbitAz, el: WIDE.el + 3 * hold, dist: WIDE.dist * (1 - 0.04 * hold) };
    let p = mixPose(holdCam(lib, f), wide, pullEase(E.seg(t, ...T.pull)));
    p = mixPose(p, STACK_MID, E.quintInOut(E.seg(t, ...T.frame)));
    p = mixPose(p, STACK, E.sineInOut(E.seg(t, ...T.settle)));
    const d = lib.camera.drift(f, 29, { amp: 0.4, rate: 0.07, roll: 0.05, dolly: 0.004 });
    p = withDrift(p, d, E.smoothstep(0.1, 1.6, t) * (1 - E.smoothstep(6.9, 8.0, t)));
    applyPose(lib, camera, p);

    // ---- lights ----------------------------------------------------------------------------
    const bu = ctx.backdrop.material.uniforms;
    const room = { top: keysLin(ROOM.map((r) => r.top), roomK), bottom: keysLin(ROOM.map((r) => r.bottom), roomK) };
    bu.uTop.value.setRGB(...room.top);
    bu.uBottom.value.setRGB(...room.bottom);
    // The paper keeps full white until the lamp dims; the pool follows the paper down.
    const bl = lin(lerp(1, 0.02, poolK));
    const ember = E.smoothstep(0, 0.4, poolK) * (1 - E.smoothstep(0.55, 0.8, poolK)); // neutral below ~40/255
    const glow = keysLin([POOL.day, POOL.lamp], roomK);
    bu.uGlow.value.setRGB(...glow.map((v, i) => v * bl * lerp(1, EMBER.pool[i], ember)));
    s.v.set(...at(0), S_POS[2]).project(camera);
    bu.uCenter.value.set(lerp(0.5, s.v.x * 0.5 + 0.5, roomK), lerp(0.62, s.v.y * 0.5 + 0.5, roomK));
    bu.uGlowAmount.value = lerp(0.55, 1, roomK) * (1 - E.smoothstep(0.9, 1, poolK));
    bu.uRadius.value = lerp(0.6, 0.36, roomK);
    const tint = EMBER.paper.map((v) => bl * lerp(1, v, ember));
    for (const sh of s.sheets) {
      sh.material.color.setRGB(...tint);
      sh.edge.material.color.set('#D9D4CB').multiplyScalar(bl);
    }
    const hz = Math.max(hazeAt(f), E.sineInOut(E.seg(t, 0.55, 1.2)) * (1 - E.sineInOut(E.seg(t, 5.6, 6.3))));
    s.haze.set({ amount: hz, ...HAZE_BAND });

    // ---- post, type ------------------------------------------------------------------------
    // Depth of field: onto the diagram page as the fan lands, then a rack to the covers.
    const depth = (k) => -s.v.copy(s.sheets[k].group.position).applyMatrix4(camera.matrixWorldInverse).z;
    const dofWide = E.sineInOut(E.seg(t, 0.4, 1.6));
    const onFan = lerp(depth(S_K), depth(PACK.length - 1), E.sineInOut(E.seg(t, ...T.rack)));
    const focus = lerp(p.dist, lerp(onFan, p.dist, E.sineInOut(E.seg(t, 6.0, 6.9))), dofWide);
    post.dof = t < 0.4 ? dofAt(p.dist, 1) : { focus, aperture: lerp(130, 230, dofWide) * lerp(1, 0.5, E.seg(t, 6.0, 6.9)), maxBlur: 12 };
    post.vignette = lerp(0.06, 0.22, roomK);
    post.bloom = null;
    const moving = (a, b) => t > a && t < b;
    post.samples = moving(0.0, 1.6) || moving(T.close[0], T.frame[1]) ? 14 : 0;

    s.head.set(t, T.head[0], T.head[1]);
    s.sub.set(t, T.sub[0], T.sub[1]);
  },
};

export default scene;
