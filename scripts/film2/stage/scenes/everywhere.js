// Act 6, everywhere (FILM.md §3): the lift's last bars. Enters by a cut from the bank; the
// end act's axis chapter wipes it away over P14..P16. Beats (P(n) = scene pulse n, film =
// 87.15 + 0.4445 n):
//   P0   cut  C2: "A real Word document" rises in at left; at right the real Export dialog at
//             1.6× (its Format … Export .docx rows, cropped below the summary); the Export…
//             click lands on the cut and the dialog opens in the crop
//   P3   cut  the same slot: the real exported .docx (LibreOffice render), cropped to Q1–Q3 at
//             a 1200 px page width; the statement stays
//   P4.5      the other formats pop in under the statement, one per half pulse
//   P8   cut  "On the web, Mac and Windows": the browser rises, the Mac and Windows windows fan
//             out from behind it, each holding the app; a slow push into the end act's wipe
import { h, place, show, C, FONT, PAPER_SHADOW } from '../lib/dom.js';
import { block, HEADLINE, STATEMENT } from '../lib/type.js';
import { C2 } from '../lib/layout.js';
import { camera } from '../lib/camera.js';
import { f } from '../lib/tween.js';
import { prog, lerp, outSoft, inOutSoft, spring } from '../lib/ease.js';
import { COPY } from '../../timeline.mjs';
import { browser, macWindow, winWindow } from './everywhere/windows.js';
import { frameImage, crop } from './bank/crops.js';

const CHIPS = ['PDF', 'Answer key', 'Suggested answers', 'Kahoot', 'Blooket', 'ZipGrade'];
const EXPORT_CLICK = 0.8; // export clip: the Export… click; Answer key flips at 2.30 (never shown)
const DIALOG = [480, 300, 480, 522]; // CSS px: Format … Export .docx (the summary row above is out)
const ZOOM = 1.6;
const DIALOG_CARD = { x: 1416 - (DIALOG[2] * ZOOM) / 2, y: 540 - (DIALOG[3] * ZOOM) / 2, w: DIALOG[2] * ZOOM, h: DIALOG[3] * ZOOM };
const grow = (r, k) => ({ x: r.x + (r.w * (1 - k)) / 2, y: r.y + (r.h * (1 - k)) / 2, w: r.w * k, h: r.h * k });
// The .docx page (1819 × 2573 px render) cropped to Answer ALL … Q3 D at k = 0.66 (page 1200 px wide),
// keeping 90 px of its top margin.
const DOCX = { k: 0.66, x: 170, y: 150, w: 1236, h: 960 };
const DOCX_BOX = { x: 1404 - (DOCX.w * DOCX.k) / 2, y: 540 - (DOCX.h * DOCX.k) / 2 }; // its push ends on x 1824
// The pointer sits on the editor at clip 0 s: patch it with the same pixels from 0.75 s.
const CURSOR = { x: 2060, y: 584, w: 72, h: 72 }; // frame px

const scene = {
  events: [
    { t: 3 * 0.4445, kind: 'paper', label: 'cut to the real .docx page' },
    { t: 4.5 * 0.4445, kind: 'shimmer', label: 'the formats pop in' },
    { t: 8 * 0.4445, kind: 'whoosh', size: 's', label: 'cut to the three windows' },
    { t: 9 * 0.4445, kind: 'whoosh', size: 's', label: 'the Mac and Windows windows fan out' },
  ],
  async setup(ctx) {
    const P = (n) => ctx.pulse(n);
    h('div', { style: { position: 'absolute', inset: 0, background: C.cream } }, ctx.el);

    // A/B. The statement and the formats, as one group centred on y 540 (C2's left column).
    ctx.ab = h('div', { style: { position: 'absolute', inset: 0 } }, ctx.el);
    ctx.word = block(ctx.ab, { ...STATEMENT, ...C2.statement, ...ctx.copy.word, valign: 'top', y: 0 });
    ctx.chipRow = h('div', { style: { position: 'absolute', left: '96px', width: '784px', display: 'flex', flexWrap: 'wrap', gap: '14px 12px' } }, ctx.ab);
    ctx.chips = CHIPS.map((text) => h('span', { text, style: {
      display: 'inline-block', font: `500 26px ${FONT.sans}`, color: C.ink, padding: '12px 24px', borderRadius: '999px',
      background: C.panel, border: `1px solid ${C.lineStrong}`, whiteSpace: 'pre', transformOrigin: '50% 60%',
    } }, ctx.chipRow));
    const gap = 56, top = 540 - (ctx.word.height + gap + ctx.chipRow.offsetHeight) / 2;
    ctx.word.el.style.top = `${f(top, 2)}px`;
    ctx.chipRow.style.top = `${f(top + ctx.word.height + gap, 2)}px`;

    // A. The Export dialog at 1.6× in the right slot.
    ctx.cam = camera(ctx, { src: { w: 1440, h: 900 }, parent: ctx.ab, name: 'export' });
    ctx.exp = await ctx.load.clip('export', { x: 0, y: 0, w: 1440, h: 900 }, ctx.cam.content);
    // A slow push, already moving at the cut: the crop grows with the zoom (no row is cut).
    ctx.cam.shots([{ at: 0, end: P(3), size: 'narrow', card: DIALOG_CARD, focus: DIALOG, zoom: ZOOM,
      move: { at: -P(1), dur: P(5), to: { zoom: ZOOM * 1.06, card: grow(DIALOG_CARD, 1.06) } } }]);
    ctx.placeClip('export', { at: 0, from: EXPORT_CLICK, rate: 1, dur: P(3) });

    // B. The real Word document, cropped at a legible scale.
    ctx.docx = h('div', { style: {
      position: 'absolute', left: `${f(DOCX_BOX.x, 2)}px`, top: `${f(DOCX_BOX.y, 2)}px`, width: `${f(DOCX.w * DOCX.k, 2)}px`, height: `${f(DOCX.h * DOCX.k, 2)}px`,
      background: C.paper, boxShadow: PAPER_SHADOW, borderRadius: '4px', overflow: 'hidden', transformOrigin: '50% 50%',
    } }, ctx.ab);
    const img = h('img', { src: ctx.load.url('export-docx-page-1'), style: {
      position: 'absolute', left: `${f(-DOCX.x * DOCX.k, 2)}px`, top: `${f(-DOCX.y * DOCX.k, 2)}px`, width: `${f(1819 * DOCX.k, 2)}px`, height: `${f(2573 * DOCX.k, 2)}px`,
    } }, ctx.docx);
    await img.decode();

    // C. Web, Mac, Windows: three flat windows, each with the app in it (clip 0 s, frozen).
    ctx.c = h('div', { style: { position: 'absolute', inset: 0 } }, ctx.el);
    ctx.cWin = h('div', { style: { position: 'absolute', inset: 0, transformOrigin: '960px 620px' } }, ctx.c);
    const name = COPY.end.name.en;
    ctx.mac = macWindow(ctx.cWin, { x: 120, y: 296, w: 780, name });
    ctx.win = winWindow(ctx.cWin, { x: 1020, y: 296, w: 780, name });
    ctx.web = browser(ctx.cWin, { x: 480, y: 330, w: 960 }); // with the push it ends inside x 96..1824, y ≤ 1008
    ctx.apps = [];
    for (const wdw of [ctx.mac, ctx.win, ctx.web]) {
      const bw = wdw.w - 2;
      const content = h('div', { style: { position: 'absolute', left: 0, top: 0, width: '1440px', height: '900px', transformOrigin: '0 0', transform: `scale(${f(bw / 1440, 5)})` } }, wdw.body);
      const clip = await ctx.load.clip('export', { x: 0, y: 0, w: 1440, h: 900 }, content);
      ctx.apps.push({ clip, content });
    }
    ctx.placeClip('export', { at: P(8), from: 0, rate: 0, dur: ctx.window.end - ctx.from - P(8) });
    ctx.placeClip('export', { at: P(8), from: 0.75, rate: 0, dur: ctx.window.end - ctx.from - P(8) }); // the cursor patch
    ctx.platforms = block(ctx.c, { ...HEADLINE, ...ctx.copy.platforms });
    if (ctx.dry) return;
    const clean = await frameImage(ctx.apps[0].clip, 45);
    for (const a of ctx.apps) crop(clean, CURSOR, a.content);
  },

  update(ctx, t) {
    const P = (n) => ctx.pulse(n);
    const c = t >= P(8);
    ctx.ab.style.display = c ? 'none' : 'block';
    ctx.c.style.display = c ? 'block' : 'none';

    // A. The dialog plays from the click (it opens on the cut), cut away before Answer key.
    const dialog = t < P(3);
    show(ctx.cam.el, dialog ? 1 : 0);
    if (dialog) ctx.cam.update(t);
    ctx.exp.at(EXPORT_CLICK + Math.min(t, P(3) - 1 / 60));
    ctx.word.show(t, { at: 0, dur: 0.5 });

    // B. The .docx in the same slot, a slow push; the formats pop in under the statement.
    show(ctx.docx, !dialog ? 1 : 0);
    // It settles up into the slot on the cut, then pushes in at a constant rate to the next cut.
    const push = 1 + 0.03 * prog(t, P(3), P(8));
    ctx.docx.style.transform = `translateY(${f(36 * (1 - outSoft(prog(t, P(3), P(3) + 0.55))), 2)}px) scale(${f(push, 5)})`;
    ctx.chips.forEach((el, i) => {
      const p = prog(t, P(4.5 + i * 0.5), P(4.5 + i * 0.5) + 0.5);
      el.style.transform = p < 1 ? `translateY(${f(10 * (1 - outSoft(p)), 2)}px) scale(${f(lerp(0.72, 1, spring(p)), 4)})` : 'none';
      show(el, outSoft(Math.min(1, p * 1.8)));
    });

    // C. The browser rises in with the headline; the desktop windows fan out from behind it;
    // a slow push carries the frame into the end act's wipe (P14..P16).
    ctx.apps.forEach((a) => a.clip.at(0));
    const web = prog(t, P(8), P(8) + 0.6);
    place(ctx.web.el, { y: 28 * (1 - outSoft(web)), scale: lerp(0.95, 1, spring(web)), opacity: outSoft(Math.min(1, web * 2)) });
    const fan = outSoft(prog(t, P(9), P(9) + 0.8));
    const peek = outSoft(prog(t, P(9), P(9) + 0.2));
    place(ctx.mac.el, { x: 330 * (1 - fan), opacity: peek });
    place(ctx.win.el, { x: -330 * (1 - fan), opacity: peek });
    ctx.platforms.show(t, { at: P(8), dur: 0.5 });
    place(ctx.cWin, { scale: 1 + 0.03 * prog(t, P(9), P(16)) }); // a constant push into the wipe
  },
};

export default scene;
