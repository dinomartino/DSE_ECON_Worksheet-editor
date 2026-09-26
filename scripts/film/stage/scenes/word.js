// word — bars 32–36, night (FILM.md §3). The breakdown: one sheet — the real exported
// .docx page — alone in darkness, a pool of light and a slow light band crossing it; "A
// real Word document." On the 66.0 riser it turns to face us and the light comes up; the
// camera rushes in and on the 68.0 drop a document window snaps shut around the page
// (still the LibreOffice render of the exported .docx). Facts on 69.0, 70.0, 71.0.
import { COPY } from '../../timeline.mjs';
import { cubicBezier } from '../lib/ease.js';
import { docWindow, DOC } from './word/docWindow.js';

const C = COPY.word;

// Scene seconds (film − 64).
const T = {
  sweep: [0.0, 3.2],
  headline: 0.6,
  headlineOut: 2.9,
  turn: [1.9, 3.3],
  lit: [2.3, 3.55],
  move: [3.08, 3.97],
  snap: 3.9,
  facts: [5.0, 6.0, 7.0],
};

const YAW = 0.2; // the window turns toward the facts
const SHEET0 = { pos: [0.1, 0.35, 0.3], rot: [-0.04, -0.62, 0.012] }; // breakdown pose, window-group local
const FACT_X = 1310;
const FACT_Y = [428, 540, 652];
const rush = cubicBezier(0.5, 0, 0.18, 1); // from rest, fast through the middle, long landing

const scene = {
  id: 'word',
  world: 'night',
  async setup(ctx) {
    const { lib, scene, THREE } = ctx;
    const s = (ctx.state = {});
    const map = await ctx.load.texture(DOC.texture);
    s.doc = docWindow(lib, map);
    s.doc.group.rotation.y = YAW;
    scene.add(s.doc.group);
    s.floor = lib.floor.nightFloor({ W: ctx.renderW, H: ctx.renderH, y: -1.2, reflect: 0.22, blur: 12 * (ctx.renderH / 1080), near: 0.6, far: 5.5, sheenR: 3.2 });
    scene.add(s.floor.mesh);
    ctx.onPrepass((...a) => s.floor.prepass(...a), { once: true });
    s.dust = lib.particles.dust({
      count: 120, seed: 32, H: ctx.renderH,
      box: [[-10, -2, -16], [10, 6, 3]], size: 0.012, aperture: 0.2, bright: 0.6, drift: 0.2, rise: 0.012, minPx: 5,
    });
    scene.add(s.dust.mesh);
    // The breakdown target: where the sheet stands before it moves.
    const probe = new THREE.Object3D();
    probe.position.set(...SHEET0.pos);
    s.doc.group.add(probe);
    s.doc.group.updateMatrixWorld(true);
    s.target0 = probe.getWorldPosition(new THREE.Vector3()).toArray();
    s.doc.group.remove(probe);
    s.tmp = new THREE.Vector3();

    const T_ = lib.type;
    s.headline = T_.headline(ctx.el, { en: C.headline, zh: C.headlineZh, y: 900, size: 104, world: 'night' });
    s.facts = C.facts.map((en, i) => T_.headline(ctx.el, { en, x: FACT_X, y: FACT_Y[i], size: 74, align: 'left', world: 'night' }));
  },

  update(t, ctx) {
    const { lib, camera, post } = ctx;
    const { ease: E, camera: cam } = lib;
    const s = ctx.state;
    const { win, sheet, L } = s.doc;

    // --- the sheet: turns to face us, then rushes into its slot ------------------------
    const turn = E.sineInOut(E.seg(t, T.turn[0], T.turn[1]));
    const m = rush(E.seg(t, T.move[0], T.move[1]));
    const slot = L.slot;
    const p0 = SHEET0.pos;
    sheet.mesh.position.set(E.lerp(p0[0], slot[0], m), E.lerp(p0[1], slot[1], m), E.lerp(p0[2], slot[2], m));
    sheet.mesh.position.y += 0.018 * Math.sin(t * 1.1) * (1 - turn); // a breath of float while alone
    const r = 1 - turn;
    sheet.mesh.rotation.set(SHEET0.rot[0] * r, SHEET0.rot[1] * r, SHEET0.rot[2] * r);

    const find = E.sineOut(E.seg(t, 0, 1.2)); // the light finds the page after the cut
    const swU = E.seg(t, T.sweep[0], T.sweep[1]);
    const lit = E.sineInOut(E.seg(t, T.lit[0], T.lit[1]));
    sheet.set({
      base: 0.003,
      pool: [0.5, 0.68, 0.3 + 0.05 * find, 0.07 + 0.12 * find],
      band: [E.lerp(-0.62, 0.9, E.sineInOut(swU)), 0.15, 0.85 * Math.sin(Math.PI * swU) ** 0.6],
      lit,
    });

    // --- the window closes in from beyond the frame and settles around the page ----------
    const snap = E.spring(t - T.snap, { freq: 2.0, damping: 0.74 });
    const scale = E.lerp(1.34, 1, snap);
    win.group.scale.setScalar(scale);
    win.group.visible = t > T.snap;
    win.set({ opacity: E.sineOut(E.seg(t, T.snap, T.snap + 0.14)) });
    const bottom = L.bottom * scale - sheet.mesh.position.y; // window bottom in sheet-local y
    sheet.set({ clip: [bottom, 0.004, t > T.snap ? 1 : 0] });

    // --- camera: close and dark with a slow push, then the rush into the window framing ---
    const d = cam.drift(t, 34, { amp: 0.7, rate: 0.06, roll: 0.08, dolly: 0.005 });
    const approach = E.sineInOut(E.seg(t, 0, T.move[0] + 0.3)); // the riser's slow push
    const creep = 1 - 0.04 * E.seg(t, T.move[1], 8.2);
    const dist = E.lerp(E.lerp(9.8, 8.8, approach), 5.76, m) * creep;
    const target = s.target0.map((a, i) => E.lerp(a, [0, -0.02, 0][i], m));
    cam.orbit(camera, {
      target,
      dist: dist * d.dist,
      az: E.lerp(-9 + 4 * approach, 0, m) + 2.4 * E.seg(t, T.move[1], 8.2) + d.az,
      el: E.lerp(4.2 - 0.6 * approach, 1.6, m) + d.el,
      roll: d.roll,
      fov: 30,
      shift: [E.lerp(0, -0.128, m), E.lerp(0.12, 0.0, m)],
    });

    // --- light, floor, dust, post --------------------------------------------------------
    const since = Math.max(0, t - 4.0);
    const hit = (1 - Math.exp(-since / 0.04)) * Math.exp(-since / 0.55);
    ctx.backdrop.userData.set({
      center: [E.lerp(0.5, 0.37, m), E.lerp(0.58, 0.52, m)],
      radius: E.lerp(0.5, 0.62, m),
      glowAmount: 0.85 + 0.35 * m + 0.9 * hit,
    });
    s.floor.set({ opacity: 1, center: [0, 0.2] });
    s.floor.mesh.position.y = E.lerp(-1.2, -1.75, m);
    const focus = camera.position.distanceTo(sheet.mesh.getWorldPosition(s.tmp));
    s.dust.set({ time: 64 + t, focus, bright: 0.3 + 0.12 * m + 0.35 * hit, fov: 30, H: ctx.renderH });
    const aperture = 520 * (1 - E.smoothstep(T.move[0], T.move[1] - 0.2, t));
    post.dof = aperture > 1 ? { focus, aperture, maxBlur: 9 } : null;
    post.bloom = null; // paper and screens never glow; nothing here exceeds 1.0
    post.vignette = 0.26;
    post.samples = t > T.move[0] && t < T.snap + 0.6 ? 16 : 0;

    // --- type ------------------------------------------------------------------------------
    s.headline.set(t, T.headline, T.headlineOut);
    s.facts.forEach((f, i) => f.set(t, T.facts[i]));
  },
};

export default scene;
