// papers — bars 28–32, day (FILM.md §3). From the pair marks hands over, on the 56.0 whoosh
// the camera pulls back and tips over the desk while the pack fans out to the right from
// under the diagram page: its teacher copy, Versions A, B and C, an LQ worksheet, the Paper 2
// and Paper 1 covers: quiz to mock paper, landing on 57.5. The held fan lifts sheet by sheet
// on the beats, focus following, as the camera drifts over to the covers. On the 62.0 whoosh
// the fan folds back under the diagram page, the room goes down around a lamp on the stack,
// and the paper and its pool fall together to word's first frame (hard cut at 64.0).
import { COPY } from '../../timeline.mjs';
import { cubicBezier } from '../lib/ease.js';
import { stop, mixPose, withDrift, applyPose, haze } from './marks/kit.js';
import { S_POS, S_ROT, tPose, holdCam, hazeAt, HAZE_BAND, dofAt, SHEET } from './papers/deck.js';
import { PACK, S_K, T_K, TH_S, SP_OPEN, SP_SHUT, SP_STACK, PHI_OPEN, PHI_STACK, at, lin, sheetTexture } from './papers/fan.js';

const C = COPY.papers;
const F0T = 56; // film time of t = 0
const LAST = 7 + 59 / 60; // the last frame before word's cut (63.983)

// Beat map (scene seconds).
const T = {
  pull: [0.0, 1.5], // camera: pull back and tip over the desk (57.5)
  open: [0.04, 1.5], // the fan opens, the last sheet settling on 57.5
  turn: [0.0, 1.5], // the turntable centres the fan
  head: [1.0, 5.62],
  track: [1.6, 5.95], // while the fan holds: over to the covers
  close: [6.0, 7.0], // 62.0 whoosh: the fan folds back under the diagram page (63.0)
  frame: [6.0, 7.1], // camera onto the stack…
  settle: [6.85, LAST], // …then into word's first framing, arriving at rest as word starts from rest
  room: [6.2, 7.4], // the room goes down to warm charcoal
  dim: [7.0, LAST], // then the lamp: paper and pool together, to word's first frame
};

// Camera: the open fan over the type band; the two covers; the stack; word's first frame.
const WIDE = stop([...at(0), S_POS[2]], 330, 945, 310, { az: 6, el: -24 });
const COVERS = stop([...at(-24.5 * Math.PI / 180, 0.15), S_POS[2]], 470, 960, 330, { az: -9, el: -18 }); // the two cover titles
const STACK_MID = stop([...at(0), S_POS[2]], 420, 960, 480, { az: 1, el: -12 });
// word.js opens on its sheet (2.176 wide: docLayout pageW) pitched back 14° and seen from
// el 2.2°, az = its yaw, DIST0 9.775, SHIFT0: the same view of our 1-wide top sheet.
const END = { target: [...at(0), S_POS[2]], dist: 9.775 / 2.176, az: 0, el: 2.2 - 14, roll: 0, shift: [0.0031, 0.1234] };

// Lights (display sRGB). Low-chroma: the room goes from cream to the brand tile's warm
// charcoal, then to word's first room; a lamp pool on the stack, always darker than the
// paper, which stays the brightest thing and falls with it to word's sheet (linear 0.0022).
const ROOM = [
  { top: [0xf5, 0xf1, 0xea], bottom: [0xe8, 0xe1, 0xd5] },
  { top: [0xc9, 0xc1, 0xb5], bottom: [0xba, 0xb1, 0xa4] },
  { top: [0x3a, 0x34, 0x2e], bottom: [0x2a, 0x25, 0x21] },
];
const ROOM_END = { top: [11, 9, 7], bottom: [3, 2, 2] }; // word.js ROOM0
const PAPER_END = 0.0022 * 12.92; // display value of word.js DIM
const POOL = { day: [0xf8, 0xf5, 0xef], lamp: [0x8a, 0x80, 0x74] };

const pullEase = cubicBezier(0.42, 0, 0.1, 1); // from rest, long landing
const openEase = cubicBezier(0.36, 0, 0.14, 1);
const closeEase = cubicBezier(0.55, 0, 0.18, 1);
const frameEase = cubicBezier(0.45, 0, 0.35, 1);
const clamp = (u) => Math.min(1, Math.max(0, u));
const quintOut = (u) => 1 - (1 - clamp(u)) ** 5;
const sine = (u) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(u));
const lerp = (a, b, u) => a + (b - a) * u;
/** Linear light → display value (inverse of fan.js lin). */
const disp = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
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
/** A sheet's lift on its beat: up in 0.25 s, settled 0.4 s later. */
const lifted = (t, beat) => quintOut((t - beat) / 0.25) * (1 - sine((t - beat - 0.25) / 0.4));

const scene = {
  id: 'papers',
  world: 'day',
  async setup(ctx) {
    const { lib, scene } = ctx;
    const s = (ctx.state = {});
    // The pair is seen close in marks: full-size maps; the rest are seen smaller.
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
    s.head = lib.type.headline(ctx.el, { en: C.headline, zh: C.headlineZh, y: 904, size: 104, zhSize: 44, world: 'day' });
  },

  update(t, ctx) {
    const { lib, camera, post } = ctx;
    const { ease: E } = lib;
    const s = ctx.state;
    const f = F0T + t;

    // ---- the fan ---------------------------------------------------------------------------
    const uc = closeEase(E.seg(t, ...T.close));
    const phi = lerp(PHI_OPEN * E.quintInOut(E.seg(t, ...T.turn)), PHI_STACK, uc);
    const bumpLift = 0.1 * bump(E.seg(t, T.open[0], T.open[1] + 0.3)) + 0.06 * bump(E.seg(t, T.close[0], T.close[1] + 0.1));
    const roomK = E.sineInOut(E.seg(t, ...T.room));
    const dimK = sine((t - T.dim[0]) / (T.dim[1] - T.dim[0]));
    const flat = E.smoothstep(0.15, 1.3, t); // lying on the desk: flat, shadows between layers
    const u0 = E.quintInOut(E.seg(t, 0, 1.2)); // the hinge settles flat
    const spT = lerp(SP_OPEN, SP_STACK, uc); // the teacher copy's gap under the hinge
    const hold = E.sineInOut(E.seg(t, 1.7, 5.6)); // the held fan spreads a touch
    const spread = 1 + 0.03 * hold;

    s.sheets.forEach((sh, k) => {
      const { off, rad, depth, beat } = PACK[k];
      const up = 0.018 * lifted(t, beat) * (1 - uc);
      const lift = bumpLift + up;
      let pos, rot;
      if (k === S_K) {
        const g = TH_S + phi;
        pos = [...at(g), S_POS[2] + lift];
        rot = [S_ROT[0] * (1 - u0), S_ROT[1] * (1 - u0), g];
      } else if (k === T_K) {
        const g = TH_S + lerp(off * spread, 0, uc) + phi;
        const fan = [...at(g), S_POS[2] - spT + lift];
        const uT = openEase(E.seg(t, 0.0, 1.35));
        const m = tPose(f);
        pos = m.pos.map((v, i) => lerp(v, fan[i], uT));
        rot = [lerp(m.rot[0], 0, uT), lerp(m.rot[1], 0, uT), lerp(m.rot[2], g, uT)];
      } else {
        // Farther sheets leave the hinge a touch later; all land together on 57.5.
        const uo = openEase(E.seg(t, T.open[0] + 0.03 * (k - T_K - 1), T.open[1]));
        const sp = lerp(lerp(SP_SHUT, SP_OPEN, uo), SP_STACK, uc);
        const g = TH_S + lerp(off * uo * spread, 0, uc) + phi;
        pos = [...at(g, rad * uo * (1 - uc)), S_POS[2] - spT - (depth - 1) * sp + lift];
        rot = [S_ROT[0] * (1 - u0), S_ROT[1] * (1 - u0), g];
        // Hidden sheets cast nothing until they leave the hinge.
        sh.shadowK = E.smoothstep(0, 0.25, uo);
      }
      sh.group.position.set(...pos);
      sh.group.rotation.set(rot[0], rot[1], rot[2]);
      const bend = 0.012 * (1 - flat);
      sh.set({ bend });
      // Shadow: nearly under the sheet, so its soft rim shades the sheets under both its edges
      // (the V overlaps both ways); it stays on the layer below as the sheet lifts, spreading.
      const c = Math.cos(-rot[2]), si = Math.sin(-rot[2]);
      const spreadK = 1 + up / 0.018;
      const [ox, oy] = [0.006 * spreadK, -0.012 * spreadK];
      const lx = lerp(0.018, ox * c - oy * si, flat), ly = lerp(-0.03, ox * si + oy * c, flat);
      sh.shadow.position.set(lx, ly, lerp(-0.02, -(bend + 0.45 * SP_OPEN), flat) - up);
      sh.shadow.scale.setScalar(1 + 0.03 * (spreadK - 1));
      sh.shadow.material.opacity = lerp(0.15, 0.26, flat) * (sh.shadowK ?? 1) * (1 - roomK) * (1 - 0.25 * (spreadK - 1));
    });

    // ---- camera ----------------------------------------------------------------------------
    const orbitAz = -10 * E.seg(t, 1.2, 6.0);
    const wide = { ...WIDE, az: WIDE.az + orbitAz };
    let p = mixPose(holdCam(lib, f), wide, pullEase(E.seg(t, ...T.pull)));
    p = mixPose(p, COVERS, E.sineInOut(E.seg(t, ...T.track)));
    p = mixPose(p, STACK_MID, frameEase(E.seg(t, ...T.frame)));
    const settle = sine((t - T.settle[0]) / (T.settle[1] - T.settle[0]));
    p = mixPose(p, END, settle);
    const d = lib.camera.drift(f, 29, { amp: 0.4, rate: 0.07, roll: 0.05, dolly: 0.004 });
    p = withDrift(p, d, E.smoothstep(0.1, 1.6, t) * (1 - E.smoothstep(6.85, LAST, t)));
    applyPose(lib, camera, p);

    // ---- lights ----------------------------------------------------------------------------
    const bu = ctx.backdrop.material.uniforms;
    const toEnd = (keyed, end) => keyed.map((v, i) => lerp(v, lin(end[i] / 255), dimK));
    bu.uTop.value.setRGB(...toEnd(keysLin(ROOM.map((r) => r.top), roomK), ROOM_END.top));
    bu.uBottom.value.setRGB(...toEnd(keysLin(ROOM.map((r) => r.bottom), roomK), ROOM_END.bottom));
    // One display-space curve for the lamp: the paper and its pool fall together.
    const b = PAPER_END ** dimK; // even steps to the eye (log brightness)
    const bl = lin(b);
    const pool = keysLin([POOL.day, POOL.lamp], roomK).map((v) => lin(disp(v) * b));
    bu.uGlow.value.setRGB(...pool);
    s.v.set(...at(0), S_POS[2]).project(camera);
    bu.uCenter.value.set(lerp(0.5, s.v.x * 0.5 + 0.5, roomK), lerp(0.62, s.v.y * 0.5 + 0.5, roomK));
    bu.uGlowAmount.value = lerp(0.55, 0.45, roomK) * (1 - E.smoothstep(0.55, 1, dimK));
    bu.uRadius.value = lerp(0.6, 0.45, roomK);
    for (const sh of s.sheets) {
      sh.material.color.setRGB(bl, bl, bl);
      sh.edge.material.color.set('#D9D4CB').multiplyScalar(bl);
    }
    const hz = Math.max(hazeAt(f), E.sineInOut(E.seg(t, 0.55, 1.2)) * (1 - E.sineInOut(E.seg(t, 5.6, 6.3))));
    s.haze.set({ amount: hz, ...HAZE_BAND });

    // ---- post, type ------------------------------------------------------------------------
    // Depth of field: onto the diagram page as the fan lands, then along the lifting sheets
    // to the Paper 1 cover; off before the lights go down (word opens without it).
    const depth = (k) => -s.v.copy(s.sheets[k].group.position).applyMatrix4(camera.matrixWorldInverse).z;
    const dofWide = E.sineInOut(E.seg(t, 0.4, 1.6));
    let onFan = depth(S_K);
    for (const k of [2, 5, 6, 7]) onFan = lerp(onFan, depth(k), E.sineInOut(E.seg(t, PACK[k].beat - 0.3, PACK[k].beat + 0.15)));
    const focus = lerp(p.dist, lerp(onFan, p.dist, E.sineInOut(E.seg(t, 6.0, 6.9))), dofWide);
    const aperture = lerp(130, 200, dofWide) * (1 - E.sineInOut(E.seg(t, 6.0, 7.2)));
    post.dof = t < 0.4 ? dofAt(p.dist, 1) : aperture < 1 ? null : { focus, aperture, maxBlur: 12 * Math.min(1, aperture / 60) };
    post.vignette = lerp(0.06, 0.26, roomK);
    post.bloom = null;
    const moving = (a, b0) => t > a && t < b0;
    post.samples = moving(0.0, 1.6) || moving(T.close[0], T.frame[1]) ? 14 : 0;

    s.head.set(t, T.head[0], T.head[1]);
  },
};

export default scene;
