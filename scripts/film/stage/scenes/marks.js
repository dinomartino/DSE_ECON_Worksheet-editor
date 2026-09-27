// marks — bars 24–28, day (FILM.md §3). The printed diagram page diagrams hands over
// (48.0) lifts away: underneath, registered to it, the same page live in the editor, its
// part (a) still at (4 marks) with no answer lines. Marks → 6 on 50.0: the page's label,
// the Marks field and the paper summary change together; Lines → 6 on 51.0; Teacher on
// the 52.0 tick prints the marking scheme. The window drops away as the printed student
// copy rises in front, the teacher's copy slides out from behind it (54.5), and a slow
// push into its scheme hands over to papers. One clip, one document: no screen blends.
import { COPY } from '../../timeline.mjs';
import { cubicBezier } from '../lib/ease.js';
import { haze, stop, mixPose, withDrift, applyPose } from './marks/kit.js';
import { S_POS, S_ROT, tPose, holdCam, hazeAt, HAZE_BAND, dofAt, loadSheets, SHEET, PAIR } from './papers/deck.js';

const C = COPY.marks;
const F0T = 48; // film time of t = 0
const CLIP = '../extra/marks/clips/marks-live'; // capture/extra-marks.mjs; clip time = scene time

// Beat map (scene seconds). The clip: Marks shows 6 on 2.0, the lines on 3.0, Teacher 4.0.
const T = {
  slide: [0.05, 1.0], // the window glides up under the printed page, landing on 49.0
  peel: [0.55, 1.2], // the printed page lifts away
  toEdit: [0.35, 1.5], // camera onto part (a) and its Marks field (49.5)
  creep: [1.6, 3.15], // down to the lines' room
  toTeacher: [3.25, 3.95],
  answers: [4.1, 5.0], // into the red scheme, landing on 53.0
  back: [4.95, 6.2], // pull back to the pair
  winOut: [5.0, 5.8], // the window drops away, down and back
  rise: [5.3, 6.0], // the printed pair rises in front (54.0), once the camera is back
  h1: [1.0, 3.75],
  h2: [4.5, 7.45],
};

// ---- geometry (world units: a page is 1 wide) ------------------------------------------
// The clip (2880×1800) shows its page at 100% zoom: 1588 frame px wide, left edge x 322,
// top edge y −574 (scrolled to its end). The window lies flat just under the printed page,
// registered to it, so the lift reveals the same page in place.
const FPX = 1588;
const WIN_W = 2880 / FPX;
const BAR = (40 / 1440) * WIN_W;
const SCREEN_TOP = (WIN_W / 1.6 + BAR) / 2 - BAR; // screen's top edge above the window centre
const PAGE_TOP = 1672 - FPX * Math.SQRT2;
const W_POS = [(1440 - 322) / FPX - 0.5, Math.SQRT1_2 + PAGE_TOP / FPX - SCREEN_TOP, -0.014];
/** World point of clip frame pixel (fx, fy), the window at rest. */
const wpt = (fx, fy) => [W_POS[0] + (fx - 1440) / FPX, W_POS[1] + SCREEN_TOP - fy / FPX, W_POS[2]];

// Camera stops (frame px of the clip): diagrams' last frame; the paper summary over the
// "(n marks)" label and the Marks field; the lines' room; Teacher and the page; the scheme.
const F0 = { ...stop([0.0006, 0.275, 0], 1108), az: 0.3 };
const F2 = stop(wpt(2230, 300), 1480, 960, 340, { az: 3, el: 1 });
const F2b = stop(wpt(1990, 556), 1660, 960, 255, { az: 2, el: 1 });
const F3 = stop(wpt(1166, 433), 1000, 960, 330, { az: -1, el: 1 });
const F3b = stop(wpt(1166, 704), 1500, 960, 380, { az: -3, el: 2 });

const soft = cubicBezier(0.42, 0, 0.22, 1);
const land = cubicBezier(0.2, 0.62, 0.22, 1); // arrives already moving (off frame), long landing
const rise = cubicBezier(0.3, 0, 0.1, 1);
const quintIn = (u) => u ** 5;

const scene = {
  id: 'marks',
  world: 'day',
  async setup(ctx) {
    const { lib, scene } = ctx;
    const s = (ctx.state = {});
    const [dTex, clip] = await Promise.all([ctx.load.texture(PAIR.student), ctx.load.clip(CLIP)]);
    s.clip = clip;
    s.d = lib.paper.sheet({ map: dTex, width: 1, ...SHEET, shadowOpacity: 0.16 });
    scene.add(s.d.group);

    s.win = lib.win.appWindow({ variant: 'mac', width: WIN_W, shadowOpacity: 0.2, shadowColor: '#3A342E' });
    scene.add(s.win.group);

    [s.S, s.T] = await loadSheets(ctx, [PAIR.student, PAIR.teacher]);
    s.haze = haze(ctx);

    ctx.placeClip(CLIP, { at: 0, from: 0, dur: T.winOut[1] });

    const T_ = lib.type;
    s.h1 = T_.headline(ctx.el, { en: C.headline, zh: C.headlineZh, y: 868, size: 104, zhSize: 44, world: 'day' });
    s.h2 = T_.headline(ctx.el, { en: C.teacher, zh: C.teacherZh, y: 868, size: 104, zhSize: 44, world: 'day' });
  },

  update(t, ctx) {
    const { lib, camera, post } = ctx;
    const { ease: E } = lib;
    const s = ctx.state;
    const f = F0T + t;

    // ---- camera: overlapping from-rest moves between the stops ----------------------------
    let p = mixPose(F0, F2, soft(E.seg(t, ...T.toEdit)));
    p = mixPose(p, F2b, E.sineInOut(E.seg(t, ...T.creep)));
    p = mixPose(p, F3, E.quintInOut(E.seg(t, ...T.toTeacher)));
    p = mixPose(p, F3b, cubicBezier(0.4, 0, 0.25, 1)(E.seg(t, ...T.answers)));
    // Drift: calm at the handoff (diagrams' own drift is nearly spent), fuller after.
    const early = withDrift(p, lib.camera.drift(f, 24, { amp: 0.4, rate: 0.07, roll: 0.06 }), E.smoothstep(0, 1.2, t));
    const pose = mixPose(early, holdCam(lib, f), cubicBezier(0.45, 0, 0.18, 1)(E.seg(t, ...T.back)));
    applyPose(lib, camera, pose);

    // ---- the printed page lifts; the window under it -------------------------------------------
    const pe = E.cubicIn(E.seg(t, ...T.peel));
    s.d.group.visible = pe < 1;
    s.d.group.position.set(0.05 * pe, 1.7 * pe * pe, 0.3 * pe);
    s.d.group.rotation.set(0.35 * pe, 0, -0.06 * pe);
    s.d.set({ shadowOpacity: 0.16 * (1 - E.smoothstep(0, 0.4, pe)) });

    const up = 1 - land(E.seg(t, ...T.slide));
    const out = quintIn(E.seg(t, ...T.winOut));
    s.win.group.visible = t > T.slide[0] && out < 1;
    s.win.group.position.set(W_POS[0], W_POS[1] - 0.9 * up - 0.9 * out, W_POS[2] - 0.5 * out);
    s.win.group.rotation.set(-0.25 * out, 0, 0);
    if (s.win.group.visible) s.win.set({ screen: s.clip.frameAt(Math.max(0, t)) });

    // ---- the printed pair rises in front -------------------------------------------------------
    const r = rise(E.seg(t, ...T.rise));
    const lift = [0, -1.25 * (1 - r), -0.1 * (1 - r)];
    const tilt = -0.32 * (1 - r);
    const pairOn = t > T.rise[0];
    s.S.group.visible = pairOn;
    s.T.group.visible = pairOn;
    s.S.group.position.set(...S_POS.map((v, i) => v + lift[i]));
    s.S.group.rotation.set(S_ROT[0] + tilt, S_ROT[1], S_ROT[2]);
    const tp = tPose(f);
    s.T.group.position.set(...tp.pos.map((v, i) => v + lift[i]));
    s.T.group.rotation.set(tp.rot[0] + tilt, tp.rot[1], tp.rot[2]);
    for (const sh of [s.S, s.T]) sh.set({ bend: 0.012 + 0.03 * (1 - r) });

    // ---- haze, post, type -----------------------------------------------------------------------
    s.haze.set({ amount: E.sineInOut(E.seg(t, 0.35, 1.05)) * hazeAt(f), ...HAZE_BAND });
    post.dof = dofAt(pose.dist, E.sineInOut(E.seg(t, 5.2, 6.0)));
    const moving = (a, b) => t > a && t < b;
    post.samples = moving(0.3, 1.55) || moving(3.2, 5.05) || moving(5.0, 6.25) ? 14 : 0;
    post.vignette = 0.06;
    post.bloom = null;

    s.h1.set(t, T.h1[0], T.h1[1]);
    s.h2.set(t, T.h2[0], T.h2[1]);
  },
};

export default scene;
