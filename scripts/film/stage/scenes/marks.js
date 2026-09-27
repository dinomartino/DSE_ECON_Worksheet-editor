// marks — bars 24–28, day (FILM.md §3). The printed page diagrams lands on (48.0): part (a)
// at 4 marks, (b) at 2, "(Total: 6 marks)". The editor window rises under it, registered,
// and the print fades into the same page, live. (a) Marks → 6 on 50.0 and the page's total
// becomes 8 by itself; Lines → 6 on 51.0; Teacher on the 52.0 tick prints the marking
// schemes in red. The window drops away, then the printed pair rises in front, the teacher's
// copy slides out from behind it (54.5), and a slow push into its scheme hands over to papers.
import { COPY } from '../../timeline.mjs';
import { cubicBezier } from '../lib/ease.js';
import { haze, stop, mixPose, withDrift, applyPose } from './marks/kit.js';
import { S_POS, S_ROT, tPose, holdCam, hazeAt, HAZE_BAND, dofAt, loadSheets, SHEET, PAIR } from './papers/deck.js';

const C = COPY.marks;
const F0T = 48; // film time of t = 0
const CLIP = '../extra/marks/clips/marks-total'; // capture/extra-marks.mjs; clip time = scene time
const START_SHEET = 'extra/marks/sheets/diagram-question-start.png'; // the clip's frame 0, printed

// Beat map (scene seconds). The clip: Marks shows 6 on 2.0, the lines on 3.0, Teacher 4.0.
const T = {
  slide: [0.05, 0.95], // the window rises under the printed page, registered by 48.95
  toEdit: [0.25, 1.75], // camera onto the page's marks and the Marks fields
  fade: [1.2, 1.45], // print → live, once the frame shows only page the window covers
  creep: [1.2, 3.4], // a slow push while the total changes
  toTeacher: [3.05, 3.95], // out to the Teacher toggle and the page, with the pointer
  push: [3.7, 5.2], // a slow push toward the red scheme
  winOut: [4.8, 5.3], // the window drops away, down and back…
  back: [4.85, 6.1], // …as the camera pulls back to the pair…
  rise: [5.3, 6.0], // …which rises in front once the window has gone (54.0)
  h1: [1.0, 3.75],
  h2: [4.5, 7.45],
};

// ---- geometry (world units: a page is 1 wide) ------------------------------------------
// The clip (2880×1800) shows its page at 100% zoom: 1588 frame px wide, left edge x 321,
// top edge y −574 (scrolled to its end). The window lies just under the printed page,
// registered to it.
const FPX = 1588;
const WIN_W = 2880 / FPX;
const BAR = (40 / 1440) * WIN_W;
const SCREEN_TOP = (WIN_W / 1.6 + BAR) / 2 - BAR; // screen's top edge above the window centre
const PAGE_X = 321;
const PAGE_TOP = -574;
const W_POS = [(1440 - PAGE_X) / FPX - 0.5, Math.SQRT1_2 + PAGE_TOP / FPX - SCREEN_TOP, -0.014];
/** World point of clip frame pixel (fx, fy), the window at rest. */
const wpt = (fx, fy) => [W_POS[0] + (fx - 1440) / FPX, W_POS[1] + SCREEN_TOP - fy / FPX, W_POS[2]];

// Camera stops (frame px of the clip): diagrams' last frame; the page's marks column and
// total beside the inspector's Marks fields; the Teacher toggle over the page's part (a).
const F0 = { ...stop([0.0006, 0.275, 0], 1108), az: 0.3 };
const F2 = stop(wpt(2040, 600), 2000, 960, 330, { az: 2, el: 1 });
const F3 = stop(wpt(1115, 425), 1150, 960, 322, { az: -1, el: 1 });
const F3b = stop(wpt(1080, 560), 1185, 960, 420, { az: -2, el: 1 });

const land = cubicBezier(0.2, 0.62, 0.22, 1); // arrives already moving (off frame), long landing
const follow = cubicBezier(0.45, 0, 0.3, 1);
const back = cubicBezier(0.4, 0, 0.2, 1);
const rise = cubicBezier(0.12, 0.62, 0.22, 1); // enters moving (below frame), long landing
const quintIn = (u) => u ** 5;
const scaleDist = (p, k) => ({ ...p, dist: p.dist * k });

const scene = {
  id: 'marks',
  world: 'day',
  async setup(ctx) {
    const { lib, scene } = ctx;
    const s = (ctx.state = {});
    const [dTex, clip] = await Promise.all([ctx.load.texture(START_SHEET), ctx.load.clip(CLIP)]);
    s.clip = clip;
    // No thickness edge: it would show through the face as it fades (the dissolve hides its absence).
    s.d = lib.paper.sheet({ map: dTex, width: 1, ...SHEET, shadowOpacity: 0.16, edge: false });
    s.d.group.traverse((o) => { o.renderOrder = 1; }); // over the window, also while it fades
    scene.add(s.d.group);

    s.win = lib.win.appWindow({ variant: 'mac', width: WIN_W, shadowOpacity: 0.2, shadowColor: '#3A342E' });
    scene.add(s.win.group);

    [s.S, s.T] = await loadSheets(ctx, [PAIR.student, PAIR.teacher]);
    s.haze = haze(ctx);

    ctx.placeClip(CLIP, { at: 0, from: 0, dur: T.winOut[1] });

    const T_ = lib.type;
    s.h1 = T_.headline(ctx.el, { en: C.headline, zh: C.headlineZh, y: 904, size: 104, zhSize: 44, world: 'day' });
    s.h2 = T_.headline(ctx.el, { en: C.teacher, zh: C.teacherZh, y: 904, size: 104, zhSize: 44, world: 'day' });
  },

  update(t, ctx) {
    const { lib, camera, post } = ctx;
    const { ease: E } = lib;
    const s = ctx.state;
    const f = F0T + t;

    // ---- camera: each move starts before the last one lands --------------------------------
    const f2 = scaleDist(F2, 1 - 0.03 * E.sineInOut(E.seg(t, ...T.creep)));
    const f3 = mixPose(F3, F3b, E.sineInOut(E.seg(t, ...T.push)));
    let p = mixPose(F0, f2, E.sineInOut(E.seg(t, ...T.toEdit)));
    p = mixPose(p, f3, follow(E.seg(t, ...T.toTeacher)));
    // Drift: calm at the handoff (diagrams' own drift is nearly spent), fuller after.
    const early = withDrift(p, lib.camera.drift(f, 24, { amp: 0.4, rate: 0.07, roll: 0.06 }), E.smoothstep(0, 1.2, t));
    const pose = mixPose(early, holdCam(lib, f), back(E.seg(t, ...T.back)));
    applyPose(lib, camera, pose);

    // ---- the printed page, and the window rising under it ------------------------------------
    const fade = E.sineInOut(E.seg(t, ...T.fade));
    s.d.group.visible = fade < 1;
    s.d.set({ opacity: 1 - fade, shadowOpacity: 0.16 * (1 - fade) });

    const up = 1 - land(E.seg(t, ...T.slide));
    const out = quintIn(E.seg(t, ...T.winOut));
    s.win.group.visible = t > T.slide[0] && out < 1;
    s.win.group.position.set(W_POS[0], W_POS[1] - 0.9 * up - 1.7 * out, W_POS[2] - 0.9 * out);
    s.win.group.rotation.set(-0.3 * out, 0, 0);
    if (s.win.group.visible) s.win.set({ screen: s.clip.frameAt(Math.max(0, t)) });

    // ---- the printed pair rises in front -------------------------------------------------------
    const r = rise(E.seg(t, ...T.rise));
    const lift = [0, -1.5 * (1 - r), -0.15 * (1 - r)];
    const tilt = -0.3 * (1 - r);
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
    post.dof = dofAt(pose.dist, E.sineInOut(E.seg(t, 5.4, 6.1)));
    const moving = (a, b) => t > a && t < b;
    post.samples = moving(0.4, 1.65) || moving(3.0, 4.0) ? 10 : moving(4.85, 6.15) ? 14 : 0;
    post.vignette = 0.06;
    post.bloom = null;

    s.h1.set(t, T.h1[0], T.h1[1]);
    s.h2.set(t, T.h2[0], T.h2[1]);
  },

  // The total changing and the lines landing; the window dropping away as the pair comes up.
  events: [
    { t: 2.0, kind: 'tick', strength: 0.4 },
    { t: 3.0, kind: 'tick', strength: 0.4 },
    { t: 5.25, kind: 'whoosh', strength: 0.4 },
  ],
};

export default scene;
