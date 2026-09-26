// diagrams — bars 16–24, night → day (FILM.md §3). The hero.
// 32.0 hit: black; the mark's two cream strokes sweep in and settle as D and S on axes,
// "Diagrams.". Bar 17: the real canvas lights up where the mark stood (its axes on the
// mark's) and the clip draws the tax diagram from scratch, retimed so each gesture lands
// on a beat: D 35.0, S 36.0, E₀ 36.5, guides 37.0, the tax shift 39.0, E₁ 39.5, tax
// revenue 40.75, DWL 41.5. 42.0 whoosh: the diagram lifts out of the window and comes
// apart into its layers, each on a pane of glass. 46.0 whoosh: they collapse and the
// diagram flies down onto the printed page as night turns to day; it lands on 47.5.
import { COPY } from '../../timeline.mjs';
import { cubicBezier } from '../lib/ease.js';
import { remap, placeRemapped } from './diagrams/remap.js';
import { diagramStack, ASPECT, LAYERS } from './diagrams/stack.js';
import { veil } from './diagrams/light.js';

const C = COPY.diagrams;
const DEG = Math.PI / 180;

// ---- geometry (world units) ---------------------------------------------------------
// The window stands at the origin; its screen maps css px (1440×900) to world.
const WIN_W = 4;
const K = WIN_W / 1440;
const BAR_H = (40 / 1440) * WIN_W; // mac title bar
const SCREEN_TOP = (WIN_W / 1.6 + BAR_H) / 2 - BAR_H;
const css = (x, y) => [(x / 1440 - 0.5) * WIN_W, SCREEN_TOP - y * K];
// The canvas card (css 160–960 × 172.5–842) is diagram/full.png's frame exactly.
const CARD_W = 800 * K;
const CARD = [...css(560, 172.5 + 800 / ASPECT / 2), 0];
// The mark sits on the card's axes: origin css (288.3, 749.5), y axis 545.3 css tall.
const AXIS_O = css(160 + 385 / 3, 172.5 + 1731 / 3);
const MARK_S = (545.33 * K) / 1.125; // the logo's axis is 1.125 logo units long
const MARK_P = [AXIS_O[0] + 0.539063 * MARK_S, AXIS_O[1] + 0.539063 * MARK_S, 0.06];
const FLOOR_Y = -1.62;
// Where it lands: the page's diagram region is full.png at half size, at sheet px
// (591, 526) of 2379 × 3366, so the page is the card's width × 2379 / 1200.
const PAGE_W = CARD_W / (1200 / 2379);
const SPACING = 0.44; // between panes
const HOVER = [CARD[0], CARD[1] + 0.15, 1.3];
const LAND = [HOVER[0], HOVER[1] - 0.55, -1.1];
const PAGE_C = [LAND[0] - (1191 / 2379 - 0.5) * PAGE_W, LAND[1] - (0.5 - 1028.5 / 3366) * PAGE_W * (297 / 210), LAND[2]];
const FOV = 30;
const VIEW_H = 2 * Math.tan((FOV / 2) * DEG); // world height per unit distance
/** Camera distance at which `worldW` spans `px` pixels at 1080p. */
const distForPx = (worldW, px) => (worldW * 1080) / (px * VIEW_H);
const END_DIST = distForPx(PAGE_W, 1100); // the handoff: sheet 1100 px wide
// The light's edge: soft width and the radius (world units on the page plane) at which the
// whole sheet is lit.
const LIGHT_SOFT = 2.6;
const lightR = (u) => -LIGHT_SOFT + (7.6 + LIGHT_SOFT) * u;

// ---- time (scene seconds; film = 32 + t) --------------------------------------------
const T = {
  word: [0.1, 1.55],
  markOut: [1.45, 1.85],
  lit: [1.6, 2.3],
  toWide: [1.85, 3.25],
  push: [3.2, 4.35],
  head: [4.0, 7.9],
  sub: [4.4, 8.0],
  skip: [5.88, 6.12],
  toClose: [7.75, 8.95],
  take: [9.8, 10.02],
  lift: [10.0, 11.25],
  orbit: [10.0, 11.9],
  layers: [10.5, 13.75],
  collapse: [13.9, 14.45],
  fly: [14.05, 15.5],
  cam: [13.95, 15.3],
  pageIn: [14.1, 14.5],
  pageLight: [14.45, 15.15], // the light opens across the page from the landing diagram
  day: [14.7, 15.45], // …and the room follows
  gone: [15.5, 15.72],
};

// Clip retiming: [scene t, clip t] keys on the clip's events (clips/draw-diagram.json).
const PLAY_A = remap([
  [1.5, 0.0], [2.0, 0.38],
  [2.49, 1.0], [3.0, 1.617], // D drag lands on 35.0
  [3.62, 2.93], [4.0, 3.55], // S drag lands on 36.0
  [4.5, 4.85], // E₀
  [5.0, 5.85], // drop to y
  [5.75, 6.65], [6.15, 7.05], // P₀ typed
]);
const PLAY_B = remap([
  [5.85, 8.55], // after the subscript edits, skipped under a dissolve
  [7.0, 10.37], // Shift a copy
  [7.5, 10.93], // E₁
  [8.0, 11.55],
  [8.75, 12.92], // tax revenue added
  [9.5, 14.27], // DWL added
  [10.0, 14.55], [10.8, 14.66],
]);

// Ink per layer while apart: the new elements (shading, the shift) in the accent.
const INK_APART = ['#C7C7CC', '#4AA3FF', '#98989D', '#F5F5F7', '#4AA3FF', '#F5F5F7'];

const fast = cubicBezier(0.3, 0, 0.06, 1); // fast, from rest
const soft = cubicBezier(0.45, 0, 0.2, 1); // a landing
const lerp3 = (a, b, u) => a.map((v, i) => v + (b[i] - v) * u);

function mixPose(p, q, u) {
  if (u <= 0) return p;
  if (u >= 1) return q;
  const l = (a, b) => a + (b - a) * u;
  return {
    target: lerp3(p.target, q.target, u),
    dist: p.dist * Math.pow(q.dist / p.dist, u),
    az: l(p.az, q.az),
    el: l(p.el, q.el),
    shift: [l(p.shift[0], q.shift[0]), l(p.shift[1], q.shift[1])],
  };
}

const scene = {
  id: 'diagrams',
  world: 'night',
  async setup(ctx) {
    const { lib, scene, THREE } = ctx;
    const s = (ctx.state = {});

    s.floor = lib.floor.nightFloor({ W: ctx.renderW, H: ctx.renderH, y: FLOOR_Y, reflect: 0.32, blur: 9 * (ctx.renderH / 1080), near: 1.4, far: 6.5, sheenR: 3.2 });
    scene.add(s.floor.mesh);
    ctx.onPrepass((...a) => s.floor.prepass(...a), { once: true });
    s.dust = lib.particles.dust({
      count: 110, seed: 16, H: ctx.renderH,
      box: [[-10, -1.5, -14], [10, 6, 4]], size: 0.012, aperture: 0.2, bright: 0.7, drift: 0.22, rise: 0.012, minPx: 5,
    });
    scene.add(s.dust.mesh);

    // The mark: strokes and axis only, posed on the canvas's axes.
    s.logo = lib.logo.createLogo();
    s.logo.group.position.set(...MARK_P);
    s.logo.group.scale.setScalar(MARK_S);
    s.logo.set({ tile: { visible: false }, puck: 0, dot: { scale: 0 } });
    s.logo.materials.cream.transparent = true;
    // The x axis runs as long as the canvas's (1.77 vs 1.51 units), so the two coincide.
    s.logo.materials.axis.uniforms.uAr.value.set(-0.539063 + (css(160 + 2296 / 3, 0)[0] - AXIS_O[0]) / MARK_S, -0.539063);
    scene.add(s.logo.group);
    s.strokeBase = ['supply', 'demand'].map((k) => ({ pos: s.logo[k].position.clone(), rot: s.logo[k].rotation.z }));

    // The app window; a second one carries the clip across the skipped subscript edits.
    s.clip = await ctx.load.clip('draw-diagram', { cache: 16, prefetch: 3 });
    const mkWin = () => {
      const w = lib.win.appWindow({ variant: 'mac', width: WIN_W, shadow: false });
      scene.add(w.group);
      return w;
    };
    s.winA = mkWin();
    s.winB = mkWin();
    s.winB.mesh.renderOrder = 3;
    placeRemapped(ctx, s.clip, 'draw-diagram', PLAY_A, [T.lit[0], 6.0]);
    placeRemapped(ctx, s.clip, 'draw-diagram', PLAY_B, [6.0, T.take[1]]);

    // The diagram's layers, and the page it lands on.
    s.stack = await diagramStack(ctx, { width: CARD_W });
    scene.add(s.stack.group);
    const sheetTex = await ctx.load.texture('sheets/diagram-question.png');
    s.page = lib.paper.sheet({ map: sheetTex, width: PAGE_W, shadowOpacity: 0, shadowBlur: 0.1, shadowOffset: [0.02, -0.05] });
    s.page.group.position.set(...PAGE_C);
    s.page.edge.material.transparent = true;
    scene.add(s.page.group);
    s.veil = veil({ w: PAGE_W + 0.006, h: PAGE_W * (297 / 210) + 0.006, center: [LAND[0] - PAGE_C[0], LAND[1] - PAGE_C[1]], soft: LIGHT_SOFT });
    s.veil.mesh.position.set(PAGE_C[0], PAGE_C[1], PAGE_C[2] + 0.0006);
    scene.add(s.veil.mesh);
    s.cardShadow = lib.floor.contactShadow({ w: CARD_W, h: CARD_W / ASPECT, radius: 0.01, blur: 0.12, opacity: 0 });
    scene.add(s.cardShadow);

    s.v = new THREE.Vector3();
    const col = (h) => new THREE.Color(h);
    s.col = {
      black: col('#000000'), blue: col('#1E7FD4'), apart: INK_APART.map(col),
      top: [col('#000000'), col('#F5F1EA')], bottom: [col('#000000'), col('#E8E1D5')], glow: [col('#15120F'), col('#F8F5EF')],
    };
    s.ink = LAYERS.map(() => new THREE.Color());

    // Type.
    const T_ = lib.type;
    s.word = T_.headline(ctx.el, { en: C.word, y: 872, size: 128, world: 'night' });
    s.labels = ['D', 'S'].map((en) => T_.text(ctx.el, { kind: 'headline', en, size: 80, world: 'night', color: '#FCFAF6' }));
    s.head = T_.headline(ctx.el, { en: 'Drawn in\nseconds.', zh: C.headlineZh, x: 104, y: 540, align: 'left', valign: 'bottom', size: 112, zhSize: 46, world: 'night' });
    s.sub = T_.sub(ctx.el, { en: C.sub.split(/(?<=\.) /).join('\n'), x: 106, y: 588, align: 'left', valign: 'top', size: 36, world: 'night' });
    s.layers = T_.headline(ctx.el, { en: C.layers, zh: C.layersZh, y: 868, size: 104, zhSize: 44, world: 'night' });
  },

  update(t, ctx) {
    const { lib, camera, post } = ctx;
    const { ease: E, camera: cam } = lib;
    const s = ctx.state;

    // ---- the mark (bar 16) -----------------------------------------------------------
    const markOut = E.sineInOut(E.seg(t, T.markOut[0], T.markOut[1]));
    const axisOut = E.sineInOut(E.seg(t, T.markOut[0] + 0.15, T.lit[1] - 0.15));
    s.logo.set({ supply: fast(E.seg(t, 0.0, 0.8)), demand: fast(E.seg(t, 0.13, 0.93)), axis: E.quintOut(E.seg(t, 0.32, 1.1)) });
    s.logo.materials.cream.opacity = 1 - markOut;
    s.logo.materials.axis.uniforms.uOpacity.value = 0.42 * (1 - axisOut);
    s.logo.group.visible = axisOut < 1;
    // Each stroke swings 24° into place about the crossing as it draws.
    const swing = [24 * (1 - E.expoOut(E.seg(t, 0.0, 1.2))), -24 * (1 - E.expoOut(E.seg(t, 0.13, 1.33)))];
    ['supply', 'demand'].forEach((k, i) => {
      const b = s.strokeBase[i];
      const a = swing[i] * DEG;
      const g = s.logo[k];
      g.position.set(b.pos.x * Math.cos(a) - b.pos.y * Math.sin(a), b.pos.x * Math.sin(a) + b.pos.y * Math.cos(a), b.pos.z);
      g.rotation.z = b.rot + a;
      g.visible = markOut < 1 && g.visible;
    });
    s.logo.group.updateMatrixWorld();

    // ---- the window and the clip ---------------------------------------------------------
    const winOp = E.sineInOut(E.seg(t, T.lit[0], T.lit[0] + 0.32));
    const winDim = E.sineInOut(E.seg(t, T.lit[0] + 0.06, T.lit[1]));
    const skip = E.sineInOut(E.seg(t, T.skip[0], T.skip[1]));
    const recede = E.quintIn(E.seg(t, 10.0, 10.55));
    const winVis = winOp * (1 - E.sineInOut(E.seg(t, 10.05, 10.42)));
    s.winA.group.position.set(0, -0.35 * recede, -1.8 * recede);
    s.winB.group.position.set(0, -0.35 * recede, -1.8 * recede + 0.0008);
    s.winA.group.visible = winVis > 0.001 && skip < 1;
    s.winB.group.visible = winVis > 0.001 && skip > 0;
    if (s.winA.group.visible) s.winA.set({ screen: s.clip.frameAt(PLAY_A(t)), opacity: winVis, dim: winDim });
    if (s.winB.group.visible) s.winB.set({ screen: s.clip.frameAt(PLAY_B(t)), opacity: winVis * (s.winA.group.visible ? skip : 1), dim: winDim });

    // ---- the stack ------------------------------------------------------------------------
    const take = E.sineInOut(E.seg(t, T.take[0], T.take[1]));
    const lift = E.quintInOut(E.seg(t, T.lift[0], T.lift[1]));
    const collapse = cubicBezier(0.55, 0, 0.35, 1)(E.seg(t, T.collapse[0], T.collapse[1]));
    const breathe = 0.06 * E.smoothstep(11.0, 13.9, t);
    const spread = LAYERS.map((_, i) => {
      const x = E.spring(t - 10.1 - 0.04 * i, { freq: 0.8, damping: 0.8 }) + breathe;
      return SPACING * i * x * (1 - collapse);
    });
    const fly = soft(E.seg(t, T.fly[0], T.fly[1]));
    const pos = lerp3(lerp3(CARD, HOVER, lift), LAND, fly);
    pos[1] += 0.3 * Math.sin(Math.PI * fly) * (1 - fly); // a little float before it drops
    pos[2] += 0.002;
    s.stack.group.position.set(...pos);
    s.stack.group.rotation.set(-10 * DEG * Math.sin(Math.PI * fly), 0, 0);
    // Ink: black → selection blue → light as the card clears; the reverse before landing.
    const toBlue = E.sineInOut(E.seg(t, 10.1, 10.4));
    const toApart = E.sineInOut(E.seg(t, 10.62, 11.05));
    const back = E.sineInOut(E.seg(t, 14.0, 14.3));
    const toBlack = E.sineInOut(E.seg(t, 14.5, 14.8));
    const paper = 1 - E.sineInOut(E.seg(t, 10.4, 10.78)) + E.sineInOut(E.seg(t, 14.25, 14.55));
    s.ink.forEach((c, i) => {
      c.copy(s.col.black).lerp(s.col.blue, toBlue).lerp(s.col.apart[i], toApart).lerp(s.col.blue, back).lerp(s.col.black, toBlack);
    });
    const gone = E.sineInOut(E.seg(t, T.gone[0], T.gone[1]));
    const stackOp = take * (1 - gone);
    s.stack.group.visible = stackOp > 0.001;

    // ---- the page, the day ----------------------------------------------------------------
    const pageIn = E.sineInOut(E.seg(t, T.pageIn[0], T.pageIn[1]));
    const day = E.sineInOut(E.seg(t, T.day[0], T.day[1]));
    s.page.group.visible = pageIn > 0.001;
    // The page arrives black; once opaque, a veil over it takes over the dark and opens.
    const lit = pageIn >= 1 ? 1 : 0;
    s.page.material.color.setScalar(lit);
    s.page.set({ opacity: pageIn, shadowOpacity: 0.14 * day });
    s.page.edge.material.opacity = pageIn;
    s.page.edge.material.color.set('#D9D4CB').multiplyScalar(lit);
    const pageLight = E.sineInOut(E.seg(t, T.pageLight[0], T.pageLight[1]));
    s.veil.set({ r: lit ? lightR(pageLight) : 1e9 });
    s.veil.mesh.visible = !!lit && pageLight < 1;
    // The card's shadow on the page tightens as it lands.
    const height = Math.max(0, pos[2] - LAND[2]);
    s.cardShadow.position.set(pos[0] + 0.1 * height, pos[1] - 0.16 * height, LAND[2] + 0.001);
    s.cardShadow.scale.setScalar(1 + 0.08 * height);
    s.cardShadow.material.opacity = (0.16 * day * (1 - gone)) / (1 + 1.5 * height);
    s.cardShadow.visible = s.cardShadow.material.opacity > 0.001;

    const bd = ctx.backdrop.material.uniforms;
    // The room follows: its glow turns cream and spreads from the same point.
    const settle = E.smoothstep(0.72, 1, day);
    const base = E.smoothstep(0.5, 1, day);
    bd.uTop.value.lerpColors(s.col.top[0], s.col.top[1], base);
    bd.uBottom.value.lerpColors(s.col.bottom[0], s.col.bottom[1], base);
    bd.uGlow.value.lerpColors(s.col.glow[0], s.col.glow[1], E.smoothstep(0, 0.3, day));
    bd.uGlowAmount.value = E.lerp(1, 0.55, settle);

    // ---- camera ---------------------------------------------------------------------------
    const markSweep = E.quintOut(E.seg(t, 0, 1.8));
    const pMark = {
      target: MARK_P,
      dist: distForPx(1.5148, 440) * (1.07 - 0.07 * markSweep),
      az: -22 + 20 * markSweep,
      el: 8 - 6.5 * markSweep,
      shift: [0, 0.066],
    };
    const pWide = { target: [0, 0.02, 0], dist: distForPx(WIN_W, 1240), az: -6, el: 4, shift: [0, 0.05] };
    const creep = E.seg(t, 4.0, 8.0);
    const pSide = {
      target: CARD,
      dist: distForPx(CARD_W, 880) * (1 - 0.03 * creep),
      az: -11 + 2 * creep,
      el: 2 - 1 * creep,
      shift: [0.215 - 0.004 * creep, -0.1],
    };
    const pClose = { target: CARD, dist: distForPx(CARD_W, 1150), az: -3 + 2 * E.seg(t, 8.5, 10.5), el: 1, shift: [-0.099, 0] };
    const orbitDrift = 3.2 * (t - 10) * E.smoothstep(10, 11.2, t);
    const stackC = [pos[0], pos[1], pos[2] + 0.5 * spread[5]];
    const pApart = { target: stackC, dist: distForPx(CARD_W, 610) * (1 + 0.02 * E.seg(t, 11, 14)), az: -36 + orbitDrift, el: 13 - 2 * E.seg(t, 11, 14), shift: [-0.02, 0.17] };
    const pEnd = { target: LAND, dist: END_DIST * (1 - 0.012 * E.seg(t, 14.6, 17)), az: 0.6 * E.seg(t, 15, 17), el: 0, shift: [0, 0] };

    let p = pMark;
    p = mixPose(p, pWide, E.quintInOut(E.seg(t, T.toWide[0], T.toWide[1])));
    p = mixPose(p, pSide, E.quintInOut(E.seg(t, T.push[0], T.push[1])));
    p = mixPose(p, pClose, E.quintInOut(E.seg(t, T.toClose[0], T.toClose[1])));
    p = mixPose(p, pApart, cubicBezier(0.4, 0, 0.12, 1)(E.seg(t, T.orbit[0], T.orbit[1])));
    p = mixPose(p, pEnd, E.quintInOut(E.seg(t, T.cam[0], T.cam[1])));
    const d = cam.drift(t, 16, { amp: 0.7, rate: 0.06, roll: 0.08, dolly: 0.005 });
    const calm = 1 - 0.8 * E.seg(t, 14.4, 15.4);
    cam.orbit(camera, {
      target: p.target,
      dist: p.dist * (1 + (d.dist - 1) * calm),
      az: p.az + d.az * calm,
      el: p.el + d.el * calm,
      roll: d.roll * calm,
      fov: FOV,
      shift: p.shift,
    });

    // Per-pane depth of field while the layers are apart.
    const dofK = E.smoothstep(10.3, 11.1, t) * (1 - E.smoothstep(13.85, 14.3, t));
    s.stack.set({
      spread, opacity: stackOp, paper, ink: s.ink,
      panes: E.sineInOut(E.seg(t, 10.45, 11.0)) * (1 - E.sineInOut(E.seg(t, 13.95, 14.35))),
      dof: { focus: camera.position.distanceTo(s.v.set(...stackC)), aperture: 150 * dofK * (ctx.renderH / 1080), maxBlur: 8 * (ctx.renderH / 1080) },
    });

    // ---- world, post --------------------------------------------------------------------------
    s.floor.set({ opacity: 1 - E.sineInOut(E.seg(t, 13.95, 14.8)) });
    // The room's glow edge sits where the page's light edge would be, one step behind.
    s.v.set(LAND[0] + 1, LAND[1], LAND[2]).project(camera);
    const x1 = s.v.x;
    s.v.set(...LAND).project(camera);
    const k = (Math.abs(x1 - s.v.x) / 2) * (ctx.renderW / ctx.renderH); // screen heights per world unit
    const glowR = Math.max(0.02, ((lightR(day) - LIGHT_SOFT / 2) * k) / 0.76);
    bd.uRadius.value = E.lerp(E.lerp(0.55, glowR, E.smoothstep(0, 0.04, day)), 0.6, settle);
    bd.uCenter.value.set(E.lerp((s.v.x + 1) / 2, 0.5, settle), E.lerp((s.v.y + 1) / 2, 0.62, settle));
    s.dust.set({ time: 32 + t, focus: camera.position.distanceTo(s.v.set(...p.target)), bright: 0.4 * (1 - day), fov: FOV, H: ctx.renderH });
    post.dof = null;
    post.bloom = { strength: 0, radius: 0.6, threshold: 1, knee: 0.5 };
    post.vignette = E.lerp(0.22, 0.06, day);
    const moving = (a, b) => t > a && t < b;
    post.samples = moving(0, 1.3) || moving(T.toWide[0], T.toWide[1]) || moving(10.0, 11.6) || moving(13.9, 15.6) ? 12 : 0;

    // ---- type -----------------------------------------------------------------------------------
    s.word.set(t, T.word[0], T.word[1]);
    const anchors = [[0.55, -0.37, swing[1]], [0.55, 0.45, swing[0]]]; // D at demand's end, S at supply's
    s.labels.forEach((lab, i) => {
      const [lx, ly, sw] = anchors[i];
      const a = sw * DEG;
      s.v.set(lx * Math.cos(a) - ly * Math.sin(a), lx * Math.sin(a) + ly * Math.cos(a), 0.05).applyMatrix4(s.logo.group.matrixWorld).project(camera);
      lab.place({ x: (s.v.x + 1) * 960, y: (1 - s.v.y) * 540 });
      lab.set(t, i === 1 ? 0.62 : 0.74, T.markOut[0]);
    });
    s.head.set(t, T.head[0], T.head[1]);
    s.sub.set(t, T.sub[0], T.sub[1]);
    s.layers.set(t, T.layers[0], T.layers[1]);
  },
};

export default scene;
