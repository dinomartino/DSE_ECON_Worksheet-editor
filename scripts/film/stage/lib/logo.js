// The mark in 3D, from design/icons/13-equilibrium-axes.svg (512 grid → tile 2 units wide,
// face at z = 0, +z towards the viewer). Parts pose independently; strokes and axis draw
// on (0 → 1). The dot is emissive HDR so it alone blooms.
import * as THREE from 'three';
import { filmic, patch } from './tonemap.js';

const U = (x) => (x - 256) / 256;
const V = (y) => (256 - y) / 256;

export const ICON = {
  tile: '#3A342E',
  cream: '#FCFAF6',
  dot: '#1E7FD4',
  glow: '#4AA3FF',
  radius: 114 / 256,
  // Strokes in draw order (start → end).
  supply: [[U(150), V(362)], [U(362), V(150)]],
  demand: [[U(150), V(150)], [U(362), V(362)]],
  strokeR: 15 / 256,
  axisCorner: [U(118), V(394)],
  axisTop: [U(118), V(106)],
  axisRight: [U(406), V(394)],
  axisR: 10 / 256,
  axisOpacity: 0.34,
  ringR: 46 / 256,
  dotR: 30 / 256,
};

const STROKE_Z = 0.62; // cross-section flattening of the strokes (a raised rounded bar)
const PUCK_H = 0.074;

function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, 1.5 * Math.PI, false);
  return s;
}

/** A capsule bar from a to b that draws on: set(p) shows the first p of it. */
function strokeBar(a, b, r, material) {
  const group = new THREE.Group();
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 48, 1, true), material);
  body.geometry.rotateZ(-Math.PI / 2).translate(0.5, 0, 0); // along +x, 0..1
  const capGeo = new THREE.SphereGeometry(r, 48, 24);
  const c0 = new THREE.Mesh(capGeo, material);
  const c1 = new THREE.Mesh(capGeo, material);
  group.add(body, c0, c1);
  group.position.set(a[0], a[1], r * STROKE_Z * 0.55);
  group.rotation.z = Math.atan2(dy, dx);
  group.scale.set(1, 1, STROKE_Z);
  group.userData.set = (p) => {
    const q = Math.min(1, Math.max(0, p));
    group.visible = q > 1e-4;
    body.scale.x = Math.max(1e-4, q * len);
    c1.position.x = q * len;
  };
  group.userData.set(1);
  return group;
}

// Face decals: soft occlusion under the raised parts (multiplied) and the axis L (34%
// cream), both as SDFs so they follow the draw-on exactly.
const DECAL_VERT = /* glsl */ `
varying vec2 vP;
void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const SDF = /* glsl */ `
float seg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
  return length(pa - ba * h);
}
uniform vec2 uS0; uniform vec2 uS1; uniform float uSp;
uniform vec2 uD0; uniform vec2 uD1; uniform float uDp;
uniform vec2 uAc; uniform vec2 uAt; uniform vec2 uAr; uniform float uAp;
uniform float uPuck;
float strokes(vec2 p, float r) {
  float d = 1e3;
  if (uSp > 1e-4) d = min(d, seg(p, uS0, mix(uS0, uS1, uSp)) - r);
  if (uDp > 1e-4) d = min(d, seg(p, uD0, mix(uD0, uD1, uDp)) - r);
  return d;
}
float axisL(vec2 p, float r) {
  if (uAp <= 1e-4) return 1e3;
  return min(seg(p, uAc, mix(uAc, uAt, uAp)), seg(p, uAc, mix(uAc, uAr, uAp))) - r;
}`;

const AO_FRAG = /* glsl */ `
${SDF}
uniform float uStrength; uniform float uStrokeR; uniform float uRingR; uniform float uFace;
varying vec2 vP;
void main() {
  float d = strokes(vP, uStrokeR);
  if (uPuck > 1e-3) d = min(d, length(vP) - uRingR * uPuck);
  float ao = uStrength * exp(-max(d, 0.0) * max(d, 0.0) / 0.0016) * step(-0.02, d);
  gl_FragColor = vec4(vec3(1.0 - ao * uFace), 1.0);
}`;

const AXIS_FRAG = /* glsl */ `
${SDF}
uniform vec3 uColor; uniform float uOpacity; uniform float uAxisR;
varying vec2 vP;
void main() {
  float d = axisL(vP, uAxisR);
  float aa = fwidth(d) * 0.8;
  float a = (1.0 - smoothstep(-aa, aa, d)) * uOpacity;
  if (a < 1e-4) discard;
  gl_FragColor = vec4(uColor * a, a);
}`;

/** Emissive HDR dot: a flattened sphere with a slightly brighter core. */
function dotMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(ICON.dot) }, uGlow: { value: 1 }, uHot: { value: new THREE.Color(ICON.glow) } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform vec3 uHot; uniform float uGlow; varying vec3 vN; varying vec3 vV;
      void main() {
        float f = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
        vec3 c = mix(uColor, uHot, 0.35 * f) * (0.72 + 0.28 * f) * uGlow;
        c += uHot * pow(f, 18.0) * 0.25 * uGlow;
        gl_FragColor = vec4(c, 1.0);
      }`,
    toneMapped: false,
  });
}

// The light sweep: a soft diagonal band of light gliding across the tile and strokes in
// logo space (a studio sheen, controllable to the frame), brighter on grazing surfaces.
function sweepable(material, u) {
  return patch(material, 'sweep', (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 uLogoInv; varying vec3 vLogoP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLogoP = (uLogoInv * modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uSweepP; uniform float uSheen; uniform vec2 uSweepDir; uniform float uSweepW; uniform float uSweepAmt; uniform vec3 uSweepColor;
varying vec3 vLogoP;`)
      .replace('#include <opaque_fragment>', `{
  float sp = dot(vLogoP.xy, uSweepDir);
  float band = exp(-pow((sp - uSweepP) / uSweepW, 2.0)) + 0.35 * exp(-pow((sp - uSweepP + 0.34) / (uSweepW * 0.45), 2.0));
  float facing = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
  outgoingLight += uSweepColor * band * uSweepAmt * mix(1.0, 2.2, pow(1.0 - facing, 2.0));
  outgoingLight += uSweepColor * uSheen * smoothstep(1.5, -1.5, sp) * facing;
}
#include <opaque_fragment>`);
  });
}

export function createLogo(opts = {}) {
  const depth = opts.depth ?? 0.24;
  const bevel = opts.bevel ?? 0.05;
  const group = new THREE.Group();
  group.name = 'logo';

  // Tile.
  const sweepU = {
    uLogoInv: { value: new THREE.Matrix4() },
    uSweepP: { value: -9 },
    uSweepDir: { value: new THREE.Vector2(0.62, -0.78).normalize() },
    uSweepW: { value: 0.2 },
    uSweepAmt: { value: 0 },
    uSheen: { value: 0.035 },
    uSweepColor: { value: new THREE.Color('#FFF3E6') },
  };
  const tileMat = filmic(sweepable(new THREE.MeshPhysicalMaterial({
    color: ICON.tile,
    roughness: 0.38,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    specularIntensity: 0.5,
    envMapIntensity: 1,
  }), sweepU), opts.exposure ?? 1);
  const shape = roundedRect(2 - 2 * bevel, 2 - 2 * bevel, ICON.radius - bevel);
  const tileGeo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 12,
    curveSegments: 72,
  });
  tileGeo.translate(0, 0, -(depth + bevel));
  tileGeo.computeVertexNormals();
  const tile = new THREE.Mesh(tileGeo, tileMat);
  tile.name = 'tile';
  const syncSweep = () => sweepU.uLogoInv.value.copy(group.matrixWorld).invert();
  const tileRoot = new THREE.Group();
  tileRoot.add(tile);
  group.add(tileRoot);

  // Strokes.
  const creamMat = filmic(sweepable(new THREE.MeshPhysicalMaterial({
    color: ICON.cream,
    emissive: ICON.cream,
    emissiveIntensity: 0.12,
    roughness: 0.4,
    metalness: 0,
    clearcoat: 0.35,
    clearcoatRoughness: 0.2,
    envMapIntensity: 1.1,
  }), sweepU), opts.exposure ?? 1);
  const supply = strokeBar(ICON.supply[0], ICON.supply[1], ICON.strokeR, creamMat);
  const demand = strokeBar(ICON.demand[0], ICON.demand[1], ICON.strokeR, creamMat);
  supply.name = 'supply';
  demand.name = 'demand';
  group.add(supply, demand);

  // Decals.
  const sdfUniforms = {
    uS0: { value: new THREE.Vector2(...ICON.supply[0]) }, uS1: { value: new THREE.Vector2(...ICON.supply[1]) }, uSp: { value: 1 },
    uD0: { value: new THREE.Vector2(...ICON.demand[0]) }, uD1: { value: new THREE.Vector2(...ICON.demand[1]) }, uDp: { value: 1 },
    uAc: { value: new THREE.Vector2(...ICON.axisCorner) }, uAt: { value: new THREE.Vector2(...ICON.axisTop) },
    uAr: { value: new THREE.Vector2(...ICON.axisRight) }, uAp: { value: 1 },
    uPuck: { value: 1 },
  };
  const aoMat = new THREE.ShaderMaterial({
    uniforms: { ...sdfUniforms, uStrength: { value: 0.55 }, uStrokeR: { value: ICON.strokeR }, uRingR: { value: ICON.ringR }, uFace: { value: 1 } },
    vertexShader: DECAL_VERT,
    fragmentShader: AO_FRAG,
    transparent: true,
    blending: THREE.MultiplyBlending,
    premultipliedAlpha: true,
    depthWrite: false,
    toneMapped: false,
  });
  const ao = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), aoMat);
  ao.position.z = 0.0015;
  ao.renderOrder = 1;
  const axisMat = new THREE.ShaderMaterial({
    uniforms: { ...sdfUniforms, uColor: { value: new THREE.Color(ICON.cream) }, uOpacity: { value: ICON.axisOpacity }, uAxisR: { value: ICON.axisR } },
    vertexShader: DECAL_VERT,
    fragmentShader: AXIS_FRAG,
    transparent: true,
    premultipliedAlpha: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    depthWrite: false,
    toneMapped: false,
  });
  const axis = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), axisMat);
  axis.position.z = 0.003;
  axis.renderOrder = 2;
  group.add(ao, axis);

  // Puck (the tile-coloured ring that parts the strokes) and the dot.
  const puck = new THREE.Mesh(new THREE.CylinderGeometry(ICON.ringR, ICON.ringR, PUCK_H, 96, 1, false), tileMat);
  puck.geometry.rotateX(Math.PI / 2).translate(0, 0, PUCK_H / 2);
  group.add(puck);
  const dotMat = dotMaterial();
  const dot = new THREE.Mesh(new THREE.SphereGeometry(ICON.dotR, 64, 32), dotMat);
  dot.scale.z = 0.5;
  dot.position.z = PUCK_H;
  dot.name = 'dot';
  group.add(dot);

  group.traverse((o) => {
    if (o.material === tileMat || o.material === creamMat) o.onBeforeRender = syncSweep;
  });

  const api = {
    group, tile, tileRoot, supply, demand, axis, ao, puck, dot, sweepU,
    materials: { tile: tileMat, cream: creamMat, dot: dotMat, ao: aoMat, axis: axisMat },
    dotRest: new THREE.Vector3(0, 0, PUCK_H),
    /**
     * Pose every part. Omitted keys keep their value. `tile.extrude` 0..1 grows the tile's
     * depth behind the face; `face` 0..1 fades the face occlusion in with the tile.
     */
    set(s = {}) {
      if (s.supply != null) {
        supply.userData.set(s.supply);
        sdfUniforms.uSp.value = Math.min(1, Math.max(0, s.supply));
      }
      if (s.demand != null) {
        demand.userData.set(s.demand);
        sdfUniforms.uDp.value = Math.min(1, Math.max(0, s.demand));
      }
      if (s.axis != null) {
        sdfUniforms.uAp.value = Math.min(1, Math.max(0, s.axis));
        axis.visible = s.axis > 1e-4;
      }
      if (s.tile) {
        const { extrude = 1, scale = 1, visible = true } = s.tile;
        tileRoot.visible = visible && scale > 1e-3;
        tileRoot.scale.set(scale, scale, Math.max(1e-3, extrude));
        aoMat.uniforms.uFace.value = s.tile.face ?? (visible ? 1 : 0);
        ao.visible = tileRoot.visible;
      }
      if (s.puck != null) {
        const k = Math.max(0, s.puck);
        puck.visible = k > 1e-3;
        puck.scale.set(k, k, 1);
        sdfUniforms.uPuck.value = k;
      }
      if (s.dot) {
        const d = s.dot;
        if (d.position) dot.position.set(...d.position);
        if (d.scale != null) {
          dot.visible = d.scale > 1e-4;
          dot.scale.set(d.scale, d.scale, d.scale * 0.5);
        }
        if (d.glow != null) dotMat.uniforms.uGlow.value = d.glow;
      }
      if (s.sweep !== undefined) {
        // p 0 → 1 carries the band from the top-left corner to the bottom-right one.
        const w = s.sweep ?? { amount: 0 };
        sweepU.uSweepP.value = -1.6 + 3.2 * (w.p ?? 0);
        sweepU.uSweepAmt.value = w.amount ?? 0;
        if (w.width != null) sweepU.uSweepW.value = w.width;
      }
    },
    dispose() {
      group.traverse((o) => {
        o.geometry?.dispose();
      });
      for (const m of Object.values(api.materials)) m.dispose();
    },
  };
  group.userData.dispose = api.dispose;
  return api;
}
