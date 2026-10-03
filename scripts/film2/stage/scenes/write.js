// Act 2, write (FILM.md §3 row 2), bar 3 → bar 8, the build. Beats (P(n) = scene pulse n):
//   P(-2)…P(5)  the iris opens on the mark's dot; the four paper kinds rise as sketches; the
//               dot drops into the Classroom worksheet, which opens into the window card
//   P(5)…P(18)  cut to type-mcq at the real page's place: the camera pushes in (2.3×) as the
//               question is typed, English then 中文, and eases out as the options land
//   P(18)…P(26) language-toggle: EN (P19), 中文 (P22), EN+中 (P25), the dot marks each click
//   P(26)…P(31) the card rises away; the printed sheets rise in, one per language
//   P(31)…P(40) zh-interface: Settings in English, 繁體中文 on P(33), the camera pulls back
//               as 完成 (P36) leaves the start screen in 中文; a clean demo frame for the push
import { h, s, svg, card, block, place, show, C, PAPER_SHADOW, ease, keys, tw, f } from '../lib/index.js';
import { P, HEAD, CARD, camera, TYPE, typeClipT, LANG, langClipT, LANG_CLICKS, UI, uiClipT, UI_CLICKS, SHEET } from './write/geom.js';
import { buildDesk, updateDesk } from './write/desk.js';

const { prog, outSoft, inOutSoft, spring, lerp } = ease;
const SHEETS = ['sheets-en', 'sheets-zh', 'sheets-bi'];
const ROW_CX = SHEET.x0 + (3 * SHEET.w + 2 * SHEET.gap) / 2;
const PUSH = CARD.y + CARD.h + 60; // the card rises out of the frame by this much; the sheets rise in from as far

// Camera keys [t, [z, cx, cy], ease] per footage beat (CSS px of the 1440 × 900 footage).
const CAM_TYPE = [
  [P(5), [1, 720, 450]],
  [P(7), [2.3, 440, 396], inOutSoft],
  [P(14.4), [2.3, 476, 404], ease.sineInOut], // drifts with the caret, line by line
  [P(16), [1.7, 540, 455], inOutSoft],
];
const CAM_LANG = [[P(18), [1.55, 650, 290]], [P(27.5), [1.7, 640, 280], ease.sineInOut]];
const CAM_UI = [
  [P(31), [1.32, 610, 300]],
  [P(33), [1.45, 590, 300], inOutSoft], // the whole dialog edge to edge, the language cards whole
  [P(34.6), [1.5, 585, 296], ease.sineInOut], // a breath closer while it is read
  [P(36.6), [1.05, 700, 440], inOutSoft],
  [P(38), [1, 720, 450], ease.sineInOut], // settles to the clean frame the push takes
];

const scene = {
  events: [
    { t: P(0.2), kind: 'paper', label: 'the four paper kinds rise onto the desk' },
    { t: P(3), kind: 'drop', label: 'the dot drops into the Classroom worksheet' },
    { t: P(3.25), kind: 'whoosh', size: 'm', label: 'the page opens into the editor' },
    { t: P(26), kind: 'whoosh', size: 's', label: 'the editor gives way to the printed sheets' },
    { t: P(26.4), kind: 'paper', label: 'three printed sheets: English, 中文, both' },
  ],
  async setup(ctx) {
    h('div', { style: { position: 'absolute', inset: 0, background: C.cream } }, ctx.el);
    ctx.desk = buildDesk(ctx.el);

    // The printed sheets, one per language (under the card: it pushes them in).
    ctx.sheets = await Promise.all(SHEETS.map(async (id, i) => {
      const el = h('div', { style: {
        position: 'absolute', left: `${f(SHEET.x0 + i * (SHEET.w + SHEET.gap), 2)}px`, top: `${SHEET.y}px`,
        width: `${SHEET.w}px`, height: `${f(SHEET.h, 2)}px`, background: C.paper, boxShadow: PAPER_SHADOW, overflow: 'hidden',
      } }, ctx.el);
      const img = h('img', { src: ctx.load.url(id), style: { display: 'block', width: '100%', height: '100%' } }, el);
      await img.decode();
      return el;
    }));

    // The window card and its camera; one player per clip, only the live one shown.
    ctx.card = card(ctx.el, { x: CARD.x, y: CARD.y, w: CARD.w, h: CARD.h });
    ctx.cam = h('div', { style: { position: 'absolute', left: 0, top: 0, width: '1440px', height: '900px', transformOrigin: '0 0' } }, ctx.card.body);
    const box = { x: 0, y: 0, w: 1440, h: 900 };
    ctx.clips = {
      type: await ctx.load.clip('type-mcq', box, ctx.cam),
      lang: await ctx.load.clip('language-toggle', box, ctx.cam),
      ui: await ctx.load.clip('zh-interface', box, ctx.cam),
    };
    const ov = svg(ctx.card.body, { w: CARD.w, h: CARD.h });
    ctx.click = { dot: s('circle', { r: 9, fill: C.markBlue }, ov), ring: s('circle', { fill: 'none', stroke: C.markBlue }, ov) };

    ctx.placeClip('type-mcq', { at: TYPE.at, from: TYPE.from, rate: 1, dur: TYPE.t1 - TYPE.at });
    ctx.placeClip('type-mcq', { at: TYPE.t1, from: TYPE.fast, rate: TYPE.rate2, dur: TYPE.end - TYPE.t1 });
    ctx.placeClip('language-toggle', { at: LANG.at, from: LANG.from, rate: LANG.rate, dur: LANG.end - LANG.at });
    ctx.placeClip('zh-interface', { at: UI.at, from: UI.from, rate: UI.rate, dur: (UI.hold - UI.from) / UI.rate });


    const head = { x: HEAD.x, y: HEAD.y, align: 'left', w: HEAD.w, maxLines: 2, size: HEAD.size, zhSize: HEAD.zhSize, zhGap: 12, rise: 12 };
    ctx.heads = ['type', 'lang', 'ui'].map((k) => block(ctx.el, { ...ctx.copy[k], ...head }));
  },

  update(ctx, t) {
    updateDesk(ctx.desk, t);

    // Which footage is live, its clip time and its camera.
    const live = t < P(5) ? null : t < LANG.at ? 'type' : t < LANG.end ? 'lang' : t >= UI.at ? 'ui' : null;
    for (const [k, c] of Object.entries(ctx.clips)) c.el.style.visibility = k === live ? 'visible' : 'hidden';
    let cam = camera(1, 720, 450), clicks = [];
    if (live === 'type') {
      ctx.clips.type.at(typeClipT(t));
      cam = camera(...keys(t, CAM_TYPE));
    } else if (live === 'lang') {
      ctx.clips.lang.at(langClipT(t));
      cam = camera(...keys(t, CAM_LANG));
      clicks = LANG_CLICKS;
    } else if (live === 'ui') {
      ctx.clips.ui.at(uiClipT(t));
      cam = camera(...keys(t, CAM_UI));
      clicks = UI_CLICKS;
    }
    ctx.cam.style.transform = `translate(${f(cam.tx, 2)}px, ${f(cam.ty, 2)}px) scale(${f(cam.S, 5)})`;

    // The card: in on the desk's cut; it rises out of the frame (right of the headline column)
    // to bring the sheets in; back on a cut for the interface.
    const out = tw(t, LANG.exit, LANG.end - LANG.exit, inOutSoft);
    show(ctx.card.el, live ? 1 : 0);
    place(ctx.card.el, { y: live === 'lang' ? -PUSH * out : 0 });

    // The dot marks each click in the footage: a pop, then a ripple.
    const hit = clicks.find(([at]) => t >= at - 0.02 && t < at + 0.55);
    if (hit) {
      const [at, pt] = hit;
      const [x, y] = cam.at(pt);
      // Short: the toolbar can re-flow under it right after the click.
      const p = prog(t, at - 0.02, at + 0.55);
      const pop = spring(prog(t, at - 0.02, at + 0.16)) * (1 - outSoft(prog(t, at + 0.2, at + 0.45)));
      for (const el of [ctx.click.dot, ctx.click.ring]) { el.setAttribute('cx', f(x, 2)); el.setAttribute('cy', f(y, 2)); }
      ctx.click.dot.setAttribute('r', f(8 * pop, 3));
      ctx.click.ring.setAttribute('r', f(lerp(8, 34, outSoft(p)), 2));
      ctx.click.ring.setAttribute('stroke-width', f(lerp(3, 1, p), 3));
      show(ctx.click.dot, pop > 0.01 ? 1 : 0);
      show(ctx.click.ring, 0.6 * (1 - p));
    } else {
      show(ctx.click.dot, 0);
      show(ctx.click.ring, 0);
    }

    // The printed sheets rise in on the card's push, a hair apart, left to right.
    ctx.sheets.forEach((el, i) => {
      const p = tw(t, LANG.exit + i * 0.05, LANG.end - LANG.exit, inOutSoft);
      // …then the row breathes in a touch while it is read.
      const k = 1 + 0.025 * ease.sineInOut(prog(t, LANG.end, UI.at));
      const dx = (SHEET.x0 + i * (SHEET.w + SHEET.gap) + SHEET.w / 2 - ROW_CX) * (k - 1);
      place(el, { x: dx, y: PUSH * (1 - p), scale: k, opacity: t >= LANG.exit && t < UI.at ? 1 : 0 });
    });

    // Headlines: one per beat, each gone before the next arrives.
    ctx.heads[0].show(t, { at: P(4), out: P(18) - 0.05, outDur: 0.35 });
    ctx.heads[1].show(t, { at: P(18), out: P(31) - 0.05, outDur: 0.35 });
    ctx.heads[2].show(t, { at: P(31) });
  },
};

export default scene;
