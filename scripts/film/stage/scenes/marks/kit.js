// Helpers shared by marks and papers: camera stops placed by what they frame, blended as
// orbit poses; a haze that dissolves the lower frame into the backdrop (type sits there);
// a window whose screen can crossfade between two textures.
import * as THREE from 'three';

export const FOV = 30;
/** Screen px per world unit at distance 1 (1080p, fov 30). */
export const K = 1080 / (2 * Math.tan((FOV / 2) * (Math.PI / 180)));

/**
 * An orbit pose that shows world point `p` at design px (x, y), `ppu` px per world unit at
 * p's depth (lens shift, so verticals stay straight). `az`/`el` in degrees.
 */
export const stop = (p, ppu, x = 960, y = 540, { az = 0, el = 0, roll = 0 } = {}) => ({
  target: [...p],
  dist: K / ppu,
  az,
  el,
  roll,
  shift: [(x - 960) / 1920, (540 - y) / 1080],
});

const lerp = (a, b, u) => a + (b - a) * u;

/** Blends two poses: targets and angles linearly, distance in log space (even zoom). */
export function mixPose(p, q, u) {
  if (u <= 0) return p;
  if (u >= 1) return q;
  return {
    target: p.target.map((v, i) => lerp(v, q.target[i], u)),
    dist: p.dist * Math.pow(q.dist / p.dist, u),
    az: lerp(p.az, q.az, u),
    el: lerp(p.el, q.el, u),
    roll: lerp(p.roll ?? 0, q.roll ?? 0, u),
    shift: [lerp(p.shift[0], q.shift[0], u), lerp(p.shift[1], q.shift[1], u)],
  };
}

/** Adds a drift ({az, el, roll, dist} from lib.camera.drift) scaled by k. */
export const withDrift = (p, d, k = 1) => ({
  ...p,
  az: p.az + d.az * k,
  el: p.el + d.el * k,
  roll: (p.roll ?? 0) + d.roll * k,
  dist: p.dist * (1 + (d.dist - 1) * k),
});

export const applyPose = (lib, camera, p) => lib.camera.orbit(camera, { ...p, fov: FOV });

const HAZE_FRAG = /* glsl */ `
uniform vec3 uTop; uniform vec3 uBottom; uniform vec3 uGlow; uniform vec2 uCenter;
uniform float uRadius; uniform float uGlowAmount; uniform float uAspect; uniform float uMix;
uniform vec3 uTint; uniform float uFrom; uniform float uTo; uniform float uAmount; varying vec2 vUv;
void main() {
  vec3 base = mix(uBottom, uTop, smoothstep(0.0, 1.0, vUv.y));
  vec2 d = (vUv - uCenter) * vec2(uAspect, 1.0);
  float r = length(d) / uRadius;
  vec3 c = mix(mix(base, uGlow, exp(-r * r * 1.2) * uGlowAmount), uTint, uMix);
  float y = (1.0 - vUv.y) * 1080.0;
  gl_FragColor = vec4(c, uAmount * smoothstep(uFrom, uTo, y));
}`;

/**
 * A screen-space haze in the backdrop's own colour (it shares the backdrop's uniforms, so
 * it always matches), rising from the bottom: 0 at design y `from`, full at `to`.
 */
export function haze(ctx) {
  const bu = ctx.backdrop.material.uniforms;
  const material = new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: HAZE_FRAG,
    uniforms: { ...bu, uFrom: { value: 640 }, uTo: { value: 800 }, uAmount: { value: 0 } },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 50;
  mesh.userData.noReflect = true;
  ctx.scene.add(mesh);
  const u = material.uniforms;
  return {
    mesh,
    set({ amount, from, to }) {
      if (amount != null) u.uAmount.value = amount;
      if (from != null) u.uFrom.value = from;
      if (to != null) u.uTo.value = to;
      mesh.visible = u.uAmount.value > 0.001;
    },
  };
}

/** Lets a lib window mix two screen textures: returns show(a, b, mix). */
export function mixable(win) {
  const m = win.material;
  m.uniforms.tScreen2 = { value: m.uniforms.tScreen.value };
  m.uniforms.uMix = { value: 0 };
  const src = m.fragmentShader;
  m.fragmentShader = src
    .replace('uniform vec4 uCrop;', 'uniform vec4 uCrop; uniform sampler2D tScreen2; uniform float uMix;')
    .replace('c = texture2D(tScreen, st).rgb;', 'c = mix(texture2D(tScreen, st).rgb, texture2D(tScreen2, st).rgb, uMix);');
  if (!m.fragmentShader.includes('tScreen2, st')) throw new Error('mixable: window shader changed');
  m.needsUpdate = true;
  return (a, b = null, mix = 0) => {
    m.uniforms.tScreen.value = a;
    m.uniforms.tScreen2.value = b ?? a;
    m.uniforms.uMix.value = b ? mix : 0;
  };
}
