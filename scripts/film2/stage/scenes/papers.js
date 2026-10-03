// Act 4, mark and papers (FILM.md §3), bars 14–20 (51.58–72.92 s), body rising into the
// lift. Enters by a push-left from `draw`; the `bank` iris opens from the frame's centre.
// Beats (P(n) = scene pulse n, 0.4445 s; bar lines at P0, P8, P16, P24, P32, P40):
//   P0–P10   "Marks add themselves up": answer-lines; the camera pushes into Parts & marks,
//            one blue ring travels 4 → 3 → Total: 7 marks (P5, P6, P7)
//   P8–P10   the window grows to the big frame; P10 cut: Student → Teacher (P12), red answers
//   P16      "A marking scheme, HKEAA-style": Marking scheme beside Student and Teacher (P18)
//   P20–P26  key-layouts at 1.35×: HKEAA style P21, Suggested answers P23, Detailed table P25
//   P26–P29  the four printed first pages dealt flat, one per pulse
//   P32–P36  "Mock papers, cover to key": Paper 1 cover, Paper 2 cover, its answer page,
//            LQ pages, one per pulse
//   P38–P40  Versions 3 in Document setup (P39)
//   P40–P42  version A, B, C close-ups swap on pulses (options reshuffle, header letter)
//   P43–P45  the close-up opens out to the whole page at the centre; covers, key and LQ
//            page deal in either side (P44, P45): a centred spread the iris opens from
import { block, h, show, place, keys, tw, ease, f, C } from '../lib/index.js';
import { PULSE } from '../../timeline.mjs';
import { shot } from './papers/shot.js';
import { sheet, loadSheet, SHEET_W, SHEET_H } from './papers/sheet.js';

const P = (n) => n * PULSE;
const { outSoft, inOutSoft, spring, prog, lerp, clamp } = ease;

const DEMO = { x: 608, y: 248, w: 1216 };
const BIG = { x: 216, y: 76, w: 1488 };
const FULL = [1, 720, 450];

// Clip time of scene time t for each footage segment (the clip events land on pulses).
const KEY_RATE = 1.2 / P(2); // key-layouts switches every 1.2 s → every 2 pulses
const SEG = {
  lines: { id: 'answer-lines', from: P(-2), to: P(10), ct: (t) => t + 0.39 },
  teacher: { id: 'teacher-toggle', from: P(10), to: P(16), ct: (t) => 1.0 + (t - P(12)) },
  scheme: { id: 'marking-scheme', from: P(16), to: P(20), ct: (t) => 1.0 + (t - P(18)) },
  layouts: { id: 'key-layouts', from: P(20), to: P(26), ct: (t) => 1.0 + (t - P(21)) * KEY_RATE },
  versions: { id: 'versions', from: P(38), to: P(40), ct: (t) => Math.min(2.495, 1.67 + (t - P(39))) },
};

// Parts & marks in answer-lines (CSS px): the 4, the 3, "Total: 7 marks".
const RING = [[1286, 310, 46, 27], [1286, 346, 46, 27], [1343, 415, 84, 19]];
const PANEL = [1052, 262, 380, 186];

const KEY_SHEETS = ['sheets-key-classic', 'sheets-key-hkeaa', 'sheets-key-suggested', 'sheets-key-detailed'];
const MOCK_SHEETS = ['sheets-p1-cover', 'sheets-p2-cover', 'sheets-p2-page', 'sheets-lq-1', 'sheets-lq-2'];
const VERSION_SHEETS = ['sheets-version-a', 'sheets-version-b', 'sheets-version-c'];
const CROP = [240, 110, 1920, 1040]; // version header + question 1 with its options
const PAGE = [0, 0, SHEET_W, SHEET_H];

// The closing spread: [sheet id, dx, width, deal pulse]; the version page sits on top.
const FAN = [
  ['sheets-key-hkeaa', -680, 320, 45],
  ['sheets-lq-1', 680, 320, 45],
  ['sheets-p1-cover', -350, 360, 44],
  ['sheets-p2-cover', 350, 360, 44],
];
const FAN_W = 420;

/** A sheet dealt in on pulse n: rises 80 px into place and appears at once (no fade-in blur). */
const deal = (t, n, dy = 80) => {
  const p = outSoft(prog(t, P(n), P(n) + 0.55));
  return { dy: dy * (1 - p), opacity: clamp((t - P(n)) / 0.08), scale: lerp(0.965, 1, p) };
};

const scene = {
  events: [
    { t: P(7), kind: 'pop', size: 's', label: 'the ring lands on Total: 7 marks' },
    { t: P(8), kind: 'whoosh', size: 's', label: 'the window grows' },
    ...[26, 27, 28, 29].map((n) => ({ t: P(n), kind: 'paper', label: 'a marking scheme page is dealt' })),
    ...[32, 34, 36].map((n) => ({ t: P(n), kind: 'paper', label: 'a mock paper is dealt' })),
    ...[40, 41, 42].map((n) => ({ t: P(n), kind: 'page', label: 'version close-up swaps' })),
    { t: P(43), kind: 'whoosh', size: 'm', label: 'the close-up opens to the page' },
    { t: P(44), kind: 'paper', label: 'covers dealt into the fan' },
    { t: P(45), kind: 'paper', label: 'key and LQ dealt into the fan' },
  ],
  async setup(ctx) {
    // Clip placements (scene time `at`, clip time `from`), all inside the clips' frames.
    ctx.placeClip('answer-lines', { at: -0.39, from: 0, dur: 4.98 });
    ctx.placeClip('teacher-toggle', { at: P(10), from: SEG.teacher.ct(P(10)), dur: P(6) });
    ctx.placeClip('marking-scheme', { at: P(16), from: SEG.scheme.ct(P(16)), dur: P(4) });
    ctx.placeClip('key-layouts', { at: P(20), from: SEG.layouts.ct(P(20)), rate: KEY_RATE, dur: P(6) });
    ctx.placeClip('versions', { at: P(38), from: SEG.versions.ct(P(38)), dur: P(2) });
    if (ctx.dry) return;
    h('div', { style: { position: 'absolute', inset: 0, background: C.cream } }, ctx.el);

    // Printed sheets (decoded once).
    const url = (id) => ctx.load.url(id);
    const canvases = {};
    await Promise.all([...KEY_SHEETS, ...MOCK_SHEETS].map(async (id) => { canvases[id] = await loadSheet(url(id), 900); }));
    const versionCanvases = await Promise.all(VERSION_SHEETS.map((id) => loadSheet(url(id), 1600)));

    ctx.keyRow = KEY_SHEETS.map((id) => sheet(ctx.el, [canvases[id]]));
    ctx.mockRow = MOCK_SHEETS.map((id) => sheet(ctx.el, [canvases[id]]));
    ctx.fin = h('div', { style: { position: 'absolute', inset: 0, transformOrigin: '960px 540px' } }, ctx.el);
    ctx.fan = FAN.map(([id]) => sheet(ctx.fin, [canvases[id]]));
    ctx.ver = sheet(ctx.fin, versionCanvases);
    await Promise.all([...ctx.keyRow, ...ctx.mockRow, ...ctx.fan, ctx.ver].map((x) => x.ready));

    // Footage.
    ctx.shot = shot(ctx.el);
    for (const s of Object.values(SEG)) ctx.shot.clips.push(await ctx.load.clip(s.id, { x: 0, y: 0, w: 1440, h: 900 }, ctx.shot.cam));
    ctx.spot = ctx.lib.focus(ctx.shot.overlay, { max: 0.38 });
    ctx.ring = h('div', { style: { position: 'absolute', left: 0, top: 0, border: `3px solid ${C.accent}`, borderRadius: '10px', boxSizing: 'border-box' } }, ctx.shot.overlay);

    const head = (c) => block(ctx.el, { ...c, x: 96, y: 96, align: 'left', w: 1400, maxLines: 1, size: 68 });
    ctx.h1 = head(ctx.copy.marks);
    ctx.h2 = head(ctx.copy.scheme);
    ctx.h3 = head(ctx.copy.mock);
  },
  update(ctx, t) {
    const { shot: sh } = ctx;
    const segs = Object.values(SEG);
    const seg = segs.findIndex((s) => t >= s.from && t < s.to);
    const live = seg >= 0 ? segs[seg] : null;

    // ---- the footage window: layout and camera per segment -------------------------------
    let pose = null;
    if (live === SEG.lines) {
      const grow = inOutSoft(prog(t, P(8), P(10)));
      const lay = { x: lerp(DEMO.x, BIG.x, grow), y: lerp(DEMO.y, BIG.y, grow), w: lerp(DEMO.w, BIG.w, grow) };
      const [z, cx, cy] = keys(t, [[P(2), FULL], [P(4.5), [2.7, 1240, 365], inOutSoft], [P(8), [2.7, 1240, 365]], [P(10), FULL, inOutSoft]]);
      pose = { ...lay, z, cx, cy };
    } else if (live === SEG.teacher) {
      const [z, cx, cy] = keys(t, [[P(12.5), [1.45, 560, 320]], [P(14.5), [1.75, 480, 560], inOutSoft]]);
      pose = { ...BIG, z, cx, cy };
    } else if (live === SEG.scheme) {
      const [z, cx, cy] = keys(t, [[P(18.2), [1.8, 640, 150]], [P(19.8), FULL, inOutSoft]]);
      pose = { ...DEMO, z, cx, cy };
    } else if (live === SEG.layouts) {
      pose = { ...DEMO, z: 1.55, cx: 500, cy: 340 }; // the page: its title and shape change per layout
    } else if (live === SEG.versions) {
      const z = lerp(1.9, 2.05, ease.sineInOut(prog(t, P(38), P(40))));
      pose = { ...DEMO, z, cx: 740, cy: 590 };
    }
    if (pose) {
      // Footage never sits still: a slow push across every segment.
      pose.z *= 1 + 0.06 * prog(t, live.from, live.to); // linear: it moves from the cut on
      sh.set(pose);
      sh.play(seg, live.ct(t));
    } else {
      show(sh.el, 0);
      sh.play(-1, 0);
    }

    // Parts & marks: a spotlight, and one ring travelling 4 → 3 → Total.
    if (live === SEG.lines) {
      const [u, v, w, ht] = PANEL;
      const [lx, ly] = sh.local(u, v);
      const s = sh.view.s;
      ctx.spot.set({ x: lx, y: ly, w: w * s, h: ht * s, r: 12, amount: tw(t, P(3.5), P(1.5)) - tw(t, P(7.5), P(1.5)) });
      const box = keys(t, [[P(5), RING[0]], [P(6), RING[0]], [P(6) + 0.32, RING[1], spring], [P(7), RING[1]], [P(7) + 0.36, RING[2], spring]]);
      const pad = 4;
      const [rx, ry] = sh.local(box[0] - pad, box[1] - pad);
      const pop = spring(prog(t, P(5), P(5) + 0.35));
      const rw = (box[2] + 2 * pad) * s, rh = (box[3] + 2 * pad) * s;
      Object.assign(ctx.ring.style, { width: `${f(rw, 2)}px`, height: `${f(rh, 2)}px` });
      place(ctx.ring, { x: rx + (rw * (1 - pop)) / 2, y: ry + (rh * (1 - pop)) / 2, scale: Math.max(0.001, pop), opacity: Math.min(pop * 3, 1) - tw(t, P(8), 0.3) });
      ctx.ring.style.transformOrigin = '0 0';
    } else {
      ctx.spot.set({ amount: 0 });
      show(ctx.ring, 0);
    }

    // ---- printed first pages of the marking scheme: dealt one per pulse --------------------
    const inKeys = t >= P(26) && t < P(32);
    ctx.keyRow.forEach((sht, i) => {
      const d = deal(t, 26 + i);
      const g = 1 + 0.06 * ease.sineInOut(prog(t, P(26), P(32))); // a slow push while it holds
      const w = 372 * g;
      sht.set({ x: 960 + (i - 1.5) * (w + 40 * g), y: 622 + d.dy, w: w * d.scale, opacity: inKeys ? d.opacity : 0 });
    });

    // ---- mock papers: covers first, one per pulse ------------------------------------------
    const inMock = t >= P(32) && t < P(38);
    ctx.mockRow.forEach((sht, i) => {
      const d = deal(t, 32 + i);
      const g = 1 + 0.05 * ease.sineInOut(prog(t, P(32), P(38)));
      const w = 320 * g;
      sht.set({ x: 960 + (i - 2) * (w + 24 * g), y: 622 + d.dy, w: w * d.scale, opacity: inMock ? d.opacity : 0 });
    });

    // ---- versions: close-ups swap on pulses, then open out into the centred fan -------------
    const inFin = t >= P(40);
    const face = t < P(41) ? 0 : t < P(42) ? 1 : 2;
    const open = inOutSoft(prog(t, P(43), P(45)));
    const crop = CROP.map((c, k) => lerp(c, PAGE[k], open));
    ctx.ver.set({
      x: 960, y: lerp(628, 540, open), w: lerp(1270 * (1 + 0.04 * ease.sineInOut(prog(t, P(40), P(43.5)))), FAN_W, open), crop, face,
      opacity: inFin ? 1 : 0,
    });
    ctx.fan.forEach((sht, i) => {
      const [, dx, w, n] = FAN[i];
      const p = outSoft(prog(t, P(n), P(n) + 0.6));
      sht.set({
        x: 960 + dx * lerp(0.6, 1, p), y: 540 + 120 * (1 - p), w,
        opacity: inFin ? clamp((t - P(n)) / 0.08) : 0,
      });
    });
    // A slow push keeps the final hold alive until the iris takes it.
    place(ctx.fin, { scale: 1 + 0.02 * ease.sineInOut(prog(t, P(45), P(48))) });

    // ---- headlines --------------------------------------------------------------------------
    ctx.h1.show(t, { at: P(1), out: P(9) });
    ctx.h2.show(t, { at: P(16), out: P(31.8), outDur: 0.3 });
    ctx.h3.show(t, { at: P(32), out: P(43.5) });
  },
};

export default scene;
