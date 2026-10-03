// Act 5, the 題庫 (FILM.md §3), the climax: the music's full lift lands on P(0) = bar 20.
// Beats (P(n) = scene pulse n; every one is on the grid):
//   P(-2)..P(0)  the iris opens on topic card C (Market and Price, 23 questions), large
//   P(0)         impact: C's coverage bar draws on
//   P(1.5)..P(4.5) the camera pulls back; the other eleven cards fly in on P(2) and P(3),
//                their bars draw, the coverage chart grows; headline on P(4)
//   P(4.5)..P(6) the window resolves around them (same pixels); footage from P(6)
//   P(8)         click Market and Price: its questions, by sub-topic; push to the list
//   P(12)        cut: the editor's 題庫 tab; press P(13), drag onto the page, which makes
//                room and renumbers; release P(19); the "1 question added" toast
//   P(22)        cut: the Check terms menu item; click P(23); underlines draw P(24)..P(25.5);
//                the finding P(26); Replace with 消費者盈餘 P(29.3); hold to the cut P(32)
import { h, show, C, place } from '../lib/dom.js';
import { block } from '../lib/type.js';
import { card } from '../lib/card.js';
import { prog, outSoft, inOutSoft, clamp } from '../lib/ease.js';
import { P, WIN, BODY, HEAD, CARDS, CARD_C, CHART, UNDERLINES, camera, camTransform } from './bank/geom.js';
import { frameImage, crop, topicCard } from './bank/crops.js';

const SCREEN_AT = 2.5; // bank-screen time the crops are cut from and the footage resumes at
const DRAG_AT = P(13) - 0.9; // bank-drag: the press (0.9 s) lands on P(13)
const TERMS_AT = P(23) - 1.6; // check-terms: the Check terms click (1.6 s) lands on P(23)
const ARRIVE = (c) => (c.ring === 0 ? -1 : c.ring === 1 ? P(2) : P(3)); // fly-in start
const inset = (r) => `inset(0 ${(100 * (1 - clamp(r))).toFixed(3)}% 0 0)`;

const scene = {
  events: [
    { t: 0, kind: 'impact', label: 'the lift: the 題庫 opens' },
    { t: P(1.5), kind: 'whoosh', size: 'm', label: 'pull back, the topic cards fly in' },
    { t: P(3.5), kind: 'shimmer', label: 'the coverage bars draw on' },
    { t: P(24), kind: 'pencil', label: 'the glossary underlines draw on' },
  ],
  async setup(ctx) {
    // Everything hangs off one root (the engine poses the iris on its own wrapper).
    ctx.root = h('div', { style: { position: 'absolute', inset: 0 } }, ctx.el);
    h('div', { style: { position: 'absolute', inset: 0, background: C.cream } }, ctx.root);
    // The window: footage inside a camera-posed content box (CSS px, origin 0 0).
    ctx.win = card(ctx.root, { ...WIN });
    ctx.content = h('div', { style: { position: 'absolute', left: 0, top: 0, width: '1440px', height: '900px', transformOrigin: '0 0' } }, ctx.win.body);
    const box = { x: 0, y: 0, w: 1440, h: 900 };
    ctx.screen = await ctx.load.clip('bank-screen', box, ctx.content);
    ctx.drag = await ctx.load.clip('bank-drag', box, ctx.content);
    ctx.terms = await ctx.load.clip('check-terms', box, ctx.content);
    ctx.strips = h('div', { style: { position: 'absolute', inset: 0 } }, ctx.content);
    // The floating layer: the cut-out cards before the window exists (same camera, screen px).
    ctx.float = h('div', { style: { position: 'absolute', left: 0, top: 0, width: '1440px', height: '900px', transformOrigin: '0 0' } }, ctx.root);

    ctx.placeClip('bank-screen', { at: P(-2), from: SCREEN_AT, rate: 0, dur: P(8) }); // the crops (frozen)
    ctx.placeClip('bank-screen', { at: P(-2), from: 1, rate: 0, dur: P(8) }); // EL1's crop
    ctx.placeClip('bank-screen', { at: P(6), from: SCREEN_AT, dur: P(6) });
    ctx.placeClip('bank-drag', { at: P(12), from: P(12) - DRAG_AT, dur: P(10) });
    ctx.placeClip('check-terms', { at: P(22), from: P(22) - TERMS_AT, dur: P(10) });
    ctx.placeClip('check-terms', { at: P(22), from: 1.567, rate: 0, dur: P(4) }); // the strips (frozen)

    ctx.head = ['bank', 'drag', 'terms'].map((k) => block(ctx.root, {
      ...ctx.copy[k], x: HEAD.x, y: HEAD.y, align: 'left', w: 1728, maxLines: 1, size: HEAD.size, zhSize: HEAD.zhSize, rise: 12,
    }));
    if (ctx.dry) return;
    const [f150, f60, pre] = await Promise.all([frameImage(ctx.screen, 150), frameImage(ctx.screen, 60), frameImage(ctx.terms, 94)]);
    ctx.chart = CHART.map((r) => crop(f150, r, ctx.float));
    ctx.cards = CARDS.map((c) => ({ ...c, ...topicCard(c.frame === 60 ? f60 : f150, c, ctx.float) }));
    ctx.lines = UNDERLINES.map((r) => crop(pre, r, ctx.strips));
  },
  update(ctx, t) {
    const q = camera(t);
    ctx.float.style.transform = camTransform(q);
    ctx.content.style.transform = camTransform(q, BODY);

    // The window resolves around the assembled cards; the cut-outs give way to footage.
    const win = outSoft(prog(t, P(4.5), P(5.75)));
    show(ctx.win.el, win);
    show(ctx.float, t < P(6) ? 1 : 0);
    if (ctx.cards) {
      const cC = [CARD_C.x + CARD_C.w / 2, CARD_C.y + CARD_C.h / 2];
      for (const c of ctx.cards) {
        const at = ARRIVE(c);
        const p = c.ring === 0 ? 1 : outSoft(prog(t, at + c.col * 0.07, at + c.col * 0.07 + 0.75));
        const d = [c.x + c.w / 2 - cC[0], c.y + c.h / 2 - cC[1]];
        const n = Math.hypot(...d) || 1;
        place(c.el, { x: (d[0] / n) * 70 * (1 - p), y: (d[1] / n) * 70 * (1 - p), scale: 0.92 + 0.08 * p, opacity: p });
        c.el.style.boxShadow = `0 4px 14px -4px rgb(0 0 0 / ${(0.14 * p * (1 - win)).toFixed(4)})`;
        const barAt = c.ring === 0 ? 0 : at + c.col * 0.07 + 0.35;
        c.bar.style.clipPath = inset(c.ring === 0 ? inOutSoft(prog(t, P(-0.6), P(2))) : outSoft(prog(t, barAt, barAt + 0.7)));
      }
      ctx.chart.forEach((cv, i) => {
        const g = outSoft(prog(t, P(3.5) + i * 0.06, P(3.5) + i * 0.06 + 0.6));
        cv.style.clipPath = `inset(${(100 * (1 - g)).toFixed(3)}% 0 0 0)`;
        show(cv, g > 0 ? 1 : 0);
      });
    }

    // Footage: one clip at a time, cut on P(12) and P(22).
    show(ctx.screen.el, t < P(12) ? 1 : 0);
    ctx.screen.at(t < P(6) ? SCREEN_AT : SCREEN_AT + (t - P(6)));
    show(ctx.drag.el, t >= P(12) && t < P(22) ? 1 : 0);
    ctx.drag.at(Math.max(0, t - DRAG_AT));
    show(ctx.terms.el, t >= P(22) ? 1 : 0);
    ctx.terms.at(Math.max(0, t - TERMS_AT));
    // Check terms: the frame before the click hides each underline, then wipes away.
    show(ctx.strips, t >= P(22) && t < P(26) ? 1 : 0);
    ctx.lines?.forEach((cv, i) => {
      const w = inOutSoft(prog(t, P(24) + i * P(0.6), P(24) + i * P(0.6) + 0.7));
      cv.style.clipPath = `inset(0 0 0 ${(100 * w).toFixed(3)}%)`;
    });

    ctx.head[0].show(t, { at: P(4), out: P(12), outDur: 0.3 });
    ctx.head[1].show(t, { at: P(12), out: P(22), outDur: 0.3 });
    ctx.head[2].show(t, { at: P(22) });
  },
};

export default scene;
