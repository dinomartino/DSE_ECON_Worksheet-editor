// Camera helpers. Every call poses the camera completely from its arguments (no state),
// so scenes stay pure functions of t. Angles in degrees.
import * as THREE from 'three';
import { wander } from './noise.js';

const DEG = Math.PI / 180;
const tmp = new THREE.Vector3();

/** World height visible at distance `dist` for a vertical fov. */
export const viewHeight = (fov, dist) => 2 * dist * Math.tan((fov * DEG) / 2);
/** Distance at which `height` world units fill the frame height. */
export const distFor = (fov, height) => height / (2 * Math.tan((fov * DEG) / 2));

/**
 * Orbit pose: camera at `dist` from `target`, azimuth `az` (0 = on +z, positive to the
 * right), elevation `el`, `roll`, `fov`. `shift` = [x, y] frame fractions moves the
 * subject on screen (lens shift, no rotation): +x right, +y up.
 */
export function orbit(camera, { target = [0, 0, 0], dist = 10, az = 0, el = 0, roll = 0, fov, shift = [0, 0], W = 1920, H = 1080 } = {}) {
  if (fov != null) camera.fov = fov;
  const a = az * DEG, e = el * DEG;
  camera.position.set(
    target[0] + dist * Math.cos(e) * Math.sin(a),
    target[1] + dist * Math.sin(e),
    target[2] + dist * Math.cos(e) * Math.cos(a),
  );
  camera.up.set(0, 1, 0);
  camera.lookAt(tmp.set(...target));
  if (roll) camera.rotateZ(roll * DEG);
  if (shift[0] || shift[1]) camera.setViewOffset(W, H, -shift[0] * W, shift[1] * H, W, H);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return camera;
}

/**
 * A slow living drift to add to an orbit (FILM.md §4: nothing is ever still): returns
 * { az, el, roll, dist } offsets from smooth noise. `amp` in degrees; `rate` in Hz.
 */
export function drift(t, seed = 1, { amp = 0.6, rate = 0.07, roll = 0.12, dolly = 0.004 } = {}) {
  const [x, y, z] = wander(t, seed, rate, 3);
  return { az: x * amp, el: y * amp * 0.6, roll: z * roll, dist: 1 + z * dolly };
}

/** Linear dolly from d0 to d1 over the shot: the "1–3% dolly" drift. */
export const dolly = (t, dur, d0, d1) => d0 + (d1 - d0) * Math.min(1, Math.max(0, t / dur));
