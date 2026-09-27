// The student/teacher pair that marks ends on and papers starts from: the diagram
// worksheet marks edits live, printed. Both scenes pose it, the camera and the haze from
// these functions of film time, so the two render the same picture through 56.0.
import { cubicBezier } from '../../lib/ease.js';
import { stop, mixPose, withDrift } from '../marks/kit.js';
import { sceneStart } from '../../../timeline.mjs';
import { pick } from '../../lib/format.js';

const clamp = (x) => Math.min(1, Math.max(0, x));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const sineInOut = (u) => -(Math.cos(Math.PI * u) - 1) / 2;
export const add = (a, b) => a.map((v, i) => v + b[i]);
export const lerp3 = (a, b, u) => a.map((v, i) => v + (b[i] - v) * u);
/** Quadratic Bezier through control point c. */
export const bez3 = (a, c, b, u) => lerp3(lerp3(a, c, u), lerp3(c, b, u), u);

/** Asset ids of the pair: the page marks edits, printed after the edit, and its teacher copy. */
export const PAIR = { student: 'question-done', teacher: 'teacher-done' };

/** The marks → papers cut (film s); the pair's moves below are timed from it. */
const CUT = sceneStart('papers');

/** The student copy's resting place (world units; a page is 1 wide). */
export const S_POS = [-0.377, 0.308, 1.05];
export const S_ROT = [0, 0.02, 0.008];
/**
 * The teacher's copy slides out from behind it along a 3D arc, landing on 54.5 beside it and
 * just beneath its edge: the pack's second sheet, so the student copy stays on top.
 */
export const SLIDE = [CUT - 2.5, CUT - 1.5];
// Portrait: it slides out upward instead, its scheme landing just above the student copy.
const T_ARC = pick({
  landscape: { start: [0.012, 0.004, -0.02], mid: [0.48, 0.07, -0.13], end: [0.9, 0.02, -0.02], rot: [0.01, -0.07, -0.014], lift: [0, -0.05, 0.025] },
  portrait: { start: [0.004, 0.012, -0.02], mid: [0.05, 0.5, -0.13], end: [0.07, 0.95, -0.02], rot: [0.02, 0.01, -0.03], lift: [0.05, 0, 0.02] },
});
const T_START = add(S_POS, T_ARC.start);
const T_MID = add(S_POS, T_ARC.mid);
export const T_END = add(S_POS, T_ARC.end);
export const T_ROT = T_ARC.rot;
const slideEase = cubicBezier(0.36, 0, 0.12, 1); // off the mark from rest, long landing

/** Teacher's copy pose at film time f: { pos, rot } (Euler x, y, z). */
export function tPose(f) {
  const u = slideEase(seg(f, SLIDE[0], SLIDE[1]));
  const lift = Math.sin(Math.PI * u);
  return {
    pos: bez3(T_START, T_MID, T_END, u),
    rot: S_ROT.map((v, i) => v + (T_ROT[i] - v) * u + T_ARC.lift[i] * lift),
  };
}

// Camera on the pair: both sheets, then a slow push into the teacher's marking scheme (its
// six "(1)" points, a third of the way down the page), easing out into papers' pull. It starts
// as marks' pull-back lands, so the camera never stops between them.
// Portrait: the pair stacked, the teacher's copy above; then into its scheme.
export const PAIR_VIEW = pick({
  landscape: stop(add(S_POS, [0.45, 0.02, 0]), 520, 960, 425, { az: -5, el: 2 }),
  portrait: stop(add(S_POS, [0.035, 0.475, 0]), 730, 540, 1205, { az: -2, el: -4 }),
});
const ANSWERS = pick({
  landscape: stop(add(T_END, [0.02, -0.1, 0]), 1300, 960, 380, { az: -8, el: 3 }),
  portrait: stop(add(T_END, [0.01, -0.09, 0]), 1180, 540, 1000, { az: -5, el: -6 }),
});
export const PUSH = [CUT - 2, CUT - 0.1];
const pushEase = cubicBezier(0.45, 0, 0.22, 1);

/** The pair camera at film time f (drift included). */
export function holdCam(lib, f) {
  const p = mixPose(PAIR_VIEW, ANSWERS, pushEase(seg(f, PUSH[0], PUSH[1])));
  return withDrift(p, lib.camera.drift(f, 27, { amp: 0.45, rate: 0.07, roll: 0.05, dolly: 0.004 }));
}

/** Haze over the lower frame (the type band): it clears as the marks headline leaves. */
export const hazeAt = (f) => 1 - sineInOut(seg(f, CUT - 0.65, CUT + 0.05));
export const HAZE_BAND = pick({
  landscape: { from: 640, to: 800 },
  portrait: { from: 1280, to: 1390, flip: true }, // from the top: clear below y 640, full above 530
});

/** Depth of field focused at `focus` (camera distance), strength k. */
export const dofAt = (focus, k = 1) => (k < 0.01 ? null : { focus, aperture: 130 * k * APERTURE, maxBlur: 12 * k });
/** Portrait frames the paper closer and steeper: a shallower blur keeps the headers readable. */
export const APERTURE = pick({ landscape: 1, portrait: 0.4 });

export const SHEET = { shadowOpacity: 0.15, shadowBlur: 0.05, shadowOffset: [0.018, -0.03] };

/** Loads sheets by asset id into lib paper meshes (added to the scene). */
export async function loadSheets(ctx, ids) {
  const maps = await Promise.all(ids.map((id) => ctx.load.texture(id)));
  return maps.map((map, i) => {
    const s = ctx.lib.paper.sheet({ map, width: 1, ...SHEET });
    s.group.name = ids[i];
    ctx.scene.add(s.group);
    return s;
  });
}
