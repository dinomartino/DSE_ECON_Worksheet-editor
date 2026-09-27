// marks — bars 24–28, day (FILM.md §3). The printed page diagrams lands on (48.0): part (a)
// at 4 marks, (b) at 2, "(Total: 6 marks)". The editor window rises under it, registered,
// and the print fades into the same page, live. (a) Marks → 6 on 50.0 and the page's total
// becomes 8 by itself; Lines → 6 on 51.0; Teacher on the 52.0 tick prints the marking
// schemes in red. The window drops away, then the printed pair rises in front, the teacher's
// copy slides out from behind it (54.5), and a slow push into its scheme hands over to papers.
import { COPY, cueAt, sceneStart } from '../../timeline.mjs';
import { cubicBezier } from '../lib/ease.js';
import { pick, PORTRAIT } from '../lib/format.js';
import { haze, stop, mixPose, withDrift, applyPose, handoff } from './marks/kit.js';
import { S_POS, S_ROT, tPose, holdCam, hazeAt, HAZE_BAND, dofAt, loadSheets, SHEET, PAIR } from './papers/deck.js';

const C = COPY.marks;
const F0T = sceneStart('marks'); // film time of t = 0
const CLIP = 'marks-total'; // capture/extra-marks.mjs
const START_SHEET = 'question-start'; // the clip's frame 0, printed
// The clip's own edits (clip s): Marks shows 6 on 2.0, the lines on 3.0, Teacher on 4.0. It is
// placed so its Teacher click lands on the marks.teacher cue (clip time = scene time today).
const EDITS = { marks: 2.0, lines: 3.0, teacher: 4.0 };
const CLIP_AT = cueAt('marks.teacher') - F0T - EDITS.teacher;

// Beat map (scene seconds).
const T = {
  slide: [0.05, 0.95], // the window rises under the printed page, registered by 48.95
  toEdit: [0.25, 1.75], // camera onto the page's marks and the Marks fields
  fade: [1.3, 1.55], // print → live, once the frame shows only page the window covers
  creep: [1.2, 3.4], // a slow push while the total changes
  toTeacher: [CLIP_AT + EDITS.teacher - 1, CLIP_AT + EDITS.teacher], // out to the Teacher toggle and the page, with the pointer
  push: [3.7, 5.2], // a slow push toward the red scheme
  winOut: [4.8, 5.3], // the window drops away, down and back…
  back: [4.85, 6.1], // …as the camera pulls back to the pair…
  rise: [5.12, 6.0], // …which rises in front as the window clears the frame (54.0)
  card: [1.3, 1.8], // portrait: the inspector card floats up off the page before the Marks click (49.58)
  pan: [CLIP_AT + 3.2, CLIP_AT + 3.95], // portrait: the card follows the pointer to Teacher (clip 3.3–3.9)
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
// Portrait (FILM-9x16.md): the page alone, 960 px wide, diagram centre at y 900 on the cut;
// then the page's marks column under a card of the inspector's Marks rows (a crop of the
// same live frame), which pans with the pointer up to the Teacher toggle.
const { F0, F2, F3, F3b, HEAD, CARD } = pick({
  landscape: {
    F0: { ...stop([0.0006, 0.275, 0], 1109, 960, 540.55), az: 0.3 }, // measured to 0.1 px on the cut
    F2: stop(wpt(2080, 600), 1900, 960, 330, { az: 2, el: 1 }),
    F3: stop(wpt(1115, 425), 1150, 960, 322, { az: -1, el: 1 }),
    F3b: stop(wpt(1080, 560), 1185, 960, 420, { az: -2, el: 1 }),
    HEAD: { y: 904, size: 104 },
  },
  portrait: {
    F0: { ...stop([0.0006, 0.275, 0], 960, 540, 900), az: 0.3 },
    F2: stop(wpt(1412, 543), 1500, 540, 950, { az: 1.5, el: -1 }),
    F3: stop(wpt(1412, 560), 1530, 540, 960, { az: -1, el: -1 }),
    F3b: stop(wpt(1412, 640), 1560, 540, 980, { az: -2, el: -1.5 }),
    HEAD: { y: 330, size: 96, maxWidth: 860, maxLines: 3 },
    // The card: clip px [x, y, w, h] it shows (rows, then the toolbar's Student/Teacher),
    // its centre (clip px, on the page plane) and width in world units, lifted off the page.
    CARD: { rows: [2075, 400, 800, 255], bar: [640, 0, 800, 255], at: wpt(1412, 278), width: 0.6, lift: 0.06 },
  },
});

const land = cubicBezier(0.2, 0.62, 0.22, 1); // arrives already moving (off frame), long landing
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

    ctx.placeClip(CLIP, { at: CLIP_AT, from: 0, dur: T.winOut[1] - CLIP_AT });

    const T_ = lib.type;
    s.h1 = T_.headline(ctx.el, { en: C.headline, zh: C.headlineZh, ...HEAD, zhSize: 44, world: 'day' });
    s.h2 = T_.headline(ctx.el, { en: C.teacher, zh: C.teacherZh, ...HEAD, zhSize: 44, world: 'day' });
    if (PORTRAIT) {
      const [, , cw, ch] = CARD.rows;
      s.card = lib.win.appWindow({ variant: 'none', width: CARD.width, aspect: cw / ch, shadowOpacity: 0.16, shadowColor: '#3A342E', shadowBlur: 0.1 });
      s.card.group.traverse((o) => { o.renderOrder = 3; });
      scene.add(s.card.group);
    }
  },

  update(t, ctx) {
    const { lib, camera, post } = ctx;
    const { ease: E } = lib;
    const s = ctx.state;
    const f = F0T + t;

    // ---- camera: each move starts before the last one lands --------------------------------
    const f2 = scaleDist(F2, 1 - 0.03 * E.sineInOut(E.seg(t, ...T.creep)));
    const f3 = mixPose(F3, F3b, E.sineInOut(E.seg(t, ...T.push)));
    // F0 keeps diagrams' landing dolly going, so the camera never rests across the cut.
    let p = mixPose(scaleDist(F0, handoff(lib, f)), f2, E.sineInOut(E.seg(t, ...T.toEdit)));
    p = mixPose(p, f3, E.sineInOut(E.seg(t, ...T.toTeacher)));
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
    const frame = s.win.group.visible ? s.clip.frameAt(Math.max(0, t - CLIP_AT)) : null;
    if (frame) s.win.set({ screen: frame });
    if (s.card) {
      // The same live frame as the page, cropped; it rides the window's drop.
      const c = s.card, k = E.sineInOut(E.seg(t, ...T.card));
      c.group.visible = frame != null && k > 0;
      // Up to the toolbar, then along it (the pan never crosses the page's canvas).
      const [p0, p1] = T.pan, pm = p0 + 0.45 * (p1 - p0);
      const py = E.sineInOut(E.seg(t, p0, pm)), px = E.sineInOut(E.seg(t, p0 + 0.25 * (p1 - p0), p1));
      const [x, y, w, h] = CARD.rows.map((v, i) => E.lerp(v, CARD.bar[i], i === 1 ? py : px));
      if (c.group.visible) c.set({ screen: frame, opacity: k, crop: [x / 2880, 1 - (y + h) / 1800, w / 2880, h / 1800], shadowOpacity: 0.16 * k });
      c.group.position.set(CARD.at[0], CARD.at[1] - 0.04 * (1 - k) - 1.7 * out, W_POS[2] + CARD.lift * (0.4 + 0.6 * k) - 0.9 * out);
      c.group.rotation.set(-0.3 * out, 0, 0);
      c.group.scale.setScalar(0.96 + 0.04 * k);
    }

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
    post.samples = moving(0.25, 1.8) || moving(2.95, 4.05) ? 10 : moving(4.75, 6.15) ? 14 : 0;
    post.vignette = 0.06;
    post.bloom = null;

    s.h1.set(t, T.h1[0], T.h1[1]);
    s.h2.set(t, T.h2[0], T.h2[1]);
  },

  // The total changing and the lines landing; the window dropping away as the pair comes up.
  events: [
    { t: CLIP_AT + EDITS.marks, kind: 'tick', strength: 0.4 },
    { t: CLIP_AT + EDITS.lines, kind: 'tick', strength: 0.4 },
    { t: 5.15, kind: 'whoosh', strength: 0.4 },
  ],
};

export default scene;
