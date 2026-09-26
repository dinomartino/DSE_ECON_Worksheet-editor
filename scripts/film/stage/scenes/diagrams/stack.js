// The finished tax diagram as a stack of glass panes, one per registration-aligned layer,
// over a white card (the canvas). Collapsed, with black ink on the white card, it is
// pixel-identical to diagram/full.png on white, so it can take over from the clip's canvas
// and land on the printed page without a seam. Apart, the card clears to dark glass and
// the ink turns light. Depth of field is per pane (each pane knows its own depth), since
// the panes are transparent and a single depth buffer cannot describe them.
import * as THREE from 'three';

// Back to front.
export const LAYERS = ['axes', 'areas', 'guides', 'curves', 'shift', 'points'];
export const ASPECT = 2400 / 2010;

const VERT = /* glsl */ `
varying vec2 vUv; varying float vDepth;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

// Circle of confusion in px from the pane's own depth (uAperture already in output px).
const COC = /* glsl */ `
uniform float uFocus; uniform float uAperture; uniform float uMaxBlur; varying float vDepth;
float coc() { return uAperture > 0.0 ? min(uMaxBlur, uAperture * abs(1.0 / uFocus - 1.0 / vDepth)) : 0.0; }`;

// Ink: dark texels take the ink colour, white texels (label halos) the paper colour.
const INK = /* glsl */ `
${COC}
uniform sampler2D tMap; uniform float uOpacity; uniform vec3 uInk; uniform vec3 uPaper; varying vec2 vUv;
void main() {
  float r = coc();
  vec4 c;
  if (r < 0.6) {
    c = texture2D(tMap, vUv);
  } else {
    vec2 px = fwidth(vUv);
    float bias = log2(max(1.0, r * 0.5));
    c = vec4(0.0);
    for (int i = 0; i < 12; i++) {
      float k = (float(i) + 0.5) / 12.0;
      float ang = float(i) * 2.39996323;
      c += texture2D(tMap, vUv + vec2(cos(ang), sin(ang)) * sqrt(k) * r * px, bias);
    }
    c /= 12.0;
  }
  float a = c.a * uOpacity;
  if (a < 0.003) discard;
  float lum = c.a > 0.0 ? clamp(dot(c.rgb, vec3(0.3333)) / c.a, 0.0, 1.0) : 0.0;
  gl_FragColor = vec4(mix(uInk, uPaper, lum) * a, a);
}`;

// A glass pane: only its hairline edge catches the light, brighter at the top.
const PANE = /* glsl */ `
${COC}
uniform vec2 uSize; uniform float uRadius; uniform float uOpacity; uniform float uPxScale; varying vec2 vUv;
float rbox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main() {
  vec2 p = (vUv - 0.5) * uSize;
  float d = rbox(p, uSize * 0.5, uRadius);
  float aa = fwidth(d);
  float soft = aa * (1.0 + coc());
  float edge = 1.0 - smoothstep(0.0, soft * 1.4, abs(d + aa));
  float a = 0.13 * mix(0.45, 1.0, vUv.y) * edge * uOpacity; // lit from above
  if (a < 0.002) discard;
  gl_FragColor = vec4(vec3(a), 0.0);
}`;

const blend = {
  transparent: true,
  premultipliedAlpha: true,
  blending: THREE.CustomBlending,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneMinusSrcAlphaFactor,
  toneMapped: false,
  depthWrite: false,
};

/** Loads the layers and builds the stack; `width` in world units. */
export async function diagramStack(ctx, { width = 2 } = {}) {
  const height = width / ASPECT;
  const group = new THREE.Group();
  group.name = 'diagram-stack';
  const maps = await Promise.all(LAYERS.map((n) => ctx.load.texture(`diagram/${n}.png`)));

  const dof = { uFocus: { value: 5 }, uAperture: { value: 0 }, uMaxBlur: { value: 8 } };
  const cardMat = new THREE.MeshBasicMaterial({ color: '#FFFFFF', toneMapped: false, transparent: true, depthWrite: false });
  const card = new THREE.Mesh(new THREE.PlaneGeometry(width, height), cardMat);
  card.renderOrder = 1;
  group.add(card);

  const geo = new THREE.PlaneGeometry(width, height);
  const panes = [], layers = [];
  maps.forEach((map, i) => {
    const pane = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: PANE,
      uniforms: { ...dof, uSize: { value: new THREE.Vector2(width, height) }, uRadius: { value: 0.028 * width }, uOpacity: { value: 0 }, uPxScale: { value: 1 } },
      ...blend,
      // Additive-ish glass: premultiplied colour, a little coverage.
    }));
    pane.renderOrder = 10 + 2 * i;
    const ink = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: INK,
      uniforms: { ...dof, tMap: { value: map }, uOpacity: { value: 1 }, uInk: { value: new THREE.Color(0, 0, 0) }, uPaper: { value: new THREE.Color(1, 1, 1) } },
      ...blend,
    }));
    ink.renderOrder = 11 + 2 * i;
    group.add(pane, ink);
    panes.push(pane);
    layers.push(ink);
  });

  const api = {
    group, card, layers, panes, width, height,
    /**
     * `spread`: each layer's height above the card (world units, index as LAYERS).
     * `ink`: per-layer THREE.Color (linear); `paper` 0..1 whiteness of the card (label
     * halos follow it); `panes` 0..1 glass; `dof` { focus, aperture (px), maxBlur (px) }.
     */
    set({ spread = null, opacity = 1, paper = 1, ink = null, panes: glass = 0, dof: d = null } = {}) {
      const white = paper ** 2.2; // fades evenly to the eye, not through a long grey
      cardMat.opacity = opacity * white;
      card.visible = cardMat.opacity > 0.001;
      dof.uFocus.value = d?.focus ?? 5;
      dof.uAperture.value = d?.aperture ?? 0;
      dof.uMaxBlur.value = d?.maxBlur ?? 8;
      layers.forEach((m, i) => {
        const h = spread ? spread[i] : 0;
        m.position.z = 0.0012 + h;
        panes[i].position.z = 0.0006 + h;
        const u = m.material.uniforms;
        u.uOpacity.value = opacity;
        if (ink) u.uInk.value.copy(ink[i]);
        u.uPaper.value.setScalar(white);
        m.visible = opacity > 0.001;
        panes[i].material.uniforms.uOpacity.value = glass * opacity;
        panes[i].visible = glass * opacity > 0.001;
      });
    },
    dispose() {
      geo.dispose();
      card.geometry.dispose();
      cardMat.dispose();
      for (const m of [...layers, ...panes]) m.material.dispose();
    },
  };
  group.userData.dispose = api.dispose;
  api.set({});
  return api;
}
