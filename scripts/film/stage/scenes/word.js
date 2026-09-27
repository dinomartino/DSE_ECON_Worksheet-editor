// word — bars 32–36, night (FILM.md §3). The breakdown: the hard cut from papers' dark
// stack lands on its top sheet — the diagram question, same size and place — alone in
// darkness. The light finds it, a slow band crosses it as the camera turns around it: "A
// real Word document." On the 66.0 riser the page comes up to white; the camera rushes in,
// the printed page becomes the exported .docx (LibreOffice render) and on the 68.0 drop a
// document window snaps shut around it. Facts on 69.0, 70.0, 71.0.
import { COPY } from '../../timeline.mjs';
import { cubicBezier } from '../lib/ease.js';
import { docWindow, DOC } from './word/docWindow.js';

const C = COPY.word;
const PRINTED = 'sheets/diagram-question.png'; // on top of papers' stack

// Scene seconds (film − 64).
const T = {
  find: [0.0, 1.5], // the light comes up on the page after the cut
  sweep: [0.3, 3.2],
  headline: 0.6,
  headlineOut: 2.9,
  lit: [2.3, 3.55],
  docx: [3.32, 3.54], // the printed page → the .docx, at the rush's fastest (motion blur hides it)
  move: [3.08, 3.97],
  snap: 3.95, // the window forms around the page on the 68.0 drop
  facts: [5.0, 6.0, 7.0],
};

const YAW = 0.2; // the window turns toward the facts
const DEG = Math.PI / 180;
// Breakdown: papers' last frame (sheet 459 px wide, centred at 965, 420) from camera az AZ0.
const AZ0 = 2;
const DIST0 = 9.55;
const SHIFT0 = 0.11;
const SHEET0 = { pos: [0.1, 0.35, 0.3], rot: [0, AZ0 * DEG - YAW, 0] }; // window-group local: faces the camera
const DIM = 0.0056; // linear: papers' stack ends at display 0.066
const FACT_X = 1310;
const FACT_Y = [428, 540, 652];
const rush = cubicBezier(0.5, 0, 0.18, 1); // from rest, fast through the middle, long landing

const scene = {
  id: 'word',
  world: 'night',
  async setup(ctx) {
    const { lib, scene, THREE } = ctx;
    const s = (ctx.state = {});
    const [map, printed] = await Promise.all([ctx.load.texture(DOC.texture), ctx.load.texture(PRINTED)]);
    s.doc = docWindow(lib, map, { alt: printed });
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

    // --- the sheet: stands where papers left it, then rushes into its slot --------------
    const m = rush(E.seg(t, T.move[0], T.move[1]));
    const slot = L.slot;
    const p0 = SHEET0.pos;
    sheet.mesh.position.set(E.lerp(p0[0], slot[0], m), E.lerp(p0[1], slot[1], m), E.lerp(p0[2], slot[2], m));
    sheet.mesh.position.y += 0.014 * Math.sin(t * 1.1) * (1 - m); // a breath of float while alone
    sheet.mesh.rotation.set(0, SHEET0.rot[1] * (1 - m), 0);

    const find = E.sineInOut(E.seg(t, T.find[0], T.find[1]));
    const swU = E.seg(t, T.sweep[0], T.sweep[1]);
    const lit = E.sineInOut(E.seg(t, T.lit[0], T.lit[1]));
    sheet.set({
      base: E.lerp(DIM, 0.003, find),
      pool: [0.5, 0.62, 0.34 + 0.04 * find, 0.19 * find],
      band: [E.lerp(-0.62, 0.9, E.sineInOut(swU)), 0.15, 0.85 * Math.sin(Math.PI * swU) ** 0.6],
      lit,
      alt: 1 - E.sineInOut(E.seg(t, T.docx[0], T.docx[1])),
    });

    // --- the window closes in from beyond the frame and settles around the page ----------
    const snap = E.spring(t - T.snap, { freq: 2.0, damping: 0.74 });
    const scale = E.lerp(1.34, 1, snap);
    win.group.scale.setScalar(scale);
    win.group.visible = t > T.snap;
    win.set({ opacity: E.sineOut(E.seg(t, T.snap, T.snap + 0.08)) });
    const bottom = L.bottom * scale - sheet.mesh.position.y; // window bottom in sheet-local y
    sheet.set({ clip: [bottom, 0.004, t > T.snap ? 1 : 0] });

    // --- camera: papers' framing, a slow turn around the page, then the rush in ---------
    const d = cam.drift(t, 34, { amp: 0.7, rate: 0.06, roll: 0.08, dolly: 0.005 });
    const calm = E.smoothstep(0, 1.2, t); // the drift grows in, so the cut frame matches exactly
    const approach = E.sineInOut(E.seg(t, 0, T.move[0] + 0.3)); // the riser's slow push
    const creep = 1 - 0.04 * E.seg(t, T.move[1], 8.2);
    const dist = E.lerp(E.lerp(DIST0, 8.7, approach), 5.76, m) * creep;
    const target = s.target0.map((a, i) => E.lerp(a, [0, -0.02, 0][i], m));
    cam.orbit(camera, {
      target,
      dist: dist * (1 + (d.dist - 1) * calm),
      az: E.lerp(AZ0 - 13 * approach, 0, m) + 2.4 * E.seg(t, T.move[1], 8.2) + d.az * calm,
      el: E.lerp(2.2 + 0.8 * approach, 1.6, m) + d.el * calm,
      roll: d.roll * calm,
      fov: 30,
      shift: [E.lerp(0, -0.128, m), E.lerp(SHIFT0, 0.0, m)],
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
    // No DOF: the dust carries its own bokeh, and the depth-aware blur steps the sheet's
    // anti-aliased edge against the black.
    post.dof = null;
    post.bloom = null; // paper and screens never glow; nothing here exceeds 1.0
    post.vignette = 0.26;
    post.samples = t > T.move[0] && t < T.snap + 0.6 ? 16 : 0;

    // --- type ------------------------------------------------------------------------------
    s.headline.set(t, T.headline, T.headlineOut);
    s.facts.forEach((f, i) => f.set(t, T.facts[i]));
  },
};

export default scene;
