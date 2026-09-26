// A sheet of A4 paper: unlit (white stays white), subdivided so it can bend and curl,
// with an optional thickness edge and a soft contact shadow. Spec: FILM.md §5.5.
import * as THREE from 'three';
import { patch } from './tonemap.js';
import { contactShadow } from './floor.js';

export const A4 = 297 / 210;

const BEND_VERT = `
float xn = position.x / (uW * 0.5);
float yn = position.y / (uH * 0.5);
float cx = clamp((xn - 0.2) / 0.8, 0.0, 1.0), cy = clamp((-yn - 0.2) / 0.8, 0.0, 1.0);
transformed.z += uBend * (xn * xn - 1.0) + uCurl * pow(cx * cy, 2.0);
vShadeK = uBend * 2.0 * xn / (uW * 0.5) + uCurl * 1.5 * cx * cy;`;

function bendable(material, uniforms, key, frag) {
  return patch(material, key, (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
uniform float uBend; uniform float uCurl; uniform float uW; uniform float uH; varying float vShadeK;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>${BEND_VERT}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uShade; uniform vec3 uBack; varying float vShadeK;`)
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>\n${frag}`);
  });
}

/**
 * `width` in world units (height = width × √2). `map` is a sheet texture (sRGB) or null
 * for blank paper. set({ bend, curl, shade }) poses it: bend sags the sheet across its
 * width, curl lifts the bottom-right corner; both in world units along z.
 */
export function sheet({ map = null, width = 1, segments = [24, 34], edge = true, shadow = true, shadowOpacity = 0.18, shadowBlur = 0.06, shadowOffset = [0.02, -0.035], back = '#EFEDE8' } = {}) {
  const h = width * A4;
  const group = new THREE.Group();
  group.name = 'sheet';
  const uniforms = {
    uBend: { value: 0 },
    uCurl: { value: 0 },
    uShade: { value: 0.05 },
    uW: { value: width },
    uH: { value: h },
    uBack: { value: new THREE.Color(back) },
  };
  const material = bendable(
    new THREE.MeshBasicMaterial({ map, color: '#FFFFFF', side: THREE.DoubleSide, toneMapped: false }),
    uniforms,
    'paper',
    `float shade = 1.0 - uShade * clamp(abs(vShadeK) * 4.0, 0.0, 1.0);
gl_FragColor.rgb = gl_FrontFacing ? gl_FragColor.rgb * shade : uBack * shade;`,
  );
  const face = new THREE.Mesh(new THREE.PlaneGeometry(width, h, ...segments), material);
  face.name = 'face';
  group.add(face);

  let edgeMesh = null;
  if (edge) {
    const edgeMat = bendable(new THREE.MeshBasicMaterial({ color: '#D9D4CB', toneMapped: false }), uniforms, 'paperEdge', '');
    edgeMesh = new THREE.Mesh(new THREE.PlaneGeometry(width + 0.004, h + 0.004, ...segments), edgeMat);
    edgeMesh.position.z = -0.0025;
    group.add(edgeMesh);
  }
  let shadowMesh = null;
  if (shadow) {
    shadowMesh = contactShadow({ w: width, h, radius: 0.004, blur: shadowBlur, opacity: shadowOpacity });
    shadowMesh.position.set(shadowOffset[0], shadowOffset[1], -0.02);
    group.add(shadowMesh);
  }

  const api = {
    group, face, material, edge: edgeMesh, shadow: shadowMesh, width, height: h,
    set({ bend, curl, shade, map: m, opacity, shadowOpacity: so } = {}) {
      if (bend != null) uniforms.uBend.value = bend;
      if (curl != null) uniforms.uCurl.value = curl;
      if (shade != null) uniforms.uShade.value = shade;
      if (m !== undefined && m !== material.map) {
        const had = !!material.map;
        material.map = m;
        if (had !== !!m) material.needsUpdate = true;
      }
      if (opacity != null) {
        material.transparent = opacity < 1;
        material.opacity = opacity;
      }
      if (so != null && shadowMesh) shadowMesh.material.opacity = so;
    },
    dispose() {
      face.geometry.dispose();
      material.dispose();
      edgeMesh?.geometry.dispose();
      edgeMesh?.material.dispose();
      shadowMesh?.userData.dispose();
    },
  };
  group.userData.dispose = api.dispose;
  return api;
}
