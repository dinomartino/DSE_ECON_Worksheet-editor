// A flat patch of a clip frame laid over the window's screen: the same colour pipeline
// as lib/window.js, so at full opacity it matches the screen under it pixel for pixel.
import * as THREE from 'three';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const FRAG = /* glsl */ `
uniform sampler2D tMap; uniform vec4 uRect; uniform float uOpacity;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tMap, mix(uRect.xy, uRect.zw, vUv)).rgb;
  gl_FragColor = vec4(c * uOpacity, uOpacity);
}`;

/** `w`×`h` world units showing texture rect `uv` = [u0, v0, u1, v1] (v up). */
export function framePatch({ w, h, uv }) {
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      tMap: { value: null },
      uRect: { value: new THREE.Vector4(...uv) },
      uOpacity: { value: 0 },
    },
    transparent: true,
    premultipliedAlpha: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  mesh.renderOrder = 3;
  mesh.visible = false;
  mesh.userData.dispose = () => {
    material.dispose();
    mesh.geometry.dispose();
  };
  return {
    mesh,
    set({ map, opacity }) {
      mesh.visible = !!map && opacity > 0.001;
      material.uniforms.tMap.value = map ?? null;
      material.uniforms.uOpacity.value = opacity;
    },
  };
}
