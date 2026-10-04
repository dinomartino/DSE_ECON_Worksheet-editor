// Act 5, the 題庫 (FILM.md §3), the climax: the music's full lift lands on P(0) = bar 20.
// Beats (P(n) = scene pulse n, film = 72.92 + 0.4445 n):
//   P(-2)..P(2)  the iris opens on the full topic grid: twelve cards cut from the app's frame,
//                on cream at 1.35×; the coverage bars draw on in four waves, P0..P1.5, outward
//                from the iris; the headline from P0
//   P(3)..P(9)   re-ink lift: the baseline and letters draw, the cards fall away, their bars fly
//                flat to the baseline and stand up left to right as one coverage chart (MCQ dark,
//                LQ light, as the app drew them); each count (the card's own) as its bar stands;
//                the finished chart holds ≥ 1 s (bank/chart.js LIFT)
//   P(9)   cut   MEDIUM, the topic page, whole width, its header strip out: the click on Market
//                and Price lands on the cut
//   P(12)  cut   WIDE, the editor: the press on the 題庫 tab's question lands on the cut
//   P(13)  cut   CLOSE 2.4× on the page: the drag arrives; P14 the page makes room and renumbers
//   P(16)  cut   MEDIUM: the drop (P17.7), "1 question added from 題庫 · Undo"; the headline
//   P(22)  cut   the one menu row "Check terms against EDB glossary  free" at 1600 → 1728 px under
//                its headline; its click lands on the cut, marked by the blue dot (no AI menu, no
//                AI button, no provider in frame; the pointer not yet on the row)
//   P(24)  cut   MEDIUM: the page; the wavy underlines draw on
//   P(27)        re-ink lift: Q1 D's line leaves from where it sits (the page carried along),
//                its underline drawn at frame scale, 剩 → 盈
//   P(30)  cut   CLOSE on the finding card: Replace with 消費者盈餘 lands on the cut
import { h, s, svg as svgEl, show, C, PAPER_SHADOW } from '../lib/dom.js';
import { C1 } from '../lib/layout.js';
import { stroke, lift as reinkLift } from '../lib/reink.js';
import { block, HEADLINE } from '../lib/type.js';
import { camera } from '../lib/camera.js';
import { prog, outSoft, inOutSoft, spring, sineInOut, cubicBezier, clamp, lerp } from '../lib/ease.js';
import { f } from '../lib/tween.js';
import {
  P, CARDS, GRID, gridPt, TOPIC, DRAG_CLOSE, DRAG_CLOSE_END, DRAG_AFTER, DRAG_PAGE, AI_BUTTON,
  ROW, ROW_ZOOM, ROW_CARD, ROW_W, ROW_RADIUS, ROW_CLICK, TERMS_PAGE, REPLACE, REPLACE_SAFE, UNDERLINES, Q1D,
} from './bank/geom.js';
import { frameImage, crop, topicCard } from './bank/crops.js';
import { chart, measureBar } from './bank/chart.js';
import { termsLift } from './bank/terms.js';
import { PULSE } from '../../timeline.mjs';

const TOPIC_AT = 3.4; // bank-screen: the click on Market and Price (the topic page is frame 204)
const PRESS_AT = 0.9; // bank-drag: the press on the bank question
// The page makes room at 1.85 s (frame 111, the drop target snaps in): played a touch fast so
// that change lands on P14, a pulse after the CLOSE cut (motion review: it popped 55 ms off grid).
const DRAG_RATE = (1.85 - PRESS_AT) / (2 * PULSE);
// The row is frozen at 1.167 s, before the pointer reaches it (at 1.55 s it covered "EDB").
const CT_CLICK = 1.6, CT_ROW = 1.167, CT_PAGE = 1.75, CT_REPLACE = 4.4; // check-terms
const CT_RATE = 0.9; // the page plays 1.75 → 2.95 s: the finding card (Next, 3.0 s) opens off screen
const SRC = { w: 1440, h: 900 };
const inset = (r) => `inset(0 ${(100 * (1 - clamp(r))).toFixed(3)}% 0 0)`;
const box = { x: 0, y: 0, w: 1440, h: 900 };
const ROW_PUSH = ROW_W[1] / ROW_W[0];
const grow = (r, k) => ({ x: r.x + (r.w * (1 - k)) / 2, y: r.y + (r.h * (1 - k)) / 2, w: r.w * k, h: r.h * k });
const LIFT_AT = P(3); // the cards' bars become the chart (lib chart.js LIFT)
// The term lift's ease: a gentle start (outSoft whipped the dense page, MAD ≈ 9), a soft landing.
const LIFT_EASE = cubicBezier(0.4, 0, 0.2, 1);
const TOPIC_CUT = P(9); // the topic page
// The renumbering, ringed with the dot's blue (CSS px of bank-drag): old Q2 becomes "3."
// while the question hovers; the dropped question is "2." after the release (P18.07).
const RINGS = [{ c: [353, 578], at: P(16.5) }, { c: [353, 393], at: P(18.25) }];
/** The grid's slow push (scale about 960, 640) from the iris to the lift. */
const gridPush = (t) => 1 + 0.04 * prog(t, P(-2), P(4.5));
/** The click marker on the Check terms row: the dot lands, its ring opens over 2 pulses. */
const CLICK_AT = P(22);

const scene = {
  events: [
    { t: 0, kind: 'impact', label: 'the lift: the 題庫 opens' },
    // (the whoosh into the lift is timeline.mjs CUES bank.whoosh: it ends 0.35 s after the hit)
    { t: P(0.25), kind: 'shimmer', label: 'the coverage bars draw on' },
    { t: P(3), kind: 'pencil', label: 'the bars leave the cards for the baseline' },
    { t: P(4.5), kind: 'pop', label: 'the bars stand up as a chart, left to right' },
    { t: P(14), kind: 'snap', label: 'the page makes room under the dragged question' },
    { t: P(24), kind: 'pencil', label: 'the glossary underlines draw on' },
    { t: P(27), kind: 'pencil', label: 'the term lifts off the page; its underline draws at frame scale' },
    { t: P(29), kind: 'pop', label: 'the glossary term sets in' },
  ],
  async setup(ctx) {
    ctx.root = h('div', { style: { position: 'absolute', inset: 0, background: C.cream } }, ctx.el);

    // Motion design: the grid of cut-out cards, then the chart.
    ctx.grid = h('div', { style: { position: 'absolute', left: 0, top: 0, width: '1440px', height: '900px', transformOrigin: '0 0',
      transform: `translate(${f(GRID.at[0] - GRID.css[0] * GRID.s, 2)}px, ${f(GRID.at[1] - GRID.css[1] * GRID.s, 2)}px) scale(${GRID.s})` } }, ctx.root);
    ctx.ink = h('div', { style: { position: 'absolute', inset: 0 } }, ctx.root);

    // Footage: one camera rig per clip (each shot list is linted on its own).
    const rig = (name, parent = ctx.root) => camera(ctx, { src: SRC, parent, name });
    ctx.camS = rig('bank-screen');
    ctx.screen = await ctx.load.clip('bank-screen', box, ctx.camS.content);
    ctx.camD = rig('bank-drag');
    ctx.drag = await ctx.load.clip('bank-drag', box, ctx.camD.content);
    // Check terms sits in a window that keeps the carried page inside its MEDIUM card (C1).
    ctx.tWin = h('div', { style: { position: 'absolute', inset: 0 } }, ctx.root);
    ctx.camT = rig('check-terms', ctx.tWin);
    ctx.terms = await ctx.load.clip('check-terms', box, ctx.camT.content);
    ctx.strips = h('div', { style: { position: 'absolute', inset: 0 } }, ctx.camT.content);
    // Q1 D's own line and underline, painted out (page white) while its vector copy lifts off.
    ctx.q1dGap = h('div', { style: { position: 'absolute', left: '412px', top: '366px', width: '184px', height: '29px', background: '#fff' } }, ctx.camT.content);
    ctx.lift = h('div', { style: { position: 'absolute', inset: 0 } }, ctx.root);

    // A push already under way at the cut (the topic page holds still after the click).
    // The whole page width, its header strip out of frame; a push held on the top-left corner, so
    // the list's words never meet an edge (only the empty preview margin leaves at the right).
    ctx.camS.shots([{ at: TOPIC_CUT, end: P(12), size: 'medium', focus: TOPIC,
      move: { at: 0, dur: P(3), to: { zoom: 1.27, focus: [0, TOPIC[1], 1728 / 1.27, 744 / 1.27] } } }]);
    ctx.camD.shots([
      { at: P(12), size: 'wide' },
      // A pull, its top edge held in the gap above Q1 (y 176): the bottom edge opens from
      // y 600 to 626 as the page makes room, in the gaps between text lines before and after.
      { at: P(13), size: 'close', focus: DRAG_CLOSE, zoom: 2.55, move: { at: -P(1), dur: P(6), to: { zoom: 2.4, focus: DRAG_CLOSE_END } } },
      // The page in a spotlight while the question hovers and drops (the panel and pages dim).
      { at: P(16), end: P(22), size: 'medium', focus: DRAG_AFTER, drift: 0.02, dim: { rect: DRAG_PAGE, on: P(16), off: P(22), dur: P(1.5) } },
    ]);
    ctx.camT.shots([
      // The row pushes in (already moving at the cut), its card growing with the zoom.
      // The row alone at ~60 px text under the headline, pushing in from the cut (1600 → 1728).
      { at: P(22), end: P(24), size: 'close', card: ROW_CARD, focus: ROW, zoom: ROW_ZOOM,
        move: { at: 0, dur: P(4), to: { zoom: ROW_ZOOM * ROW_PUSH, card: grow(ROW_CARD, ROW_PUSH) } } },
      { at: P(24), end: P(27), size: 'medium', focus: TERMS_PAGE, drift: 0.02 },
      { at: P(30), size: 'close', focus: REPLACE, safe: REPLACE_SAFE, zoom: 2.4, drift: 0.02 },
    ]);

    ctx.placeClip('bank-screen', { at: P(-2), from: 2.5, rate: 0, dur: P(6) }); // the card crops (frozen)
    ctx.placeClip('bank-screen', { at: P(-2), from: 1, rate: 0, dur: P(6) }); // EL1's crop
    ctx.placeClip('bank-screen', { at: TOPIC_CUT, from: TOPIC_AT, dur: P(12) - TOPIC_CUT });
    ctx.placeClip('bank-drag', { at: P(12), from: PRESS_AT, rate: DRAG_RATE, dur: P(10) });
    ctx.placeClip('check-terms', { at: P(22), from: CT_CLICK, dur: 0.02 }); // the click, on the cut
    ctx.placeClip('check-terms', { at: P(22), from: CT_ROW, rate: 0, dur: P(2) }); // the row (frozen)
    ctx.placeClip('check-terms', { at: P(22), from: 1.567, rate: 0, dur: P(5) }); // the strips (frozen)
    ctx.placeClip('check-terms', { at: P(24), from: CT_PAGE, rate: CT_RATE, dur: P(3) }); // ends before Next (3.0 s)
    ctx.placeClip('check-terms', { at: P(30), from: CT_REPLACE, dur: P(2) });

    ctx.head = ['bank', 'drag', 'terms'].map((k) => block(ctx.root, { ...HEADLINE, ...ctx.copy[k] }));
    if (ctx.dry) return;
    const [f150, f60, pre] = await Promise.all([frameImage(ctx.screen, 150), frameImage(ctx.screen, 60), frameImage(ctx.terms, 94)]);
    ctx.cards = CARDS.map((c) => ({ ...c, ...topicCard(c.frame === 60 ? f60 : f150, c, ctx.grid) }));
    ctx.chart = chart(ctx.ink, CARDS.map((c) => measureBar(c.frame === 60 ? f60 : f150, c.bar)), { k: gridPush(LIFT_AT), about: [960, 640] });
    // The ✦ AI button, masked in the WIDE frame with the toolbar's own flat fill (#F0ECE3).
    const [ax, ay, aw, ah] = AI_BUTTON;
    ctx.aiMask = h('div', { style: { position: 'absolute', left: `${ax}px`, top: `${ay}px`, width: `${aw}px`, height: `${ah}px`, background: '#F0ECE3' } }, ctx.camD.content);
    ctx.lines = UNDERLINES.map((r) => crop(pre, r, ctx.strips));
    const rs = svgEl(ctx.camD.content, { w: 1440, h: 900 });
    ctx.rings = RINGS.map((r) => ({ ...r, el: s('circle', { cx: r.c[0], cy: r.c[1], r: 15, fill: 'none', stroke: C.markBlue, 'stroke-width': 2.4, transform: `rotate(-90 ${r.c[0]} ${r.c[1]})` }, rs) }));
    ctx.q1d = termsLift(ctx.lift);
    // The motif on the row's click (the film's blue dot): a dot lands, a ring opens and fades.
    const ms = svgEl(ctx.root, { w: 1920, h: 1080 });
    ctx.clickRing = s('circle', { r: 7, fill: 'none', stroke: C.markBlue, 'stroke-width': 3 }, ms);
    ctx.clickDot = s('circle', { r: 7, fill: C.markBlue }, ms);
  },
  update(ctx, t) {
    // ---- the grid and the chart (P-2..P9) ----
    const md = t < TOPIC_CUT;
    show(ctx.grid, md ? 1 : 0);
    // The grid pushes in slowly from the iris to the lift (alive while the bars draw).
    const k = gridPush(t);
    ctx.grid.style.transform = `translate(${f(960 + (GRID.at[0] - GRID.css[0] * GRID.s - 960) * k, 2)}px, ${f(640 + (GRID.at[1] - GRID.css[1] * GRID.s - 640) * k, 2)}px) scale(${f(GRID.s * k, 5)})`;
    show(ctx.ink, md ? 1 : 0);
    if (ctx.cards) {
      const fall = outSoft(prog(t, LIFT_AT, LIFT_AT + 0.4)); // the cards leave as their bars fly
      for (const c of ctx.cards) {
        // Four waves outward from the iris centre, half a pulse apart (all drawn by P2.6).
        const [cx, cy] = gridPt([(c.x + c.w / 2) / 2, (c.y + c.h / 2) / 2]);
        const wave = Math.min(3, Math.round(Math.hypot(cx - 960, (cy - 540) * 1.4) / 300));
        const b = outSoft(prog(t, P(wave / 2), P(wave / 2) + 0.5));
        c.bar.style.clipPath = inset(b);
        c.bar.style.visibility = t < LIFT_AT ? 'visible' : 'hidden'; // the vector bars take over
        c.el.style.opacity = f(1 - fall, 3);
        c.el.style.transform = fall > 0 ? `translateY(${f(18 * fall, 2)}px) scale(${f(1 - 0.03 * fall, 4)})` : 'none';
      }
      ctx.chart.svg.style.visibility = t >= LIFT_AT ? 'visible' : 'hidden';
      ctx.chart.at(t, { lift: LIFT_AT, drift: TOPIC_CUT });
    }

    // ---- footage: one rig at a time (the Check terms page rides along into its lift) ----
    const carrying = t >= P(27) && t < P(28.5);
    const seg = t < TOPIC_CUT ? null : t < P(12) ? 'S' : t < P(22) ? 'D' : t < P(27) || t >= P(30) || carrying ? 'T' : null;
    for (const [k, cam] of [['S', ctx.camS], ['D', ctx.camD], ['T', ctx.camT]]) {
      show(cam.el, seg === k ? 1 : 0);
      if (seg === k) cam.update(carrying && k === 'T' ? P(27) - 1e-3 : t);
    }
    // The row card takes the row fill's own corner radius (no popover white at its corners).
    // (and the paper shadow: it reads as an object on the cream, not a strip of the screen).
    if (seg === 'T' && t < P(24)) Object.assign(ctx.camT.card.style, { borderRadius: `${f(ROW_RADIUS * ctx.camT.state.frame.pose.s, 2)}px`, boxShadow: PAPER_SHADOW });
    const { x: cx0, y: cy0, w: cw0, h: ch0 } = C1.card;
    ctx.tWin.style.clipPath = carrying ? `inset(${cy0}px ${1920 - cx0 - cw0}px ${1080 - cy0 - ch0}px ${cx0}px round 16px)` : 'none';
    ctx.screen.at(t < TOPIC_CUT ? 2.5 : TOPIC_AT + (t - TOPIC_CUT));
    ctx.drag.at(PRESS_AT + DRAG_RATE * Math.max(0, t - P(12)));
    if (ctx.aiMask) show(ctx.aiMask, t < P(13) ? 1 : 0);
    ctx.rings?.forEach((r) => {
      stroke(r.el, t, { at: r.at, dur: 0.45 });
      r.el.style.opacity = f(1 - inOutSoft(prog(t, P(20.75), P(21.9))), 3);
      r.el.style.visibility = t >= r.at && t >= P(16) && t < P(22) ? 'visible' : 'hidden';
    });
    ctx.terms.at(t < P(24) ? CT_ROW : t < P(30) ? CT_PAGE + CT_RATE * Math.min(t - P(24), P(3)) : CT_REPLACE + (t - P(30)));
    // The underlines draw on: strips of the frame before the click wipe away, left to right.
    show(ctx.strips, t >= P(24) && t < P(27) ? 1 : 0);
    ctx.lines?.forEach((cv, i) => {
      const w = inOutSoft(prog(t, P(24.2 + i * 0.6), P(24.2 + i * 0.6) + 0.6));
      cv.style.clipPath = `inset(0 0 0 ${(100 * w).toFixed(3)}%)`;
    });

    // ---- the click marker on the Check terms row (P22..P24) ----
    if (ctx.clickDot) {
      const on = t >= CLICK_AT && t < P(24);
      ctx.clickDot.style.visibility = ctx.clickRing.style.visibility = on ? 'visible' : 'hidden';
      if (on) {
        const [x, y] = ctx.camT.toScreen(ROW_CLICK);
        const r = outSoft(prog(t, CLICK_AT, CLICK_AT + P(2)));
        for (const el of [ctx.clickDot, ctx.clickRing]) {
          el.setAttribute('cx', f(x, 2));
          el.setAttribute('cy', f(y, 2));
        }
        ctx.clickRing.setAttribute('r', f(lerp(7, 36, r), 2));
        ctx.clickRing.style.opacity = f(0.55 * (1 - r), 3);
        const d = spring(prog(t, CLICK_AT, CLICK_AT + 0.2)) * (1 - inOutSoft(prog(t, P(23.2), P(23.8))));
        ctx.clickDot.setAttribute('r', f(7 * Math.max(0, d), 2));
      }
    }

    // ---- the Check terms lift (P27..P30): Q1 D leaves from where it sits, the page carried ----
    const lifting = t >= P(27) && t < P(30);
    show(ctx.lift, lifting ? 1 : 0);
    show(ctx.q1dGap, lifting ? 1 : 0);
    if (ctx.q1d && lifting) {
      ctx.camT.update(P(27) - 1e-3); // the MEDIUM pose at the lift
      const L = reinkLift(t, { cam: ctx.camT, rect: Q1D }, ctx.q1d.target, { at: P(27), dur: P(1.75), ease: LIFT_EASE });
      // The page rides along at a fifth of the line's growth and a quarter of its travel, fading
      // over 1.5 pulses (carried at the line's full 6× it whipped: MAD ≈ 11 for 0.3 s).
      const F = [L.from.x + L.from.w / 2, L.from.y + L.from.h / 2], N = [L.rect.x + L.rect.w / 2, L.rect.y + L.rect.h / 2];
      const kc = 1 + (L.scale - 1) * 0.2;
      const [tx, ty] = [0, 1].map((i) => F[i] + 0.25 * (N[i] - F[i]) - kc * F[i]);
      Object.assign(ctx.camT.el.style, { transformOrigin: '0 0', transform: `translate(${f(tx, 2)}px, ${f(ty, 2)}px) scale(${f(kc, 5)})` });
      show(ctx.camT.el, carrying ? 1 - sineInOut(prog(t, P(27), P(28.5))) : 0);
      ctx.q1d.at(t, { L, lift: P(27), dur: P(1.75), draw: P(27.75), swapAt: P(29) });
    } else ctx.camT.el.style.transform = 'none'; // (opacity: show() above, every frame)

    // ---- headlines: off in CLOSE and WIDE frames; the terms one is up from the row's cut ----
    // Each one stands until its cut, gone on the cut's own frame (no headline-less footage frame).
    [[0, P(12)], [P(16), P(22)], [P(22), P(30)]].forEach(([at, out], i) => {
      ctx.head[i].show(t, { at, dur: 0.45 });
      if (t >= out) show(ctx.head[i].el, 0);
    });
  },
};

export default scene;
