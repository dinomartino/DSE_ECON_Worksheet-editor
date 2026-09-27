// Extends one lib window's screen (this instance only) with: a second frame to cross-fade to
// (softens UI state pops and hides skipped stretches), a round reveal that grows from a point
// (the screen lights up from the mark's crossing), and a dim that spares one rectangle (the
// lights go down around the canvas card). Coordinates are window-local world units.
import * as THREE from 'three';

const PATCHES = [
  [
    'uniform vec4 uCrop; uniform float uDim;',
    `uniform vec4 uCrop; uniform float uDim;
uniform sampler2D tScreen2; uniform float uMix; uniform vec4 uReveal; uniform vec4 uSpare; uniform float uOuter;
float spare(vec2 p) {
  vec2 q = max(uSpare.xy - p, p - uSpare.zw);
  float d = max(q.x, q.y);
  return 1.0 - smoothstep(-0.004, 0.012, d);
}`,
  ],
  ['c = texture2D(tScreen, st).rgb;', 'c = mix(texture2D(tScreen, st).rgb, texture2D(tScreen2, st).rgb, uMix);'],
  ['c *= uDim;', 'c *= uDim * mix(uOuter, 1.0, spare(p));'],
  [
    'gl_FragColor = vec4(c * a * uOpacity, a * uOpacity);',
    `a *= 1.0 - smoothstep(uReveal.z - uReveal.w, uReveal.z, length(p - uReveal.xy));
  gl_FragColor = vec4(c * a * uOpacity, a * uOpacity);`,
  ],
];

/**
 * set({ a, b, mix, reveal: [x, y, r, soft], spare: [x0, y0, x1, y1], outer }) on top of the
 * window's own set(): `a`/`b` are the two screen textures, `mix` 0..1 shows `b`.
 */
export function extendScreen(win) {
  const m = win.material;
  let src = m.fragmentShader;
  for (const [from, to] of PATCHES) {
    if (!src.includes(from)) throw new Error(`lib/window.js shader changed; diagrams/screen.js cannot find: ${from}`);
    src = src.replace(from, to);
  }
  m.fragmentShader = src;
  const u = m.uniforms;
  Object.assign(u, {
    tScreen2: { value: u.tScreen.value },
    uMix: { value: 0 },
    uReveal: { value: new THREE.Vector4(0, 0, 1e3, 1) },
    uSpare: { value: new THREE.Vector4(-1e3, -1e3, 1e3, 1e3) },
    uOuter: { value: 1 },
  });
  m.needsUpdate = true;
  return {
    set({ a, b, mix = 0, reveal = null, spare = null, outer = 1, ...rest } = {}) {
      win.set({ screen: a, ...rest });
      u.tScreen2.value = mix > 0 && b ? b : u.tScreen.value;
      u.uMix.value = mix;
      if (reveal) u.uReveal.value.set(...reveal);
      else u.uReveal.value.set(0, 0, 1e3, 1);
      if (spare) u.uSpare.value.set(...spare);
      u.uOuter.value = outer;
    },
  };
}
