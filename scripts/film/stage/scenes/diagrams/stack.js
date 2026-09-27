// The finished tax diagram as a stack of glass panes, one per registration-aligned layer,
// over a white card (the canvas). In its paper state (black ink on the white card) it is
// the page's diagram exactly, so it can take over from the clip's canvas and land on the
// printed page without a seam. A wipe turns it to glass: behind a soft band of light the
// card clears and the ink turns light. Depth of field is per pane (each pane knows its own
// depth), since the panes are transparent and one depth buffer cannot describe them.
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

// Circle of confusion in px from the pane's own depth (uAperture already in output px), and
// the wipe: 0 = paper, 1 = glass, with the band's light.
const COMMON = /* glsl */ `
uniform float uFocus; uniform float uAperture; uniform float uMaxBlur; varying float vDepth;
uniform vec3 uWipe; uniform float uSoft;
float coc() { return uAperture > 0.0 ? min(uMaxBlur, uAperture * abs(1.0 / uFocus - 1.0 / vDepth)) : 0.0; }
float wipeS(vec2 uv) { return dot(uv - 0.5, uWipe.xy); }
float glass(vec2 uv) { return 1.0 - smoothstep(uWipe.z - uSoft, uWipe.z + uSoft, wipeS(uv)); }
float band(vec2 uv) { float d = (wipeS(uv) - uWipe.z) / uSoft; return exp(-d * d * 1.6); }`;

const CARD = /* glsl */ `
${COMMON}
uniform float uOpacity; uniform float uSheen; varying vec2 vUv;
void main() {
  float g = glass(vUv);
  float paper = pow(1.0 - g, 2.2);
  float b = band(vUv) * uSheen;
  float a = clamp(paper + 0.35 * b, 0.0, 1.0) * uOpacity;
  if (a < 0.002) discard;
  vec3 c = vec3(paper) + vec3(1.0, 0.97, 0.93) * 0.35 * b;
  gl_FragColor = vec4(c * uOpacity, a);
}`;

// Ink: dark texels take the ink colour, white texels (label halos) the card's colour and
// vanish with it in the glass state.
const INK = /* glsl */ `
${COMMON}
uniform sampler2D tMap; uniform float uOpacity; uniform vec3 uInk; uniform vec3 uInkGlass; varying vec2 vUv;
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
  float g = glass(vUv);
  float lum = c.a > 0.0 ? clamp(dot(c.rgb, vec3(0.3333)) / c.a, 0.0, 1.0) : 0.0;
  float a = c.a * uOpacity * mix(1.0, 1.0 - lum, g);
  if (a < 0.003) discard;
  vec3 ink = mix(uInk, uInkGlass, g);
  gl_FragColor = vec4(mix(ink, vec3(1.0 - g), lum) * a, a);
}`;

// A glass pane: a faint sheet whose hairline edge catches the light, brighter at the top.
const PANE = /* glsl */ `
${COMMON}
uniform vec2 uSize; uniform float uRadius; uniform float uOpacity; uniform float uGlint; varying vec2 vUv;
float rbox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main() {
  vec2 p = (vUv - 0.5) * uSize;
  float d = rbox(p, uSize * 0.5, uRadius);
  float aa = fwidth(d);
  float soft = aa * (1.0 + coc());
  float inside = 1.0 - smoothstep(-soft, soft, d);
  float edge = 1.0 - smoothstep(0.0, soft * 1.4, abs(d + aa));
  float top = mix(0.4, 1.0, vUv.y);
  // A soft diagonal glint that travels with the orbit.
  float s = dot(vUv - 0.5, normalize(vec2(1.0, 0.6)));
  float glint = exp(-pow((s - uGlint) / 0.16, 2.0));
  float light = 0.16 * top * edge + inside * (0.006 + 0.022 * glint);
  float a = light * uOpacity;
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

  const shared = {
    uFocus: { value: 5 }, uAperture: { value: 0 }, uMaxBlur: { value: 8 },
    uWipe: { value: new THREE.Vector3(Math.SQRT1_2, -Math.SQRT1_2, -2) }, uSoft: { value: 0.06 },
  };
  const geo = new THREE.PlaneGeometry(width, height);
  const cardMat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: CARD,
    uniforms: { ...shared, uOpacity: { value: 1 }, uSheen: { value: 1 } },
    ...blend,
  });
  const card = new THREE.Mesh(geo, cardMat);
  card.renderOrder = 3; // over the window (2), whose canvas it takes over
  group.add(card);

  const panes = [], layers = [];
  maps.forEach((map, i) => {
    const pane = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: PANE,
      uniforms: { ...shared, uSize: { value: new THREE.Vector2(width, height) }, uRadius: { value: 0.028 * width }, uOpacity: { value: 0 }, uGlint: { value: 0 } },
      ...blend,
    }));
    pane.renderOrder = 10 + 2 * i;
    const ink = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: INK,
      uniforms: { ...shared, tMap: { value: map }, uOpacity: { value: 1 }, uInk: { value: new THREE.Color(0, 0, 0) }, uInkGlass: { value: new THREE.Color(1, 1, 1) } },
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
     * `wipe` 0..1 carries the band across the card (0 paper, 1 glass); `glassInk`:
     * per-layer THREE.Color (linear) for the glass state; `panes` 0..1 glass sheets;
     * `glint` -1..1 where the panes' sheen sits; `dof` { focus, aperture (px), maxBlur (px) }.
     */
    set({ spread = null, opacity = 1, wipe = 0, glassInk = null, panes: glass = 0, glint = 0, dof: d = null } = {}) {
      // The band travels from beyond one corner to beyond the other; ±2 parks it off the card.
      shared.uWipe.value.z = wipe <= 0 ? -2 : wipe >= 1 ? 2 : -0.95 + 1.9 * wipe;
      cardMat.uniforms.uOpacity.value = opacity;
      card.visible = opacity > 0.001 && wipe < 1;
      shared.uFocus.value = d?.focus ?? 5;
      shared.uAperture.value = d?.aperture ?? 0;
      shared.uMaxBlur.value = d?.maxBlur ?? 8;
      layers.forEach((m, i) => {
        const h = spread ? spread[i] : 0;
        m.position.z = 0.0012 + h;
        panes[i].position.z = 0.0006 + h;
        const u = m.material.uniforms;
        u.uOpacity.value = opacity;
        if (glassInk) u.uInkGlass.value.copy(glassInk[i]);
        m.visible = opacity > 0.001;
        const pu = panes[i].material.uniforms;
        pu.uOpacity.value = glass * opacity;
        pu.uGlint.value = glint;
        panes[i].visible = glass * opacity > 0.001;
      });
    },
    dispose() {
      geo.dispose();
      cardMat.dispose();
      for (const m of [...layers, ...panes]) m.material.dispose();
    },
  };
  group.userData.dispose = api.dispose;
  api.set({});
  return api;
}
