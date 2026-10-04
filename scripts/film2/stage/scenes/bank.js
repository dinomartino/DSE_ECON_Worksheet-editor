// Act 5, the 題庫 (FILM.md §3), the climax: the music's full lift lands on P(0) = bar 20.
// Beats (P(n) = scene pulse n, film = 72.92 + 0.4445 n):
//   P(-2)..P(2)  the iris opens on the full topic grid: twelve cards cut from the app's frame,
//                on cream at 1.35×; the coverage bars draw on in four waves, P0..P3, outward
//                from the iris; the headline from P0
//   P(4)..P(8)   re-ink lift: the cards fall away and their bars stand up as one coverage chart
//                at frame scale (MCQ dark, LQ light, as the app drew them); counts roll in
//   P(8)   cut   MEDIUM, the topic page: the click on Market and Price lands on the cut
//   P(12)  cut   WIDE, the editor: the press on the 題庫 tab's question lands on the cut
//   P(13)  cut   CLOSE 2.4× on the page: the drag arrives, the page makes room and renumbers
//   P(16)  cut   MEDIUM: the drop (P18.1), "1 question added from 題庫 · Undo"; the headline
//   P(22)  cut   CLOSE on the one menu row "Check terms against EDB glossary  free": its click
//                lands on the cut (no AI menu, no AI button, no provider in frame)
//   P(24)  cut   MEDIUM: the page; the wavy underlines draw on; the headline
//   P(27)        re-ink lift: Q1 D's line at frame scale, its underline drawn, 剩 → 盈
//   P(30)  cut   CLOSE on the finding card: Replace with 消費者盈餘 lands on the cut
import { h, s, svg as svgEl, show, C } from '../lib/dom.js';
import { stroke } from '../lib/reink.js';
import { block, HEADLINE } from '../lib/type.js';
import { camera } from '../lib/camera.js';
import { prog, outSoft, inOutSoft, clamp } from '../lib/ease.js';
import { f } from '../lib/tween.js';
import {
  P, CARDS, GRID, gridPt, TOPIC, DRAG_CLOSE, DRAG_AFTER, DRAG_PAGE, AI_BUTTON,
  ROW, ROW_ZOOM, ROW_CARD, TERMS_PAGE, REPLACE, REPLACE_SAFE, UNDERLINES, Q1D,
} from './bank/geom.js';
import { frameImage, crop, topicCard } from './bank/crops.js';
import { chart, measureBar } from './bank/chart.js';
import { termsLift } from './bank/terms.js';

const TOPIC_AT = 3.4; // bank-screen: the click on Market and Price (the topic page is frame 204)
const PRESS_AT = 0.9; // bank-drag: the press on the bank question
const CT_CLICK = 1.6, CT_ROW = 1.55, CT_PAGE = 1.75, CT_REPLACE = 4.4; // check-terms
const SRC = { w: 1440, h: 900 };
const inset = (r) => `inset(0 ${(100 * (1 - clamp(r))).toFixed(3)}% 0 0)`;
const box = { x: 0, y: 0, w: 1440, h: 900 };
const ROW_PUSH = 1.08;
const grow = (r, k) => ({ x: 960 - (r.w * k) / 2, y: 540 - (r.h * k) / 2, w: r.w * k, h: r.h * k });
// The renumbering, ringed with the dot's blue (CSS px of bank-drag): old Q2 becomes "3."
// while the question hovers; the dropped question is "2." after the release (P18.07).
const RINGS = [{ c: [353, 578], at: P(16.5) }, { c: [353, 393], at: P(18.25) }];
/** The grid's slow push (scale about 960, 640) from the iris to the lift. */
const gridPush = (t) => 1 + 0.04 * prog(t, P(-2), P(4.5));

const scene = {
  events: [
    { t: 0, kind: 'impact', label: 'the lift: the 題庫 opens' },
    // (the whoosh into the lift is timeline.mjs CUES bank.whoosh: it ends 0.35 s after the hit)
    { t: P(0.25), kind: 'shimmer', label: 'the coverage bars draw on' },
    { t: P(4.25), kind: 'pencil', label: 'the bars stand up as a chart' },
    { t: P(24), kind: 'pencil', label: 'the glossary underlines draw on' },
    { t: P(27.75), kind: 'pencil', label: 'the underline drawn at frame scale' },
    { t: P(29), kind: 'pop', label: 'the glossary term sets in' },
  ],
  async setup(ctx) {
    ctx.root = h('div', { style: { position: 'absolute', inset: 0, background: C.cream } }, ctx.el);

    // Motion design: the grid of cut-out cards, then the chart.
    ctx.grid = h('div', { style: { position: 'absolute', left: 0, top: 0, width: '1440px', height: '900px', transformOrigin: '0 0',
      transform: `translate(${f(GRID.at[0] - GRID.css[0] * GRID.s, 2)}px, ${f(GRID.at[1] - GRID.css[1] * GRID.s, 2)}px) scale(${GRID.s})` } }, ctx.root);
    ctx.ink = h('div', { style: { position: 'absolute', inset: 0 } }, ctx.root);

    // Footage: one camera rig per clip (each shot list is linted on its own).
    const rig = (name) => camera(ctx, { src: SRC, parent: ctx.root, name });
    ctx.camS = rig('bank-screen');
    ctx.screen = await ctx.load.clip('bank-screen', box, ctx.camS.content);
    ctx.camD = rig('bank-drag');
    ctx.drag = await ctx.load.clip('bank-drag', box, ctx.camD.content);
    ctx.camT = rig('check-terms');
    ctx.terms = await ctx.load.clip('check-terms', box, ctx.camT.content);
    ctx.strips = h('div', { style: { position: 'absolute', inset: 0 } }, ctx.camT.content);
    ctx.lift = h('div', { style: { position: 'absolute', inset: 0 } }, ctx.root);

    // A push already under way at the cut (the topic page holds still after the click).
    ctx.camS.shots([{ at: P(8), end: P(12), size: 'medium', focus: TOPIC, move: { at: -P(1), dur: P(5.5), to: { zoom: 1.3 } } }]);
    ctx.camD.shots([
      { at: P(12), size: 'wide' },
      // A slight pull: its top and bottom edges stay in the gaps between text lines before and
      // after the page makes room (y 166..616 at the end).
      { at: P(13), size: 'close', focus: DRAG_CLOSE, zoom: 2.45, move: { at: -P(1), dur: P(4), to: { zoom: 2.4 } } },
      // The page in a spotlight while the question hovers and drops (the panel and pages dim).
      { at: P(16), end: P(22), size: 'medium', focus: DRAG_AFTER, drift: 0.02, dim: { rect: DRAG_PAGE, on: P(16), off: P(22), dur: P(1.5) } },
    ]);
    ctx.camT.shots([
      // The row pushes in (already moving at the cut), its card growing with the zoom.
      { at: P(22), end: P(24), size: 'close', card: ROW_CARD, focus: ROW, zoom: ROW_ZOOM,
        move: { at: -P(1), dur: P(4), to: { zoom: ROW_ZOOM * ROW_PUSH, card: grow(ROW_CARD, ROW_PUSH) } } },
      { at: P(24), end: P(27), size: 'medium', focus: TERMS_PAGE, drift: 0.02 },
      { at: P(30), size: 'close', focus: REPLACE, safe: REPLACE_SAFE, zoom: 2.4, drift: 0.02 },
    ]);

    ctx.placeClip('bank-screen', { at: P(-2), from: 2.5, rate: 0, dur: P(10) }); // the card crops (frozen)
    ctx.placeClip('bank-screen', { at: P(-2), from: 1, rate: 0, dur: P(10) }); // EL1's crop
    ctx.placeClip('bank-screen', { at: P(8), from: TOPIC_AT, dur: P(4) });
    ctx.placeClip('bank-drag', { at: P(12), from: PRESS_AT, dur: P(10) });
    ctx.placeClip('check-terms', { at: P(22), from: CT_CLICK, dur: 0.02 }); // the click, on the cut
    ctx.placeClip('check-terms', { at: P(22), from: CT_ROW, rate: 0, dur: P(2) }); // the row (frozen)
    ctx.placeClip('check-terms', { at: P(22), from: 1.567, rate: 0, dur: P(5) }); // the strips (frozen)
    ctx.placeClip('check-terms', { at: P(24), from: CT_PAGE, dur: P(3) });
    ctx.placeClip('check-terms', { at: P(30), from: CT_REPLACE, dur: P(2) });

    ctx.head = ['bank', 'drag', 'terms'].map((k) => block(ctx.root, { ...HEADLINE, ...ctx.copy[k] }));
    if (ctx.dry) return;
    const [f150, f60, pre] = await Promise.all([frameImage(ctx.screen, 150), frameImage(ctx.screen, 60), frameImage(ctx.terms, 94)]);
    ctx.cards = CARDS.map((c) => ({ ...c, ...topicCard(c.frame === 60 ? f60 : f150, c, ctx.grid) }));
    ctx.chart = chart(ctx.ink, CARDS.map((c) => measureBar(c.frame === 60 ? f60 : f150, c.bar)), { k: gridPush(P(4.25)), about: [960, 640] });
    // The ✦ AI button, masked in the WIDE frame with the toolbar's own flat fill (#F0ECE3).
    const [ax, ay, aw, ah] = AI_BUTTON;
    ctx.aiMask = h('div', { style: { position: 'absolute', left: `${ax}px`, top: `${ay}px`, width: `${aw}px`, height: `${ah}px`, background: '#F0ECE3' } }, ctx.camD.content);
    ctx.lines = UNDERLINES.map((r) => crop(pre, r, ctx.strips));
    const rs = svgEl(ctx.camD.content, { w: 1440, h: 900 });
    ctx.rings = RINGS.map((r) => ({ ...r, el: s('circle', { cx: r.c[0], cy: r.c[1], r: 15, fill: 'none', stroke: C.markBlue, 'stroke-width': 2.4, transform: `rotate(-90 ${r.c[0]} ${r.c[1]})` }, rs) }));
    ctx.q1d = termsLift(ctx.lift);
  },
  update(ctx, t) {
    // ---- the grid and the chart (P-2..P8) ----
    const md = t < P(8);
    show(ctx.grid, md ? 1 : 0);
    // The grid pushes in slowly from the iris to the lift (alive while the bars draw).
    const k = gridPush(t);
    ctx.grid.style.transform = `translate(${f(960 + (GRID.at[0] - GRID.css[0] * GRID.s - 960) * k, 2)}px, ${f(640 + (GRID.at[1] - GRID.css[1] * GRID.s - 640) * k, 2)}px) scale(${f(GRID.s * k, 5)})`;
    show(ctx.ink, md ? 1 : 0);
    if (ctx.cards) {
      const fall = outSoft(prog(t, P(4.25), P(5.25))); // as the vector bars take over
      for (const c of ctx.cards) {
        // Four waves outward from the iris centre, one pulse apart.
        const [cx, cy] = gridPt([(c.x + c.w / 2) / 2, (c.y + c.h / 2) / 2]);
        const wave = Math.min(3, Math.round(Math.hypot(cx - 960, (cy - 540) * 1.4) / 300));
        const b = outSoft(prog(t, P(wave), P(wave) + 0.6));
        c.bar.style.clipPath = inset(b);
        c.bar.style.visibility = t < P(4.25) ? 'visible' : 'hidden'; // the vector bars take over
        c.el.style.opacity = f(1 - fall, 3);
        c.el.style.transform = fall > 0 ? `translateY(${f(18 * fall, 2)}px) scale(${f(1 - 0.03 * fall, 4)})` : 'none';
      }
      ctx.chart.svg.style.visibility = t >= P(4.25) ? 'visible' : 'hidden';
      ctx.chart.at(t, { lift: P(4.25), dur: P(2.5), labels: P(6), drift: P(8) });
    }

    // ---- footage: one rig at a time ----
    const seg = t < P(8) ? null : t < P(12) ? 'S' : t < P(22) ? 'D' : t < P(27) || t >= P(30) ? 'T' : null;
    for (const [k, cam] of [['S', ctx.camS], ['D', ctx.camD], ['T', ctx.camT]]) {
      show(cam.el, seg === k ? 1 : 0);
      if (seg === k) cam.update(t);
    }
    ctx.screen.at(t < P(8) ? 2.5 : TOPIC_AT + (t - P(8)));
    ctx.drag.at(PRESS_AT + Math.max(0, t - P(12)));
    if (ctx.aiMask) show(ctx.aiMask, t < P(13) ? 1 : 0);
    ctx.rings?.forEach((r) => {
      stroke(r.el, t, { at: r.at, dur: 0.45 });
      r.el.style.opacity = f(1 - inOutSoft(prog(t, P(20.75), P(21.9))), 3);
      r.el.style.visibility = t >= r.at && t >= P(16) && t < P(22) ? 'visible' : 'hidden';
    });
    ctx.terms.at(t < P(24) ? CT_ROW : t < P(30) ? CT_PAGE + Math.min(t - P(24), P(3)) : CT_REPLACE + (t - P(30)));
    // The underlines draw on: strips of the frame before the click wipe away, left to right.
    show(ctx.strips, t >= P(24) && t < P(27) ? 1 : 0);
    ctx.lines?.forEach((cv, i) => {
      const w = inOutSoft(prog(t, P(24.2 + i * 0.6), P(24.2 + i * 0.6) + 0.6));
      cv.style.clipPath = `inset(0 0 0 ${(100 * w).toFixed(3)}%)`;
    });

    // ---- the Check terms lift (P27..P30) ----
    const lifting = t >= P(27) && t < P(30);
    show(ctx.lift, lifting ? 1 : 0);
    if (ctx.q1d && lifting) {
      // Where Q1 D sat on screen in the MEDIUM frame (the pose at the cut).
      ctx.camT.update(P(27) - 1e-3);
      const [x0, y0] = ctx.camT.toScreen([Q1D.x, Q1D.y]);
      const sc = ctx.camT.state.frame.pose.s;
      ctx.q1d.at(t, { from: { x: x0, y: y0 - 2 * sc, w: Q1D.w * sc }, lift: P(27), dur: P(1.75), draw: P(27.75), swapAt: P(29) });
    }

    // ---- headlines: off in CLOSE and WIDE frames ----
    ctx.head[0].show(t, { at: 0, dur: 0.45, out: P(12), outDur: 0.05 });
    ctx.head[1].show(t, { at: P(16), dur: 0.45, out: P(22), outDur: 0.05 });
    ctx.head[2].show(t, { at: P(24), dur: 0.45, out: P(30), outDur: 0.05 });
  },
};

export default scene;
