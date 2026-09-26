// Screen-space world backgrounds (FILM.md §4 Worlds). Drawn first, behind everything,
// independent of the camera. Night: black with a faint warm radial lift. Day: the app's
// cream, top to bottom.
import * as THREE from 'three';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 1.0, 1.0); }`;

const FRAG = /* glsl */ `
uniform vec3 uTop; uniform vec3 uBottom; uniform vec3 uGlow; uniform vec2 uCenter;
uniform float uRadius; uniform float uGlowAmount; uniform float uAspect; uniform float uMix;
uniform vec3 uTint; varying vec2 vUv;
void main() {
  vec3 base = mix(uBottom, uTop, smoothstep(0.0, 1.0, vUv.y));
  vec2 d = (vUv - uCenter) * vec2(uAspect, 1.0);
  float r = length(d) / uRadius;
  float lift = exp(-r * r * 1.2) * uGlowAmount;
  vec3 c = mix(base, uGlow, lift);
  gl_FragColor = vec4(mix(c, uTint, uMix), 1.0);
}`;

const col = (hex) => new THREE.Color(hex);

export const WORLDS = {
  night: { top: '#000000', bottom: '#000000', glow: '#15120F', glowAmount: 1, radius: 0.55, center: [0.5, 0.52] },
  day: { top: '#F5F1EA', bottom: '#E8E1D5', glow: '#F8F5EF', glowAmount: 0.55, radius: 0.6, center: [0.5, 0.62] },
};
WORLDS.mixed = WORLDS.night;

/** A full-screen backdrop mesh. `set({...})` retunes it per frame (colours as hex). */
export function backdrop(world = 'night', aspect = 16 / 9) {
  const w = WORLDS[world] ?? WORLDS.night;
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      uTop: { value: col(w.top) },
      uBottom: { value: col(w.bottom) },
      uGlow: { value: col(w.glow) },
      uCenter: { value: new THREE.Vector2(...w.center) },
      uRadius: { value: w.radius },
      uGlowAmount: { value: w.glowAmount },
      uAspect: { value: aspect },
      uTint: { value: new THREE.Color(0, 0, 0) },
      uMix: { value: 0 },
    },
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.name = 'backdrop';
  mesh.userData.noReflect = true;
  const u = material.uniforms;
  mesh.userData.set = (o = {}) => {
    if (o.top) u.uTop.value.set(o.top);
    if (o.bottom) u.uBottom.value.set(o.bottom);
    if (o.glow) u.uGlow.value.set(o.glow);
    if (o.center) u.uCenter.value.set(...o.center);
    if (o.radius != null) u.uRadius.value = o.radius;
    if (o.glowAmount != null) u.uGlowAmount.value = o.glowAmount;
    if (o.tint) u.uTint.value.set(o.tint);
    if (o.tintMix != null) u.uMix.value = o.tintMix;
  };
  return mesh;
}
