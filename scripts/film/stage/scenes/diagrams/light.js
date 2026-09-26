// The dark that lifts off the page: a black veil over a sheet whose clear disc grows from
// a point (the landing diagram), so the light blooms outward instead of the page fading
// up through flat grey.
import * as THREE from 'three';

const VERT = /* glsl */ `
varying vec2 vP;
void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const FRAG = /* glsl */ `
uniform vec2 uCenter; uniform float uR; uniform float uSoft; varying vec2 vP;
void main() {
  float lit = 1.0 - smoothstep(uR - uSoft, uR, length(vP - uCenter));
  float a = 1.0 - lit;
  if (a < 0.002) discard;
  gl_FragColor = vec4(0.0, 0.0, 0.0, a);
}`;

/** A veil of w × h world units; `center` in its local coordinates. set({ r, soft }). */
export function veil({ w, h, center = [0, 0], soft = 1.5 }) {
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: { uCenter: { value: new THREE.Vector2(...center) }, uR: { value: 0 }, uSoft: { value: soft } },
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
    set({ r, soft: s }) {
      if (r != null) material.uniforms.uR.value = r;
      if (s != null) material.uniforms.uSoft.value = s;
      mesh.visible = r < 1e3;
    },
  };
}
