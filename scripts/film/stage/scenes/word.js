// word — bars 32–36, night (FILM.md §3). The breakdown: the hard cut from papers' dark
// stack lands on its top sheet — the diagram question, in the same place, tilt and light —
// alone in the dark; while still near black it becomes the exported .docx page (LibreOffice
// render). The room's last light gives way to night, the sheet turns to face us and the
// light finds it; a slow band crosses it as the camera turns around it: "A real Word
// document." On the riser the page comes up to white and the camera rushes in; the page
// flashes white just before the 68.0 drop and a document window snaps shut around it on
// the drop. Each fact lands on its tick with its proof on the page and a small push-in:
// the list numbers light up, the paragraphs show their style names, a caret starts blinking.
import { COPY, CUES } from '../../timeline.mjs';
import { cubicBezier } from '../lib/ease.js';
import { docWindow, DOC } from './word/docWindow.js';
import { styleTag } from './word/styleTag.js';

const C = COPY.word;
const PRINTED = 'extra/marks/sheets/diagram-question-done.png'; // papers' top sheet: the cut frame matches it
const START = 64; // film seconds at t = 0
// Each fact lands on its own tick in CUES, so a retimed tick moves its fact and proof with it.
const FACTS_T = C.facts.map((en, i) => (CUES.find((c) => c.kind === 'tick' && c.note === en)?.t ?? 69 + i) - START);

// Scene seconds (film − 64).
const T = {
  dark: [0.05, 1.3], // papers' last room light gives way to the night world
  stand: [0.05, 1.9], // the sheet turns from papers' tilt to face the camera
  find: [0.0, 1.5], // the light comes up on the page after the cut
  swap: [0.1, 0.3], // printed page → .docx while the sheet is still near black
  sweep: [0.3, 3.2],
  headline: 0.6,
  headlineOut: 2.9,
  lit: [2.6, 3.85],
  wash: [3.78, 3.9, 3.91, 4.05], // a white flash peaking just before the drop
  move: [3.58, 4.35],
  snap: 3.9875, // after the 67.983 frame's shutter: the window first shows on 68.0
  facts: FACTS_T,
};

const YAW = 0.2; // the window turns toward the facts
const DEG = Math.PI / 180;
// Breakdown: papers' last frame (sheet 459 px wide, centred at 965, 420) from camera az AZ0.
const AZ0 = 2;
const DIST0 = 9.775;
const SHIFT0 = [0.0031, 0.1234];
// Window-group local; papers leaves the sheet tipped back (its bottom edge ~6% wider).
const SHEET0 = { pos: [0.1, 0.35, 0.3], rot: [-14 * DEG, AZ0 * DEG - YAW, 0] };
// Papers' last frame (display sRGB /255): the room's warm gradient; the sheet, neutral.
const ROOM0 = { top: [11, 9, 7], bottom: [3, 2, 2] };
const DIM = 0.0022; // linear: the sheet at display 7/255, as papers leaves it
const FACT_X = 1330;
const FACT_Y = [452, 540, 628];
const PUSH = 0.02; // camera push-in per fact
const rush = cubicBezier(0.5, 0, 0.18, 1); // from rest, fast through the middle, long landing
const punch = cubicBezier(0.3, 0, 0.1, 1); // a push that peaks just after its tick and lands long
const MARK = { num1: 0, numA: 1, title: 2, stem: 3, part: 4 };

const scene = {
  id: 'word',
  world: 'night',
  async setup(ctx) {
    const { lib, scene, THREE } = ctx;
    const s = (ctx.state = {});
    const [map, printed] = await Promise.all([ctx.load.texture(DOC.texture), ctx.load.texture(PRINTED)]);
    s.doc = docWindow(lib, map, { alt: printed });
    s.doc.group.rotation.y = YAW;
    s.doc.sheet.mesh.rotation.order = 'YXZ'; // pitch about the sheet's own x, then yaw
    scene.add(s.doc.group);
    for (const [key, i] of Object.entries(MARK)) s.doc.sheet.mark(i, DOC.regions[key], 0);
    // Style names in the window's margin, each level with its paragraph.
    const { L } = s.doc;
    s.tags = DOC.styles.map(([key, name]) => {
      const tag = styleTag(name);
      const r = DOC.regions[key];
      tag.x = L.slot[0] - L.pageW / 2 - 0.045 - tag.w / 2;
      tag.mesh.position.set(tag.x, L.slot[1] + L.pageH * (0.5 - (r[1] + r[3]) / 2), L.slot[2] + 0.002);
      s.doc.group.add(tag.mesh);
      return tag;
    });
    const srgb = (c) => new THREE.Color().setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.SRGBColorSpace);
    s.room = { top: srgb(ROOM0.top), bottom: srgb(ROOM0.bottom), a: new THREE.Color(), b: new THREE.Color() };
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
    const [F0, F1, F2] = T.facts;

    // --- the sheet: stands where papers left it, then rushes into its slot --------------
    const m = rush(E.seg(t, T.move[0], T.move[1]));
    const slot = L.slot;
    const p0 = SHEET0.pos;
    sheet.mesh.position.set(E.lerp(p0[0], slot[0], m), E.lerp(p0[1], slot[1], m), E.lerp(p0[2], slot[2], m));
    sheet.mesh.position.y += 0.014 * Math.sin(t * 1.1) * (1 - m); // a breath of float while alone
    const stand = E.sineInOut(E.seg(t, T.stand[0], T.stand[1]));
    sheet.mesh.rotation.set(SHEET0.rot[0] * (1 - stand), SHEET0.rot[1] * (1 - m), 0);

    const dark = E.sineInOut(E.seg(t, T.dark[0], T.dark[1]));
    const find = E.sineInOut(E.seg(t, T.find[0], T.find[1]));
    const swU = E.seg(t, T.sweep[0], T.sweep[1]);
    const lit = E.sineInOut(E.seg(t, T.lit[0], T.lit[1]));
    sheet.set({
      base: E.lerp(DIM, 0.003, find),
      pool: [0.5, 0.62, 0.34 + 0.04 * find, 0.19 * find],
      band: [E.lerp(-0.62, 0.9, E.sineInOut(swU)), 0.15, 0.85 * Math.sin(Math.PI * swU) ** 0.6],
      lit,
      warm: E.smoothstep(0, 1.2, t), // papers leaves it neutral; the new light is tungsten
      wash: t < T.wash[2] ? E.sineInOut(E.seg(t, T.wash[0], T.wash[1])) : 1 - E.sineInOut(E.seg(t, T.wash[2], T.wash[3])),
      alt: 1 - E.smoothstep(T.swap[0], T.swap[1], t),
    });

    // --- the window closes in from beyond the frame and settles around the page ----------
    const snap = E.spring(t - T.snap, { freq: 3.2, damping: 0.74 });
    const scale = E.lerp(1.34, 1, snap);
    win.group.scale.setScalar(scale);
    win.group.visible = t > T.snap;
    const form = E.sineOut(E.seg(t, T.snap, T.snap + 0.08));
    win.set({ opacity: form });
    const bottom = L.bottom * scale - sheet.mesh.position.y; // window bottom in sheet-local y
    sheet.set({ clip: [bottom, 0.004, form] });

    // --- the facts' proof on the page ------------------------------------------------------
    const up = (t0, d = 0.3) => E.quintOut(E.seg(t, t0 - 0.04, t0 + d));
    const flare = (t0) => Math.exp(-Math.max(0, t - t0) / 0.45);
    const num = up(F0) * (1 - up(F1, 0.4));
    sheet.mark(MARK.num1, DOC.regions.num1, num, num * (0.3 + 0.7 * flare(F0)));
    sheet.mark(MARK.numA, DOC.regions.numA, num, num * (0.3 + 0.7 * flare(F0)));
    ['title', 'stem', 'part'].forEach((key, i) => {
      const t0 = F1 + 0.08 * i;
      const k = up(t0) * (1 - 0.55 * up(F2, 0.45));
      sheet.mark(MARK[key], DOC.regions[key], k, k * 0.9 * flare(t0));
    });
    s.tags.forEach((tag, i) => {
      const a = E.quintOut(E.seg(t, F1 + 0.08 * i - 0.04, F1 + 0.08 * i + 0.5));
      tag.mesh.position.x = tag.x + 0.05 * (1 - a); // drawn out of the page
      tag.set(a);
    });
    const [cu, c0, c1] = DOC.caret;
    sheet.set({ caret: [cu, c0, c1, caretOn(t - F2, E)] });

    // --- camera: papers' framing, a slow turn around the page, the rush, a push per fact --
    const d = cam.drift(t, 34, { amp: 0.7, rate: 0.06, roll: 0.08, dolly: 0.005 });
    const calm = E.smoothstep(0, 1.2, t); // the drift grows in, so the cut frame matches exactly
    const approach = E.sineInOut(E.seg(t, 0, T.move[0] + 0.3)); // the riser's slow push
    const creep = 1 - 0.008 * E.seg(t, T.move[1], 8.2);
    const push = 1 - PUSH * T.facts.reduce((a, f) => a + punch(E.seg(t, f - 0.12, f + 0.65)), 0);
    const dist = E.lerp(E.lerp(DIST0, 8.7, approach), 5.84, m) * creep * push;
    const target = s.target0.map((a, i) => E.lerp(a, [0, -0.02, 0][i], m));
    cam.orbit(camera, {
      target,
      dist: dist * (1 + (d.dist - 1) * calm),
      az: E.lerp(AZ0 - 13 * approach, 0, m) + 2.4 * E.seg(t, T.move[1], 8.2) + d.az * calm,
      el: E.lerp(2.2 + 0.8 * approach, 1.6, m) + d.el * calm,
      roll: d.roll * calm,
      fov: 30,
      shift: [E.lerp(SHIFT0[0], -0.128, m), E.lerp(SHIFT0[1], 0.0, m)],
    });

    // --- light, floor, dust, post --------------------------------------------------------
    const since = Math.max(0, t - 4.0);
    const hit = (1 - Math.exp(-since / 0.04)) * Math.exp(-since / 0.55);
    // The room papers leaves (a warm gradient) fades out as the night glow comes up.
    ctx.backdrop.userData.set({
      top: s.room.a.copy(s.room.top).multiplyScalar(1 - dark),
      bottom: s.room.b.copy(s.room.bottom).multiplyScalar(1 - dark),
      center: [E.lerp(0.5, 0.37, m), E.lerp(0.58, 0.52, m)],
      radius: E.lerp(0.5, 0.62, m),
      glowAmount: (0.85 + 0.35 * m + 0.9 * hit) * dark,
    });
    s.floor.set({ opacity: dark, center: [0, 0.2] });
    s.floor.mesh.position.y = E.lerp(-1.2, -1.75, m);
    const focus = camera.position.distanceTo(sheet.mesh.getWorldPosition(s.tmp));
    s.dust.set({ time: START + t, focus, bright: (0.3 + 0.12 * m + 0.35 * hit) * dark, fov: 30, H: ctx.renderH });
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

/** A text caret x s after it appears: solid for 0.6 s, then a 0.53 s blink with soft edges. */
function caretOn(x, E) {
  if (x < 0) return 0;
  if (x < 0.6) return E.smoothstep(0, 0.06, x);
  const ph = (x - 0.6) % 1.06;
  return ph < 0.53 ? 1 - E.smoothstep(0, 0.07, ph) : E.smoothstep(0.53, 0.6, ph);
}

export default scene;
