// The act's printed pages (A4 print previews of the real app, 2379×3366): flat paper, never a
// thumbnail while it is meant to be read (FILM.md §4: ≥ 1190 px wide, 11 pt → 22 px).
//   keys     one marking-scheme page, 1240 px wide, its four layouts cut in place on beats; the
//            left column lists the four by the app's own names, the blue dot on the one shown
//   mock     Paper 1 cover, Paper 2 cover, its answer page, an answer key: dealt on beats, 1240 wide
//   vers     Version A, B, C full-bleed (the header and question 1; the options reshuffle), swapped
//            in place, one slow push accelerating into the bank's iris
// update(t) is pure; every time is scene seconds from the caller's T.
import { h, s, svg, show, place, label, LABEL, f, C } from '../../lib/index.js';
import { lerp, prog, outSoft, inOutSoft, sineInOut } from '../../lib/ease.js';
import * as reink from '../../lib/reink.js';
import { sheet, loadSheet, SHEET_W, SHEET_H } from './sheet.js';

/** The four layouts, in the order they cut, with the app's names (AnswerKeyLayoutPanel.messages.ts). */
export const LAYOUTS = [
  { id: 'sheets-key-hkeaa', en: 'HKEAA style', zh: 'HKEAA 評卷參考' },
  { id: 'sheets-key-classic', en: 'Classic', zh: '經典' },
  { id: 'sheets-key-suggested', en: 'Suggested answers', zh: '參考答案' },
  { id: 'sheets-key-detailed', en: 'Detailed table', zh: '詳細表格' },
];
export const MOCK = ['sheets-p1-cover', 'sheets-p2-cover', 'sheets-p2-page', 'sheets-key-classic']; // cover to key
export const VERSIONS = ['sheets-version-a', 'sheets-version-b', 'sheets-version-c'];

const PAGE = { x: 584, top: 264, w: 1240 }; // keys and mock: right of the label column
const KEY_ANCHOR = [1204, 432]; // the page title: the slow push closes on it
const VCROP = [188, 60, 2000, 1125]; // version header + question 1 and its options, filling the frame
const LIST = { x: 120, dot: 102, y: 290, step: 56 }; // the layout list: label baselines, the dot's x
const RISE = 168; // the key page's rise after the headline: its top from y 264 to 96
const PUSH = 0.045; // the versions push: every printed word stays 48 px inside the frame
const VHEAD = [1825, 2088, 200]; // "Version A 版本 A": x0, x1, underline y (sheet px)

export async function prints(parent, { url, T }) {
  const ids = [...new Set([...LAYOUTS.map((l) => l.id), ...MOCK])];
  const cv = {};
  await Promise.all(ids.map(async (id) => { cv[id] = await loadSheet(url(id), 1400); }));
  const vcv = await Promise.all(VERSIONS.map((id) => loadSheet(url(id), SHEET_W))); // full-bleed: full res

  const keyLayer = h('div', { style: { position: 'absolute', inset: 0 } }, parent);
  const keys = sheet(keyLayer, LAYOUTS.map((l) => cv[l.id]));
  // Each name twice (muted, and ink for the one shown): a cut between them, never a blend.
  const row = (l, i, color) => label(keyLayer, { ...LABEL, en: l.en, zh: l.zh, color, zhColor: color, x: LIST.x, y: LIST.y + i * LIST.step });
  const names = LAYOUTS.map((l, i) => [row(l, i, C.inkMuted), row(l, i, C.ink)]);
  const listSvg = svg(keyLayer, {});
  const dot = s('circle', { cx: LIST.dot, r: 6, fill: C.markBlue }, listSvg);

  const mockLayer = h('div', { style: { position: 'absolute', inset: 0, transformOrigin: '960px 640px' } }, parent);
  const mock = MOCK.map((id) => sheet(mockLayer, [cv[id]]));

  const fin = h('div', { style: { position: 'absolute', inset: 0 } }, parent);
  const vers = sheet(fin, vcv);
  const uSvg = svg(fin, {});
  const under = s('line', { stroke: C.markBlue, 'stroke-width': 4, 'stroke-linecap': 'round' }, uSvg);
  await Promise.all([keys, ...mock, vers].map((x) => x.ready));

  const ht = (w, crop = [0, 0, SHEET_W, SHEET_H]) => (crop[3] * w) / crop[2];
  function update(t) {
    // ---- keys: one page, four layouts cut on beats, a slow push toward its title ----------
    const inKeys = t >= T.keys[0] && t < T.keys[1];
    show(keyLayer, inKeys ? 1 : 0);
    if (inKeys) {
      const face = T.keyCuts.findLastIndex((c) => t >= c);
      const g = 1 + 0.025 * sineInOut(prog(t, T.keys[0], T.keys[1]));
      const w = PAGE.w * g, cx = KEY_ANCHOR[0] + (PAGE.x + PAGE.w / 2 - KEY_ANCHOR[0]) * g;
      // Once the headline has gone, the page rises into its slot (the list stays): no empty band.
      const top = KEY_ANCHOR[1] + (PAGE.top - KEY_ANCHOR[1]) * g - RISE * inOutSoft(prog(t, ...T.keyRise));
      keys.set({ x: cx, y: top + ht(w) / 2, w, face });
      // The list rises in (70 ms stagger); the dot slides to the layout shown on each cut.
      names.forEach(([dim, lit], i) => {
        const p = outSoft(prog(t, T.keys[0] + i * 0.07, T.keys[0] + i * 0.07 + 0.5));
        dim.show(i === face ? 0 : p);
        lit.show(i === face ? p : 0);
      });
      const at = T.keyCuts[face], from = face ? face - 1 : face;
      const row = lerp(from, face, outSoft(prog(t, at, at + 0.3)));
      dot.setAttribute('cy', f(LIST.y - 8 + row * LIST.step, 2));
      dot.setAttribute('r', f(6 * outSoft(prog(t, T.keys[0] + 0.1, T.keys[0] + 0.5)), 2));
    }

    // ---- mock: dealt on beats, each one 80 px right of the last, rising into place --------
    const inMock = t >= T.mock[0] && t < T.mock[1];
    show(mockLayer, inMock ? 1 : 0);
    if (inMock) {
      mock.forEach((sh, i) => {
        const at = T.mockDeals[i], p = outSoft(prog(t, at, at + 0.55));
        sh.set({ x: PAGE.x - 240 + 80 * i + PAGE.w / 2, y: PAGE.top + ht(PAGE.w) / 2 + 140 * (1 - p), w: PAGE.w * lerp(0.97, 1, p), opacity: t >= at ? 1 : 0 }); // dealt: there at once, rising
      });
      place(mockLayer, { scale: 1 + 0.02 * sineInOut(prog(t, T.mock[0], T.mock[1])) });
    }

    // ---- versions: one full-bleed CLOSE, the page swapped in place, one push into the iris --
    const inFin = t >= T.vers[0] && t < T.vers[1];
    show(fin, inFin ? 1 : 0);
    if (!inFin) return;
    const face = Math.max(0, T.verCuts.findLastIndex((c) => t >= c));
    const u = prog(t, T.vers[0], T.vers[1]);
    const w = 1920 * (1 + PUSH * (u + u * u) / 2); // gathering: slow at first, faster into the lift
    vers.set({ x: 960, y: 540, w, crop: VCROP, face });
    // A blue underline under the version letter: it stays while the pages swap.
    const k = w / VCROP[2], left = 960 - w / 2, top = 540 - ht(w, VCROP) / 2;
    const ux = (sx) => left + (sx - VCROP[0]) * k, uy = top + (VHEAD[2] - VCROP[1]) * k;
    Object.entries({ x1: ux(VHEAD[0]), x2: ux(VHEAD[1]), y1: uy, y2: uy }).forEach(([a2, v]) => under.setAttribute(a2, f(v, 2)));
    under.__len = ux(VHEAD[1]) - ux(VHEAD[0]); // its length changes with the push: measure each frame
    if (reink.stroke(under, t, { at: T.vers[0] + 0.05, dur: 0.35 }) <= 0) under.style.visibility = 'hidden';
  }
  update(-1);
  return { update };
}
