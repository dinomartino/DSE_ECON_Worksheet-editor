// A glass chip in 3D (so it shares the scene's motion blur): a pill drawn as a signed
// distance in the shader — translucent white fill, bright rim, warm inner shade — with the
// label from a canvas coverage mask, and a two-layer soft shadow behind it.
import * as THREE from 'three';
import { softShadow } from './shadow.js';

const FONT = '-apple-system, "SF Pro Display", system-ui, sans-serif';
const PX = 3; // canvas px per design px

const VERT = /* glsl */ `
varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const FRAG = /* glsl */ `
uniform sampler2D tText; uniform vec2 uSize; uniform float uRim; uniform float uOpacity;
uniform vec3 uInk; uniform vec3 uFill; uniform vec3 uShade;
varying vec2 vUv;
float rbox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main() {
  vec2 p = (vUv - 0.5) * uSize;
  float d = rbox(p, uSize * 0.5, uSize.y * 0.5);
  float aa = fwidth(d);
  float a = 1.0 - smoothstep(-aa, aa * 0.5, d);
  if (a <= 0.0) discard;
  float fillA = mix(0.7, 0.9, vUv.y);
  vec3 c = uFill;
  c = mix(c, uShade, 0.22 * smoothstep(-uSize.y * 0.45, 0.0, d) * (1.0 - vUv.y));
  float rim = 1.0 - smoothstep(0.0, aa * 1.2, abs(d + uRim * 0.5) - uRim * 0.5);
  c = mix(c, vec3(1.0), rim);
  fillA = mix(fillA, 1.0, rim);
  float cov = texture2D(tText, vUv).r;
  c = pow(mix(pow(c, vec3(1.0 / 2.2)), pow(uInk, vec3(1.0 / 2.2)), cov), vec3(2.2)); // blend like the browser does
  float A = max(fillA, cov) * a * uOpacity;
  gl_FragColor = vec4(c * A, A);
}`;

/** `text` at `fontPx` design px on a pill `hPx` tall; `unit` = world units per design px. */
export function glassChip(text, { unit, hPx = 100, fontPx = 46, padPx = 44 } = {}) {
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = `600 ${fontPx}px ${FONT}`;
  probe.letterSpacing = `${-0.02 * fontPx}px`;
  const wPx = Math.ceil(probe.measureText(text).width + 2 * padPx);
  const c = document.createElement('canvas');
  c.width = wPx * PX;
  c.height = hPx * PX;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, c.width, c.height);
  g.font = `600 ${fontPx * PX}px ${FONT}`;
  g.letterSpacing = `${-0.02 * fontPx * PX}px`;
  g.fillStyle = '#FFF';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, c.height / 2 + fontPx * PX * 0.04);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 8;

  const w = wPx * unit, h = hPx * unit;
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      tText: { value: tex },
      uSize: { value: new THREE.Vector2(w, h) },
      uRim: { value: 1.6 * unit },
      uOpacity: { value: 1 },
      uInk: { value: new THREE.Color('#1D1D1F') },
      uFill: { value: new THREE.Color('#FFFFFF') },
      uShade: { value: new THREE.Color('#D6CCBE') },
    },
    transparent: true,
    depthWrite: false,
    premultipliedAlpha: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    toneMapped: false,
  });
  const group = new THREE.Group();
  group.name = `chip-${text}`;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  mesh.renderOrder = 6;
  const amb = softShadow({ w: w * 0.94, h: h * 0.9, r: h * 0.45, s: 22 * unit, opacity: 0.15 });
  const key = softShadow({ w: w * 0.97, h: h * 0.95, r: h * 0.47, s: 4 * unit, opacity: 0.08 });
  amb.position.set(0, -20 * unit, -0.012);
  key.position.set(0, -3 * unit, -0.006);
  amb.renderOrder = key.renderOrder = 5;
  group.add(amb, key, mesh);
  const api = {
    group, w, h,
    set({ opacity = 1, shadow = 1 } = {}) {
      material.uniforms.uOpacity.value = opacity;
      amb.material.opacity = 0.15 * shadow * opacity;
      key.material.opacity = 0.08 * shadow * opacity;
      group.visible = opacity > 0.001;
    },
    dispose() {
      tex.dispose();
      material.dispose();
      mesh.geometry.dispose();
    },
  };
  mesh.userData.dispose = api.dispose;
  return api;
}
