// A sheet lit in the dark: a soft pool of light, a travelling light band, and `lit` that
// brings the whole face up to exactly white (unlit maths, so white never exceeds 1.0).
// `clip` fades the sheet out below a local y (the bottom edge of a window it sits in).
import * as THREE from 'three';

const VERT = /* glsl */ `
varying vec2 vUv; varying vec2 vLocal;
void main() { vUv = uv; vLocal = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const FRAG = /* glsl */ `
uniform sampler2D tMap; uniform vec2 uSize; uniform float uLit; uniform float uBase;
uniform vec4 uPool; uniform vec3 uBand; uniform vec2 uDir; uniform vec3 uClip; uniform float uOpacity;
uniform vec3 uWarm;
varying vec2 vUv; varying vec2 vLocal;
void main() {
  vec3 c = texture2D(tMap, vUv, -0.5).rgb;
  vec2 q = vUv * vec2(uSize.x / uSize.y, 1.0);
  vec2 p = q - uPool.xy * vec2(uSize.x / uSize.y, 1.0);
  float pool = exp(-dot(p, p) / (uPool.z * uPool.z));
  float d = dot(q, uDir);
  float band = exp(-pow((d - uBand.x) / uBand.y, 2.0));
  float L = clamp(uBase + uPool.w * pool + uBand.z * band, 0.0, 1.0);
  L = mix(L, 1.0, uLit);
  c *= L * mix(uWarm, vec3(1.0), L);
  float a = uOpacity;
  a *= 1.0 - uClip.z * (1.0 - smoothstep(uClip.x - uClip.y, uClip.x + uClip.y, vLocal.y));
  gl_FragColor = vec4(c * a, a);
}`;

export function litSheet({ map, width, aspect }) {
  const height = width * aspect;
  const u = {
    tMap: { value: map },
    uSize: { value: new THREE.Vector2(width, height) },
    uLit: { value: 0 },
    uBase: { value: 0.01 },
    uPool: { value: new THREE.Vector4(0.5, 0.62, 0.45, 0.4) },
    uBand: { value: new THREE.Vector3(-1, 0.18, 0) },
    uDir: { value: new THREE.Vector2(0.8, -0.6) },
    uClip: { value: new THREE.Vector3(-1e3, 0.01, 0) },
    uOpacity: { value: 1 },
    uWarm: { value: new THREE.Color('#FFEAD6') },
  };
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: u,
    transparent: true,
    premultipliedAlpha: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mesh.renderOrder = 3;
  const api = {
    mesh, width, height,
    /** pool = [u, v, radius, amount] (uv, radius in sheet heights); band = [pos, width, amount]. */
    set({ lit, base, pool, band, dir, clip, opacity } = {}) {
      if (lit != null) u.uLit.value = lit;
      if (base != null) u.uBase.value = base;
      if (pool) u.uPool.value.set(...pool);
      if (band) u.uBand.value.set(...band);
      if (dir) u.uDir.value.set(...dir).normalize();
      if (clip) u.uClip.value.set(...clip);
      if (opacity != null) u.uOpacity.value = opacity;
    },
  };
  mesh.userData.dispose = () => {
    mesh.geometry.dispose();
    material.dispose();
  };
  return api;
}
