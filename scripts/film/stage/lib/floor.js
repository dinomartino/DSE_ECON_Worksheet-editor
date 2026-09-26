// Floors. Night: glossy black with a blurred mirror reflection that fades out away from
// the subject. Day: soft contact shadows (a blurred shape under an object).
import * as THREE from 'three';
import { makeTarget } from '../post.js';

const FLOOR_VERT = /* glsl */ `
uniform mat4 uTexMatrix; varying vec4 vRefl; varying vec3 vWorld;
void main() {
  vRefl = uTexMatrix * vec4(position, 1.0);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FLOOR_FRAG = /* glsl */ `
uniform sampler2D tRefl; uniform vec3 uColor; uniform float uReflect; uniform vec2 uCenter;
uniform float uNear; uniform float uFar; uniform float uOpacity; uniform vec3 uSheen; uniform float uSheenR;
varying vec4 vRefl; varying vec3 vWorld;
void main() {
  vec3 refl = textureProj(tRefl, vRefl).rgb;
  vec3 v = normalize(cameraPosition - vWorld);
  float fres = 0.18 + 0.82 * pow(1.0 - clamp(v.y, 0.0, 1.0), 4.0);
  float dist = length(vWorld.xz - uCenter);
  float fade = 1.0 - smoothstep(uNear, uFar, dist);
  float sheen = exp(-dist * dist / (uSheenR * uSheenR));
  vec3 c = uColor + uSheen * sheen + refl * uReflect * fres;
  gl_FragColor = vec4(c * fade * uOpacity, fade * uOpacity);
}`;

/**
 * Glossy night floor at height y. Call `floor.prepass(renderer, scene, camera, fx)` before
 * each render (the engine does this for anything registered with ctx.onPrepass).
 * Objects with userData.noReflect are left out of the reflection.
 */
export function nightFloor({ W, H, y = 0, size = 80, color = '#030303', reflect = 0.5, blur = 5, near = 1.5, far = 7, center = [0, 0], res = 0.5, sheen = '#0B0907', sheenR = 3 } = {}) {
  const rw = Math.round(W * res), rh = Math.round(H * res);
  const target = makeTarget(rw, rh, { depthBuffer: true, samples: 4 });
  const blurA = makeTarget(rw, rh);
  const blurB = makeTarget(rw, rh);
  const texMatrix = new THREE.Matrix4();
  const material = new THREE.ShaderMaterial({
    vertexShader: FLOOR_VERT,
    fragmentShader: FLOOR_FRAG,
    uniforms: {
      tRefl: { value: blurB.texture },
      uTexMatrix: { value: texMatrix },
      uColor: { value: new THREE.Color(color) },
      uReflect: { value: reflect },
      uCenter: { value: new THREE.Vector2(...center) },
      uNear: { value: near },
      uFar: { value: far },
      uOpacity: { value: 1 },
      uSheen: { value: new THREE.Color(sheen) },
      uSheenR: { value: sheenR },
    },
    transparent: true,
    premultipliedAlpha: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  mesh.renderOrder = -10;
  mesh.name = 'floor';
  mesh.userData.noReflect = true;

  const mirror = new THREE.PerspectiveCamera();
  const normal = new THREE.Vector3(), view = new THREE.Vector3(), target3 = new THREE.Vector3();
  const lookAt = new THREE.Vector3(), rot = new THREE.Matrix4(), plane = new THREE.Plane();
  const clip = new THREE.Vector4(), q = new THREE.Vector4(), camPos = new THREE.Vector3(), floorPos = new THREE.Vector3();
  const hidden = [];

  const api = {
    mesh,
    material,
    blur,
    prepass(renderer, scene, camera, fx) {
      if (!mesh.visible || material.uniforms.uOpacity.value <= 0) return;
      mesh.updateMatrixWorld();
      camera.updateMatrixWorld();
      floorPos.setFromMatrixPosition(mesh.matrixWorld);
      camPos.setFromMatrixPosition(camera.matrixWorld);
      rot.extractRotation(mesh.matrixWorld);
      normal.set(0, 0, 1).applyMatrix4(rot);
      view.subVectors(floorPos, camPos);
      if (view.dot(normal) > 0) return;
      view.reflect(normal).negate().add(floorPos);
      rot.extractRotation(camera.matrixWorld);
      lookAt.set(0, 0, -1).applyMatrix4(rot).add(camPos);
      target3.subVectors(floorPos, lookAt).reflect(normal).negate().add(floorPos);
      mirror.position.copy(view);
      mirror.up.set(0, 1, 0).applyMatrix4(rot).reflect(normal);
      mirror.lookAt(target3);
      mirror.far = camera.far;
      mirror.updateMatrixWorld();
      mirror.projectionMatrix.copy(camera.projectionMatrix);
      texMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
      texMatrix.multiply(mirror.projectionMatrix).multiply(mirror.matrixWorldInverse).multiply(mesh.matrixWorld);
      // Oblique near plane at the floor (Lengyel), so nothing below it reflects.
      plane.setFromNormalAndCoplanarPoint(normal, floorPos).applyMatrix4(mirror.matrixWorldInverse);
      clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
      const p = mirror.projectionMatrix.elements;
      q.x = (Math.sign(clip.x) + p[8]) / p[0];
      q.y = (Math.sign(clip.y) + p[9]) / p[5];
      q.z = -1;
      q.w = (1 + p[10]) / p[14];
      clip.multiplyScalar(2 / clip.dot(q));
      p[2] = clip.x;
      p[6] = clip.y;
      p[10] = clip.z + 1 - 0.003;
      p[14] = clip.w;

      hidden.length = 0;
      scene.traverseVisible((o) => {
        if (o.userData.noReflect) hidden.push(o);
      });
      for (const o of hidden) o.visible = false;
      const bg = scene.background;
      scene.background = null;
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x000000, 1);
      renderer.clear(true, true, false);
      renderer.render(scene, mirror);
      scene.background = bg;
      for (const o of hidden) o.visible = true;
      fx.blur(target.texture, api.blur, blurB, blurA, rw, rh);
    },
    set({ opacity, reflect: r, center: c, near: n, far: f } = {}) {
      const u = material.uniforms;
      if (opacity != null) u.uOpacity.value = opacity;
      if (r != null) u.uReflect.value = r;
      if (c) u.uCenter.value.set(...c);
      if (n != null) u.uNear.value = n;
      if (f != null) u.uFar.value = f;
    },
    dispose() {
      target.dispose();
      blurA.dispose();
      blurB.dispose();
      material.dispose();
      mesh.geometry.dispose();
    },
  };
  mesh.userData.dispose = api.dispose;
  return api;
}

/** A soft blurred-rectangle texture (alpha in all channels), for contact shadows. */
export function softRectTexture({ w = 1, h = 1, radius = 0.04, blur = 0.08, res = 256 } = {}) {
  const pad = blur * 2.5;
  const cw = Math.round(res * (w + 2 * pad)), ch = Math.round(res * (h + 2 * pad));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const g = canvas.getContext('2d');
  g.filter = `blur(${blur * res}px)`;
  g.fillStyle = '#fff';
  g.beginPath();
  g.roundRect(pad * res, pad * res, w * res, h * res, radius * res);
  g.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.userData.pad = pad;
  return tex;
}

/**
 * A contact shadow quad for an object of size w×h (world units), lying in the XY plane.
 * Day-world ink: warm rgba(58,52,46,.18) by default.
 */
export function contactShadow({ w = 1, h = 1, radius = 0.04, blur = 0.08, color = '#3A342E', opacity = 0.18, res = 128 } = {}) {
  const tex = softRectTexture({ w, h, radius, blur, res });
  const pad = tex.userData.pad;
  const material = new THREE.MeshBasicMaterial({
    color,
    alphaMap: tex,
    transparent: true,
    opacity,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w + 2 * pad, h + 2 * pad), material);
  mesh.name = 'contactShadow';
  mesh.userData.dispose = () => {
    tex.dispose();
    material.dispose();
    mesh.geometry.dispose();
  };
  return mesh;
}
