// everywhere — bars 36–40, day (FILM.md §3). The 72.0 hit cuts to the warm world on the
// real Export dialog, "Export your way." over the space beside it; on each tick (72.5–74.5)
// a glass chip springs into that space: PDF, Answer key, Kahoot, Blooket, ZipGrade. The
// camera trucks right, everything whooshing off-frame, and lands close on the browser
// window on 76.0; it eases back as the Mac and Windows windows slide in from the front on
// 77.0 and 78.0, each earlier one stepping back, while "In your browser. On Mac. On
// Windows." lands a phrase per window, the Chinese with it. Then the camera pushes in and
// turns, accelerating into the 80.0 montage cut, the stack opening up in depth.
import { COPY, cueAt, sceneStart, sceneEnd } from '../../timeline.mjs';
import { cubicBezier } from '../lib/ease.js';
import { REVEAL } from '../lib/type.js';
import { glassChip } from './everywhere/glassChip.js';
import { softShadow } from './everywhere/shadow.js';

const C = COPY.everywhere;

// Scene seconds (film − 72). Chips and windows land on their cues (everywhere.chip1…5,
// .browser/.mac/.windows); the truck, the Chinese and the push hang off the windows.
const START = sceneStart('everywhere');
const at = (id) => cueAt(id) - START;
const WIN = ['browser', 'mac', 'windows'].map((w) => at(`everywhere.${w}`));
const T = {
  export: [0.3, 3.12], // the chips' headline, gone before the truck moves
  chips: C.chips.map((_, i) => at(`everywhere.chip${i + 1}`)),
  truck: [WIN[0] - 0.6, WIN[0]],
  windows: WIN,
  zh: [WIN[0] + 0.3, WIN[1] + 0.3, WIN[2] + 0.3, WIN[2] + 0.42], // 瀏覽器、/ Mac、/ Windows，/ 隨處可用。 — each with its window
  solo: [WIN[0] + 0.25, WIN[1] + 0.15], // the camera eases back from the browser as the Mac arrives
  push: [WIN[2] - 0.4, sceneEnd('everywhere') - START], // into the cut
};

// The Export dialog, cropped to its own rounded rectangle in the still (px).
const STILL = { asset: 'export-other-apps', W: 2880, H: 1800 };
const DIALOG = { x: 963, y: 177, w: 954, h: 1446, radius: 27 };
const CARD_H = 4.45;
const CARD = { pos: [-1.95, 0.0, 0], yaw: 0.16 };
// Chip cluster: two rows centred on ROW_X (world), chips at depth CHIP_Z, inside title-safe.
const ROWS = [{ y: 0.38, items: [0, 1] }, { y: -0.3, items: [2, 3, 4] }];
const ROW_X = 2.06;
const CHIP_Z = 0.35;
const CHIP_GAP = 0.12;
const UNIT = 0.0047; // world units per design px at the chips' depth
const POP = { lead: 0.07, freq: 3.0, damping: 0.66 }; // crosses full size ~0.09 s after its tick

// The windows live one truck to the right. Slot 0 = front.
const OFF = 10.6;
// The browser rides in behind the truck, LAG units short of its slot, so it enters frame
// while the chips are still leaving it: there is always product on screen.
const LAG = 3.2;
const SLOTS = [
  { pos: [1.62, -0.62, 0.5], rot: [0, -0.2, 0] },
  { pos: [2.3, 0.5, -1.5], rot: [0, -0.2, 0] },
  { pos: [2.95, 1.55, -3.55], rot: [0, -0.2, 0] },
];
// Mac and Windows arrive from the front right, so each stays in front of the ones it passes.
const FROM = { pos: [5.4, -2.9, 2.4], rot: [0, -0.5, 0] };
// The canvas shows ⌘ shortcut hints, so it goes on the Mac; Windows gets the teacher copy.
const WINDOWS = [
  { variant: 'browser', still: 'start-screen' },
  { variant: 'mac', still: 'diagram-canvas' },
  { variant: 'windows', still: 'editor-teacher' },
];
const SPREAD = 0.1; // z the front and back windows drift apart by at the end
const WIN_W = 3.9;
const land = cubicBezier(0.45, 0, 0.12, 1); // from rest, lands soft on the beat
const truckEase = cubicBezier(0.6, 0, 0.18, 1); // from rest, fast through the middle, soft landing
const TEXT_X = 128;
const TEXT_W = 720; // to the windows' left edge
const TEXT_Y = [392, 510, 628];
const EXPORT_X = 1355; // centred on the chip cluster
const ZH_DY = 96; // the Chinese line under the last English line

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

    // The Export dialog.
    const cardW = CARD_H * (DIALOG.w / DIALOG.h);
    s.card = lib.win.appWindow({ variant: 'none', width: cardW, aspect: DIALOG.w / DIALOG.h, shadow: false, screen: await ctx.load.texture(STILL.asset) });
    s.card.material.uniforms.uRadius.value = (DIALOG.radius / DIALOG.w) * cardW;
    s.card.set({ crop: [DIALOG.x / STILL.W, 1 - (DIALOG.y + DIALOG.h) / STILL.H, DIALOG.w / STILL.W, DIALOG.h / STILL.H] });
    dropShadow(s.card);
    s.card.group.position.set(...CARD.pos);
    s.card.group.rotation.y = CARD.yaw;
    scene.add(s.card.group);
    // Chips and their slots.
    s.chips = C.chips.map((text) => glassChip(text, { unit: UNIT, hPx: 108, fontPx: 50, padPx: 46 }));
    s.to = [];
    for (const row of ROWS) {
      const total = row.items.reduce((a, i) => a + s.chips[i].w, 0) + CHIP_GAP * (row.items.length - 1);
      let x = ROW_X - total / 2;
      for (const i of row.items) {
        s.to[i] = [x + s.chips[i].w / 2, row.y, CHIP_Z];
        x += s.chips[i].w + CHIP_GAP;
      }
    }
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
    s.lines = C.lines.map((en, i) => T_.headline(ctx.el, { en, x: TEXT_X, y: TEXT_Y[i], size: 96, align: 'left', world: 'day', maxWidth: TEXT_W }));
    s.zh = T_.text(ctx.el, { kind: 'headline', en: '', zh: C.linesZh, zhSize: 40, zhGap: 0, x: TEXT_X + 4, y: TEXT_Y[2] + ZH_DY, align: 'left', world: 'day', maxWidth: TEXT_W });
    s.export = T_.headline(ctx.el, { en: C.export, zh: C.exportZh, x: EXPORT_X, y: 372, valign: 'bottom', size: 96, zhSize: 40, world: 'day' });
  },

  update(t, ctx) {
    const { lib, camera, post } = ctx;
    const { ease: E, camera: cam } = lib;
    const s = ctx.state;

    // --- camera: a settle after the hit, a slow push, the truck (landing close on the
    // browser), a pull back as the stack builds, then a push and turn into the cut ---------
    const truck = truckEase(E.seg(t, T.truck[0], T.truck[1]));
    const d = cam.drift(t, 36, { amp: 0.7, rate: 0.07, roll: 0.08, dolly: 0.004 });
    const settle = 1 - E.expoOut(E.seg(t, 0, 1.4));
    const solo = truck * (1 - E.sineInOut(E.seg(t, T.solo[0], T.solo[1])));
    const end = E.sineIn(E.seg(t, T.push[0], T.push[1]));
    const dist = 10 * (1 + 0.045 * settle) * (1 - 0.022 * E.seg(t, 0, 3.4)) * (1 - 0.02 * E.seg(t, T.truck[1], T.push[0])) *
      (1 - 0.2 * solo) * (1 - 0.08 * end);
    // After the truck the aim rises with the stack as each window arrives.
    const stack = land(E.seg(t, T.windows[1] - 0.7, T.windows[1] + 0.3)) + land(E.seg(t, T.windows[2] - 0.7, T.windows[2] + 0.3));
    const aimY = E.lerp(-0.42, 0.15, stack / 2);
    cam.orbit(camera, {
      target: [E.lerp(0.1, OFF + 0.25 - 0.12 * (1 - stack / 2), truck) + 0.25 * solo, E.lerp(0.02, aimY, truck), 0],
      dist: dist * d.dist,
      az: E.lerp(2.2 - 1.6 * E.sineInOut(E.seg(t, 0, 3.4)), 2.5 - 2 * E.sineInOut(E.seg(t, T.truck[1] - 0.6, T.push[0] + 0.5)), truck) + 3.5 * end + d.az,
      el: 1.6 + 0.4 * truck + d.el,
      roll: d.roll,
      fov: 30,
    });

    // --- chips: each springs into its slot on its tick (one soft overshoot) -----------------
    s.chips.forEach((chip, i) => {
      const t0 = T.chips[i] - POP.lead;
      const g = E.spring(t - t0, POP);
      const [x, y, z] = s.to[i];
      const bob = 0.012 * lib.noise.noise1(t * 0.6, 50 + i);
      chip.group.position.set(x, y - 0.16 * (1 - g) + bob, z - 0.5 * (1 - g));
      chip.group.scale.setScalar(E.lerp(0.5, 1, g));
      chip.group.rotation.set(0.35 * (1 - g), 0, 0);
      chip.set({ opacity: E.smoothstep(t0, t0 + 0.09, t), shadow: E.clamp(g) });
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
        p[0] -= LAG * u;
        p[2] -= 1.4 * u;
        r[1] -= 0.18 * u;
      }
      win.group.position.set(p[0] + OFF, p[1], p[2] + SPREAD * end * (i - 1)); // front (i = 2) forward, back away
      win.group.rotation.set(...r);
      win.set({ opacity: E.smoothstep(0, 0.25, a) });
      win.shadow(a);
    });

    const fast = (t > T.truck[0] && t < T.truck[1] + 0.05) ? 24 : T.windows.slice(1).some((w) => t > w - 0.65 && t < w + 0.2) ? 12 : T.chips.some((c) => t > c - POP.lead && t < c + 0.35) ? 24 : t > T.push[1] - 0.8 ? 8 : 0;
    post.samples = fast;
    post.vignette = 0.06;

    // --- type ------------------------------------------------------------------------------
    s.export.set(t, T.export[0], T.export[1]);
    s.lines.forEach((l, i) => l.set(t, T.windows[i] - 0.08));
    // The Chinese line starts under the second line's slot and steps down to make room for
    // the third just before it lands.
    s.zh.place({ y: E.lerp(TEXT_Y[1], TEXT_Y[2], E.quintInOut(E.seg(t, T.windows[2] - 0.6, T.windows[2] - 0.12))) + ZH_DY });
    reveal(s.zh, t, T.zh, E);
  },
};

/** Reveals each word of a text block from its own start time (the lib's reveal, per word). */
function reveal(block, t, starts, E) {
  let any = 0;
  block.words.forEach((w, i) => {
    const r = E.expoOut(E.clamp((t - starts[Math.min(i, starts.length - 1)]) / REVEAL.dur));
    const st = w.el.style;
    const y = REVEAL.rise * (1 - r), b = REVEAL.blur * (1 - r);
    st.opacity = r < 0.001 ? '0' : r > 0.999 ? '1' : r.toFixed(4);
    st.transform = y < 1e-4 ? 'none' : `translate3d(0, ${y.toFixed(4)}em, 0)`;
    st.filter = b < 0.05 ? 'none' : `blur(${b.toFixed(3)}px)`;
    any = Math.max(any, r);
  });
  block.el.style.visibility = any > 0.001 ? 'visible' : 'hidden';
}

export default scene;
