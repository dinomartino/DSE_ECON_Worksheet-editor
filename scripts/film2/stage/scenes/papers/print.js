// The act's printed pages (A4 print previews of the real app, 2379×3366): flat paper, never a
// thumbnail while it is meant to be read (FILM.md §4: ≥ 1190 px wide, 11 pt → 22 px).
//   keys     one marking-scheme page, 1240 px wide, its four layouts cut in place on beats; the
//            left column lists the four by the app's own names, the blue dot on the one shown
//   mock     Paper 1 cover, Paper 2 cover, its answer page, an answer key: dealt on beats, 1240 wide
//   vers     Version A, B, C full-bleed (the header and question 1; the options reshuffle), swapped
//            in place, one slow push accelerating into the bank's iris
// update(t) is pure; every time is scene seconds from the caller's T.
import { h, s, svg, show, place, label, LABEL, f, C } from '../../lib/index.js';
import { clamp, lerp, prog, outSoft, inOutSoft, sineInOut } from '../../lib/ease.js';
import { PULSE } from '../../../timeline.mjs';
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
// The reshuffle (sheet px, measured on the three pages): option rows at y 753, 849, 945, 1041
// (pitch 96), each its sentence and 中文 line, x 516–1497; the letters A–D (x 445–484) stay put.
const ROWS = { x: 500, y: 747, w: 1020, pitch: 96 };
const ORDER = [['gov', 'rent', 'tax', 'uni'], ['tax', 'gov', 'uni', 'rent'], ['gov', 'uni', 'tax', 'rent']]; // A, B, C
const VLABEL = [1810, 140, 290, 52]; // the version label (ink 1824–2085 × 152–185), above its underline
const STAGGER = 0.06, SWAP = PULSE + 3 * STAGGER; // the rows' travel; the old page shows until it ends
const POP = 0.75 * PULSE; // the label 1 → 1.2 → 1

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
  // One overlay per swap, in sheet px under the page's transform: a paper mask over the old rows,
  // the old rows (crops of the real page) that slide to their slots on the next page, its label.
  const crop = (img, [x, y, w, ht], parent2) => {
    const cv = h('canvas', { width: w, height: ht, style: { position: 'absolute', left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${ht}px`, transformOrigin: '50% 50%' } }, parent2);
    cv.getContext('2d').drawImage(img, x, y, w, ht, 0, 0, w, ht);
    return cv;
  };
  const swaps = [0, 1].map((i) => {
    const el = h('div', { style: { position: 'absolute', left: 0, top: 0, transformOrigin: '0 0' } }, fin);
    h('div', { style: { position: 'absolute', left: `${ROWS.x - 5}px`, top: `${ROWS.y}px`, width: `${ROWS.w + 10}px`, height: `${4 * ROWS.pitch}px`, background: C.paper } }, el);
    const rows = ORDER[i].map((o, j) => ({ el: crop(vcv[i], [ROWS.x, ROWS.y + j * ROWS.pitch, ROWS.w, ROWS.pitch], el), dy: (ORDER[i + 1].indexOf(o) - j) * ROWS.pitch }));
    return { el, rows, label: crop(vcv[i + 1], VLABEL, el) };
  });
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
    const cut = Math.max(0, T.verCuts.findLastIndex((c) => t >= c)), t0 = T.verCuts[cut];
    const moving = cut > 0 && t < t0 + SWAP; // swap cut − 1: its rows travel, its old page under them
    const u = prog(t, T.vers[0], T.vers[1]);
    const w = 1920 * (1 + PUSH * (u + u * u) / 2); // gathering: slow at first, faster into the lift
    vers.set({ x: 960, y: 540, w, crop: VCROP, face: moving ? cut - 1 : cut });
    const k = w / VCROP[2], left = 960 - w / 2, top = 540 - ht(w, VCROP) / 2;
    swaps.forEach((sw, i) => {
      const on = moving && i === cut - 1;
      show(sw.el, on ? 1 : 0);
      if (!on) return;
      sw.el.style.transform = `translate(${f(left - VCROP[0] * k, 2)}px, ${f(top - VCROP[1] * k, 2)}px) scale(${f(k, 5)})`;
      sw.rows.forEach((r, j) => { r.el.style.transform = `translateY(${f(r.dy * inOutSoft(prog(t, t0 + j * STAGGER, t0 + j * STAGGER + PULSE)), 3)}px)`; });
      const q = clamp((t - t0) / POP);
      sw.label.style.transform = `scale(${f(q < 0.5 ? lerp(1, 1.2, outSoft(q * 2)) : lerp(1.2, 1, inOutSoft(q * 2 - 1)), 4)})`;
    });
    // A blue underline under the version label: it redraws with each new version.
    const ux = (sx) => left + (sx - VCROP[0]) * k, uy = top + (VHEAD[2] - VCROP[1]) * k;
    Object.entries({ x1: ux(VHEAD[0]), x2: ux(VHEAD[1]), y1: uy, y2: uy }).forEach(([a2, v]) => under.setAttribute(a2, f(v, 2)));
    under.__len = ux(VHEAD[1]) - ux(VHEAD[0]); // its length changes with the push: measure each frame
    if (reink.stroke(under, t, { at: cut ? t0 : T.vers[0] + 0.05, dur: 0.35 }) <= 0) under.style.visibility = 'hidden';
  }
  update(-1);
  return { update };
}
