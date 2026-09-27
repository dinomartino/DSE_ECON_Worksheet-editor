// A sheet lit in the dark: a soft pool of light, a travelling light band, and `lit` that
// brings the whole face up to exactly white (unlit maths, so white never exceeds 1.0).
// `clip` fades the sheet out below a local y (the bottom edge of a window it sits in);
// `alt` shows a second page image of the same aspect instead (the printed page → the .docx);
// `wash` burns the face to white; `warm` is how much of the tungsten tint the dim light
// carries (0 = neutral). `marks` outline page regions in the accent (a tinted fill, a crisp
// ring, a soft outer glow) and `caret` draws a text caret — both in page fractions.
import * as THREE from 'three';

export const MARKS = 6;

const VERT = /* glsl */ `
varying vec2 vUv; varying vec2 vLocal;
void main() { vUv = uv; vLocal = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const FRAG = /* glsl */ `
#define MARKS ${MARKS}
uniform sampler2D tMap; uniform sampler2D tAlt; uniform float uAlt; uniform vec2 uSize; uniform float uLit; uniform float uBase;
uniform vec4 uPool; uniform vec3 uBand; uniform vec2 uDir; uniform vec3 uClip; uniform float uOpacity;
uniform vec3 uWarm; uniform float uWash; uniform float uWarmK;
uniform vec4 uMark[MARKS]; uniform float uMarkK[MARKS]; uniform float uMarkGlow[MARKS];
uniform vec3 uInk; uniform vec3 uTint; uniform vec4 uCaret;
varying vec2 vUv; varying vec2 vLocal;
float rbox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main() {
  vec3 c = texture2D(tMap, vUv, -0.5).rgb;
  if (uAlt > 0.0) c = mix(c, texture2D(tAlt, vUv, -0.5).rgb, uAlt);
  c = mix(c, vec3(1.0), uWash);
  float asp = uSize.x / uSize.y;
  vec2 q = vUv * vec2(asp, 1.0); // page-height units
  // Marks: rect = (u0, top0, u1, top1) in page fractions from the top-left.
  float ring = 0.0, fill = 0.0, glow = 0.0;
  for (int i = 0; i < MARKS; i++) {
    vec4 R = uMark[i];
    vec2 ctr = vec2((R.x + R.z) * 0.5 * asp, 1.0 - (R.y + R.w) * 0.5);
    vec2 hb = vec2((R.z - R.x) * 0.5 * asp, (R.w - R.y) * 0.5) + 0.0065;
    float d = rbox(q - ctr, hb, 0.0055);
    float aa = fwidth(d);
    float k = uMarkK[i];
    ring = max(ring, k * (1.0 - smoothstep(0.0011 - aa, 0.0011 + aa, abs(d))));
    fill = max(fill, k * (1.0 - smoothstep(-aa, aa, d)));
    glow = max(glow, uMarkGlow[i] * exp(-max(d, 0.0) / 0.012) * smoothstep(-aa, aa, d));
  }
  c *= mix(vec3(1.0), uTint, fill * 0.55);
  c = mix(c, uTint, glow * 0.6);
  c = mix(c, uInk, ring);
  // Caret: (u, top0, top1, alpha).
  float cw = fwidth(q.x);
  float cx = 1.0 - smoothstep(0.0009 - cw, 0.0009 + cw, abs(q.x - uCaret.x * asp));
  float top = 1.0 - vUv.y;
  float cy = smoothstep(uCaret.y - cw, uCaret.y + cw, top) * (1.0 - smoothstep(uCaret.z - cw, uCaret.z + cw, top));
  c = mix(c, vec3(0.0), uCaret.w * cx * cy);
  vec2 p = q - uPool.xy * vec2(asp, 1.0);
  float pool = exp(-dot(p, p) / (uPool.z * uPool.z));
  float d = dot(q, uDir);
  float band = exp(-pow((d - uBand.x) / uBand.y, 2.0));
  float L = clamp(uBase + uPool.w * pool + uBand.z * band, 0.0, 1.0);
  L = mix(L, 1.0, uLit);
  c *= L * mix(mix(vec3(1.0), uWarm, uWarmK), vec3(1.0), L);
  float a = uOpacity;
  a *= 1.0 - uClip.z * (1.0 - smoothstep(uClip.x - uClip.y, uClip.x + uClip.y, vLocal.y));
  gl_FragColor = vec4(c * a, a);
}`;

export function litSheet({ map, alt = null, width, aspect }) {
  const height = width * aspect;
  const u = {
    tMap: { value: map },
    tAlt: { value: alt ?? map },
    uAlt: { value: 0 },
    uSize: { value: new THREE.Vector2(width, height) },
    uLit: { value: 0 },
    uBase: { value: 0.01 },
    uPool: { value: new THREE.Vector4(0.5, 0.62, 0.45, 0.4) },
    uBand: { value: new THREE.Vector3(-1, 0.18, 0) },
    uDir: { value: new THREE.Vector2(0.8, -0.6) },
    uClip: { value: new THREE.Vector3(-1e3, 0.01, 0) },
    uOpacity: { value: 1 },
    uWarm: { value: new THREE.Color('#FFEAD6') },
    uWarmK: { value: 1 },
    uWash: { value: 0 },
    uMark: { value: Array.from({ length: MARKS }, () => new THREE.Vector4(-1, -1, -1, -1)) },
    uMarkK: { value: new Array(MARKS).fill(0) },
    uMarkGlow: { value: new Array(MARKS).fill(0) },
    uInk: { value: new THREE.Color('#1E7FD4') },
    uTint: { value: new THREE.Color('#D3E8FF') },
    uCaret: { value: new THREE.Vector4(0, 0, 0, 0) },
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
    set({ lit, base, pool, band, dir, clip, opacity, alt, wash, warm, caret } = {}) {
      if (lit != null) u.uLit.value = lit;
      if (base != null) u.uBase.value = base;
      if (pool) u.uPool.value.set(...pool);
      if (band) u.uBand.value.set(...band);
      if (dir) u.uDir.value.set(...dir).normalize();
      if (clip) u.uClip.value.set(...clip);
      if (opacity != null) u.uOpacity.value = opacity;
      if (alt != null) u.uAlt.value = alt;
      if (wash != null) u.uWash.value = wash;
      if (warm != null) u.uWarmK.value = warm;
      if (caret) u.uCaret.value.set(...caret);
    },
    /** Mark i: rect [u0, top0, u1, top1] in page fractions, strength k (0..1), outer glow g. */
    mark(i, rect, k, g = 0) {
      u.uMark.value[i].set(...rect);
      u.uMarkK.value[i] = k;
      u.uMarkGlow.value[i] = g;
    },
  };
  mesh.userData.dispose = () => {
    mesh.geometry.dispose();
    material.dispose();
  };
  return api;
}
