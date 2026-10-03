// Act 6, everywhere (FILM.md §3): fast cuts on the lift's last bars. Enters by a cut from
// the bank. Beats (P(n) = scene pulse n; the act is 16 pulses, then the end act pushes up):
//   P0..P4   Export: the real dialog opens in the window card (clip `export`), the camera
//            pushes in to its Format / What rows and the Export .docx button
//   P4..P11  cut: "A real Word document" in the left column; the real exported .docx page
//            (LibreOffice render) stands on the right exactly where the cold open's sketch
//            page stood; on P6 the diagram page is dealt over it (the supply curve, done);
//            P7.5..P10 the other formats pop in under the headline as text pills
//   P11..    cut: "On the web, Mac and Windows": a browser, then a Mac-style and a
//            Windows-style window fan out from behind it, each showing the app; a slow drift
//            carries the frame into the push
import { h, place, show, C, FONT, PAPER_SHADOW } from '../lib/dom.js';
import { card } from '../lib/card.js';
import { block } from '../lib/type.js';
import { keys, f } from '../lib/tween.js';
import { prog, lerp, outSoft, inOutSoft, spring } from '../lib/ease.js';
import { COPY } from '../../timeline.mjs';
import { PAGE } from './open/geom.js';
import { browser, macWindow, winWindow } from './everywhere/windows.js';

// The formats the Export dialog writes besides .docx (stills-export-other-apps shows the list).
const CHIPS = ['PDF', 'Answer key', 'Suggested answers', 'Kahoot', 'Blooket', 'ZipGrade'];
const EXPORT_IN = 0.55; // clip s at the cut: the Export… click lands 0.25 s later
const CARD = { x: 240, y: 90, w: 1440, h: 900 };
const ZOOM = { s: 1.55, at: [720, 548] }; // clip CSS px: the dialog's Format … Export .docx
const PAPER_W = PAGE.w * PAGE.k; // the cold open's page box (open/geom.js), 864 px
// Clip s per window (mac, win, web): the editor before the dialog opens. Different moments, so
// the pointer is never cloned: hidden behind the browser on the Mac window, by the sidebar on
// the Windows one, on Export… in the browser.
const EDITOR_AT = [0, 0, 0.75];

const pg = (ctx, n) => ctx.pulse(n);

async function paper(ctx, id, parent) {
  const el = h('div', { style: {
    position: 'absolute', left: `${PAGE.x}px`, top: `${PAGE.y}px`, width: `${f(PAPER_W, 2)}px`, height: `${f((PAPER_W * 2573) / 1819, 2)}px`,
    background: C.paper, boxShadow: PAPER_SHADOW, borderRadius: '4px', overflow: 'hidden',
  } }, parent);
  const img = h('img', { src: ctx.load.url(id), style: { display: 'block', width: '100%', height: '100%' } }, el);
  await img.decode();
  return el;
}

const scene = {
  events: [
    { t: 1.778, kind: 'paper', label: 'cut to the real .docx page' },
    { t: 2.667, kind: 'paper', label: 'the diagram page is dealt over it' },
    { t: 3.334, kind: 'shimmer', label: 'the formats pop in' },
    { t: 4.89, kind: 'whoosh', size: 's', label: 'cut to the three windows' },
    { t: 5.334, kind: 'whoosh', size: 's', label: 'the Mac and Windows windows fan out' },
  ],
  async setup(ctx) {
    h('div', { style: { position: 'absolute', inset: 0, background: C.cream } }, ctx.el);
    const P = (n) => pg(ctx, n);

    // A. Export: the dialog in the window card.
    ctx.a = h('div', { style: { position: 'absolute', inset: 0 } }, ctx.el);
    ctx.card = card(ctx.a, { ...CARD });
    ctx.exp = await ctx.load.clip('export', { x: 0, y: 0, w: CARD.w, h: CARD.h }, ctx.card.body);
    ctx.exp.el.style.transformOrigin = '0 0';
    ctx.placeClip('export', { at: 0, from: EXPORT_IN, rate: 1, dur: P(4) });

    // B. The real Word document.
    ctx.b = h('div', { style: { position: 'absolute', inset: 0 } }, ctx.el);
    ctx.pages = h('div', { style: { position: 'absolute', inset: 0 } }, ctx.b);
    ctx.page1 = await paper(ctx, 'export-docx-page-1', ctx.pages);
    ctx.page2 = await paper(ctx, 'export-docx-diagram-page-1', ctx.pages);
    ctx.word = block(ctx.b, { ...ctx.copy.word, x: 96, y: 0, w: 700, align: 'left', size: 96, zhSize: 44, maxLines: 2, rise: 14 });
    ctx.chipRow = h('div', { style: { position: 'absolute', left: '96px', width: '720px', display: 'flex', flexWrap: 'wrap', gap: '14px 12px' } }, ctx.b);
    ctx.chips = CHIPS.map((text) => h('span', { text, style: {
      display: 'inline-block', font: `500 26px ${FONT.sans}`, color: C.ink, padding: '13px 26px', borderRadius: '999px',
      background: C.panel, border: `1px solid ${C.lineStrong}`, whiteSpace: 'pre', transformOrigin: '50% 60%',
    } }, ctx.chipRow));
    const gap = 64;
    const total = ctx.word.height + gap + ctx.chipRow.offsetHeight;
    const top = 540 - total / 2;
    ctx.word.el.style.top = `${f(top, 2)}px`;
    ctx.chipRow.style.top = `${f(top + ctx.word.height + gap, 2)}px`;

    // C. Web, Mac, Windows: three flat windows, each with the app in it.
    ctx.c = h('div', { style: { position: 'absolute', inset: 0, transformOrigin: '960px 640px' } }, ctx.el);
    const name = COPY.end.name.en;
    ctx.mac = macWindow(ctx.c, { x: 96, y: 300, w: 720, name });
    ctx.win = winWindow(ctx.c, { x: 1104, y: 300, w: 720, name });
    ctx.web = browser(ctx.c, { x: 480, y: 340, w: 960 });
    ctx.apps = [];
    for (const [i, wdw] of [ctx.mac, ctx.win, ctx.web].entries()) {
      const bw = wdw.w - 2;
      ctx.apps.push(await ctx.load.clip('export', { x: 0, y: 0, w: bw, h: (bw * 900) / 1440 }, wdw.body));
      ctx.placeClip('export', { at: P(11), from: EDITOR_AT[i], rate: 0, dur: ctx.window.end - ctx.from - P(11) });
    }
    ctx.platforms = block(ctx.c, { ...ctx.copy.platforms, x: 96, y: 96, w: 1500, align: 'left', size: 72, zhSize: 33, maxLines: 1, rise: 12 });
  },

  update(ctx, t) {
    const P = (n) => pg(ctx, n);
    const beat = t < P(4) ? 'a' : t < P(11) ? 'b' : 'c';
    for (const k of ['a', 'b', 'c']) ctx[k].style.display = k === beat ? 'block' : 'none';

    // A. The clip plays at 1.0; the camera pushes in once the dialog is up.
    ctx.exp.at(EXPORT_IN + Math.min(t, P(4) - 1 / 60));
    const z = inOutSoft(prog(t, P(1.5), P(3.75)));
    const s = lerp(1, ZOOM.s, z);
    const cx = lerp(ZOOM.at[0], CARD.w / 2, z), cy = lerp(ZOOM.at[1], CARD.h / 2, z);
    ctx.exp.el.style.transform = `translate(${f(cx - s * ZOOM.at[0], 2)}px, ${f(cy - s * ZOOM.at[1], 2)}px) scale(${f(s, 5)})`;

    // B. The pages drift up a little; the diagram page is dealt over page 1 on P6.
    place(ctx.pages, { y: lerp(0, -36, prog(t, P(4), P(11))) });
    const deal = outSoft(prog(t, P(6), P(6) + 0.62));
    place(ctx.page2, { y: lerp(1000, 0, deal) });
    show(ctx.page2, t >= P(6) ? 1 : 0);
    ctx.word.show(t, { at: P(4), dur: 0.7 });
    ctx.chips.forEach((el, i) => {
      const p = prog(t, P(7.5 + i * 0.5), P(7.5 + i * 0.5) + 0.5);
      const sc = lerp(0.72, 1, spring(p));
      el.style.transform = p < 1 ? `translateY(${f(10 * (1 - outSoft(p)), 2)}px) scale(${f(sc, 4)})` : 'none';
      show(el, outSoft(Math.min(1, p * 1.8)));
    });

    // C. The browser rises in with the headline; the two desktop windows fan out from
    // behind it; then the whole frame drifts towards the push.
    ctx.apps.forEach((c, i) => c.at(EDITOR_AT[i]));
    const web = prog(t, P(11), P(11) + 0.6);
    place(ctx.web.el, { y: 28 * (1 - outSoft(web)), scale: lerp(0.95, 1, spring(web)), opacity: outSoft(Math.min(1, web * 2)) });
    const fan = outSoft(prog(t, P(12), P(12) + 0.8));
    const peek = outSoft(prog(t, P(12), P(12) + 0.2));
    place(ctx.mac.el, { x: 300 * (1 - fan), opacity: peek });
    place(ctx.win.el, { x: -300 * (1 - fan), opacity: peek });
    ctx.platforms.show(t, { at: P(11), dur: 0.7 });
    const drift = keys(t, [[P(13), 1], [ctx.window.end - ctx.from, 1.035, inOutSoft]]);
    place(ctx.c, { scale: drift });
  },
};

export default scene;
