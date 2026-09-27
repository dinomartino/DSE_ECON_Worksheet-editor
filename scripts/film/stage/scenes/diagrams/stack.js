// The finished tax diagram as a stack of glass panes, one per registration-aligned layer,
// over a white card (the canvas). In its paper state (black ink on the white card) it is
// the page's diagram exactly, so it can take over from the clip's canvas and land on the
// printed page without a seam. A wipe turns it to glass: behind a soft band of light the
// card clears and the ink turns light. Depth of field is per pane (each pane knows its own
// depth), since the panes are transparent and one depth buffer cannot describe them.
import * as THREE from 'three';

// Back to front.
export const LAYERS = ['axes', 'areas', 'guides', 'curves', 'shift', 'points'];
// Each pane's name, set small in its own plane (in a band that is clear on every layer).
const NAMES = ['Axes', 'Shading', 'Guides', 'Curves', 'Tax shift', 'Points'];
const LIT_INK = '#4AA3FF';
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
uniform vec3 uWipe; uniform float uSoft; uniform float uSheen;
float coc() { return uAperture > 0.0 ? min(uMaxBlur, uAperture * abs(1.0 / uFocus - 1.0 / vDepth)) : 0.0; }
float wipeS(vec2 uv) { return dot(uv - 0.5, uWipe.xy); }
float glass(vec2 uv) { return 1.0 - smoothstep(uWipe.z - uSoft, uWipe.z + uSoft, wipeS(uv)); }
float band(vec2 uv) { float d = (wipeS(uv) - uWipe.z) / uSoft; return exp(-d * d * 1.6); }
// The card's paper (linear) and the light of the band over it.
float paperOf(float g) { return pow(1.0 - g, 2.2); }
float lightOf(vec2 uv, float g) { return paperOf(g) + 0.35 * band(uv) * uSheen; }`;

const CARD = /* glsl */ `
${COMMON}
uniform float uOpacity; varying vec2 vUv;
void main() {
  float g = glass(vUv);
  float paper = paperOf(g);
  float b = band(vUv) * uSheen;
  float a = clamp(paper + 0.35 * b, 0.0, 1.0) * uOpacity;
  if (a < 1e-5) discard;
  vec3 c = vec3(paper) + vec3(1.0, 0.97, 0.93) * 0.35 * b;
  gl_FragColor = vec4(c * uOpacity, a);
}`;

// Ink: dark texels take the ink colour, white texels (label halos) the card's colour and
// vanish with it in the glass state. The ink is dark on light paper and light on dark
// glass, flipping where the local paper (with the band's light) crosses mid-grey, so a
// line never matches the page behind it. `uLit` turns it to the accent (a selected layer).
const INK = /* glsl */ `
${COMMON}
uniform sampler2D tMap; uniform float uOpacity; uniform vec3 uInk; uniform vec3 uInkGlass;
uniform vec3 uLitInk; uniform float uLit; varying vec2 vUv;
void main() {
  // Sharp and blurred are blended over a band of radii, never switched: a switch pops the
  // whole layer on the frame its circle of confusion crosses the threshold.
  float r = coc();
  vec2 px = fwidth(vUv);
  vec4 c = texture2D(tMap, vUv);
  float w = smoothstep(0.35, 1.2, r);
  if (w > 0.0) {
    float bias = log2(max(1.0, r * 0.5));
    vec4 b = vec4(0.0);
    for (int i = 0; i < 12; i++) {
      float k = (float(i) + 0.5) / 12.0;
      float ang = float(i) * 2.39996323;
      b += texture2D(tMap, vUv + vec2(cos(ang), sin(ang)) * sqrt(k) * r * px, bias);
    }
    c = mix(c, b / 12.0, w);
  }
  float g = glass(vUv);
  float lum = c.a > 0.0 ? clamp(dot(c.rgb, vec3(0.3333)) / c.a, 0.0, 1.0) : 0.0;
  float a = c.a * uOpacity * mix(1.0, 1.0 - lum, g);
  if (a < 1e-5) discard;
  // A step (anti-aliased, ~1 px) where the paper passes sRGB 0.5: no strip of ink ever
  // matches the paper around it.
  float light = lightOf(vUv, g);
  float fw = max(fwidth(light), 1e-4);
  float flip = smoothstep(-fw, fw, 0.214 - light);
  vec3 glassInk = mix(uInkGlass, uLitInk, uLit);
  vec3 ink = mix(uInk, mix(vec3(1.0), glassInk, smoothstep(0.55, 1.0, g)), flip);
  gl_FragColor = vec4(mix(ink, vec3(min(1.0, light)), lum) * a, a);
}`;

// A glass pane: a faint sheet whose hairline edge catches the light, brighter at the top.
const PANE = /* glsl */ `
${COMMON}
uniform vec2 uSize; uniform float uRadius; uniform float uOpacity; uniform float uGlint; uniform float uLit; varying vec2 vUv;
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
  float light = (0.16 + 0.22 * uLit) * top * edge + inside * (0.0042 + 0.0154 * glint);
  float a = light * uOpacity;
  if (a < 1e-5) discard; // near black even 0.002 is a visible step
  // A lit pane's hairline takes the accent.
  gl_FragColor = vec4(a * mix(vec3(1.0), vec3(0.45, 0.72, 1.0), uLit * edge), 0.0);
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

/** A pane's name: dark text on clear (the ink shader colours it), 512×128. */
function labelTexture(text) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  g.font = '600 56px -apple-system, "SF Pro Text", system-ui, sans-serif';
  g.letterSpacing = '0.5px';
  g.fillStyle = '#000';
  g.textBaseline = 'middle';
  g.fillText(text, 6, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  return tex;
}

/** Loads the layers and builds the stack; `width` in world units. */
export async function diagramStack(ctx, { width = 2 } = {}) {
  const height = width / ASPECT;
  const group = new THREE.Group();
  group.name = 'diagram-stack';
  const maps = await Promise.all(LAYERS.map((n) => ctx.load.texture(`layer-${n}`)));

  const shared = {
    uFocus: { value: 5 }, uAperture: { value: 0 }, uMaxBlur: { value: 8 },
    uWipe: { value: new THREE.Vector3(Math.SQRT1_2, -Math.SQRT1_2, -2) }, uSoft: { value: 0.06 }, uSheen: { value: 1 },
  };
  const geo = new THREE.PlaneGeometry(width, height);
  const cardMat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: CARD,
    uniforms: { ...shared, uOpacity: { value: 1 } },
    ...blend,
  });
  const card = new THREE.Mesh(geo, cardMat);
  card.renderOrder = 3; // over the window (2), whose canvas it takes over
  group.add(card);

  const inkMat = (map, lit) => new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: INK,
    uniforms: {
      ...shared, tMap: { value: map }, uOpacity: { value: 1 }, uInk: { value: new THREE.Color(0, 0, 0) },
      uInkGlass: { value: new THREE.Color(1, 1, 1) }, uLitInk: { value: new THREE.Color(lit) }, uLit: { value: 0 },
    },
    ...blend,
  });
  const LABEL_H = 0.075 * width;
  const labelGeo = new THREE.PlaneGeometry(4 * LABEL_H, LABEL_H);
  const panes = [], layers = [], labels = [];
  maps.forEach((map, i) => {
    const pane = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: PANE,
      uniforms: { ...shared, uSize: { value: new THREE.Vector2(width, height) }, uRadius: { value: 0.028 * width }, uOpacity: { value: 0 }, uGlint: { value: 0 }, uLit: { value: 0 } },
      ...blend,
    }));
    pane.renderOrder = 10 + 3 * i;
    const ink = new THREE.Mesh(geo, inkMat(map, LIT_INK));
    ink.renderOrder = 11 + 3 * i;
    const label = new THREE.Mesh(labelGeo, inkMat(labelTexture(NAMES[i]), LIT_INK));
    label.renderOrder = 12 + 3 * i;
    label.position.set(-width / 2 + 0.32 * width + 2 * LABEL_H, height / 2 - 0.065 * height, 0);
    group.add(pane, ink, label);
    panes.push(pane);
    layers.push(ink);
    labels.push(label);
  });

  const api = {
    group, card, layers, panes, labels, width, height,
    /**
     * `opacity`: the ink (and panes); `card`: the white card beneath it (default `opacity`).
     * `spread`: each layer's height above the card (world units, index as LAYERS).
     * `wipe` 0..1 carries the band across the card (0 paper, 1 glass); `soft` its width
     * (uv), `sheen` its light; `glassInk`: per-layer THREE.Color (linear) for the glass
     * state; `panes` 0..1 glass sheets; `glint` -1..1 where the panes' sheen sits;
     * `lit` per-layer 0..1 (accent ink, bright edge), `dim` 0..1 how far the unlit layers
     * fade, `labels` per-layer 0..1 name opacity; `dof` { focus, aperture (px), maxBlur (px) }.
     */
    set({ spread = null, opacity = 1, card: cardOp = opacity, wipe = 0, soft = 0.06, sheen = 1, glassInk = null, panes: glass = 0, glint = 0, lit = null, dim = 0, labels: names = null, dof: d = null } = {}) {
      // The band travels from wholly off one corner (band light included) to wholly off
      // the other, so both ends are continuous; beyond them it is parked.
      const reach = 0.72 + 2.5 * soft;
      shared.uSoft.value = soft;
      shared.uWipe.value.z = wipe <= 0 ? -reach - 1 : wipe >= 1 ? reach + 1 : reach * (2 * wipe - 1);
      shared.uSheen.value = sheen;
      cardMat.uniforms.uOpacity.value = cardOp;
      card.visible = cardOp > 0.001 && wipe < 1;
      shared.uFocus.value = d?.focus ?? 5;
      shared.uAperture.value = d?.aperture ?? 0;
      shared.uMaxBlur.value = d?.maxBlur ?? 8;
      layers.forEach((m, i) => {
        const h = spread ? spread[i] : 0;
        const li = lit ? lit[i] : 0;
        m.position.z = 0.0012 + h;
        panes[i].position.z = 0.0006 + h;
        labels[i].position.z = 0.0009 + h;
        const u = m.material.uniforms;
        u.uOpacity.value = opacity * (1 - dim * (1 - li));
        u.uLit.value = li;
        if (glassInk) u.uInkGlass.value.copy(glassInk[i]);
        m.visible = opacity > 0.001;
        const pu = panes[i].material.uniforms;
        pu.uOpacity.value = glass * opacity;
        pu.uGlint.value = glint;
        pu.uLit.value = li;
        panes[i].visible = glass * opacity > 0.001;
        const lu = labels[i].material.uniforms;
        const lo = (names ? names[i] : 0) * opacity;
        lu.uOpacity.value = lo;
        lu.uLit.value = li;
        if (glassInk) lu.uInkGlass.value.copy(glassInk[i]);
        labels[i].visible = lo > 0.001;
      });
    },
    dispose() {
      geo.dispose();
      labelGeo.dispose();
      cardMat.dispose();
      for (const m of [...layers, ...panes, ...labels]) m.material.dispose();
      for (const m of labels) m.material.uniforms.tMap.value.dispose();
    },
  };
  group.userData.dispose = api.dispose;
  api.set({});
  return api;
}
