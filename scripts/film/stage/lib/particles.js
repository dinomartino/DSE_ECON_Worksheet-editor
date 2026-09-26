// Sparse bokeh dust: billboards whose disc grows with their circle of confusion (so they
// read as out-of-focus light) while their energy is conserved. Motion is a pure function
// of uTime and per-particle seeds.
import * as THREE from 'three';
import { rng } from './noise.js';

const VERT = /* glsl */ `
attribute vec3 aBase; attribute vec4 aSeed;
uniform float uTime; uniform float uSize; uniform float uFocus; uniform float uAperture;
uniform float uProj; uniform float uBright; uniform float uDrift; uniform float uRise;
varying vec2 vQ; varying float vA; varying float vSharp; varying float vTint;
void main() {
  float t = uTime;
  vec3 p = aBase;
  p.x += uDrift * (sin(t * (0.11 + 0.13 * aSeed.x) + aSeed.y * 6.2831) + 0.5 * sin(t * 0.37 * aSeed.z + aSeed.w * 9.0));
  p.y += uDrift * 0.7 * sin(t * (0.09 + 0.1 * aSeed.z) + aSeed.x * 6.2831) + uRise * t * (0.4 + aSeed.w);
  p.z += uDrift * 0.6 * cos(t * (0.07 + 0.08 * aSeed.w) + aSeed.z * 6.2831);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float z = max(0.05, -mv.z);
  float sharp = uSize * (0.35 + 0.65 * aSeed.x);
  float r = sharp + uAperture * abs(z - uFocus) / uFocus;
  float px = r * uProj / z;
  float a = uBright * (0.35 + 0.65 * aSeed.y) * (sharp * sharp) / (r * r);
  if (px < 1.3) { a *= (px * px) / (1.69); r *= 1.3 / px; }
  a *= 0.75 + 0.25 * sin(t * (0.6 + aSeed.z) + aSeed.w * 20.0);
  mv.xy += position.xy * r;
  gl_Position = projectionMatrix * mv;
  vQ = position.xy;
  vA = a;
  vSharp = clamp(sharp / r, 0.0, 1.0);
  vTint = aSeed.z;
}`;

const FRAG = /* glsl */ `
uniform vec3 uColor; uniform vec3 uColor2; varying vec2 vQ; varying float vA; varying float vSharp; varying float vTint;
void main() {
  float d = length(vQ);
  if (d > 1.0) discard;
  float soft = mix(0.1, 0.95, vSharp);
  float disc = 1.0 - smoothstep(1.0 - soft, 1.0, d);
  float rim = smoothstep(0.55, 0.92, d) * (1.0 - smoothstep(0.92, 1.0, d)) * 0.35 * (1.0 - vSharp);
  float v = disc * (0.8 + rim) ;
  vec3 c = mix(uColor, uColor2, vTint) * v * vA;
  gl_FragColor = vec4(c, 0.0);
}`;

/**
 * `box` = [[x0,y0,z0],[x1,y1,z1]] world volume. `focus` is the camera distance in focus;
 * `aperture` scales the blur disc. Call set({time, focus, bright}) per frame.
 */
export function dust({ count = 90, seed = 7, box = [[-8, -1, -10], [8, 6, 2]], size = 0.012, focus = 10, aperture = 0.08, bright = 0.5, color = '#FFE6C4', color2 = '#BFD8FF', drift = 0.25, rise = 0.02, H = 1080, fov = 30 } = {}) {
  const r = rng(seed);
  const base = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    for (let k = 0; k < 3; k++) base[i * 3 + k] = box[0][k] + (box[1][k] - box[0][k]) * r();
    for (let k = 0; k < 4; k++) seeds[i * 4 + k] = r();
  }
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.setAttribute('aBase', new THREE.InstancedBufferAttribute(base, 3));
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  geo.instanceCount = count;
  const proj = (fovDeg) => H / (2 * Math.tan((fovDeg * Math.PI) / 360));
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uTime: { value: 0 },
      uSize: { value: size },
      uFocus: { value: focus },
      uAperture: { value: aperture },
      uProj: { value: proj(fov) },
      uBright: { value: bright },
      uDrift: { value: drift },
      uRise: { value: rise },
      uColor: { value: new THREE.Color(color) },
      uColor2: { value: new THREE.Color(color2) },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    premultipliedAlpha: true,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  mesh.name = 'dust';
  mesh.userData.noReflect = true;
  mesh.userData.dispose = () => {
    geo.dispose();
    material.dispose();
  };
  return {
    mesh,
    set({ time, focus: f, bright: b, aperture: a, fov: fv, H: h } = {}) {
      const u = material.uniforms;
      if (time != null) u.uTime.value = time;
      if (f != null) u.uFocus.value = f;
      if (b != null) u.uBright.value = b;
      if (a != null) u.uAperture.value = a;
      if (fv != null) u.uProj.value = (h ?? H) / (2 * Math.tan((fv * Math.PI) / 360));
    },
    dispose() {
      geo.dispose();
      material.dispose();
    },
  };
}
