// A lab scene, not in the timeline: try lib pieces alone with ?lab=_lab&labdur=<s>
// (tools/lab.mjs renders stills). It shows the camera grammar on a real clip:
// WIDE 0–1.5 s, MEDIUM 1.5–3 s with a push to CLOSE from 2.1 s, MEDIUM with a dim 3–4.5 s,
// CLOSE 4.5–6 s (its safe rect kept whole), then the re-ink helpers 6–8 s, then a carry lift
// 8–10.5 s (MEDIUM; Q1 lifts from where it sits on screen, the card rides along and fades):
// lab.mjs --dur=10.5 --at=8.3,8.5,8.65,8.8,9.1,10
import { h, C, svg, s } from '../lib/dom.js';
import { block, HEADLINE } from '../lib/type.js';
import { camera } from '../lib/camera.js';
import * as reink from '../lib/reink.js';

const Q1 = [330, 300, 640, 200]; // CSS px of type-mcq: question 1 and its options
const Q1_TEXT = [340, 300, 600, 180];

export default {
  async setup(ctx) {
    h('div', { style: { position: 'absolute', inset: 0, background: C.cream } }, ctx.el);
    ctx.cam = camera(ctx, { src: { w: 1440, h: 900 } });
    ctx.clip = await ctx.load.clip('type-mcq', ctx.cam.box, ctx.cam.content);
    ctx.problems = ctx.cam.shots([
      { at: 0, size: 'wide' },
      { at: 1.5, size: 'medium', focus: Q1, move: { at: 0.6, dur: 0.9, to: { size: 'close', safe: Q1_TEXT } } },
      { at: 3, size: 'medium', focus: Q1, dim: { rect: Q1, on: 3.1, off: 4.4, dur: 0.45 } },
      { at: 4.5, size: 'close', focus: Q1, safe: Q1_TEXT, zoom: 2.8 },
      { at: 8, size: 'medium', focus: Q1, drift: 0 },
    ]);
    ctx.head = block(ctx.el, { ...HEADLINE, en: 'Type right on the page', zh: '直接在頁面上打字' });
    ctx.ink = svg(ctx.el, {});
    ctx.ink.style.visibility = 'hidden';
    ctx.axes = s('path', { d: 'M300 900V200M300 900H1000', fill: 'none', stroke: C.ink, 'stroke-width': 4, 'stroke-linecap': 'round' }, ctx.ink);
    ctx.curve = s('path', { d: 'M360 260L940 840', fill: 'none', stroke: C.markBlue, 'stroke-width': 6, 'stroke-linecap': 'round' }, ctx.ink);
    ctx.wavy = s('path', { d: reink.wavyPath(1100, 860, 600, { amp: 6, wave: 24 }), fill: 'none', stroke: C.red, 'stroke-width': 3 }, ctx.ink);
    ctx.hatch = reink.hatch(ctx.ink, { points: [[300, 900], [300, 560], [640, 560]], gap: 14, color: C.markBlue });
    ctx.bars = reink.bars(ctx.ink, { x: 1100, y: 760, w: 600, h: 300, values: [0.4, 0.7, 0.55, 0.9, 0.3, 0.65], color: C.accent });
    // The traced element of the carry lift: a white field with a blue rim in Q1's shape.
    ctx.q1 = h('div', { style: { position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', boxSizing: 'border-box', background: C.paper, border: `3px solid ${C.markBlue}`, borderRadius: '9px', visibility: 'hidden' } }, ctx.el);
    ctx.num = h('div', { style: { position: 'absolute', left: '1100px', top: '200px', font: '400 160px Newsreader', color: C.ink } }, ctx.el);
  },
  update(ctx, t) {
    ctx.cam.update(t);
    ctx.clip.at(Math.min(t, 7));
    ctx.head.show(t, { at: 0.2, out: 2.1 });
    const lab = t >= 6 && t < 8;
    ctx.ink.style.visibility = lab ? 'visible' : 'hidden';
    ctx.cam.el.style.visibility = lab ? 'hidden' : 'visible';
    ctx.num.style.visibility = lab ? 'visible' : 'hidden';
    ctx.q1.style.visibility = 'hidden';
    if (t >= 8) {
      // The lift starts where Q1 sits on its first frame (the camera posed at AT).
      const AT = 8.4;
      ctx.cam.update(AT);
      const from = reink.screenRect({ cam: ctx.cam, rect: { x: Q1[0], y: Q1[1], w: Q1[2], h: Q1[3] } });
      ctx.cam.update(t);
      const L = reink.lift(t, from, reink.fitRect(from), { at: AT, dur: 0.89, carry: true });
      L.carry.apply(ctx.cam.el);
      if (t >= AT) Object.assign(ctx.q1.style, {
        width: `${from.w}px`, height: `${from.h}px`, visibility: 'visible', borderWidth: `${3 / L.scale}px`,
        transform: `translate(${L.x + from.x * L.scale}px, ${L.y + from.y * L.scale}px) scale(${L.scale})`,
      });
      return;
    }
    if (!lab) return;
    const u = t - 6;
    reink.stroke(ctx.axes, u, { at: 0, dur: 0.6 });
    reink.stroke(ctx.curve, u, { at: 0.3, dur: 0.7 });
    reink.stroke(ctx.wavy, u, { at: 0.5, dur: 0.6 });
    ctx.hatch.at(u, { at: 0.6, dur: 0.8 });
    ctx.bars.at(u, { at: 0.4, dur: 0.8, stagger: 0.08 });
    ctx.num.textContent = reink.roll(u, { from: 4, to: 7, at: 0.6, dur: 0.8 });
  },
};
