// The student/teacher pair that marks ends on and papers starts from. Both scenes pose it,
// the camera and the haze from these functions of film time, so the two render the same
// picture through the 56.0 blurDissolve.
import { cubicBezier } from '../../lib/ease.js';
import { stop, mixPose, withDrift } from '../marks/kit.js';

const clamp = (x) => Math.min(1, Math.max(0, x));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const sineInOut = (u) => -(Math.cos(Math.PI * u) - 1) / 2;
export const add = (a, b) => a.map((v, i) => v + b[i]);
export const lerp3 = (a, b, u) => a.map((v, i) => v + (b[i] - v) * u);
/** Quadratic Bezier through control point c. */
export const bez3 = (a, c, b, u) => lerp3(lerp3(a, c, u), lerp3(c, b, u), u);

/** The student copy's resting place (world units; a page is 1 wide). */
export const S_POS = [-0.377, 0.308, 1.05];
export const S_ROT = [0, 0.02, 0.008];
/** The teacher's copy slides out from behind it along a 3D arc, landing on 54.5. */
export const SLIDE = [53.5, 54.5];
const T_START = add(S_POS, [0.012, 0.004, -0.02]);
const T_MID = add(S_POS, [0.5, 0.06, -0.14]);
export const T_END = add(S_POS, [0.64, 0.03, 0.26]);
export const T_ROT = [0.01, -0.07, -0.014];
const slideEase = cubicBezier(0.36, 0, 0.12, 1); // off the mark from rest, long landing

/** Teacher's copy pose at film time f: { pos, rot } (Euler x, y, z). */
export function tPose(f) {
  const u = slideEase(seg(f, SLIDE[0], SLIDE[1]));
  const lift = Math.sin(Math.PI * u);
  return {
    pos: bez3(T_START, T_MID, T_END, u),
    rot: S_ROT.map((v, i) => v + (T_ROT[i] - v) * u + [0, -0.05, 0.025][i] * lift),
  };
}

// Camera on the pair: both sheets, then a slow push into the teacher's red answers that
// comes to rest before papers pulls back on 56.0.
export const PAIR_VIEW = stop(add(S_POS, [0.35, 0.02, 0.16]), 530, 960, 425, { az: -5, el: 2 });
const ANSWERS = stop(add(T_END, [-0.05, 0.25, 0]), 830, 985, 372, { az: -8, el: 3 });
export const PUSH = [54.35, 55.75];
const pushEase = cubicBezier(0.45, 0, 0.22, 1);

/** The pair camera at film time f (drift included). */
export function holdCam(lib, f) {
  const p = mixPose(PAIR_VIEW, ANSWERS, pushEase(seg(f, PUSH[0], PUSH[1])));
  return withDrift(p, lib.camera.drift(f, 27, { amp: 0.45, rate: 0.07, roll: 0.05, dolly: 0.004 }));
}

/** Haze over the lower frame (the type band): it clears as the marks headline leaves. */
export const hazeAt = (f) => 1 - sineInOut(seg(f, 55.35, 56.05));
export const HAZE_BAND = { from: 640, to: 800 };

/** Depth of field focused at `focus` (camera distance), strength k. */
export const dofAt = (focus, k = 1) => (k < 0.01 ? null : { focus, aperture: 130 * k, maxBlur: 12 * k });

export const SHEET = { shadowOpacity: 0.15, shadowBlur: 0.05, shadowOffset: [0.018, -0.03] };

/** Loads sheets by name into lib paper meshes (added to the scene). */
export async function loadSheets(ctx, names) {
  const maps = await Promise.all(names.map((n) => ctx.load.texture(`sheets/${n}.png`)));
  return maps.map((map, i) => {
    const s = ctx.lib.paper.sheet({ map, width: 1, ...SHEET });
    s.group.name = names[i];
    ctx.scene.add(s.group);
    return s;
  });
}
