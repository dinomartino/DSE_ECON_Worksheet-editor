// The light on the page: the sheet's colour is scaled by a disc of light growing from its
// diagram slot, so the page first lies in a pool of light and then the light spreads
// outward, instead of the page fading up through flat grey. `amb` lights all of it.
// Patched into the lib paper material, so a fading (transparent) sheet stays monotonic.
import * as THREE from 'three';
import { patch } from '../../lib/tonemap.js';

// The diagram's frame on the question sheet (sheet px): diagram/full.png at half size.
const SLOT = { x: 591, y: 526, w: 1200, h: 1005 };

/** The sheet texture with its diagram painted out (paper white). */
export function blankSlot(sheetTex, ctx) {
  const img = sheetTex.image;
  if (!img?.width) return sheetTex;
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const g = canvas.getContext('2d');
  g.drawImage(img, 0, 0);
  g.fillStyle = '#FFFFFF';
  // The bitmap is stored flipped (lib/clip.js loads with imageOrientation: flipY).
  g.fillRect(SLOT.x, img.height - SLOT.y - SLOT.h, SLOT.w, SLOT.h);
  const tex = new THREE.CanvasTexture(canvas);
  for (const k of ['flipY', 'colorSpace', 'generateMipmaps', 'minFilter', 'magFilter', 'anisotropy']) tex[k] = sheetTex[k];
  ctx.onDispose(() => tex.dispose());
  return tex;
}

/** Lights a lib/paper sheet; `center` in its local coordinates. set({ r, soft, amb }). */
export function pageLight(sheet, { center = [0, 0], soft = 1.5 } = {}) {
  const u = {
    uLC: { value: new THREE.Vector2(...center) },
    uLR: { value: 0 },
    uLSoft: { value: soft },
    uLAmb: { value: 0 },
  };
  patch(sheet.material, 'pageLight', (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vPL;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPL = position.xy;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec2 uLC; uniform float uLR; uniform float uLSoft; uniform float uLAmb; varying vec2 vPL;')
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
gl_FragColor.rgb *= mix(uLAmb, 1.0, 1.0 - smoothstep(uLR - uLSoft, uLR, length(vPL - uLC)));`);
  });
  return {
    set({ r, soft: sf, amb }) {
      if (r != null) u.uLR.value = r;
      if (sf != null) u.uLSoft.value = sf;
      if (amb != null) u.uLAmb.value = amb;
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
uniform vec2 uCenter; uniform float uR; uniform float uSoft; uniform float uAlpha; varying vec2 vUv;
void main() {
  float lit = uAlpha * (1.0 - smoothstep(uR - uSoft, uR, length((vUv - uCenter) * vec2(uAspect, 1.0))));
  if (lit < 1e-5) discard;
  vec3 base = mix(uBottom, uTop, smoothstep(0.0, 1.0, vUv.y));
  vec2 d = (vUv - uGlowCenter) * vec2(uAspect, 1.0);
  float r = length(d) / uGlowRadius;
  vec3 c = mix(base, uGlow, exp(-r * r * 1.2) * uGlowAmount);
  gl_FragColor = vec4(c * lit, lit);
}`;

/** `day` = lib.backdrop WORLDS.day. set({ center: [u, v], r, soft, alpha }), r and soft in frame heights. */
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
      uAlpha: { value: 1 },
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
    set({ center, r, soft, alpha }) {
      if (center) u.uCenter.value.set(...center);
      if (r != null) u.uR.value = r;
      if (soft != null) u.uSoft.value = soft;
      if (alpha != null) u.uAlpha.value = alpha;
      mesh.visible = r > 0;
    },
  };
}
