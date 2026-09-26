// everywhere — bars 36–40, day (FILM.md §3). The 72.0 hit cuts to the warm world on the
// real Export dialog (clip), which opens on the hit; the export targets pop in beside it as
// glass chips on the 72.5–74.5 ticks. The dialog slides away and three windows arrive in
// depth on 76.0, 77.0, 78.0 — browser, Mac, Windows, each the real app — each earlier one
// stepping back as the next lands, while "In your browser. On Mac. On Windows." lands a
// phrase per window.
import { COPY } from '../../timeline.mjs';
import { cubicBezier } from '../lib/ease.js';
import { chip, poseChip, sizeOf } from './everywhere/chips.js';
import { softShadow } from './everywhere/shadow.js';

const C = COPY.everywhere;
const PHRASES = C.headline.split(/(?<=\.)\s+/); // In your browser. / On Mac. / On Windows.

// Scene seconds (film − 72).
const T = {
  clipFrom: 0.97, // the dialog is open on the hit; its toggles fall between the chips
  chips: [0.5, 1.0, 1.5, 2.0, 2.5],
  chipsOut: 3.3,
  cardOut: [3.25, 3.95],
  windows: [4.0, 5.0, 6.0],
  zh: 6.35,
};

// Export card: a crop of the clip around the dialog (frame px), in world units.
const CROP = { x: 900, y: 60, w: 1080, h: 1680, W: 2880, H: 1800 };
const CARD_H = 4.7;
const CARD = { pos: [-1.55, 0.06, 0], rot: [0, 0.2, 0] };
// Chip layout: two centred rows, design px.
const ROWS = [{ y: 462, items: [0, 1] }, { y: 588, items: [2, 3, 4] }];
const ROW_X = 1440;
const GAP = 24;

// Window cascade: slot 0 = front. Positions in world units.
const SLOTS = [
  { pos: [1.62, -0.62, 0.5], rot: [0, -0.2, 0] },
  { pos: [2.3, 0.5, -1.5], rot: [0, -0.2, 0] },
  { pos: [2.95, 1.55, -3.55], rot: [0, -0.2, 0] },
];
const FROM = { pos: [4.6, -1.6, -11], rot: [0, -0.45, 0] }; // where each arrives from
const WINDOWS = [
  { variant: 'browser', still: 'stills/start-screen.png' },
  { variant: 'mac', still: 'stills/editor-clean.png' },
  { variant: 'windows', still: 'stills/diagram-canvas.png' },
];
const WIN_W = 3.9;
const land = cubicBezier(0.45, 0, 0.12, 1); // from rest, lands soft on the beat
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
    const { lib, scene } = ctx;
    const s = (ctx.state = {});

    // Export card (clip).
    s.clip = await ctx.load.clip('export');
    ctx.placeClip('export', { at: 0, from: T.clipFrom, rate: 1, dur: T.cardOut[1] });
    const cardW = CARD_H * (CROP.w / CROP.h);
    s.card = lib.win.appWindow({ variant: 'none', width: cardW, aspect: CROP.w / CROP.h, shadow: false });
    s.cardShadow = dropShadow(s.card);
    s.card.set({ crop: [CROP.x / CROP.W, 1 - (CROP.y + CROP.h) / CROP.H, CROP.w / CROP.W, CROP.h / CROP.H] });
    scene.add(s.card.group);

    // Chips.
    s.chips = C.chips.map((text) => chip(ctx.el, text));
    s.sizes = s.chips.map(sizeOf);
    s.chipAt = [];
    for (const row of ROWS) {
      const total = row.items.reduce((a, i) => a + s.sizes[i].w, 0) + GAP * (row.items.length - 1);
      let x = ROW_X - total / 2;
      for (const i of row.items) {
        s.chipAt[i] = { x: x + s.sizes[i].w / 2, y: row.y };
        x += s.sizes[i].w + GAP;
      }
    }

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

    // --- camera: a slow drift and push for the whole scene -----------------------------
    const d = cam.drift(t, 36, { amp: 0.8, rate: 0.07, roll: 0.1, dolly: 0.004 });
    cam.orbit(camera, {
      target: [0.25, 0.15, 0],
      dist: 10 * (1 - 0.03 * E.seg(t, 0, 8)) * d.dist,
      az: 2.5 - 3 * E.sineInOut(E.seg(t, 0, 8)) + d.az,
      el: 2 + d.el,
      roll: d.roll,
      fov: 30,
    });

    // --- the Export dialog card --------------------------------------------------------
    const out = E.cubicIn(E.seg(t, T.cardOut[0], T.cardOut[1]));
    const arrive = E.expoOut(E.seg(t, 0, 0.9)); // a small settle after the hit
    s.card.group.position.set(CARD.pos[0] - 5.6 * out, CARD.pos[1] + 0.12 * (1 - arrive), CARD.pos[2] - 1.2 * out + 0.35 * (1 - arrive));
    s.card.group.rotation.set(0, CARD.rot[1] + 0.25 * out, 0);
    s.card.group.visible = out < 1;
    s.card.set({ screen: s.clip.frameAt(T.clipFrom + Math.max(0, t)) });
    s.cardShadow(1);

    // --- chips ---------------------------------------------------------------------------
    s.chips.forEach((el, i) => {
      const at = s.chipAt[i];
      const bob = 4 * lib.noise.noise1(t * 0.6, 50 + i);
      poseChip(el, t, { x: at.x, y: at.y + bob, t0: T.chips[i] - 0.04, t1: T.chipsOut + 0.05 * i, ...s.sizes[i] });
    });

    // --- windows: each lands on its beat; the earlier ones step back -------------------
    s.wins.forEach((win, i) => {
      const a = land(E.seg(t, T.windows[i] - 0.62, T.windows[i] + 0.12));
      if (a <= 0) {
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
      win.group.position.set(...p);
      win.group.rotation.set(...r);
      win.set({ opacity: E.smoothstep(0, 0.25, a) });
      win.shadow(a);
    });

    post.samples = (t > T.cardOut[0] && t < T.cardOut[1]) || T.windows.some((w) => t > w - 0.65 && t < w + 0.2) ? 12 : 0;
    post.vignette = 0.06;

    // --- type ------------------------------------------------------------------------------
    s.lines.forEach((l, i) => l.set(t, T.windows[i] - 0.08));
    s.zh.set(t, T.zh);
  },
};

export default scene;
