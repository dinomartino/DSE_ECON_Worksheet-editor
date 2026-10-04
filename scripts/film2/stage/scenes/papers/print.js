// The act's printed pages (A4 print previews of the real app, 2379×3366): flat paper, never a
// thumbnail while it is meant to be read (FILM.md §4: ≥ 1190 px wide, 11 pt → 22 px).
//   keys     one marking-scheme page, 1240 px wide, its four layouts cut in place on beats,
//            each named with the app's own layout name (a LABEL over a hairline)
//   mock     Paper 1 cover, Paper 2 cover, its answer page, an answer key: dealt on beats, 1240 wide
//   vers     Version A, B, C: the header and question 1 at 0.66 (the options reshuffle)
//   fan      five sheets across the frame; the version page opens into its centre
// update(t) is pure; every time is scene seconds from the caller's T.
import { h, s, svg, show, place, label, LABEL, f, C } from '../../lib/index.js';
import { clamp, lerp, prog, outSoft, inOutSoft, sineInOut } from '../../lib/ease.js';
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
const FAN = [ // [sheet id, slot −2…2]; the centre (0) is the version page
  ['sheets-lq-1', -2], ['sheets-key-hkeaa', 2], ['sheets-p1-cover', -1], ['sheets-p2-cover', 1],
];

const PAGE = { x: 584, top: 264, w: 1240 }; // keys and mock: right of the label column
const KEY_ANCHOR = [1204, 432]; // the page title: the slow push closes on it
const VCROP = [240, 110, 1920, 1040]; // version header + question 1 with its options
const VW = 1500, FAN_W = 508, FAN_STEP = 305;
const VHEAD = [1825, 2088, 200]; // "Version A 版本 A": x0, x1, underline y (sheet px)

export async function prints(parent, { url, T }) {
  const ids = [...new Set([...LAYOUTS.map((l) => l.id), ...MOCK, ...FAN.map((x) => x[0])])];
  const cv = {};
  await Promise.all(ids.map(async (id) => { cv[id] = await loadSheet(url(id), 1400); }));
  const vcv = await Promise.all(VERSIONS.map((id) => loadSheet(url(id), 1700)));

  const keyLayer = h('div', { style: { position: 'absolute', inset: 0 } }, parent);
  const keys = sheet(keyLayer, LAYOUTS.map((l) => cv[l.id]));
  const names = LAYOUTS.map((l) => label(keyLayer, { ...LABEL, en: l.en, zh: l.zh, x: 96, y: 441 }));
  const ruleSvg = svg(keyLayer, {});
  const rule = s('line', { x1: 96, y1: 466, x2: PAGE.x - 24, y2: 466, stroke: C.lineStrong, 'stroke-width': 2, 'stroke-linecap': 'round' }, ruleSvg);

  const mockLayer = h('div', { style: { position: 'absolute', inset: 0, transformOrigin: '960px 640px' } }, parent);
  const mock = MOCK.map((id) => sheet(mockLayer, [cv[id]]));

  const fin = h('div', { style: { position: 'absolute', inset: 0, transformOrigin: '960px 540px' } }, parent);
  const fan = FAN.map(([id]) => sheet(fin, [cv[id]]));
  const vers = sheet(fin, vcv);
  const uSvg = svg(fin, {});
  const under = s('line', { stroke: C.markBlue, 'stroke-width': 4, 'stroke-linecap': 'round' }, uSvg);
  await Promise.all([keys, ...mock, ...fan, vers].map((x) => x.ready));

  const ht = (w, crop = [0, 0, SHEET_W, SHEET_H]) => (crop[3] * w) / crop[2];
  function update(t) {
    // ---- keys: one page, four layouts cut on beats, a slow push toward its title ----------
    const inKeys = t >= T.keys[0] && t < T.keys[1];
    show(keyLayer, inKeys ? 1 : 0);
    if (inKeys) {
      const face = T.keyCuts.findLastIndex((c) => t >= c);
      const g = 1 + 0.025 * sineInOut(prog(t, T.keys[0], T.keys[1]));
      const w = PAGE.w * g, cx = KEY_ANCHOR[0] + (PAGE.x + PAGE.w / 2 - KEY_ANCHOR[0]) * g;
      const top = KEY_ANCHOR[1] + (PAGE.top - KEY_ANCHOR[1]) * g;
      keys.set({ x: cx, y: top + ht(w) / 2, w, face });
      names.forEach((n, i) => n.show(i === face ? 1 : 0));
      reink.stroke(rule, t, { at: T.keys[0], dur: 0.6 });
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

    // ---- versions, then the fan they open into -----------------------------------------
    const inFin = t >= T.vers[0];
    show(fin, inFin ? 1 : 0);
    if (!inFin) return;
    const face = Math.max(0, T.verCuts.findLastIndex((c) => t >= c));
    const open = inOutSoft(prog(t, T.open[0], T.open[1]));
    const g = 1 + 0.04 * sineInOut(prog(t, T.vers[0], T.open[0]));
    const crop = VCROP.map((c, k) => lerp(c, [0, 0, SHEET_W, SHEET_H][k], open));
    const w = lerp(VW * g, FAN_W, open);
    vers.set({ x: 960, y: 540, w, crop, face });
    // A blue underline under the version letter: it stays while the pages swap.
    const k = w / crop[2], left = 960 - w / 2, top = 540 - ht(w, crop) / 2;
    const ux = (sx) => left + (sx - crop[0]) * k, uy = top + (VHEAD[2] - crop[1]) * k;
    Object.entries({ x1: ux(VHEAD[0]), x2: ux(VHEAD[1]), y1: uy, y2: uy }).forEach(([a, v]) => under.setAttribute(a, f(v, 2)));
    under.__len = ux(VHEAD[1]) - ux(VHEAD[0]); // its length changes with the push: measure each frame
    const uo = 1 - clamp((t - T.open[0]) / 0.25);
    if (reink.stroke(under, t, { at: T.vers[0] + 0.05, dur: 0.35 }) > 0 && uo > 0) under.style.opacity = f(uo, 3);
    else under.style.visibility = 'hidden';
    // The fan: inner pair, then outer pair, slide out from behind the centre; then the whole
    // fan spreads and pushes in, accelerating into the iris.
    // q² up to the hit, then on at the speed it reached (no stop under the opening iris).
    const u = (t - T.build[0]) / (T.build[1] - T.build[0]);
    const q2 = u <= 0 ? 0 : u <= 1 ? u * u : 2 * u - 1;
    const spread = 1 + 0.08 * q2;
    fan.forEach((sh, i) => {
      const slot = FAN[i][1], at = Math.abs(slot) === 1 ? T.deals[0] : T.deals[1];
      const p = outSoft(prog(t, at, at + 0.6));
      const from = Math.abs(slot) === 1 ? 0 : Math.sign(slot);
      sh.set({ x: 960 + lerp(from, slot, p) * FAN_STEP * spread, y: 540, w: FAN_W, opacity: t >= at ? 1 : 0 });
    });
    place(fin, { scale: 1 + 0.1 * q2 });
  }
  update(-1);
  return { update };
}
