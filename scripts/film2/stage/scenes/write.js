// Act 2, write (FILM.md §3 row 2), bar 3 → bar 8, the build. Each beat shows its money
// moment in CLOSE first, then the frame that names it (P(n) = scene pulse n):
//   P(-2)…P(5)  the iris opens on the desk (on one page, whole; the desk settles to centre):
//               four paper kinds, writing themselves; the dot drops into the Classroom
//               worksheet (P2) as the camera dives to the real page's scale, onto its stem
//   P(5)…P(11)  CLOSE: the stem is typed on the page (the double-click lands on the cut)
//   P(11)…P(17) MEDIUM + "Type right on the page": the 中文 line and the options land; the
//               push ends on the page alone (the panel leaves whole, no word on an edge)
//   P(17)…P(23) CLOSE locked on Q1: EN (on the cut), 中文 (P19), EN+中 (P21); the toggle is
//               re-inked above it as three labels and the dot
//   P(23)…P(29) the printed Q1 in each language at 1190 px page width + "English, 中文, or both"
//   P(29)…P(33) CLOSE on Settings › Language: 繁體中文 (P31) flips it; pushing to the cut
//   P(33)…P(40) WIDE on 完成: the start screen in 中文 + "An interface in 中文 too"; the draw
//               act's axis wipes in over P(38)…P(40) (x 96 / y 1008 stay clear)
import { h, s, svg, block, label, show, place, C, PAPER_SHADOW, HEADLINE, LABEL, ease, f } from '../lib/index.js';
import { camera, frame } from '../lib/camera.js';
import {
  P, BEAT, TYPE, TYPE_STEM, TYPE_CLOSE, TYPE_MED, TYPE_PAGE, TYPE_PAGE_ZOOM, TYPE_DBL, typeClipT, LANG, langClipT, LANG_STATES, REFLOW,
  LANG_CLOSE, LANG_ANCHOR, LANG_SAFE, UI, uiClipT, UI_CLOSE, UI_SAFE, UI_PUSH, UI_PUSH_SAFE, UI_TOGGLE, UI_RAIL, PRINT_K, PRINTS,
} from './write/geom.js';
import { buildDesk, updateDesk } from './write/desk.js';

const { prog, outSoft, spring, lerp, sineInOut } = ease;
const between = (t, a, b) => t >= a && t < b;
const HEAD_IN = { dur: 0.5, stagger: 0.06, outDur: 0.05 }; // in fast, out on the cut

const scene = {
  events: [
    { t: P(-1), kind: 'pencil', label: 'the four paper kinds write themselves' },
    { t: P(2), kind: 'drop', label: 'the dot drops into the Classroom worksheet' },
    { t: P(2.25), kind: 'whoosh', size: 'm', label: 'the camera dives into the page' },
    { t: P(29), kind: 'click', label: 'cut to Settings › Language (the sidebar click, off frame)' },
    { t: P(23), kind: 'paper', label: 'three printed Q1s: English, 中文, both' },
  ],
  async setup(ctx) {
    h('div', { style: { position: 'absolute', inset: 0, background: C.cream } }, ctx.el);
    ctx.desk = buildDesk(ctx.el);

    // Three rigs, one per clip, each shown only inside its own shots.
    const rig = async (name, clipId, shots, inner = false) => {
      const r = camera(ctx, { name });
      const parent = inner ? h('div', { style: { position: 'absolute', inset: 0 } }, r.content) : r.content;
      r.inner = parent;
      r.clip = await ctx.load.clip(clipId, r.box, parent);
      r.problems = r.shots(shots);
      r.span = [shots[0].at, shots[shots.length - 1].end];
      return r;
    };
    const typeClose = { size: 'close', focus: TYPE_CLOSE, safe: TYPE_STEM, zoom: 2.6 };
    ctx.rigs = {
      type: await rig('type', 'type-mcq', [
        { at: BEAT.type, end: BEAT.typeMed, ...typeClose },
        { at: BEAT.typeMed, end: BEAT.lang, size: 'medium', focus: TYPE_MED, move: { at: P(0.5), dur: P(4), to: { focus: TYPE_PAGE, zoom: TYPE_PAGE_ZOOM } } }, // the panel leaves whole
      ]),
      lang: await rig('lang', 'language-toggle', [
        { at: BEAT.lang, end: BEAT.print, size: 'close', focus: LANG_CLOSE, anchor: LANG_ANCHOR, safe: LANG_SAFE, zoom: 2.85, move: { at: -P(3), dur: P(12), to: { zoom: 2.96 } } }, // locked: a slow push only
      ], true),
      ui: await rig('ui', 'zh-interface', [
        { at: BEAT.ui, end: BEAT.uiWide, size: 'close', focus: UI_CLOSE, safe: UI_SAFE, zoom: 2.4, move: { dur: P(5), to: { focus: UI_PUSH, safe: UI_PUSH_SAFE, zoom: 2.9 } } }, // still pushing on the cut
        { at: BEAT.uiWide, end: BEAT.end + P(2), size: 'wide', move: { at: -P(1), dur: P(6), to: { size: 'medium', focus: UI_RAIL, zoom: 1.5 } } },
      ]),
    };
    // The desk dives to where the real stem sits in the first CLOSE.
    const q = frame(typeClose).pose;
    ctx.target = { x: q.a[0] + q.s * (261 - q.c[0]), y: q.a[1] + q.s * (383 - q.c[1]) };

    ctx.placeClip('type-mcq', { at: TYPE.at, from: TYPE.from, rate: 1, dur: TYPE.tS - TYPE.at });
    ctx.placeClip('type-mcq', { at: TYPE.tS, from: TYPE.s, rate: TYPE.rate2, dur: BEAT.lang - TYPE.tS });
    ctx.placeClip('language-toggle', { at: LANG.at, from: LANG.from, rate: LANG.rate, dur: BEAT.print - LANG.at });
    ctx.placeClip('zh-interface', { at: UI.at, from: UI.from, rate: UI.r1, dur: P(2) - 0.01 });
    ctx.placeClip('zh-interface', { at: UI.mid, from: 3.0, rate: UI.r2, dur: P(2) });
    ctx.placeClip('zh-interface', { at: BEAT.uiWide, from: 4.4, rate: 1, dur: UI.end - 4.4 });

    // The printed Q1s, cropped at 1190 px page width, side by side under the headline.
    ctx.prints = [];
    ctx.printGroup = h('div', { style: { position: 'absolute', inset: 0, transformOrigin: '960px 640px' } }, ctx.el);
    for (const pr of PRINTS) {
      const [x, y] = pr.at;
      const [sx, sy, sw, sh] = pr.src.map((v) => v * PRINT_K);
      const el = h('div', { style: {
        position: 'absolute', left: `${f(x, 2)}px`, top: `${y}px`, width: `${f(sw, 2)}px`, height: `${f(sh, 2)}px`,
        background: C.paper, boxShadow: PAPER_SHADOW, overflow: 'hidden', borderRadius: '3px',
      } }, ctx.printGroup);
      const img = h('img', { src: ctx.load.url(pr.id), style: { position: 'absolute', left: `${f(-sx, 2)}px`, top: `${f(-sy, 2)}px`, width: `${f(2379 * PRINT_K, 2)}px` } }, el);
      await img.decode();
      img.style.transformOrigin = `${f(sx + sw / 2, 2)}px ${f(sy + sh / 2, 2)}px`;
      const cap = label(ctx.printGroup, { ...LABEL, ...pr.label, x, y: y - 16 });
      ctx.prints.push({ el, img, cap });
    }

    // The toggle, re-inked over the locked CLOSE: three labels, the dot under the live one.
    ctx.chip = LANG_STATES.map(([, en], i) => {
      const o = en === '中文' ? { en: '', zh: '中文' } : { en, zh: '' };
      const at = { x: 96 + i * 132, y: 100 };
      return { on: label(ctx.el, { ...LABEL, ...o, ...at, color: C.ink, zhColor: C.ink }), off: label(ctx.el, { ...LABEL, ...o, ...at, color: C.inkSubtle, zhColor: C.inkSubtle }), x: at.x };
    });
    ctx.chip.forEach((c) => (c.cx = c.x + c.on.width / 2));

    const ov = svg(ctx.el, {});
    ctx.chipDot = s('circle', { r: 6, fill: C.markBlue }, ov);
    ctx.click = { dot: s('circle', { r: 9, fill: C.markBlue }, ov), ring: s('circle', { fill: 'none', stroke: C.markBlue }, ov) };

    ctx.heads = ['type', 'lang', 'ui'].map((k) => block(ctx.el, { ...HEADLINE, ...ctx.copy[k] }));
  },

  update(ctx, t) {
    updateDesk(ctx.desk, t, ctx.target);

    // Footage: each rig lives only inside its shots.
    const { type, lang, ui } = ctx.rigs;
    for (const r of [type, lang, ui]) {
      const live = between(t, ...r.span);
      r.el.style.display = live ? '' : 'none';
      if (live) r.update(t);
    }
    type.clip.at(Math.max(0, typeClipT(t)));
    const lt = Math.max(0, langClipT(t));
    lang.clip.at(lt);
    // The EN+中 state brings the pages rail back and the page moves: shift it home.
    const back = lang.clip.index(lt) >= 240;
    lang.inner.style.transform = back ? `translate(${-REFLOW[0]}px, ${-REFLOW[1]}px)` : 'none';
    ui.clip.at(Math.max(0, uiClipT(t)));

    // The printed Q1s rise in one after another, then the row breathes while it is read.
    const pOn = between(t, BEAT.print, BEAT.ui);
    // The print breathes inside each card, so the cards stay on the grid (x 96 … 1824).
    const breathe = `scale(${f(1 + 0.03 * sineInOut(prog(t, BEAT.print, BEAT.ui + P(2))), 5)})`; // still moving at the cut
    ctx.prints.forEach(({ el, img, cap }, i) => {
      img.style.transform = breathe;
      const r = outSoft(prog(t, BEAT.print + P(i * 0.5), BEAT.print + P(i * 0.5) + 0.6));
      place(el, { y: 90 * (1 - r), opacity: pOn ? r : 0 });
      cap.show(pOn ? r : 0);
    });

    // The chip: the live state's label in ink, the dot springs across on each click.
    const lOn = between(t, BEAT.lang, BEAT.print);
    const idx = LANG_STATES.findLastIndex(([at]) => t >= at);
    ctx.chip.forEach((c, i) => {
      const inP = outSoft(prog(t, BEAT.lang + i * 0.06, BEAT.lang + i * 0.06 + 0.45)); // rises in on the cut
      c.on.show(lOn && i === idx ? inP : 0);
      c.off.show(lOn && i !== idx ? inP : 0);
    });
    let cx = ctx.chip[0].cx;
    for (let i = 1; i < LANG_STATES.length; i++) cx = lerp(cx, ctx.chip[i].cx, spring(prog(t, LANG_STATES[i][0], LANG_STATES[i][0] + 0.32)));
    ctx.chipDot.setAttribute('cx', f(cx, 2));
    ctx.chipDot.setAttribute('cy', '120');
    show(ctx.chipDot, lOn ? outSoft(prog(t, BEAT.lang + 0.1, BEAT.lang + 0.5)) : 0);

    // The dot marks a click in a CLOSE: a pop, then a ripple.
    const hits = [[BEAT.type, type, TYPE_DBL], [P(31), ui, UI_TOGGLE]];
    const hit = hits.find(([at, r]) => t >= at - 0.02 && t < at + 0.55 && r.el.style.display !== 'none'); // its rig is live (posed)
    if (hit) {
      const [at, r, pt] = hit;
      const [x, y] = r.toScreen(pt);
      const p = prog(t, at - 0.02, at + 0.55);
      const pop = spring(prog(t, at - 0.02, at + 0.16)) * (1 - outSoft(prog(t, at + 0.2, at + 0.45)));
      for (const el of [ctx.click.dot, ctx.click.ring]) { el.setAttribute('cx', f(x, 2)); el.setAttribute('cy', f(y, 2)); }
      ctx.click.dot.setAttribute('r', f(10 * pop, 3));
      ctx.click.ring.setAttribute('r', f(lerp(10, 44, outSoft(p)), 2));
      ctx.click.ring.setAttribute('stroke-width', f(lerp(3, 1, p), 3));
      show(ctx.click.dot, pop > 0.01 ? 1 : 0);
      show(ctx.click.ring, 0.6 * (1 - p));
    } else {
      show(ctx.click.dot, 0);
      show(ctx.click.ring, 0);
    }

    // Headlines: each arrives with the frame that names its beat and leaves on the next cut.
    ctx.heads[0].show(t, { at: BEAT.typeMed, out: BEAT.lang, ...HEAD_IN });
    ctx.heads[1].show(t, { at: BEAT.print, out: BEAT.ui, ...HEAD_IN });
    ctx.heads[2].show(t, { at: BEAT.uiWide, ...HEAD_IN });
  },
};

export default scene;
