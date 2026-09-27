// diagrams — bars 16–24, night → day (FILM.md §3). The hero.
// 32.0 hit: black; the mark's cream strokes sweep in and settle as D and S on axes, the
// blue point drops into their crossing, "Diagrams.". 33.7: the canvas card lights up
// behind the mark (its axes are the mark's). Close on the card, the real clip draws D and
// S at 1× (they land on 35.0 and 36.0); then the camera pulls back to the whole app and
// "Drawn in seconds." comes in. The clip is retimed so each gesture lands on a beat: E₀
// 36.5, guides 37.0, a cut past the label edits, the tax shift 38.0, E₁ 38.5, tax revenue
// 40.0, DWL 40.75; then the finished diagram holds under a slow push. 42.0 whoosh: the
// diagram lifts out of the window, turns to glass and comes apart into its layers, lit one
// per beat ("Every line stays editable."). 46.0 whoosh: the layers collapse and the
// diagram flies down onto the printed page lying in the dark; it lands on 47.0, the light
// spreads from it across the page and the room turns to day for the 48.0 handoff.
import { COPY, cueAt, sceneStart } from '../../timeline.mjs';
import { cubicBezier } from '../lib/ease.js';
import { remap, edit, placeEdit } from './diagrams/remap.js';
import { diagramStack, ASPECT, LAYERS } from './diagrams/stack.js';
import { blankSlot, pageLight, roomLight } from './diagrams/light.js';
import { WORLDS } from '../lib/backdrop.js';
import { extendScreen } from './diagrams/screen.js';
import { player } from './diagrams/player.js';
import { chain } from './diagrams/poses.js';
import { handoff } from './marks/kit.js';
import { W as FW, H as FH, pick } from '../lib/format.js';

const C = COPY.diagrams;
const TEXT_W = 560; // design px from x = 100 to the window's left edge
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
/** Camera distance at which `worldW` spans `px` design px (frame height 1080 or 1920). */
const distForPx = (worldW, px) => (worldW * FH) / (px * VIEW_H);
// The handoff: the sheet 1100 px wide (×1/0.992 on the cut); portrait: 960 px, FILM-9x16.md.
const END_DIST = pick({ landscape: distForPx(PAGE_W, 1100) * 0.992, portrait: distForPx(PAGE_W, 960) });
const LIGHT_SOFT = 3.6; // the page light's soft edge (world units)
// A pool that covers the landing slot, then out past the frame's far corners at the handoff.
const LIGHT_R = [1.5 + LIGHT_SOFT, 4.8 + LIGHT_SOFT];
const CARD_H = CARD_W / ASPECT;
const DWL = [...css(502, 500), 0]; // the DWL triangle's centre on the canvas

// ---- layout per frame format (FILM-9x16.md) ---------------------------------------------
// Portrait: the mark centred high, the card big and centred, the headline block above it
// (y 260–720), the layers fanning down the frame, the page landing centred at y 900.
const L = pick({
  landscape: {
    markPx: 440, markShift: [0, 0.066],
    cardPx: 1000, cardAz: -3, cardShift: [0, 0.01],
    side: (c) => ({ target: [0.1, -0.06, 0], dist: distForPx(WIN_W, 1330) * (1 - 0.03 * c), az: -17 + 3 * c, el: 3.5 - 1 * c, shift: [0.25, 0.02] }),
    dwl: { target: DWL, dist: distForPx(WIN_W, 1645), az: -11, el: 2, shift: [0.1245, -0.026] },
    apart: (c, d) => ({ target: c, dist: distForPx(CARD_W, 640) * (1 - 0.03 * d), az: -34 + 9 * d, el: 13 - 2.5 * d, shift: [0, 0.165] }),
    endShift: [0, 0],
    appUp: 0.92,
    word: { y: 812, size: 120 },
    head: { x: 100, y: 548, size: 104, maxWidth: TEXT_W },
    subs: { x: 102, y: 596, maxWidth: TEXT_W },
    layers: { y: 906 },
  },
  portrait: {
    markPx: 600, markShift: [0, 0.075],
    cardPx: 980, cardAz: -2, cardShift: [0, 0.03],
    // A pedestal: the card rises to the upper middle, the app around it, and the headline
    // comes in on the dark below the window (its top runs under the Reels header).
    side: (c) => ({ target: CARD, dist: distForPx(CARD_W, 880) * (1 - 0.03 * c), az: -6 + 3 * c, el: 3 - 1 * c, shift: [-0.028, (960 - 640) / 1920] }),
    // DWL stays where the side pose put it (x ≈ 446, y ≈ 632) while the card grows about it.
    dwl: { target: DWL, dist: distForPx(CARD_W, 1000), az: -4, el: 1.5, shift: [(446 - 540) / 1080, (960 - 632) / 1920] },
    // From above: the layers step down the frame, back to front, under the headline.
    apart: (c, d) => ({ target: c, dist: distForPx(CARD_W, 700) * (1 - 0.03 * d), az: -16 + 8 * d, el: 30 - 4 * d, shift: [0, -0.07] }),
    endShift: [0, (960 - 900) / 1920],
    appUp: 0.62,
    word: { y: 1250, size: 120 },
    head: { x: 90, y: 1120, size: 100, maxWidth: 860, valign: 'top' },
    subs: { x: 92, maxWidth: 860, row: 30 }, // one row under the head, in order
    layers: { y: 420 },
  },
});

// ---- time (scene seconds; film = 32 + t) --------------------------------------------
// The explode, the fly to the page and the touch hang off their cues (EX, FLY, TOUCH).
const START = sceneStart('diagrams');
const EX = cueAt('diagrams.explode') - START;
const FLY = cueAt('diagrams.fly') - START;
const TOUCH = cueAt('diagrams.touch') - START;
const T = {
  word: [0.1, 1.42],
  dot: 1.0,
  shrink: [1.38, 1.74], // the strokes run into the point
  reveal: [1.7, 3.5], // the card lights from the point (covered on ~34.2), then the app
  axisOut: [1.6, 1.84],
  dotOut: [1.72, 1.97], // gone before the card is fully lit: no dot on the blank canvas
  dimApp: [2.05, 2.6], // the app around the card, faint while D and S are drawn
  closeIn: [1.42, 2.6], // within 2% before D's drag starts (34.38)
  pull: [4.0, 5.0], // after S lands on 36.0: the camera holds still while a curve draws
  appUp: [3.95, 4.8],
  head: [4.4, 9.35],
  subs: [4.8, 6.0, 7.15], // each line on its action: the curves, S₁ appearing, the Shade menu
  subOut: 9.4,
  push: [8.6, 10.6], // slowly toward the DWL triangle; the orbit takes over from 10.0
  spot: [EX, EX + 0.4],
  takeInk: [EX - 0.2, EX - 0.1], // the stack's ink over the clip's (they coincide: black stays black)
  takeCard: [EX - 0.1, EX], // then its card slides in between, covering the clip's selection
  lift: [EX, EX + 1.3],
  winOut: [EX + 0.05, EX + 0.6], // the window recedes under the lift (to EX + 0.65) and the sweep
  orbit: [EX, EX + 1.9],
  wipe: [EX, EX + 0.9], // the band crosses the card ~42.1–42.8
  apart: EX + 0.25, // the layers spring apart
  panes: [EX + 0.45, EX + 1.0],
  lit: EX + 1, // one layer lit per beat, back to front
  layers: [EX + 1.2, EX + 3.75],
  collapse: [FLY - 0.1, FLY + 0.45],
  unwipe: [FLY - 0.05, FLY + 0.65],
  face: [FLY - 0.1, FLY + 0.4], // the closing diagram turns to face the camera, and keeps facing it
  crane: [FLY - 0.15, FLY + 1.05], // up and over: overhead before the diagram comes down
  fly: [FLY + 0.3, FLY + 1.2], // drops onto its slot, touching on ~47.1 (it never cuts the page)
  cardGone: [FLY + 0.5, FLY + 0.9], // its white goes on the way down: only the ink registers
  flat: [TOUCH - 0.15, TOUCH + 0.15], // lies exactly flat for the touch
  floorOut: [FLY + 0.2, FLY + 0.9],
  pageIn: [FLY + 0.05, FLY + 0.6], // the page lies lit in its pool before the diagram comes near it
  light: [TOUCH + 0.05, TOUCH + 0.75], // day by the 47.75 dissolve
  room: [TOUCH - 0.1, TOUCH + 0.75], // ends with `light`: the backdrop swaps to day on that frame
};

// Clip retiming: [scene t, clip t, pinned rate] keys on the clip's events
// (clips/draw-diagram.json). The drags play at exactly 1× on the 60 fps grid (film frame ↔
// clip frame), so a drag never blends two frames. One cut: after P0 is typed (frame 403)
// to S picked for the shift (frame 585), where the pointer is at the same spot; the label
// subscripting it skips would otherwise run at ~4×. Everything else stays ≤ ~2.3×.
const F = (n) => n / 60;
const CUT = { at: 5.5, dur: 0.16, a: 403, b: 585 };
const SKIP = (CUT.b - CUT.a) / 60;
const PLAY = edit(remap([
  [1.4, 0.0], [2.0, 0.4],
  [F(143), F(60), 1], [F(180), F(97), 1], // D at 1×, lands on 35.0
  [F(203), F(176), 1], [F(240), F(213), 1], // S at 1×, lands on 36.0
  [4.5, 4.85], // E₀
  [5.0, 5.85], // drop to y
  [CUT.at, F(CUT.a)], // Q0, P0 typed: the cut
  [6.0, 10.367 - SKIP], // Shift a copy
  [6.5, 10.933 - SKIP], // E₁
  [8.0, 12.917 - SKIP], // tax revenue added
  [8.75, 14.267 - SKIP], // DWL added
  [10.0, 14.45 - SKIP], [10.8, 14.55 - SKIP], // the finished diagram, nearly still
]), 60, CUT);
const POPS = [775, 856]; // clip frames where "Add" closes the menu and the shading appears
// The Shade menu with its shadow (css px), where it fades out on "Add".
const MENU_RECT = [...css(622, 578), ...css(1086, 58)];

// Glass-state ink per layer: the tax (shift, shading) in the accent; neutral while one
// layer at a time is lit in the accent.
const INK_APART = ['#AEAEB2', '#4AA3FF', '#8E8E93', '#F5F5F7', '#6CB6FF', '#F5F5F7'];
const INK_NEUTRAL = ['#AEAEB2', '#C7C7CC', '#8E8E93', '#F5F5F7', '#E5E5EA', '#F5F5F7'];

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
    s.player = player(s.clip, PLAY, { pops: POPS, popRect: MENU_RECT });
    placeEdit(ctx, s.clip, 'draw-diagram', PLAY, [T.reveal[0], T.takeCard[1]]);

    // The diagram's layers, and the page it lands on (lying on the floor, top edge away).
    s.stack = await diagramStack(ctx, { width: CARD_W });
    scene.add(s.stack.group);
    // The page marks opens on (the two-part document), its diagram slot blank: the landed
    // stack is its diagram (registered exactly), so the printed one never shows twice.
    const sheetTex = await ctx.load.texture('question-start');
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
    s.col = { apart: INK_APART.map(col), neutral: INK_NEUTRAL.map(col), glass: INK_APART.map(col) };

    // Type.
    const T_ = lib.type;
    s.word = T_.headline(ctx.el, { en: C.word, y: L.word.y, size: L.word.size, world: 'night' }); // as opening's Supply./Demand.
    s.labels = C.curves.map((en) => T_.text(ctx.el, { kind: 'headline', en, size: 64, world: 'night', color: '#FCFAF6' }));
    // Left of the window: the head grows upwards from its baseline, the subs stack down.
    s.head = T_.headline(ctx.el, { en: C.headline, zh: C.headlineZh, x: L.head.x, y: L.head.y, align: 'left', valign: L.head.valign ?? 'bottom', size: L.head.size, zhSize: 44, world: 'night', maxWidth: L.head.maxWidth, maxLines: 3, zhMaxLines: 2 });
    // The sub-line, one sentence per action, each revealed as a unit.
    let y = L.subs.y;
    s.subs = C.subs.map((en) => {
      const b = T_.sub(ctx.el, { en, x: L.subs.x, y, align: 'left', valign: 'top', size: 34, world: 'night', maxWidth: L.subs.maxWidth, maxLines: 2 });
      y += b.lines * 34 * 1.2 * b.scale;
      return b;
    });
    if (L.subs.row != null) {
      // Portrait: the three sentences in one row under the head (wrapping if they must).
      let x = L.subs.x;
      y = L.head.y + s.head.el.offsetHeight + 22;
      for (const b of s.subs) {
        const w = b.el.offsetWidth;
        if (x > L.subs.x && x + w > L.subs.x + L.subs.maxWidth) [x, y] = [L.subs.x, y + 34 * 1.25];
        b.place({ x, y });
        x += w + L.subs.row;
      }
    }
    s.layers = T_.headline(ctx.el, { en: C.layers, zh: C.layersZh, y: L.layers.y, size: 104, zhSize: 44, world: 'night', ...(ctx.portrait ? { maxWidth: 860, maxLines: 3 } : {}) });
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
    const revealR = 5.6 * (1 - Math.pow(1 - rv, 1.8)); // a soft edge (1.0): no circle shows
    const around = 0.08 * E.sineInOut(seg(t, ...T.dimApp)) + L.appUp * E.sineInOut(seg(t, ...T.appUp));
    const spot = E.sineInOut(seg(t, ...T.spot));
    const out = E.sineInOut(seg(t, ...T.winOut)); // under the lift and the sweep: one gesture
    const recede = E.quintIn(seg(t, T.winOut[0], T.winOut[1] + 0.05));
    s.win.group.position.set(0, -0.3 * recede, -1.6 * recede);
    s.win.group.visible = rv > 0 && out < 1;
    if (s.win.group.visible) {
      const pic = s.player.at(t);
      s.screen.set({
        ...pic, opacity: 1 - out, dim: 1,
        reveal: [MARK_P[0], MARK_P[1], revealR, 1.0], spare: CARD_RECT, outer: around * (1 - 0.82 * spot),
        // Once the stack's card covers it, the canvas goes dark, so the glass shows the night.
        inner: 1 - E.sineInOut(seg(t, T.takeCard[1], T.takeCard[1] + 0.08)),
      });
    }

    // ---- the stack ------------------------------------------------------------------------
    // Never both whites half-transparent at once (the ink would go grey): the ink comes in
    // over the clip's own, then the card slides in beneath it.
    const takeInk = E.sineInOut(seg(t, ...T.takeInk));
    const take = E.sineInOut(seg(t, ...T.takeCard));
    const lift = fast(seg(t, ...T.lift));
    const collapse = cubicBezier(0.55, 0, 0.35, 1)(seg(t, ...T.collapse));
    const breathe = 0.05 * E.smoothstep(T.layers[0], T.collapse[0], t);
    const spread = LAYERS.map((_, i) => {
      const x = E.spring(t - T.apart - 0.05 * i, { freq: 0.75, damping: 0.8 }) + breathe;
      return 0.44 * i * x * (1 - collapse);
    });
    const fly = soft(seg(t, ...T.fly));
    const pos = lerp3(lerp3(CARD, HOVER, lift), LAND, fly);
    pos[2] += 0.003;
    s.stack.group.position.set(...pos);
    // Paper → glass behind a narrow band of light; back to paper under a broad, dim one.
    const back = t > EX + 2;
    const wipe = E.sineInOut(seg(t, ...T.wipe)) * (1 - E.sineInOut(seg(t, ...T.unwipe)));
    // It stays to the end: it is the page's diagram exactly (fading it would ghost the lines).
    const stackOp = takeInk;
    s.stack.group.visible = stackOp > 0.001;
    const panes = E.sineInOut(seg(t, ...T.panes)) * (1 - E.sineInOut(seg(t, T.collapse[0], T.collapse[0] + 0.4)));
    // One layer lit per beat from 43.0, back to front, the rest dimmed: separate objects.
    const lit = LAYERS.map((_, i) => {
      const b = T.lit + 0.5 * i;
      return E.smoothstep(b - 0.08, b + 0.1, t) * (1 - E.smoothstep(b + 0.42, b + 0.6, t));
    });
    const litAll = E.smoothstep(T.lit - 0.1, T.lit + 0.1, t) * (1 - E.smoothstep(T.lit + 2.9, T.lit + 3.2, t));
    const names = lit.map((l) => panes * l); // the lit pane's name only
    s.col.glass.forEach((c, i) => c.copy(s.col.apart[i]).lerp(s.col.neutral[i], litAll));
    // On its way down the card's white goes, so only the ink registers onto the page.
    const cardGone = E.sineInOut(seg(t, ...T.cardGone));
    const cardOp = take * (1 - cardGone);

    // ---- the page, the day ----------------------------------------------------------------
    const pageIn = E.sineInOut(seg(t, ...T.pageIn));
    // Before it spreads, the page lies in a pool of light around its blank diagram slot.
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
    s.landShadow.material.opacity = 0.34 * near * pageIn * (1 - cardGone);
    s.landShadow.scale.setScalar(1 + 0.3 * Math.min(1, h / 1.3));
    s.landShadow.position.set(PAGE_OFF[0] + 0.07 * h, PAGE_OFF[1] - 0.1 * h, 0.0005);

    // ---- camera ---------------------------------------------------------------------------
    const markSweep = E.quintOut(seg(t, 0, 1.9));
    const pMark = {
      target: MARK_P,
      dist: distForPx(1.5148, L.markPx) * (1.07 - 0.07 * markSweep),
      az: -22 + 20 * markSweep,
      el: 8 - 6.5 * markSweep,
      shift: L.markShift,
    };
    // Close on the card while D and S are drawn: only a 2% creep while a curve draws.
    const hold = seg(t, 2.3, 4.0);
    const pCard = { target: CARD, dist: distForPx(CARD_W, L.cardPx) * (1 - 0.02 * hold), az: L.cardAz + 1.5 * hold, el: 2, shift: L.cardShift };
    // Pulled back: the whole app floating on the right, the headline on the left.
    const creep = seg(t, 5.0, 8.6);
    const pSide = L.side(creep);
    // The finished diagram: a slow push toward the DWL triangle, clear of the type.
    // DWL stays where pSide put it (x 1199) while the window grows about it.
    const pDwl = L.dwl;
    const stackC = [pos[0], pos[1], pos[2] + 0.5 * spread[5]];
    const drift3 = seg(t, T.lit, FLY);
    const pApart = L.apart(stackC, drift3);
    // Overhead, first on the falling diagram, then settling on its slot.
    // It lands already creeping in; the dolly runs on through the cut into marks (registered there).
    const pEnd = { target: lerp3(pos, LAND, E.sineInOut(seg(t, T.cardGone[0], T.cardGone[0] + 0.8))), dist: END_DIST * handoff(lib, START + t), az: 0, el: END_EL, shift: L.endShift };

    const p = chain(pMark, [
      [pCard, cubicBezier(0.45, 0, 0.2, 1)(seg(t, ...T.closeIn))],
      [pSide, cubicBezier(0.4, 0, 0.2, 1)(seg(t, ...T.pull))], // a long soft landing, no whoosh
      [pDwl, E.sineInOut(seg(t, ...T.push))],
      [pApart, cubicBezier(0.35, 0, 0.12, 1)(seg(t, ...T.orbit))],
      [pEnd, E.cubicInOut(seg(t, ...T.crane))],
    ]);
    const d = cam.drift(t, 16, { amp: 0.6, rate: 0.06, roll: 0.07, dolly: 0.004 });
    const calm = 1 - E.smoothstep(FLY, FLY + 1.2, t);
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

    // The room's light spreads from the page outward as a pool whose falloff (1.8 frame
    // heights) is wider than the frame's half-height, so no edge shows: mid-way the page's
    // surround is lit and the corners still dark, never a flat grey room. It starts at the
    // page's edges (its centre is hidden by the page) and the radius grows linearly, so the
    // visible light eases in and out on its own. It covers the far corner (r − soft > 1.2)
    // before the day backdrop takes over.
    s.v.set(...LAND).project(camera);
    const room = seg(t, ...T.room);
    s.room.set({ center: [(s.v.x + 1) / 2, (s.v.y + 1) / 2], r: room > 0 && lu < 1 ? E.lerp(0.4, 3.0, room) : 0, soft: 1.8, alpha: 1 });
    const w = lu >= 1 ? WORLDS.day : WORLDS.night;
    ctx.backdrop.userData.set({ top: w.top, bottom: w.bottom, glow: w.glow, center: w.center, radius: w.radius, glowAmount: w.glowAmount });

    // Per-pane depth of field while the layers are apart.
    const dofK = E.smoothstep(EX + 0.35, EX + 1.1, t) * (1 - E.smoothstep(T.crane[0], FLY + 0.3, t));
    s.stack.set({
      // A narrow band: the ink flips where the paper crosses mid-grey, so no line fades out.
      spread, opacity: stackOp, card: cardOp, wipe, soft: back ? 0.14 : 0.1, sheen: back ? 0.45 : 0.85, glassInk: s.col.glass, panes, glint: -0.8 + 1.6 * seg(t, T.spot[1], FLY),
      lit, dim: 0.5 * litAll, labels: names,
      dof: { focus: camera.position.distanceTo(s.v.set(...stackC)), aperture: 150 * dofK * (ctx.renderH / 1080), maxBlur: 7 * (ctx.renderH / 1080) },
    });

    // ---- world, post --------------------------------------------------------------------------
    s.floor.set({ opacity: 1 - E.sineInOut(seg(t, ...T.floorOut)), center: [pos[0], Math.min(pos[2], 1.0)], reflect: E.lerp(0.14, 0.3, E.sineInOut(seg(t, T.takeInk[0], EX + 0.8))) });
    s.dust.set({ time: START + t, focus: camera.position.distanceTo(s.v.set(...p.target)), bright: 0.42 * (1 - day), fov: FOV, H: ctx.renderH });
    post.dof = null;
    const dotBloom = 1 - E.sineInOut(seg(t, ...T.dotOut));
    // A hard threshold before the card lights, so only the dot (> 1.0) blooms, never paper.
    post.bloom = { strength: 1.3 * dotBloom, radius: 0.62, threshold: 1, knee: 0.45 * (1 - E.sineInOut(seg(t, 1.5, 1.72))) };
    post.vignette = E.lerp(0.22, 0.06, day);
    const moving = (a, b) => t > a && t < b;
    // 12 also while the pointer crosses the dim app at ~4× between the two drags.
    post.samples = moving(0, 1.3) || moving(3.0, 3.4) || moving(EX, EX + 1.6) || moving(FLY - 0.1, FLY + 1.5) ? 12 : moving(...T.closeIn) || moving(...T.pull) || moving(...T.push) ? 8 : 0;

    // ---- type -----------------------------------------------------------------------------------
    s.word.set(t, T.word[0], T.word[1]);
    const anchors = [[0.55, -0.37, swing[1]], [0.55, 0.45, swing[0]]]; // D at demand's end, S at supply's
    s.labels.forEach((lab, i) => {
      const [lx, ly, sw] = anchors[i];
      const a = sw * DEG;
      s.v.set(lx * Math.cos(a) - ly * Math.sin(a), lx * Math.sin(a) + ly * Math.cos(a), 0.05).applyMatrix4(s.logo.group.matrixWorld).project(camera);
      lab.place({ x: (s.v.x + 1) * (FW / 2), y: (1 - s.v.y) * (FH / 2) });
      lab.set(t, i === 1 ? 0.62 : 0.74, T.word[1] - 0.05);
    });
    s.head.set(t, T.head[0], T.head[1]);
    s.subs.forEach((sub, i) => sub.set(t, T.subs[i], T.subOut));
    s.layers.set(t, T.layers[0], T.layers[1]);
  },
  // Under the touch cue's own hit, and the day coming up after it.
  events: [
    { t: TOUCH, kind: 'hit', strength: 0.35, note: 'diagram touches the page' },
    { t: TOUCH + 0.05, kind: 'swell', strength: 0.4, note: 'the day comes up' },
  ],
};

export default scene;
