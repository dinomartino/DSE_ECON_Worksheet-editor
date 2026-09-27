// marks — bars 24–28, day (FILM.md §3). From the printed diagram page diagrams hands over
// (48.0), the camera cranes down past its "(6 marks)" and dotted lines into the live app
// below: Lines → 6 and the dotted lines appear on 50.0. It rises to the toolbar as the
// screen turns to the quiz; Teacher on the 52.0 tick, and it follows the red answers down
// the page. The camera pulls
// back as the printed student copy rises in front, and the teacher's copy slides out from
// behind it as they rise, landing on 54.5; a slow push into its red answers hands over.
import { COPY } from '../../timeline.mjs';
import { cubicBezier } from '../lib/ease.js';
import { haze, mixable, stop, mixPose, withDrift, applyPose, K } from './marks/kit.js';
import { S_POS, S_ROT, tPose, holdCam, hazeAt, HAZE_BAND, dofAt, loadSheets, SHEET } from './papers/deck.js';

const C = COPY.marks;
const F0T = 48; // film time of t = 0

// Beat map (scene seconds).
const T = {
  glide: [0.1, 1.2],
  peel: [0.9, 1.5], // the printed page lifts away: the live editor is underneath
  reveal: [0.95, 1.4],
  fall: [0.98, 1.95],
  lines: 2.0, // Lines → 6: the dotted lines appear (50.0)
  creep: [1.8, 3.25],
  toTeacher: [3.12, 3.92],
  swap: [3.28, 3.8], // screen crossfade: answer-lines → teacher-toggle
  click: 4.0, // Teacher (52.0 tick)
  answers: [4.05, 4.95], // follow the red answers down the page
  back: [4.85, 6.0], // pull back first, so the rising sheets never pass close to the lens
  rise: [5.2, 6.05],
  winOut: [5.1, 5.9],
  h1: [0.95, 3.7],
  h2: [4.2, 7.45],
};

// ---- geometry (world units: a page is 1 wide) ------------------------------------------
// The app window shows its page at page size: the clip's page is 1526 frame px wide.
const FPX = 1526;
const WIN_W = 2880 / FPX;
const W_ROT = [0.018, -0.035, 0];
const SCREEN_TOP = (WIN_W / 1.6 + (40 / 1440) * WIN_W) / 2 - (40 / 1440) * WIN_W;

/** Window-local point of clip frame pixel (fx, fy), rotated by R = Ry(b) · Rx(a). */
function rot(fx, fy) {
  const x = (fx - 1440) / FPX, y = SCREEN_TOP - fy / FPX;
  const [a, b] = [W_ROT[0], W_ROT[1]];
  const y1 = y * Math.cos(a), z1 = y * Math.sin(a);
  return [x * Math.cos(b) + z1 * Math.sin(b), y1, -x * Math.sin(b) + z1 * Math.cos(b)];
}
// The window lies just under the printed page: its part (a) sits beneath the page's lines.
const W_POS = rot(1786, 700).map((v, i) => [0.1, -0.2, -0.06][i] - v);
/** World point of clip frame pixel (fx, fy) on the window. */
const wpt = (fx, fy) => rot(fx, fy).map((v, i) => v + W_POS[i]);

// Camera stops.
const F0 = { ...stop([0.0006, 0.275, 0], 1108), az: 0.3 }; // diagrams' last frame
const F1 = stop([0, -0.11, 0], 1250, 960, 390); // "(6 marks)" and the dotted lines
const F2 = stop(wpt(1786, 700), 1297, 930, 380); // page part (a) to the inspector
const F2b = stop(wpt(1760, 690), 1352, 930, 382);
const F3 = stop(wpt(1280, 480), 950, 960, 381); // toolbar to the first answer
const F3b = stop(wpt(1000, 720), 1060, 960, 420); // "Teacher Version" and "Answer: C"

// Clips: the key frames land on their beats.
const AL = { at: T.lines - 77 / 60 }; // answer-lines frame 77: the lines appear
const TT = { at: T.click - 1.0 }; // teacher-toggle frame 60: Teacher

const soft = cubicBezier(0.42, 0, 0.26, 1);
const sink = cubicBezier(0.5, 0, 0.2, 1);
const rise = cubicBezier(0.3, 0, 0.1, 1);
const lerp3 = (a, b, u) => a.map((v, i) => v + (b[i] - v) * u);

const scene = {
  id: 'marks',
  world: 'day',
  async setup(ctx) {
    const { lib, scene } = ctx;
    const s = (ctx.state = {});
    const [dTex, al, tt] = await Promise.all([
      ctx.load.texture('sheets/diagram-question.png'),
      ctx.load.clip('answer-lines'),
      ctx.load.clip('teacher-toggle'),
    ]);
    s.al = al;
    s.tt = tt;
    s.d = lib.paper.sheet({ map: dTex, width: 1, ...SHEET, shadowOpacity: 0.16 });
    scene.add(s.d.group);

    s.win = lib.win.appWindow({ variant: 'mac', width: WIN_W, shadowOpacity: 0.2, shadowColor: '#3A342E' });
    s.win.group.position.set(...W_POS);
    s.win.group.rotation.set(...W_ROT, 'YXZ');
    s.show = mixable(s.win);
    scene.add(s.win.group);

    [s.S, s.T] = await loadSheets(ctx, ['quiz-1', 'quiz-teacher-1']);
    s.haze = haze(ctx);

    ctx.placeClip('answer-lines', { at: AL.at + 0.6, from: 0.6, dur: T.swap[1] - (AL.at + 0.6) });
    ctx.placeClip('teacher-toggle', { at: TT.at + 0.3, from: 0.3, dur: T.winOut[1] - (TT.at + 0.3) });

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
    const g = soft(E.seg(t, ...T.glide));
    const fa = sink(E.seg(t, ...T.fall));
    const cr = E.sineInOut(E.seg(t, ...T.creep));
    const up = E.quintInOut(E.seg(t, ...T.toTeacher));
    const bk = cubicBezier(0.4, 0, 0.18, 1)(E.seg(t, ...T.back));
    let p = mixPose(F0, F1, g);
    p = mixPose(p, F2, fa);
    p = mixPose(p, F2b, cr);
    p = mixPose(p, F3, up);
    p = mixPose(p, F3b, cubicBezier(0.4, 0, 0.3, 1)(E.seg(t, ...T.answers)));
    // Drift: calm at the handoff (diagrams' own drift is nearly spent), fuller after.
    const early = withDrift(p, lib.camera.drift(f, 24, { amp: 0.4, rate: 0.07, roll: 0.06 }), E.smoothstep(0, 1.2, t));
    const pose = mixPose(early, holdCam(lib, f), bk);
    applyPose(lib, camera, pose);

    // ---- objects -----------------------------------------------------------------------------
    const pe = E.cubicIn(E.seg(t, ...T.peel));
    s.d.group.visible = pe < 1;
    s.d.group.position.set(0.05 * pe, 1.7 * pe * pe, 0.3 * pe);
    s.d.group.rotation.set(0.35 * pe, 0, -0.06 * pe);
    s.d.set({ shadowOpacity: 0.16 * (1 - E.smoothstep(0, 0.4, pe)) });
    const winOut = E.sineInOut(E.seg(t, ...T.winOut));
    const winIn = E.sineInOut(E.seg(t, ...T.reveal));
    s.win.group.visible = winIn > 0 && winOut < 1;
    s.win.set({ opacity: winIn * (1 - winOut), shadowOpacity: 0.2 * winIn * (1 - winOut) });

    const r = rise(E.seg(t, ...T.rise));
    const lift = [0, -1.25 * (1 - r), -0.1 * (1 - r)];
    const tilt = -0.32 * (1 - r);
    const pairOn = t > T.rise[0];
    s.S.group.visible = pairOn;
    s.T.group.visible = pairOn;
    s.S.group.position.set(...lerp3(S_POS, S_POS.map((v, i) => v + lift[i]), 1));
    s.S.group.rotation.set(S_ROT[0] + tilt, S_ROT[1], S_ROT[2]);
    const tp = tPose(f);
    s.T.group.position.set(...tp.pos.map((v, i) => v + lift[i]));
    s.T.group.rotation.set(tp.rot[0] + tilt, tp.rot[1], tp.rot[2]);
    for (const sh of [s.S, s.T]) sh.set({ bend: 0.012 + 0.03 * (1 - r) });

    // ---- the screen ----------------------------------------------------------------------------
    if (s.win.group.visible) {
      const ta = t - AL.at, tb = t - TT.at;
      const linesMix = E.sineInOut(E.seg(t, T.lines - 0.03, T.lines + 0.2));
      const clickMix = E.sineInOut(E.seg(t, T.click - 0.02, T.click + 0.14));
      if (t < T.swap[0]) {
        // Soften the one-frame layout pop into a short crossfade.
        if (linesMix > 0 && linesMix < 1) s.show(s.al.frameAt(76 / 60), s.al.frameAt(Math.max(ta, 77 / 60)), linesMix);
        else s.show(s.al.frameAt(ta));
      } else if (t < T.swap[1]) {
        s.show(s.al.frameAt(ta), s.tt.frameAt(tb), E.sineInOut(E.seg(t, ...T.swap)));
      } else if (clickMix > 0 && clickMix < 1) {
        s.show(s.tt.frameAt(59 / 60), s.tt.frameAt(Math.max(tb, 1.0)), clickMix);
      } else {
        s.show(s.tt.frameAt(tb));
      }
    }

    // ---- haze, post, type -----------------------------------------------------------------------
    s.haze.set({ amount: E.sineInOut(E.seg(t, 0.35, 1.05)) * hazeAt(f), ...HAZE_BAND });
    const dofK = E.sineInOut(E.seg(t, 5.1, 5.9));
    post.dof = dofAt(pose.dist, dofK);
    const moving = (a, b) => t > a && t < b;
    post.samples = moving(0.35, 1.9) || moving(T.toTeacher[0], T.toTeacher[1]) || moving(4.85, 6.1) ? 14 : 0;
    post.vignette = 0.06;
    post.bloom = null;

    s.h1.set(t, T.h1[0], T.h1[1]);
    s.h2.set(t, T.h2[0], T.h2[1]);
  },
};

export default scene;
