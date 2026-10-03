// Act 3, draw (FILM.md §3, the hero): from blank axes to the model answer in red. Beats in
// scene pulses P(n) (the act starts on bar 8, so every P(n) is on the grid):
//   P(-2)..P(12)  "Draw it in seconds": draw-diagram, blank axes → D, S, E0; the camera
//                 settles onto the canvas as the demand line is dragged (P3)
//   P(12)..P(20)  the re-ink: the window falls away, its lines stay and grow on cream; a pen
//                 redraws axes, D and S in ink, the blue dot pops (P15.5), guides drop; the
//                 diagram shrinks back into the window exactly onto the next shot's lines
//   P(16)..P(29)  "Shade any area in one click": Shade ▾ → Consumer surplus lands on P23,
//                 Producer surplus on P27.5
//   P(29)..P(32)  the Templates grid flashes by in a portrait window
//   P(32)..P(40)  "The answer, on the same axes": Draw answer, Shift a copy → red D1
//   P(40)..P(50)  Student shows blank axes; Teacher on P42 snaps the red answer on; the
//                 window glides to the centre and holds it; push-left into papers at P48
import { h, show, C } from '../lib/dom.js';
import { card } from '../lib/card.js';
import { focus } from '../lib/focus.js';
import { block } from '../lib/type.js';
import { keys, env } from '../lib/tween.js';
import { clamp, lerp, prog, outSoft, inOutSoft, spring, sineInOut, linear, cubicBezier } from '../lib/ease.js';
import { PULSE } from '../../timeline.mjs';
import { CARD, FLASH, CENTRED, APP, ZMIN, MID, LINE } from './draw/geom.js';
import { ink, mixHex } from './draw/ink.js';

const P = (n) => n * PULSE;
const BLACK = '#000000';

// Footage shots: clip time = t - offset, held at [lo, hi]; shown in [from, to).
const O_DRAW = P(3) - 1.0; // the demand drag starts on P3
const O_SHADE = P(23) - 1.6; // Consumer surplus lands on P23
const O_ANSWER = P(32) - 0.5;
const O_LAYER = P(42) - 1.5; // Teacher on P42
const SHOTS = [
  { id: 'draw-diagram', off: O_DRAW, lo: 0, hi: 5.0, from: -Infinity, to: P(16) },
  { id: 'shade-area', off: O_SHADE, lo: 0.5, hi: 4.27, from: P(16), to: P(29) },
  { id: 'template-picker', off: P(29) - 1.6, lo: 1.6, hi: 1.6 + P(3), from: P(29), to: P(32) },
  { id: 'answer-draw', off: O_ANSWER, lo: 0.5, hi: 0.5 + P(8), from: P(32), to: P(40) },
  { id: 'answer-layer', off: O_LAYER, lo: P(40) - O_LAYER, hi: P(50) - O_LAYER, from: P(40), to: Infinity },
];

// The camera: [zoom, focus x, focus y] (focus = the CSS point at the card's centre).
const CAM_MAIN = [
  [P(2), [ZMIN, 552, 450]],
  [P(12), [1.5, MID[0], 474], cubicBezier(0.5, 0, 0.5, 0.75)],
  [P(15), [1.84, MID[0], MID[1]], cubicBezier(0.3, 0.25, 0.35, 1)],
  [P(18.5), [1.94, MID[0], MID[1]], linear],
  [P(20.75), [1.18, 640, 385.5], inOutSoft],
  [P(29), [1.24, 640, 380], sineInOut],
];
const CAM_FLASH = [[P(29), [1.48, 1260, 582]], [P(32), [1.53, 1260, 590], sineInOut]];
const CAM_ANSWER = [
  [P(32), [ZMIN, 800, 450]],
  [P(37.5), [1.09, 800, 446], cubicBezier(0.3, 0.1, 0.7, 0.9)],
  [P(40), [1.3, 600, 480], inOutSoft],
];
const CAM_LAYER = [
  [P(40), [1.47, 625, 310]],
  [P(42.5), [1.5, 630, 318], sineInOut],
  [P(45.5), [1.96, 665, 388], inOutSoft],
  [P(50), [2.0, 665, 388], sineInOut],
];

// Spotlights on the footage (CSS rects [x, y, w, h]): each lights one action, then the next.
const R = { menu: [604, 6, 446, 304], answer: [703, 6, 133, 56], shift: [1129, 474, 101, 41], teacher: [462, 8, 146, 38] };
const SPOTS = [
  { on: O_SHADE + 0.85, off: O_SHADE + 1.85, keys: [[0, R.menu]] }, // Shade ▾ 0.8 → Consumer surplus 1.6
  { on: O_SHADE + 2.85, off: O_SHADE + 3.85, keys: [[0, R.menu]] }, // Shade ▾ 2.8 → Producer surplus 3.6
  { on: O_ANSWER + 0.7, off: O_ANSWER + 1.75, keys: [[0, R.answer]] }, // Draw answer 0.8
  { on: O_ANSWER + 2.3, off: O_ANSWER + 3.25, keys: [[0, R.shift]] }, // Shift a copy 3.0: D1 lands in the light
  { on: O_LAYER + 0.75, off: O_LAYER + 1.7, keys: [[0, R.teacher]] }, // Teacher 1.5
];
function spotAt(t) {
  for (const sp of SPOTS) {
    const a = env(t, sp.on, sp.off, 0.5, 0.5, inOutSoft, inOutSoft); // eased at both ends (lib/focus.js caps it at 0.16)
    if (a > 0) return { rect: keys(t, sp.keys), amount: a };
  }
  return { rect: R.menu, amount: 0 };
}

function camera(t) {
  if (t < P(29)) return { rect: CARD, cam: keys(t, CAM_MAIN) };
  if (t < P(32)) return { rect: FLASH, cam: keys(t, CAM_FLASH) };
  if (t < P(40)) return { rect: CARD, cam: keys(t, CAM_ANSWER) };
  const x = lerp(CARD.x, CENTRED.x, inOutSoft(prog(t, P(43), P(45.5))));
  return { rect: { ...CARD, x }, cam: keys(t, CAM_LAYER) };
}

/** The card's opacity: the window falls away for the re-ink and comes back under it. */
const cardAlpha = (t) => (t < P(16) ? 1 - outSoft(prog(t, P(12), P(13.5))) : inOutSoft(prog(t, P(19), P(20.25))));

const scene = {
  events: [
    { t: P(12), kind: 'whoosh', size: 's', label: 'the lines lift out of the window' },
    { t: P(13), kind: 'pencil', label: 'the axes are re-inked' },
    { t: P(14), kind: 'pencil', label: 'demand and supply are re-inked' },
    { t: P(15.5), kind: 'pop', label: 'the equilibrium dot' },
    { t: P(18.5), kind: 'whoosh', size: 's', label: 'the diagram goes back into the window' },
    { t: P(29), kind: 'shutter', label: 'the Templates grid flashes by' },
  ],
  async setup(ctx) {
    h('div', { style: { position: 'absolute', inset: 0, background: C.cream } }, ctx.el);
    ctx.card = card(ctx.el, { ...CARD, fill: C.paper });
    ctx.content = h('div', { style: { position: 'absolute', left: 0, top: 0, width: `${APP.w}px`, height: `${APP.h}px`, transformOrigin: '0 0' } }, ctx.card.body);
    ctx.clips = [];
    for (const s of SHOTS) {
      const clip = await ctx.load.clip(s.id, { x: 0, y: 0, w: APP.w, h: APP.h }, ctx.content);
      ctx.clips.push({ ...s, clip });
      const lo = Math.max(s.lo, 0);
      const at = s.off + lo;
      const end = Math.min(s.hi, Math.min(s.to, ctx.window.end - ctx.from) - s.off);
      ctx.placeClip(s.id, { at, from: lo, dur: Math.max(0, end - lo) });
    }
    ctx.spot = focus(ctx.card.body);
    ctx.ink = ink(ctx.el);
    const head = { x: 96, y: 96, w: 560, align: 'left', size: 72, zhSize: 32, maxLines: 2, rise: 12 };
    ctx.h1 = block(ctx.el, { ...ctx.copy.draw, ...head });
    ctx.h2 = block(ctx.el, { ...ctx.copy.shade, ...head });
    ctx.h3 = block(ctx.el, { ...ctx.copy.answer, ...head });
  },
  update(ctx, t) {
    const { rect, cam } = camera(t);
    const [Z0, fx0, fy0] = cam;
    const bw = rect.w - 2, bh = rect.h - 2;
    const Z = Math.max(Z0, bh / APP.h, bw / APP.w);
    const fx = clamp(fx0, bw / 2 / Z, APP.w - bw / 2 / Z);
    const fy = clamp(fy0, bh / 2 / Z, APP.h - bh / 2 / Z);
    const el = ctx.card.el.style;
    el.left = `${rect.x}px`;
    el.top = `${rect.y}px`;
    el.width = `${rect.w}px`;
    el.height = `${rect.h}px`;
    show(ctx.card.el, cardAlpha(t));
    ctx.content.style.transform = `translate(${(bw / 2 - fx * Z).toFixed(2)}px, ${(bh / 2 - fy * Z).toFixed(2)}px) scale(${Z.toFixed(5)})`;
    for (const s of ctx.clips) {
      const on = t >= s.from && t < s.to;
      s.clip.el.style.display = on ? 'block' : 'none';
      if (on) s.clip.at(clamp(t - s.off, s.lo, s.hi));
    }

    const sp = spotAt(t);
    const [sx, sy, sw, shh] = sp.rect;
    ctx.spot.set({ x: (sx - fx) * Z + bw / 2, y: (sy - fy) * Z + bh / 2, w: sw * Z, h: shh * Z, r: 12 * Z, amount: sp.amount });

    // The re-ink, through the same camera as the footage.
    const cx = rect.x + 1 + bw / 2, cy = rect.y + 1 + bh / 2;
    const map = ([x, y]) => [cx + (x - fx) * Z, cy + (y - fy) * Z];
    const live = t >= P(12) && t < P(21);
    const back = inOutSoft(prog(t, P(18.5), P(20.1)));
    const pencil = outSoft(prog(t, P(12.5), P(14)));
    ctx.ink.el.style.display = live ? 'block' : 'none';
    if (live) {
      ctx.ink.set(map, Z, {
        lift: {
          o: 1 - outSoft(prog(t, P(14.5), P(16.2))),
          w: lerp(LINE * Z, 3, pencil),
          color: mixHex(BLACK, C.inkSubtle, pencil),
        },
        ink: {
          o: 1 - prog(t, P(20.25), P(20.75)),
          w: LINE * Z * lerp(1.3, 1, back),
          color: mixHex(C.ink, BLACK, back),
          y: outSoft(prog(t, P(13), P(14))),
          x: outSoft(prog(t, P(13.33), P(14.33))),
          heads: spring(prog(t, P(14), P(14.7))),
          D: inOutSoft(prog(t, P(14), P(15.2))),
          S: inOutSoft(prog(t, P(14.5), P(15.7))),
        },
        guides: {
          p: outSoft(prog(t, P(16), P(17))),
          o: 1 - outSoft(prog(t, P(19), P(20))),
          w: 2 * Z,
          color: C.inkMuted,
        },
        dot: {
          s: spring(prog(t, P(15.5), P(16.2))) * (1 - inOutSoft(prog(t, P(18.5), P(19.5)))),
          ripple: prog(t, P(15.6), P(15.6) + 1.1),
          o: 1,
        },
      });
    }

    ctx.h1.show(t, { at: P(0), out: P(13), outDur: 0.45 });
    ctx.h2.show(t, { at: P(16), out: P(29), outDur: 0.4 });
    ctx.h3.show(t, { at: P(32), out: P(43.5), outDur: 0.5 });
  },
};

export default scene;
