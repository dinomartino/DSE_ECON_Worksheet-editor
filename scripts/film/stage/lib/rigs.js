// Lighting presets per world (FILM.md §4): night is a dark studio (one soft key, a cool
// rim, softbox reflections from a generated environment); day is warm and open.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

function panel(w, h, color, intensity, pos, look) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }),
  );
  m.position.set(...pos);
  m.lookAt(...look);
  return m;
}

/**
 * A dark studio environment, prefiltered for PBR: a soft gradient card behind the camera
 * (the sheen on glossy faces), an overhead softbox (top edges), a cool strip on the left
 * and a white rim strip behind right, in an otherwise black room.
 */
export function studioEnv(renderer, { key = 2.6, card = 1.0, strip = 1.2, rim = 2.0 } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#000000');
  scene.add(panel(14, 2.2, '#FFF6EC', 1.6 * card, [0, 3.6, 9], [0, 1.2, 0])); // card, bright top band
  scene.add(panel(14, 2.4, '#F4EEE6', 0.45 * card, [0, 1.3, 9.5], [0, 1.2, 0])); // card, soft lower band
  scene.add(panel(9, 5, '#FFF8F0', key, [0, 8, 1], [0, 0, 0])); // overhead softbox
  scene.add(panel(1.2, 8, '#D8E6FF', strip, [-9, 1.5, 1], [0, 1, 0])); // left strip
  scene.add(panel(1.4, 8, '#FFFFFF', rim, [8, 2, -4], [0, 1, 0])); // right rim strip
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0.03, 0.1, 100);
  pmrem.dispose();
  scene.traverse((o) => {
    o.geometry?.dispose();
    o.material?.dispose();
  });
  return rt;
}

/** A bright neutral room for the day world. */
export function roomEnv(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const rt = pmrem.fromScene(room, 0.04);
  pmrem.dispose();
  room.traverse((o) => {
    o.geometry?.dispose();
    o.material?.dispose?.();
  });
  return rt;
}

/**
 * Night rig: environment + a soft area key (top-left-front) + a cool rim from behind.
 * Returns { env, key, rim, fill, set({ key, rim, env }) } — intensities scale the defaults.
 */
export function night(ctx, opts = {}) {
  const env = studioEnv(ctx.renderer, opts.env);
  ctx.scene.environment = env.texture;
  ctx.scene.environmentIntensity = opts.envIntensity ?? 0.9;
  const key = new THREE.RectAreaLight('#FFF9F2', opts.key ?? 2.6, 10, 4.5);
  key.position.set(-1.5, 5, 6.5);
  key.lookAt(0, 0, 0);
  const rim = new THREE.DirectionalLight('#C9DCFF', opts.rim ?? 1.2);
  rim.position.set(5, 3, -6);
  const fill = new THREE.HemisphereLight('#28241F', '#000000', opts.fill ?? 0.3);
  const front = new THREE.DirectionalLight('#FFF7EE', opts.front ?? 0.7);
  front.position.set(0.8, 1.2, 8);
  ctx.scene.add(key, rim, rim.target, fill, front, front.target);
  const base = { key: key.intensity, rim: rim.intensity, fill: fill.intensity, front: front.intensity, env: ctx.scene.environmentIntensity };
  return {
    env, key, rim, fill, front,
    set(s = {}) {
      if (s.key != null) key.intensity = base.key * s.key;
      if (s.rim != null) rim.intensity = base.rim * s.rim;
      if (s.fill != null) fill.intensity = base.fill * s.fill;
      if (s.front != null) front.intensity = base.front * s.front;
      if (s.env != null) ctx.scene.environmentIntensity = base.env * s.env;
    },
    dispose() {
      env.dispose();
    },
  };
}

/** Day rig: bright room environment, warm sky light and a soft sun. */
export function day(ctx, opts = {}) {
  const env = roomEnv(ctx.renderer);
  ctx.scene.environment = env.texture;
  ctx.scene.environmentIntensity = opts.envIntensity ?? 0.8;
  const hemi = new THREE.HemisphereLight('#FFF8EE', '#D9CFC0', opts.hemi ?? 1.1);
  const sun = new THREE.DirectionalLight('#FFF4E4', opts.sun ?? 1.6);
  sun.position.set(-4, 8, 6);
  ctx.scene.add(hemi, sun, sun.target);
  return {
    env, hemi, sun,
    set(s = {}) {
      if (s.hemi != null) hemi.intensity = (opts.hemi ?? 1.1) * s.hemi;
      if (s.sun != null) sun.intensity = (opts.sun ?? 1.6) * s.sun;
    },
    dispose() {
      env.dispose();
    },
  };
}
