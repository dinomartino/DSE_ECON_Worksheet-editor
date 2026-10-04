// Act 6, everywhere (FILM.md §3): the lift's last bars, cut on the pulse (story review: the act
// had the film's slowest cut rate on the music's last swell). Enters by a cut from the bank; the
// end act's axis chapter wipes it away over P14..P16. Beats (P(n) = scene pulse n, film =
// 87.15 + 0.4445 n):
//   P0   cut  CLOSE 3.6× on the real Export dialog, already open (clip 0.9 s): Format .docx,
//             What, Language at ~40 px text; the Export… click sounds on the cut and the
//             pointer clicks "Question paper" inside the shot (P1.7)
//   P2   cut  C2: "A real Word document" stands at left (whole on the cut); at right the real
//             exported .docx (LibreOffice render), cropped to Q1–Q3 at a 1200 px page width;
//             the other formats pop in under the statement, one per half pulse (P3..P5.5)
//   P7   cut  CLOSE 2.4× (page 2180 px wide) on the diagram paper's .docx: title, Q1, its diagram
//   P9   cut  "On the web, Mac and Windows": the browser alone, large, rising in
//   P11  cut  WIDE: the three windows, each with a different real screen of the app (the editor,
//             the 題庫, a diagram); Mac and Windows fan out from behind the browser; a slow push
//             into the end act's wipe
import { h, place, show, C, FONT, PAPER_SHADOW } from '../lib/dom.js';
import { block, HEADLINE, STATEMENT } from '../lib/type.js';
import { C2 } from '../lib/layout.js';
import { camera } from '../lib/camera.js';
import { f } from '../lib/tween.js';
import { prog, lerp, outSoft, spring } from '../lib/ease.js';
import { COPY } from '../../timeline.mjs';
import { browser, macWindow, winWindow } from './everywhere/windows.js';
import { frameImage, crop } from './bank/crops.js';

const CHIPS = ['PDF', 'Answer key', 'Suggested answers', 'Kahoot', 'Blooket', 'ZipGrade'];
const EXPORT_CLICK = 0.8; // export clip: the Export… click (its sound on the cut)
const EXPORT_IN = 0.9; // the frame at the cut: the dialog open; "Question paper" clicked at 1.667
// The dialog from Format (y 316) to the Language row (y 572), its edges in the gaps above
// Format and above Student or teacher copy; the summary row (its AI link) stays out above y 292.
const DIALOG_CLOSE = [480, 299, 480, 297];
// The .docx page (1819 × 2573 px render) cropped to Answer ALL … Q3 D at k = 0.66 (page 1200 px wide),
// keeping 90 px of its top margin.
const DOCX = { k: 0.66, x: 170, y: 150, w: 1236, h: 960 };
const DOCX_BOX = { x: 1392 - (DOCX.w * DOCX.k) / 2, y: 540 - (DOCX.h * DOCX.k) / 2 }; // its 6 % push ends on x 1824
// The diagram paper at CLOSE: half-render px (909.5 × 1286.5); title, Q1 and its diagram (y 105..555).
const PAGE_SRC = { w: 1819 / 2, h: 2573 / 2 };
const DIAGRAM_CLOSE = [55, 105, 800, 450];
// The pointer sits on the editor at clip 0 s: patch it with the same pixels from 0.75 s.
const CURSOR = { x: 2060, y: 584, w: 72, h: 72 }; // frame px
const AI_BUTTON = [1220, 9, 58, 36]; // CSS px: the ✦ AI toolbar button, masked (the act shows no AI)
/** The windows' screens: [clip, clip s, needs the editor patches]; the bank / draw clips fall back to the editor. */
const SCREENS = { web: ['export', 0, true], mac: ['bank-screen', 2.5, false], win: ['shade-area', 5, false] };

const scene = {
  events: [
    { t: 2 * 0.4445, kind: 'paper', label: 'cut to the real .docx page' },
    { t: 3 * 0.4445, kind: 'shimmer', label: 'the formats pop in' },
    { t: 7 * 0.4445, kind: 'page', label: 'cut to the diagram paper, CLOSE' },
    { t: 9 * 0.4445, kind: 'whoosh', size: 's', label: 'cut to the browser' },
    { t: 11 * 0.4445, kind: 'whoosh', size: 's', label: 'the Mac and Windows windows fan out' },
  ],
  async setup(ctx) {
    const P = (n) => ctx.pulse(n);
    h('div', { style: { position: 'absolute', inset: 0, background: C.cream } }, ctx.el);

    // A. The Export dialog, CLOSE (its own rig: the doctor's shot budget counts it).
    ctx.cam = camera(ctx, { src: { w: 1440, h: 900 }, parent: ctx.el, name: 'export' });
    ctx.exp = await ctx.load.clip('export', { x: 0, y: 0, w: 1440, h: 900 }, ctx.cam.content);
    ctx.cam.shots([{ at: 0, end: P(2), size: 'close', focus: DIALOG_CLOSE, zoom: 1080 / DIALOG_CLOSE[3], drift: 0.015 }]);
    ctx.placeClip('export', { at: 0, from: EXPORT_CLICK, dur: 0.02 }); // the click, on the cut
    ctx.placeClip('export', { at: 0, from: EXPORT_IN, rate: 1, dur: P(2) });

    // B. The statement and the formats, one group centred on y 540 (C2's left column), and the
    // real Word document in the right slot.
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
    ctx.docx = h('div', { style: {
      position: 'absolute', left: `${f(DOCX_BOX.x, 2)}px`, top: `${f(DOCX_BOX.y, 2)}px`, width: `${f(DOCX.w * DOCX.k, 2)}px`, height: `${f(DOCX.h * DOCX.k, 2)}px`,
      transformOrigin: '50% 50%', background: C.paper, boxShadow: PAPER_SHADOW, borderRadius: '4px', overflow: 'hidden',
    } }, ctx.ab);
    const img = h('img', { src: ctx.load.url('export-docx-page-1'), style: {
      position: 'absolute', left: `${f(-DOCX.x * DOCX.k, 2)}px`, top: `${f(-DOCX.y * DOCX.k, 2)}px`, width: `${f(1819 * DOCX.k, 2)}px`, height: `${f(2573 * DOCX.k, 2)}px`,
    } }, ctx.docx);

    // C. The diagram paper's .docx, CLOSE: legible at frame scale (11 pt → 40 px).
    ctx.pageCam = camera(ctx, { src: PAGE_SRC, parent: ctx.el, name: 'docx-diagram' });
    const page = ctx.pageCam.image(ctx.load.url('export-docx-diagram-page-1'));
    ctx.pageCam.shots([{ at: P(7), end: P(9), size: 'close', focus: DIAGRAM_CLOSE, zoom: 2.4, drift: 0.02 }]);

    // D. Web, Mac, Windows: flat windows, each holding a real screen of the app (frozen frames).
    ctx.big = h('div', { style: { position: 'absolute', inset: 0 } }, ctx.el);
    ctx.webBig = browser(ctx.big, { x: 440, y: 290, w: 1040 });
    ctx.c = h('div', { style: { position: 'absolute', inset: 0 } }, ctx.el);
    ctx.cWin = h('div', { style: { position: 'absolute', inset: 0, transformOrigin: '960px 620px' } }, ctx.c);
    const name = COPY.end.name.en;
    ctx.mac = macWindow(ctx.cWin, { x: 130, y: 296, w: 780, name });
    ctx.win = winWindow(ctx.cWin, { x: 1010, y: 296, w: 780, name });
    ctx.web = browser(ctx.cWin, { x: 480, y: 330, w: 960 }); // with the push it ends inside x 96..1824, y ≤ 1008
    const rest = ctx.window.end - ctx.from - P(9);
    // A screen's clip, or the editor's if this act may not load it (assets.mjs scenes).
    const screen = async (key, parent) => {
      const [id, at, patch] = SCREENS[key];
      try {
        const clip = await ctx.load.clip(id, { x: 0, y: 0, w: 1440, h: 900 }, parent);
        ctx.placeClip(id, { at: P(9), from: at, rate: 0, dur: rest });
        return { clip, at, patch };
      } catch {
        return { clip: await ctx.load.clip('export', { x: 0, y: 0, w: 1440, h: 900 }, parent), at: 0, patch: true };
      }
    };
    ctx.apps = [];
    for (const [key, wdw] of [['web', ctx.webBig], ['mac', ctx.mac], ['win', ctx.win], ['web', ctx.web]]) {
      const bw = wdw.w - 2;
      const content = h('div', { style: { position: 'absolute', left: 0, top: 0, width: '1440px', height: '900px', transformOrigin: '0 0', transform: `scale(${f(bw / 1440, 5)})` } }, wdw.body);
      ctx.apps.push({ ...(await screen(key, content)), content });
    }
    ctx.placeClip('export', { at: P(9), from: 0.75, rate: 0, dur: rest }); // the cursor patch
    ctx.platforms = block(ctx.el, { ...HEADLINE, ...ctx.copy.platforms });
    if (ctx.dry) return;
    await img.decode();
    await page.decode();
    const clean = await frameImage(ctx.exp, 45);
    for (const a of ctx.apps.filter((x) => x.patch)) {
      crop(clean, CURSOR, a.content);
      const [ax, ay, aw, ah] = AI_BUTTON;
      h('div', { style: { position: 'absolute', left: `${ax}px`, top: `${ay}px`, width: `${aw}px`, height: `${ah}px`, background: '#F0ECE3' } }, a.content);
    }
  },

  update(ctx, t) {
    const P = (n) => ctx.pulse(n);
    const shot = t < P(2) ? 'A' : t < P(7) ? 'B' : t < P(9) ? 'C' : t < P(11) ? 'D' : 'E';

    // A. The dialog plays from just after the click (it is open on the cut).
    show(ctx.cam.el, shot === 'A' ? 1 : 0);
    if (shot === 'A') ctx.cam.update(t);
    ctx.exp.at(EXPORT_IN + Math.min(t, P(2) - 1 / 60));

    // B. The statement whole on the cut; the .docx settles up into the slot and pushes in at a
    // constant rate to the next cut; the formats pop in under the statement.
    ctx.ab.style.display = shot === 'B' ? 'block' : 'none';
    ctx.word.show(t, { at: P(2) - 1 });
    const push = 1 + 0.06 * prog(t, P(2), P(7));
    ctx.docx.style.transform = `translateY(${f(36 * (1 - outSoft(prog(t, P(2), P(2) + 0.55))), 2)}px) scale(${f(push, 5)})`;
    ctx.chips.forEach((el, i) => {
      const p = prog(t, P(3 + i * 0.5), P(3 + i * 0.5) + 0.5);
      el.style.transform = p < 1 ? `translateY(${f(10 * (1 - outSoft(p)), 2)}px) scale(${f(lerp(0.72, 1, spring(p)), 4)})` : 'none';
      show(el, outSoft(Math.min(1, p * 1.8)));
    });

    // C. The diagram paper, CLOSE.
    show(ctx.pageCam.el, shot === 'C' ? 1 : 0);
    if (shot === 'C') ctx.pageCam.update(t);

    // D/E. The browser alone rises in; then the three windows, the desktop two fanning out from
    // behind the browser; a slow push carries the frame into the end act's wipe (P14..P16).
    ctx.apps.forEach((a) => a.clip.at(a.at));
    ctx.big.style.display = shot === 'D' ? 'block' : 'none';
    ctx.c.style.display = shot === 'E' ? 'block' : 'none';
    const web = prog(t, P(9), P(9) + 0.6);
    place(ctx.webBig.el, { y: 28 * (1 - outSoft(web)), scale: lerp(0.95, 1, spring(web)) * (1 + 0.025 * prog(t, P(9), P(11))), opacity: outSoft(Math.min(1, web * 2)) });
    const fan = outSoft(prog(t, P(11), P(11) + 0.8));
    const peek = outSoft(prog(t, P(11), P(11) + 0.2));
    place(ctx.mac.el, { x: 330 * (1 - fan), opacity: peek });
    place(ctx.win.el, { x: -330 * (1 - fan), opacity: peek });
    place(ctx.cWin, { scale: 1 + 0.03 * prog(t, P(11), P(16)) });
    ctx.platforms.show(t, { at: P(9), dur: 0.5 });
  },
};

export default scene;
