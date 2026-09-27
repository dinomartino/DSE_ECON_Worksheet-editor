// Extends one lib window's screen (this instance only) with: a second frame to cross-fade to
// (fractional clip frames; a menu fading out inside its own rectangle), a round reveal that
// grows from a point (the screen lights up from the mark's crossing), and a dim that spares
// one rectangle (the lights go down around the canvas card). Coordinates are window-local
// world units.
import * as THREE from 'three';

const PATCHES = [
  [
    'uniform vec4 uCrop; uniform float uDim;',
    `uniform vec4 uCrop; uniform float uDim;
uniform sampler2D tScreen2; uniform float uMix; uniform float uMixIn; uniform vec4 uMixRect;
uniform vec4 uReveal; uniform vec4 uSpare; uniform float uOuter; uniform float uInner;
float inRect(vec2 p, vec4 r, float a, float b) {
  vec2 q = max(r.xy - p, p - r.zw);
  return 1.0 - smoothstep(a, b, max(q.x, q.y));
}
float spare(vec2 p) { return inRect(p, uSpare, -0.004, 0.012); }`,
  ],
  [
    'c = texture2D(tScreen, st).rgb;',
    'c = mix(texture2D(tScreen, st).rgb, texture2D(tScreen2, st).rgb, mix(uMix, uMixIn, inRect(p, uMixRect, -0.01, 0.01)));',
  ],
  ['c *= uDim;', 'c *= uDim * mix(uOuter, uInner, spare(p));'],
  [
    'gl_FragColor = vec4(c * a * uOpacity, a * uOpacity);',
    `a *= 1.0 - smoothstep(uReveal.z - uReveal.w, uReveal.z, length(p - uReveal.xy));
  gl_FragColor = vec4(c * a * uOpacity, a * uOpacity);`,
  ],
];

const NOWHERE = [-1e3, -1e3, -1e3 + 1e-3, -1e3 + 1e-3];

/**
 * set({ a, b, mix, mixIn, rect, reveal: [x, y, r, soft], spare: [x0, y0, x1, y1], outer, inner })
 * on top of the window's own set(): `a`/`b` are the two screen textures, `mix` 0..1 shows
 * `b`, and inside `rect` (if given) `mixIn` does instead; `outer`/`inner` scale the screen
 * outside/inside `spare`.
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
    uMixIn: { value: 0 },
    uMixRect: { value: new THREE.Vector4(...NOWHERE) },
    uReveal: { value: new THREE.Vector4(0, 0, 1e3, 1) },
    uSpare: { value: new THREE.Vector4(-1e3, -1e3, 1e3, 1e3) },
    uOuter: { value: 1 },
    uInner: { value: 1 },
  });
  m.needsUpdate = true;
  return {
    set({ a, b, mix = 0, mixIn = null, rect = null, reveal = null, spare = null, outer = 1, inner = 1, ...rest } = {}) {
      win.set({ screen: a, ...rest });
      const used = b && (mix > 0 || (rect && mixIn > 0));
      u.tScreen2.value = used ? b : u.tScreen.value;
      u.uMix.value = mix;
      u.uMixIn.value = rect ? mixIn : mix;
      u.uMixRect.value.set(...(rect ?? NOWHERE));
      if (reveal) u.uReveal.value.set(...reveal);
      else u.uReveal.value.set(0, 0, 1e3, 1);
      if (spare) u.uSpare.value.set(...spare);
      u.uOuter.value = outer;
      u.uInner.value = inner;
    },
  };
}
