// The dark that lifts off the page: a black veil over a sheet whose clear disc grows from
// a point (the landed diagram), so the light blooms outward instead of the page fading
// up through flat grey.
import * as THREE from 'three';

const VERT = /* glsl */ `
varying vec2 vP;
void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const FRAG = /* glsl */ `
uniform vec2 uCenter; uniform float uR; uniform float uSoft; uniform float uAlpha; varying vec2 vP;
void main() {
  float lit = 1.0 - smoothstep(uR - uSoft, uR, length(vP - uCenter));
  float a = (1.0 - lit) * uAlpha;
  if (a < 0.002) discard;
  gl_FragColor = vec4(0.0, 0.0, 0.0, a);
}`;

/** A veil of w × h world units; `center` in its local coordinates. set({ r, alpha }). */
export function veil({ w, h, center = [0, 0], soft = 1.5 }) {
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: { uCenter: { value: new THREE.Vector2(...center) }, uR: { value: 0 }, uSoft: { value: soft }, uAlpha: { value: 1 } },
    transparent: true,
    premultipliedAlpha: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  mesh.name = 'veil';
  mesh.userData.dispose = () => {
    material.dispose();
    mesh.geometry.dispose();
  };
  return {
    mesh,
    set({ r, alpha }) {
      if (r != null) material.uniforms.uR.value = r;
      if (alpha != null) material.uniforms.uAlpha.value = alpha;
    },
  };
}

// The room's light: a screen-space disc of the day backdrop (the same formula and colours
// as lib/backdrop.js WORLDS.day) opening over the night one, so the light spreading across
// the page runs on across the room, and the day backdrop can then take over without a seam.
const ROOM_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 1.0, 1.0); }`;

const ROOM_FRAG = /* glsl */ `
uniform vec3 uTop; uniform vec3 uBottom; uniform vec3 uGlow; uniform vec2 uGlowCenter;
uniform float uGlowRadius; uniform float uGlowAmount; uniform float uAspect;
uniform vec2 uCenter; uniform float uR; uniform float uSoft; varying vec2 vUv;
void main() {
  float lit = 1.0 - smoothstep(uR - uSoft, uR, length((vUv - uCenter) * vec2(uAspect, 1.0)));
  if (lit < 0.002) discard;
  vec3 base = mix(uBottom, uTop, smoothstep(0.0, 1.0, vUv.y));
  vec2 d = (vUv - uGlowCenter) * vec2(uAspect, 1.0);
  float r = length(d) / uGlowRadius;
  vec3 c = mix(base, uGlow, exp(-r * r * 1.2) * uGlowAmount);
  gl_FragColor = vec4(c * lit, lit);
}`;

/** `day` = lib.backdrop WORLDS.day. set({ center: [u, v], r, soft }), r and soft in frame heights. */
export function roomLight(day, aspect) {
  const material = new THREE.ShaderMaterial({
    vertexShader: ROOM_VERT,
    fragmentShader: ROOM_FRAG,
    uniforms: {
      uTop: { value: new THREE.Color(day.top) },
      uBottom: { value: new THREE.Color(day.bottom) },
      uGlow: { value: new THREE.Color(day.glow) },
      uGlowCenter: { value: new THREE.Vector2(...day.center) },
      uGlowRadius: { value: day.radius },
      uGlowAmount: { value: day.glowAmount },
      uAspect: { value: aspect },
      uCenter: { value: new THREE.Vector2(0.5, 0.5) },
      uR: { value: 0 },
      uSoft: { value: 0.3 },
    },
    transparent: false, // the opaque pass, so it sorts right after the backdrop (blending still applies)
    premultipliedAlpha: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -999; // just over the backdrop
  mesh.name = 'room-light';
  mesh.userData.noReflect = true;
  mesh.userData.dispose = () => {
    material.dispose();
    mesh.geometry.dispose();
  };
  const u = material.uniforms;
  return {
    mesh,
    set({ center, r, soft }) {
      if (center) u.uCenter.value.set(...center);
      if (r != null) u.uR.value = r;
      if (soft != null) u.uSoft.value = soft;
      mesh.visible = r > 0;
    },
  };
}
