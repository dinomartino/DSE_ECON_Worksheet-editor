// everywhere — bars 36–40, day (FILM.md §3). The 72.0 hit cuts to the warm world on the
// real Export dialog. On each tick (72.5–74.5) one of its options lifts out of the dialog
// as a glass chip and springs into a cluster beside it: PDF, Answer key, Kahoot, Blooket,
// ZipGrade. The camera trucks right, everything whooshing off-frame, and lands on the
// browser window on 76.0; the Mac and Windows windows slide in from depth on 77.0 and 78.0,
// each earlier one stepping back, while "In your browser. On Mac. On Windows." lands a
// phrase per window.
import { COPY } from '../../timeline.mjs';
import { cubicBezier } from '../lib/ease.js';
import { glassChip } from './everywhere/glassChip.js';
import { softShadow } from './everywhere/shadow.js';

const C = COPY.everywhere;
const PHRASES = C.headline.split(/(?<=\.)\s+/); // In your browser. / On Mac. / On Windows.

// Scene seconds (film − 72).
const T = {
  chips: [0.5, 1.0, 1.5, 2.0, 2.5],
  truck: [3.2, 4.0],
  windows: [4.0, 5.0, 6.0],
  zh: 6.35,
};

// The Export dialog, cropped to its own rounded rectangle in the still (px).
const STILL = { path: 'stills/export-other-apps.png', W: 2880, H: 1800 };
const DIALOG = { x: 963, y: 177, w: 954, h: 1446, radius: 27 };
const CARD_H = 4.45;
const CARD = { pos: [-1.8, 0.0, 0], yaw: 0.16 };
// Each chip lifts from its label in the dialog (px centre in the still).
const LABELS = [[1150, 559], [1305, 748], [1349, 935], [1473, 935], [1075, 937]];
// Chip cluster: two rows centred on ROW_X (world), chips at depth CHIP_Z.
const ROWS = [{ y: 0.37, items: [0, 1] }, { y: -0.27, items: [2, 3, 4] }];
const ROW_X = 2.3;
const CHIP_Z = 0.35;
const CHIP_GAP = 0.12;
const UNIT = 0.0047; // world units per design px at the chips' depth

// The windows live one truck to the right. Slot 0 = front.
const OFF = 10.6;
const SLOTS = [
  { pos: [1.62, -0.62, 0.5], rot: [0, -0.2, 0] },
  { pos: [2.3, 0.5, -1.5], rot: [0, -0.2, 0] },
  { pos: [2.95, 1.55, -3.55], rot: [0, -0.2, 0] },
];
const FROM = { pos: [4.6, -1.6, -11], rot: [0, -0.45, 0] }; // where Mac and Windows arrive from
const WINDOWS = [
  { variant: 'browser', still: 'stills/start-screen.png' },
  { variant: 'mac', still: 'stills/editor-clean.png' },
  { variant: 'windows', still: 'stills/diagram-canvas.png' },
];
const WIN_W = 3.9;
const land = cubicBezier(0.45, 0, 0.12, 1); // from rest, lands soft on the beat
const truckEase = cubicBezier(0.6, 0, 0.18, 1); // from rest, fast through the middle, soft landing
const TEXT_X = 118;
const TEXT_Y = [392, 510, 628];

/** A soft macOS-like drop shadow behind a lib.win window: ambient + key, offset down. */
function dropShadow(win) {
  const { width: w, height: h } = win;
  const amb = softShadow({ w: w * 0.98, h: h * 0.97, r: 0.1, s: 0.3, opacity: 0.14 });
  const key = softShadow({ w: w * 0.96, h: h * 0.96, r: 0.05, s: 0.07, opacity: 0.12 });
  amb.position.set(0, -0.15, -0.07);
  key.position.set(0, -0.06, -0.04);
  win.group.add(amb, key);
  return (k) => {
    amb.material.opacity = 0.14 * k;
    key.material.opacity = 0.12 * k;
  };
}

const scene = {
  id: 'everywhere',
  world: 'day',
  async setup(ctx) {
    const { lib, scene, THREE } = ctx;
    const s = (ctx.state = {});

    // The Export dialog.
    const cardW = CARD_H * (DIALOG.w / DIALOG.h);
    s.card = lib.win.appWindow({ variant: 'none', width: cardW, aspect: DIALOG.w / DIALOG.h, shadow: false, screen: await ctx.load.texture(STILL.path) });
    s.card.material.uniforms.uRadius.value = (DIALOG.radius / DIALOG.w) * cardW;
    s.card.set({ crop: [DIALOG.x / STILL.W, 1 - (DIALOG.y + DIALOG.h) / STILL.H, DIALOG.w / STILL.W, DIALOG.h / STILL.H] });
    dropShadow(s.card);
    s.card.group.position.set(...CARD.pos);
    s.card.group.rotation.y = CARD.yaw;
    scene.add(s.card.group);
    s.card.group.updateMatrixWorld(true);
    s.from = LABELS.map(([x, y]) => s.card.group.localToWorld(new THREE.Vector3(
      ((x - DIALOG.x) / DIALOG.w - 0.5) * cardW,
      (0.5 - (y - DIALOG.y) / DIALOG.h) * s.card.height,
      0.02,
    )).toArray());

    // Chips and their slots.
    s.chips = C.chips.map((text) => glassChip(text, { unit: UNIT }));
    s.to = [];
    for (const row of ROWS) {
      const total = row.items.reduce((a, i) => a + s.chips[i].w, 0) + CHIP_GAP * (row.items.length - 1);
      let x = ROW_X - total / 2;
      for (const i of row.items) {
        s.to[i] = [x + s.chips[i].w / 2, row.y, CHIP_Z];
        x += s.chips[i].w + CHIP_GAP;
      }
    }
    // The label's height in the dialog relative to the chip's: where the lift starts.
    s.labelScale = ((21 / DIALOG.h) * s.card.height) / (0.46 * s.chips[0].h);
    for (const c of s.chips) scene.add(c.group);

    // Windows.
    s.wins = [];
    for (const w of WINDOWS) {
      const tex = await ctx.load.texture(w.still);
      const win = lib.win.appWindow({ variant: w.variant, width: WIN_W, screen: tex, shadow: false });
      win.shadow = dropShadow(win);
      win.group.visible = false;
      scene.add(win.group);
      s.wins.push(win);
    }

    // Type.
    const T_ = lib.type;
    s.lines = PHRASES.map((en, i) => T_.headline(ctx.el, { en, x: TEXT_X, y: TEXT_Y[i], size: 96, align: 'left', world: 'day' }));
    s.zh = T_.text(ctx.el, { kind: 'headline', en: '', zh: C.headlineZh, zhSize: 40, zhGap: 0, x: TEXT_X + 4, y: 724, align: 'left', world: 'day' });
  },

  update(t, ctx) {
    const { lib, camera, post } = ctx;
    const { ease: E, camera: cam } = lib;
    const s = ctx.state;

    // --- camera: a settle after the hit, a slow push, the truck, then the windows' drift ----
    const truck = truckEase(E.seg(t, T.truck[0], T.truck[1]));
    const d = cam.drift(t, 36, { amp: 0.7, rate: 0.07, roll: 0.08, dolly: 0.004 });
    const settle = 1 - E.expoOut(E.seg(t, 0, 1.4));
    const dist = 10 * (1 + 0.045 * settle) * (1 - 0.022 * E.seg(t, 0, 3.4)) * (1 - 0.03 * E.seg(t, T.truck[1], 8.2));
    // After the truck the aim rises with the stack as each window arrives.
    const stack = land(E.seg(t, T.windows[1] - 0.7, T.windows[1] + 0.3)) + land(E.seg(t, T.windows[2] - 0.7, T.windows[2] + 0.3));
    const aimY = E.lerp(-0.42, 0.15, stack / 2);
    cam.orbit(camera, {
      target: [E.lerp(0.1, OFF + 0.25 - 0.12 * (1 - stack / 2), truck), E.lerp(0.02, aimY, truck), 0],
      dist: dist * d.dist,
      az: E.lerp(2.2 - 1.6 * E.sineInOut(E.seg(t, 0, 3.4)), 2.5 - 3 * E.sineInOut(E.seg(t, T.truck[1] - 0.6, 8.2)), truck) + d.az,
      el: 1.6 + 0.4 * truck + d.el,
      roll: d.roll,
      fov: 30,
    });

    // --- chips: each lifts out of its label and springs into the cluster ------------------
    s.chips.forEach((chip, i) => {
      const t0 = T.chips[i];
      const p = E.spring(t - t0, { freq: 1.55, damping: 0.74 });
      const grow = E.spring(t - t0, { freq: 1.9, damping: 0.72 });
      const a = s.from[i], b = s.to[i];
      const lift = 0.55 * Math.sin(Math.PI * E.clamp(p)); // arcs toward the camera, then settles
      chip.group.position.set(E.lerp(a[0], b[0], p), E.lerp(a[1], b[1], p) + 0.1 * lift, E.lerp(a[2], b[2], p) + lift);
      chip.group.scale.setScalar(E.lerp(s.labelScale, 1, grow));
      chip.group.rotation.set(0, E.lerp(CARD.yaw, 0, E.clamp(p)), -0.05 * Math.sin(Math.PI * E.clamp(p)));
      const bob = 0.012 * lib.noise.noise1(t * 0.6, 50 + i);
      chip.group.position.y += bob;
      chip.set({ opacity: E.smoothstep(t0 - 0.01, t0 + 0.12, t), shadow: E.clamp(grow) });
    });

    // --- windows: the browser is revealed by the truck; Mac and Windows slide in from depth -
    s.wins.forEach((win, i) => {
      const a = i === 0 ? 1 : land(E.seg(t, T.windows[i] - 0.62, T.windows[i] + 0.12));
      if (a <= 0 || (i === 0 && truck <= 0)) {
        win.group.visible = false;
        return;
      }
      win.group.visible = true;
      // Slot index as a continuous value: 0 on landing, +1 at each later arrival.
      let slot = 0;
      for (let j = i + 1; j < 3; j++) slot += land(E.seg(t, T.windows[j] - 0.62, T.windows[j] + 0.12));
      const k = Math.min(1, Math.floor(slot));
      const f = slot - k;
      const A = SLOTS[k], B = SLOTS[Math.min(2, k + 1)];
      const pos = A.pos.map((p, q) => E.lerp(p, B.pos[q], f));
      const rot = A.rot.map((r, q) => E.lerp(r, B.rot[q], f));
      const p = pos.map((v, q) => E.lerp(FROM.pos[q], v, a));
      const r = rot.map((v, q) => E.lerp(FROM.rot[q], v, a));
      if (i === 0) {
        // Rides in with the truck: a touch of depth and turn that settles as it lands.
        const u = 1 - truck;
        p[2] -= 1.4 * u;
        r[1] -= 0.18 * u;
      }
      win.group.position.set(p[0] + OFF, p[1], p[2]);
      win.group.rotation.set(...r);
      win.set({ opacity: E.smoothstep(0, 0.25, a) });
      win.shadow(a);
    });

    const fast = (t > T.truck[0] && t < T.truck[1] + 0.05) ? 24 : T.windows.slice(1).some((w) => t > w - 0.65 && t < w + 0.2) ? 12 : T.chips.some((c) => t > c && t < c + 0.5) ? 32 : 0;
    post.samples = fast;
    post.vignette = 0.06;

    // --- type ------------------------------------------------------------------------------
    s.lines.forEach((l, i) => l.set(t, T.windows[i] - 0.08));
    s.zh.set(t, T.zh);
  },
};

export default scene;
