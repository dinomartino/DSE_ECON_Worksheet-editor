// diagrams — bars 16–24, night → day (FILM.md §3). The hero.
// 32.0 hit: black; the mark's cream strokes sweep in and settle as D and S on axes, the
// blue point drops into their crossing, "Diagrams.". 33.5: the canvas card lights up
// behind the mark (its axes are the mark's) and the app fades up around it; the camera
// pulls back while the real clip draws the tax diagram from scratch, retimed so each
// gesture lands on a beat: D 35.0, S 36.0 ("Drawn in seconds."), E₀ 36.5, guides 37.0,
// the tax shift 39.0, E₁ 39.5, tax revenue 40.5, DWL 41.5; the lights go down around the
// card. 42.0 whoosh: the diagram lifts out of the window, turns to glass and comes apart
// into its layers ("Every line stays editable."). 46.0 whoosh: the layers collapse and
// the diagram flies down onto the printed page lying in the dark; it lands on 47.0, the
// light spreads from it across the page and the room turns to day for the 48.0 handoff.
import { COPY } from '../../timeline.mjs';
import { cubicBezier } from '../lib/ease.js';
import { remap, placeRemapped } from './diagrams/remap.js';
import { diagramStack, ASPECT, LAYERS } from './diagrams/stack.js';
import { blankSlot, pageLight, roomLight } from './diagrams/light.js';
import { WORLDS } from '../lib/backdrop.js';
import { extendScreen } from './diagrams/screen.js';
import { player } from './diagrams/player.js';
import { chain } from './diagrams/poses.js';

const C = COPY.diagrams;
const DEG = Math.PI / 180;

// ---- geometry (world units) ---------------------------------------------------------
// The window stands at the origin; its screen maps css px (1440×900) to world.
const WIN_W = 4;
const K = WIN_W / 1440;
const BAR_H = (40 / 1440) * WIN_W; // mac title bar
const SCREEN_TOP = (WIN_W / 1.6 + BAR_H) / 2 - BAR_H;
const css = (x, y) => [(x / 1440 - 0.5) * WIN_W, SCREEN_TOP - y * K];
// The canvas card (css 160–960 × 172.5–842.5) is diagram/full.png's frame exactly.
const CARD_W = 800 * K;
const CARD = [...css(560, 172.5 + 800 / ASPECT / 2), 0];
const CARD_RECT = [...css(160, 172.5 + 800 / ASPECT), ...css(960, 172.5)]; // x0 y0 x1 y1
// The mark sits on the card's axes: origin css (288.3, 749.5), y axis 545.3 css tall.
const AXIS_O = css(160 + 385 / 3, 172.5 + 1731 / 3);
const MARK_S = (545.33 * K) / 1.125; // the logo's axis is 1.125 logo units long
const MARK_P = [AXIS_O[0] + 0.539063 * MARK_S, AXIS_O[1] + 0.539063 * MARK_S, 0.06];
const STROKE_LEN = (212 / 256) * Math.SQRT2; // a stroke of the mark, in logo units
const FLOOR_Y = -1.62;
// The page lies on the floor. Its diagram is full.png at half size at sheet px (591, 526)
// of 2379 × 3366, so the page is the card's width × 2379 / 1200.
const PAGE_W = CARD_W * (2379 / 1200);
const PAGE_H = PAGE_W * (297 / 210);
const HOVER = [CARD[0], CARD[1] + 0.22, 1.25];
const LAND = [CARD[0], FLOOR_Y + 0.004, 2.2];
const PAGE_OFF = [(1191 / 2379 - 0.5) * PAGE_W, (0.5 - 1028.5 / 3366) * PAGE_H]; // diagram centre, page-local
const PAGE_C = [LAND[0] - PAGE_OFF[0], FLOOR_Y + 0.001, LAND[2] + PAGE_OFF[1]];
const END_EL = 89.5; // overhead (90 would leave lookAt without an up)
const FOV = 30;
const VIEW_H = 2 * Math.tan((FOV / 2) * DEG);
/** Camera distance at which `worldW` spans `px` pixels at 1080p. */
const distForPx = (worldW, px) => (worldW * 1080) / (px * VIEW_H);
const END_DIST = distForPx(PAGE_W, 1100); // the handoff: the sheet 1100 px wide
const LIGHT_SOFT = 3.6; // the page light's soft edge (world units)
// A pool that covers the landing slot, then out past the frame's far corners at the handoff.
const LIGHT_R = [1.5 + LIGHT_SOFT, 4.8 + LIGHT_SOFT];
const CARD_H = CARD_W / ASPECT;

// ---- time (scene seconds; film = 32 + t) --------------------------------------------
const T = {
  word: [0.1, 1.42],
  dot: 1.0,
  shrink: [1.38, 1.74], // the strokes run into the point
  reveal: [1.72, 3.5], // the card lights from the point (covered on 34.0), then the app
  axisOut: [1.6, 1.84],
  dotOut: [1.95, 2.3],
  dimApp: [2.05, 2.6], // the app around the card, faint while D and S are drawn
  closeIn: [1.45, 2.95],
  pull: [3.35, 4.4],
  appUp: [3.5, 4.3],
  head: [4.0, 8.35],
  sub: [4.35, 8.4],
  skip: [5.9, 6.14],
  push: [8.05, 9.35],
  spot: [9.62, 10.02],
  take: [9.8, 10.0],
  lift: [10.0, 11.3],
  orbit: [10.0, 11.9],
  wipe: [10.08, 10.5],
  layers: [11.0, 13.75],
  collapse: [13.9, 14.45],
  unwipe: [13.95, 14.65],
  face: [13.9, 14.4], // the closing diagram turns to face the camera, and keeps facing it
  crane: [13.85, 15.05], // up and over: overhead before the diagram comes down
  fly: [14.3, 15.2], // drops onto its slot, touching on ~47.1 (it never cuts the page)
  flat: [14.85, 15.15], // lies exactly flat for the touch
  floorOut: [14.2, 14.9],
  pageIn: [14.3, 14.9], // the page shows in its pool of light as the diagram comes down
  light: [15.05, 15.75], // day by the 47.75 dissolve
};

// Clip retiming: [scene t, clip t] keys on the clip's events (clips/draw-diagram.json).
const PLAY_A = remap([
  [1.4, 0.0], [2.0, 0.4],
  [2.45, 1.0], [3.0, 1.617], // D lands on 35.0
  [3.55, 2.93], [4.0, 3.55], // S lands on 36.0
  [4.5, 4.85], // E₀
  [5.0, 5.85], // drop to y
  [5.5, 6.28], [5.85, 6.65], [6.2, 7.0], // Q₀, P₀ typed
]);
const PLAY_B = remap([
  [5.9, 8.55], // after the subscript edits, skipped under a dissolve
  [7.0, 10.37], // Shift a copy
  [7.5, 10.93], // E₁
  [8.5, 12.92], // tax revenue added
  [9.5, 14.27], // DWL added
  [10.0, 14.5], [10.8, 14.62],
]);
const POPS = [775, 856]; // clip frames where "Add" closes the menu and the shading appears

// Glass-state ink per layer: the tax (shift, shading) in the accent.
const INK_APART = ['#AEAEB2', '#4AA3FF', '#8E8E93', '#F5F5F7', '#6CB6FF', '#F5F5F7'];

const fast = cubicBezier(0.3, 0, 0.06, 1); // fast, from rest
const soft = cubicBezier(0.5, 0, 0.2, 1); // a drop that lands softly
const lerp3 = (a, b, u) => a.map((v, i) => v + (b[i] - v) * u);

const scene = {
  id: 'diagrams',
  world: 'night',
  async setup(ctx) {
    const { lib, scene, THREE } = ctx;
    const s = (ctx.state = {});

    s.floor = lib.floor.nightFloor({ W: ctx.renderW, H: ctx.renderH, y: FLOOR_Y, reflect: 0.3, blur: 9 * (ctx.renderH / 1080), near: 1.6, far: 7, sheenR: 3.4 });
    scene.add(s.floor.mesh);
    ctx.onPrepass((...a) => s.floor.prepass(...a), { once: true });
    s.dust = lib.particles.dust({
      count: 120, seed: 16, H: ctx.renderH,
      box: [[-10, -1.5, -14], [10, 6, 5]], size: 0.012, aperture: 0.2, bright: 0.7, drift: 0.22, rise: 0.012, minPx: 5,
    });
    scene.add(s.dust.mesh);

    // The mark: strokes, axis and dot, posed on the canvas's axes (no tile, no puck).
    s.logo = lib.logo.createLogo();
    s.logo.group.position.set(...MARK_P);
    s.logo.group.scale.setScalar(MARK_S);
    s.logo.set({ tile: { visible: false }, puck: 0, dot: { scale: 0 } });
    // The x axis runs as long as the canvas's, so the two coincide.
    s.logo.materials.axis.uniforms.uAr.value.set(-0.539063 + (css(160 + 2296 / 3, 0)[0] - AXIS_O[0]) / MARK_S, -0.539063);
    scene.add(s.logo.group);
    s.strokeBase = ['supply', 'demand'].map((k) => ({ pos: s.logo[k].position.clone(), rot: s.logo[k].rotation.z }));

    // The app window playing the clip.
    s.clip = await ctx.load.clip('draw-diagram', { cache: 20, prefetch: 4 });
    s.win = lib.win.appWindow({ variant: 'mac', width: WIN_W, shadow: false });
    scene.add(s.win.group);
    s.screen = extendScreen(s.win);
    s.player = player(s.clip, { a: PLAY_A, b: PLAY_B, skip: T.skip, pops: POPS });
    placeRemapped(ctx, s.clip, 'draw-diagram', PLAY_A, [T.reveal[0], T.skip[0]]);
    placeRemapped(ctx, s.clip, 'draw-diagram', PLAY_B, [T.skip[0], T.take[1]]);

    // The diagram's layers, and the page it lands on (lying on the floor, top edge away).
    s.stack = await diagramStack(ctx, { width: CARD_W });
    scene.add(s.stack.group);
    // The page with its diagram slot blank: the landed stack is its diagram (registered
    // exactly), so the printed one never shows twice.
    const sheetTex = await ctx.load.texture('sheets/diagram-question.png');
    s.page = lib.paper.sheet({ map: blankSlot(sheetTex, ctx), width: PAGE_W, shadowOpacity: 0, shadowBlur: 0.12, shadowOffset: [0.03, -0.06] });
    s.page.group.position.set(...PAGE_C);
    s.page.group.rotation.x = -Math.PI / 2;
    s.page.group.traverse((o) => (o.userData.noReflect = true));
    scene.add(s.page.group);
    s.pageLight = pageLight(s.page, { center: PAGE_OFF, soft: LIGHT_SOFT });
    s.room = roomLight(WORLDS.day, ctx.renderW / ctx.renderH);
    scene.add(s.room.mesh);
    s.landShadow = lib.floor.contactShadow({ w: CARD_W, h: CARD_H, radius: 0.01, blur: 0.09, color: '#2A241E', opacity: 0 });
    s.landShadow.position.set(...PAGE_OFF, 0.0005);
    s.landShadow.renderOrder = 1; // over the face, under the landing card (3), which writes no depth
    s.page.group.add(s.landShadow);

    s.v = new THREE.Vector3();
    const col = (h) => new THREE.Color(h);
    s.col = { apart: INK_APART.map(col) };

    // Type.
    const T_ = lib.type;
    s.word = T_.headline(ctx.el, { en: C.word, y: 872, size: 128, world: 'night' });
    s.labels = ['D', 'S'].map((en) => T_.text(ctx.el, { kind: 'headline', en, size: 64, world: 'night', color: '#FCFAF6' }));
    s.head = T_.headline(ctx.el, { en: 'Drawn in\nseconds.', zh: C.headlineZh, x: 100, y: 548, align: 'left', valign: 'bottom', size: 104, zhSize: 44, world: 'night' });
    s.sub = T_.sub(ctx.el, { en: C.sub.split(/(?<=\.) /).join('\n'), x: 102, y: 596, align: 'left', valign: 'top', size: 34, world: 'night', stagger: 0.16 });
    s.layers = T_.headline(ctx.el, { en: C.layers, zh: C.layersZh, y: 906, size: 100, zhSize: 42, world: 'night' });
  },

  update(t, ctx) {
    const { lib, camera, post } = ctx;
    const { ease: E, camera: cam } = lib;
    const s = ctx.state;
    const seg = E.seg;

    // ---- the mark (bar 16) -----------------------------------------------------------
    // The strokes draw with a 24° swing about the crossing, then run into the point
    // (each shrinks about its midpoint, which is the crossing).
    const shrink = E.cubicIn(seg(t, ...T.shrink));
    const draw = [fast(seg(t, 0.0, 0.8)), fast(seg(t, 0.13, 0.93))];
    s.logo.set({ supply: draw[0] * (1 - shrink), demand: draw[1] * (1 - shrink), axis: E.quintOut(seg(t, 0.32, 1.1)) });
    s.logo.materials.axis.uniforms.uOpacity.value = 0.4 * (1 - E.sineInOut(seg(t, ...T.axisOut)));
    const swing = [24 * (1 - E.expoOut(seg(t, 0.0, 1.2))), -24 * (1 - E.expoOut(seg(t, 0.13, 1.33)))];
    ['supply', 'demand'].forEach((k, i) => {
      const b = s.strokeBase[i];
      const a = swing[i] * DEG;
      const g = s.logo[k];
      const rot = b.rot + a;
      const slide = 0.5 * shrink * STROKE_LEN;
      g.position.set(
        b.pos.x * Math.cos(a) - b.pos.y * Math.sin(a) + slide * Math.cos(rot),
        b.pos.x * Math.sin(a) + b.pos.y * Math.cos(a) + slide * Math.sin(rot),
        b.pos.z,
      );
      g.rotation.z = rot;
    });
    // The point drops into the crossing on beat 3 (33.0), takes in the strokes with a
    // flash, and the light it gives turns into the canvas.
    const fall = E.cubicIn(seg(t, T.dot - 0.42, T.dot));
    const since = Math.max(0, t - T.dot);
    const took = Math.max(0, t - T.shrink[1]);
    const dotIn = E.sineOut(seg(t, T.dot - 0.5, T.dot - 0.2));
    const flash = (1 - Math.exp(-since / 0.035)) * Math.exp(-since / 0.4);
    const flash2 = (1 - Math.exp(-took / 0.05)) * Math.exp(-took / 0.3);
    const dotScale = 0.62 * dotIn * (1 + 0.25 * flash2) * (1 - E.sineInOut(seg(t, ...T.dotOut)));
    s.logo.set({ dot: { position: [0, 0.3 * (1 - fall), s.logo.dotRest.z + 0.12 * (1 - fall)], scale: dotScale, glow: 2.2 + 1.2 * flash + 2.2 * flash2 } });
    s.logo.group.visible = t < T.dotOut[1];
    s.logo.group.updateMatrixWorld();

    // ---- the window and the clip ---------------------------------------------------------
    // The card lights as a disc of light from the point, the app around it stays faint
    // while D and S are drawn and comes up with the headline. Before the explode the
    // lights go down around the card again; on 42.0 it all goes dark as the diagram (and
    // its light) lifts out.
    const rv = seg(t, ...T.reveal);
    const revealR = 4.6 * (1 - Math.pow(1 - rv, 2.6));
    const around = 0.08 * E.sineInOut(seg(t, ...T.dimApp)) + 0.92 * E.sineInOut(seg(t, ...T.appUp));
    const spot = E.sineInOut(seg(t, ...T.spot));
    const out = E.sineInOut(seg(t, 10.0, 10.2));
    const recede = E.quintIn(seg(t, 10.0, 10.6));
    s.win.group.position.set(0, -0.3 * recede, -1.6 * recede);
    s.win.group.visible = rv > 0 && out < 1;
    if (s.win.group.visible) {
      const pic = s.player.at(t);
      s.screen.set({
        ...pic, opacity: 1 - out, dim: 1,
        reveal: [MARK_P[0], MARK_P[1], revealR, 0.24], spare: CARD_RECT, outer: around * (1 - 0.82 * spot),
      });
    }

    // ---- the stack ------------------------------------------------------------------------
    const take = E.sineInOut(seg(t, ...T.take));
    const lift = fast(seg(t, ...T.lift));
    const collapse = cubicBezier(0.55, 0, 0.35, 1)(seg(t, ...T.collapse));
    const breathe = 0.05 * E.smoothstep(11.2, 13.9, t);
    const spread = LAYERS.map((_, i) => {
      const x = E.spring(t - 10.25 - 0.05 * i, { freq: 0.75, damping: 0.8 }) + breathe;
      return 0.44 * i * x * (1 - collapse);
    });
    const fly = soft(seg(t, ...T.fly));
    const pos = lerp3(lerp3(CARD, HOVER, lift), LAND, fly);
    pos[2] += 0.003;
    s.stack.group.position.set(...pos);
    // Paper → glass behind a narrow band of light; back to paper under a broad, dim one.
    const back = t > 12;
    const wipe = E.sineInOut(seg(t, ...T.wipe)) * (1 - E.sineInOut(seg(t, ...T.unwipe)));
    // It stays to the end: it is the page's diagram exactly (fading it would ghost the lines).
    const stackOp = take;
    s.stack.group.visible = stackOp > 0.001;
    const panes = E.sineInOut(seg(t, 10.45, 11.0)) * (1 - E.sineInOut(seg(t, 13.9, 14.3)));

    // ---- the page, the day ----------------------------------------------------------------
    const pageIn = E.sineInOut(seg(t, ...T.pageIn));
    // Before it spreads, the page lies in a pool of light around its blank diagram slot. The
    // room's light (frame heights) grows from under the page to the same end radius, so it
    // spills off the page's edges just behind the page's own light.
    const lu = seg(t, ...T.light);
    const light = E.sineInOut(lu);
    const lightR = E.lerp(LIGHT_R[0], LIGHT_R[1], light);
    const day = light;
    s.page.group.visible = pageIn > 0.001;
    s.page.edge.visible = lu >= 1; // unlit: only once the light has reached the page's edges
    s.page.set({ opacity: pageIn, shadowOpacity: 0.16 * day });
    s.pageLight.set({ r: lightR, amb: 0.07 + 0.93 * E.smoothstep(0.5, 1, lu) });
    // The diagram's shadow gathers under it as it comes down, and goes as it becomes print.
    const h = Math.max(0, pos[1] - LAND[1]);
    const near = 1 - E.smoothstep(0.03, 1.3, h);
    s.landShadow.material.opacity = 0.34 * near * pageIn * (1 - E.sineInOut(seg(t, 15.0, 15.4)));
    s.landShadow.scale.setScalar(1 + 0.3 * Math.min(1, h / 1.3));
    s.landShadow.position.set(PAGE_OFF[0] + 0.07 * h, PAGE_OFF[1] - 0.1 * h, 0.0005);

    // ---- camera ---------------------------------------------------------------------------
    const markSweep = E.quintOut(seg(t, 0, 1.9));
    const pMark = {
      target: MARK_P,
      dist: distForPx(1.5148, 440) * (1.07 - 0.07 * markSweep),
      az: -22 + 20 * markSweep,
      el: 8 - 6.5 * markSweep,
      shift: [0, 0.066],
    };
    // Close on the card while D and S are drawn.
    const hold = seg(t, 2.9, 4.2);
    const pCard = { target: CARD, dist: distForPx(CARD_W, 1000) * (1 - 0.02 * hold), az: -3 + 1.5 * hold, el: 2, shift: [0, 0.01] };
    // Pulled back: the whole app floating on the right, the headline on the left.
    const creep = seg(t, 4.6, 8.3);
    const pSide = {
      target: [0.1, -0.06, 0],
      dist: distForPx(WIN_W, 1130) * (1 - 0.03 * creep),
      az: -17 + 3 * creep,
      el: 3.5 - 1 * creep,
      shift: [0.19, 0.02],
    };
    // Close enough to read the Shade menu.
    const pClose = { target: [0.02, 0.0, 0], dist: distForPx(WIN_W, 1590) * (1 - 0.015 * seg(t, 9.0, 10)), az: -2.5 + 1.5 * seg(t, 9, 10), el: 1.5, shift: [0, 0] };
    const stackC = [pos[0], pos[1], pos[2] + 0.5 * spread[5]];
    const drift3 = seg(t, 11.0, 14.0);
    const pApart = { target: stackC, dist: distForPx(CARD_W, 640) * (1 - 0.03 * drift3), az: -34 + 9 * drift3, el: 13 - 2.5 * drift3, shift: [0, 0.165] };
    // Overhead, first on the falling diagram, then settling on its slot.
    const pEnd = { target: lerp3(pos, LAND, E.sineInOut(seg(t, 14.5, 15.3))), dist: END_DIST * (1 - 0.012 * seg(t, 15.2, 16.4)), az: 0, el: END_EL, shift: [0, 0] };

    const p = chain(pMark, [
      [pCard, cubicBezier(0.45, 0, 0.2, 1)(seg(t, ...T.closeIn))],
      [pSide, E.quintInOut(seg(t, ...T.pull))],
      [pClose, E.quintInOut(seg(t, ...T.push))],
      [pApart, cubicBezier(0.35, 0, 0.12, 1)(seg(t, ...T.orbit))],
      [pEnd, E.cubicInOut(seg(t, ...T.crane))],
    ]);
    const d = cam.drift(t, 16, { amp: 0.6, rate: 0.06, roll: 0.07, dolly: 0.004 });
    const calm = 1 - E.smoothstep(14.0, 15.2, t);
    cam.orbit(camera, {
      target: p.target,
      dist: p.dist * (1 + (d.dist - 1) * calm),
      az: p.az + d.az * calm,
      el: p.el + d.el * calm,
      roll: d.roll * calm,
      fov: FOV,
      shift: p.shift,
    });
    // The diagram faces the camera from the collapse to the touch, so it stays a flat card on
    // screen while the page swings in beneath it; the drop waits for the crane (clearance).
    const face = E.sineInOut(seg(t, ...T.face));
    const flat = E.sineInOut(seg(t, ...T.flat));
    s.v.copy(camera.position).sub(s.stack.group.position);
    const yaw = Math.atan2(s.v.x, s.v.z);
    const pitch = Math.atan2(s.v.y, Math.hypot(s.v.x, s.v.z));
    s.stack.group.rotation.set(-E.lerp(face * pitch, Math.PI / 2, flat), face * yaw * (1 - flat), 0, 'YXZ');

    // The room follows the page's light; once it covers the frame the day backdrop takes over.
    s.v.set(...LAND).project(camera);
    const cu = (s.v.x + 1) / 2, cv = (s.v.y + 1) / 2;
    s.v.set(LAND[0] + 1, LAND[1], LAND[2]).project(camera);
    const k = Math.hypot(((s.v.x + 1) / 2 - cu) * (ctx.renderW / ctx.renderH), (s.v.y + 1) / 2 - cv); // frame heights per unit
    s.room.set({ center: [cu, cv], r: lu > 0 && lu < 1 ? LIGHT_R[1] * light * k : 0, soft: LIGHT_SOFT * k });
    const w = lu >= 1 ? WORLDS.day : WORLDS.night;
    ctx.backdrop.userData.set({ top: w.top, bottom: w.bottom, glow: w.glow, center: w.center, radius: w.radius, glowAmount: w.glowAmount });

    // Per-pane depth of field while the layers are apart.
    const dofK = E.smoothstep(10.35, 11.1, t) * (1 - E.smoothstep(13.85, 14.3, t));
    s.stack.set({
      spread, opacity: stackOp, wipe, soft: back ? 0.42 : 0.2, sheen: back ? 0.45 : 0.85, glassInk: s.col.apart, panes, glint: -0.8 + 1.6 * seg(t, 10.4, 14.0),
      dof: { focus: camera.position.distanceTo(s.v.set(...stackC)), aperture: 150 * dofK * (ctx.renderH / 1080), maxBlur: 7 * (ctx.renderH / 1080) },
    });

    // ---- world, post --------------------------------------------------------------------------
    s.floor.set({ opacity: 1 - E.sineInOut(seg(t, ...T.floorOut)), center: [pos[0], Math.min(pos[2], 1.0)], reflect: E.lerp(0.14, 0.3, E.sineInOut(seg(t, 9.8, 10.8))) });
    s.dust.set({ time: 32 + t, focus: camera.position.distanceTo(s.v.set(...p.target)), bright: 0.42 * (1 - day), fov: FOV, H: ctx.renderH });
    post.dof = null;
    const dotBloom = 1 - E.sineInOut(seg(t, ...T.dotOut));
    post.bloom = { strength: 1.3 * dotBloom, radius: 0.62, threshold: 1, knee: 0.45 };
    post.vignette = E.lerp(0.22, 0.06, day);
    const moving = (a, b) => t > a && t < b;
    post.samples = moving(0, 1.3) || moving(10.0, 11.6) || moving(13.9, 15.5) ? 12 : moving(...T.closeIn) || moving(...T.pull) || moving(...T.push) ? 8 : 0;

    // ---- type -----------------------------------------------------------------------------------
    s.word.set(t, T.word[0], T.word[1]);
    const anchors = [[0.55, -0.37, swing[1]], [0.55, 0.45, swing[0]]]; // D at demand's end, S at supply's
    s.labels.forEach((lab, i) => {
      const [lx, ly, sw] = anchors[i];
      const a = sw * DEG;
      s.v.set(lx * Math.cos(a) - ly * Math.sin(a), lx * Math.sin(a) + ly * Math.cos(a), 0.05).applyMatrix4(s.logo.group.matrixWorld).project(camera);
      lab.place({ x: (s.v.x + 1) * 960, y: (1 - s.v.y) * 540 });
      lab.set(t, i === 1 ? 0.62 : 0.74, T.word[1] - 0.05);
    });
    s.head.set(t, T.head[0], T.head[1]);
    s.sub.set(t, T.sub[0], T.sub[1]);
    s.layers.set(t, T.layers[0], T.layers[1]);
  },
};

export default scene;
