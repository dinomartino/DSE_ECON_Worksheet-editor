import type { Diagram, DiagramCurve, DiagramLabel } from '@/model/diagram';
import { DEFAULT_DIAGRAM_SIZE } from '@/model/factories';
import { curve, label } from '@/model/diagramTemplateKit';
import type { BiText } from '@/model/types';
import type { Compiled } from './compile';
import { phrase, symbol } from './text';
import type { DiagramIssue, DiagramSpec, LorenzInequality, SolvedKey, SpecLorenz, SpecText } from './types';

/**
 * Lorenz curves as HKDSE prints them (k-0584, u-25vr): a square box per economy (HKDSE 2012,
 * 2020, 2025, SP: two boxes side by side) or one box with two curves (2019 old/new, 2022
 * pre-tax/post-tax). The box, the optional 20% grid and its numbers, the line of equality and
 * the curves are the figure's own lines and labels on a figure with no axes (`axes: 'none'`),
 * so both boxes fit one editable diagram. Each curve is L(p) = p^k, smooth and convex through
 * both corners, under the diagonal; a box's curves differ in k, so they never cross or coincide.
 * The model only says how unequal each curve is.
 */

/** k in L(p) = p^k: a larger k bows further from the line of equality (a larger Gini, (k−1)/(k+1)). */
export const LORENZ_K: Record<LorenzInequality, number> = { slight: 1.6, moderate: 2.4, high: 3.8, extreme: 6.5 };

/** A two-box figure's printed width (a single box keeps the default). */
export const LORENZ_PAIR_WIDTH_PX = 600;

const FONT = 10 * (96 / 72);
const LINE = FONT * 1.2;
const MARGIN = 8;

const T = (en: string, zh: string): BiText => ({ en: [{ text: en }], zh: [{ text: zh }] });
const AXES = {
  percent: { y: T('% of\nincome', '收入\n百分比'), x: T('% of households', '住戶百分比') },
  cumulative: { y: T('Cumulative\npercentage\nof income', '收入\n累積\n百分比'), x: T('Cumulative percentage\nof households', '住戶累積百分比') },
} as const;

/** A rough printed width of a text, px at 10pt: CJK a full em, Latin about half. */
function widthOf(t: BiText): number {
  const w = (s: string) => [...s].reduce((sum, ch) => sum + (/[　-鿿＀-￯]/.test(ch) ? FONT : FONT * 0.56), 0);
  const lines = (side: 'en' | 'zh') => t[side].map((r) => r.text).join('').split('\n');
  return Math.max(...[...lines('en'), ...lines('zh')].map(w), 0);
}
/** Printed lines, laid out for a bilingual paper, where the English and the 中文 stack. */
function linesOf(t: BiText): number {
  const count = (side: 'en' | 'zh') => {
    const text = t[side].map((r) => r.text).join('');
    return text ? text.split('\n').length : 0;
  };
  return Math.max(1, count('en') + count('zh'));
}

/** A long key line wrapped at a word near `max` characters (HKDSE 2022's key runs to two lines). */
function wrapEn(t: BiText, max = 26): BiText {
  const text = t.en.map((r) => r.text).join('');
  if (text.length <= max) return t;
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if (line && (line + ' ' + w).length > max) {
      lines.push(line);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) lines.push(line);
  return { en: [{ text: lines.join('\n   ') }], zh: t.zh };
}

export function lorenzWidth(spec: DiagramSpec): number {
  return (spec.lorenz?.panels.length ?? 0) > 1 ? LORENZ_PAIR_WIDTH_PX : DEFAULT_DIAGRAM_SIZE.widthPx;
}

const textOf = (t: SpecText): BiText | undefined => phrase(t);

export function compileLorenz(spec: DiagramSpec): Compiled {
  const issues: DiagramIssue[] = [];
  const error = (code: string, text: string) => issues.push({ level: 'error', code, text });
  const empty: Compiled = { diagram: null, issues, curveIds: new Map(), roles: new Map(), levels: new Map() };
  const lz = spec.lorenz;
  if (!lz || !lz.panels.length) {
    error('lorenz.empty', 'A Lorenz figure needs one or two boxes ("panels"), each with its curves.');
    return empty;
  }
  if (lz.panels.length > 2) error('lorenz.panels', 'A Lorenz figure has one box, or two side by side (one per economy).');
  const panels = lz.panels.slice(0, 2);
  panels.forEach((p, i) => {
    if (!p.curves.length) error('lorenz.curves', `Box ${i + 1} has no Lorenz curve.`);
    if (p.curves.length > 2) error('lorenz.curves', `Box ${i + 1} has ${p.curves.length} curves: HKDSE boxes hold one or two.`);
    // Two curves of one depth are drawn on top of each other (k-0583's coincident lines).
    if (p.curves.length === 2 && p.curves[0].inequality === p.curves[1].inequality) {
      error('lorenz.same', `The two curves of box ${i + 1} are equally unequal, so they would be drawn on top of each other: give them different "inequality".`);
    }
    if (p.curves.length === 2 && p.curves.some((c) => !c.label.trim())) error('lorenz.label', `Box ${i + 1} has two curves: letter each ("A", "B") as the question names them.`);
  });
  if (panels.length === 2 && panels.some((p) => !textOf(p.title))) error('lorenz.title', 'Two boxes side by side each need their title ("Lorenz curve of Economy X").');
  if (issues.some((i) => i.level === 'error')) return empty;

  const diagram = layout(lz, panels, lorenzWidth(spec));
  return { diagram, issues, curveIds: new Map(), roles: new Map(), levels: new Map() };
}

interface Box {
  x0: number;
  y0: number;
  side: number;
}

function layout(lz: SpecLorenz, panels: SpecLorenz['panels'], widthPx: number): Diagram {
  const axes = AXES[lz.axes];
  const W = widthPx - 2 * MARGIN;
  const tick = lz.grid ? FONT * 0.52 * 3 + 6 : 0;
  const yTitleW = widthOf(axes.y) + 6;
  const left = yTitleW + tick + 4;
  const keyLines = panels.map((p) => p.curves.filter((c) => c.label && textOf(c.name)).map((c) => ({ c, text: wrapEn(keyText(c.label, textOf(c.name)!)) })));
  const keyW = panels.map((_, i) => (keyLines[i].length ? Math.max(...keyLines[i].map((k) => widthOf(k.text))) * 1.15 + 14 : 0));
  const gap = panels.length > 1 ? 24 : 0;
  const room = W - panels.reduce((sum, _, i) => sum + left + keyW[i] + 6, 0) - gap;
  const side = Math.max(110, Math.min(panels.length > 1 ? room / 2 : room, 250));
  const titleH = Math.max(0, ...panels.map((p) => { const t = textOf(p.title); return t ? LINE * linesOf(t) + LINE * 0.4 : 0; }));
  const top = titleH + LINE * 0.6;
  const bottom = (lz.grid ? LINE * 1.1 : LINE * 0.6) + LINE * Math.max(1, linesOf(axes.x)) + 6;
  const H = top + side + bottom;
  // The boxes sit centred in the width they leave.
  const used = panels.reduce((sum, _, i) => sum + left + side + keyW[i] + 6, 0) + gap;
  let x = Math.max(0, (W - used) / 2);
  const boxes: Box[] = [];
  for (let i = 0; i < panels.length; i += 1) {
    boxes.push({ x0: x + left, y0: bottom, side });
    x += left + side + keyW[i] + 6 + gap;
  }
  // Unit space: x over the plot's width, y up over its height.
  const ux = (px: number) => px / W;
  const uy = (py: number) => py / H;
  const curves: DiagramCurve[] = [];
  const labels: DiagramLabel[] = [];
  boxes.forEach((b, i) => {
    const panel = panels[i];
    const at = (p: number, q: number): [number, number] => [ux(b.x0 + p * b.side), uy(b.y0 + q * b.side)];
    // The square box: its four sides.
    curves.push(curve([at(0, 0), at(1, 0), at(1, 1), at(0, 1), at(0, 0)], undefined, { weight: 1.1 }));
    if (lz.grid) {
      for (const f of [0.2, 0.4, 0.6, 0.8]) {
        curves.push(curve([at(f, 0), at(f, 1)], undefined, { weight: 0.5 }));
        curves.push(curve([at(0, f), at(1, f)], undefined, { weight: 0.5 }));
      }
      for (const f of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
        const n = String(Math.round(f * 100));
        const [lx, ly] = at(0, f);
        labels.push(label(lx - ux(4), ly, T(n, n), { align: 'right' }));
        if (f > 0) {
          const [bx, by] = at(f, 0);
          labels.push(label(bx, by - uy(LINE * 0.75), T(n, n)));
        }
      }
    } else {
      const [ox, oy] = at(0, 0);
      labels.push(label(ox - ux(4), oy - uy(LINE * 0.4), T('0', '0'), { align: 'right' }));
    }
    // Axis words: the y title left of the box, up from its middle; the x title centred under it.
    const [yx, yy] = at(0, 0.62);
    labels.push(label(yx - ux(tick + 6), yy, axes.y, { align: 'right' }));
    const [xx, xy] = at(0.5, 0);
    labels.push(label(xx, xy - uy((lz.grid ? LINE * 1.1 : LINE * 0.6) + (LINE * linesOf(axes.x)) / 2 + 2), axes.x));
    const title = textOf(panel.title);
    if (title) {
      const [tx, ty] = at(0.5, 1);
      labels.push(label(tx, ty + uy((LINE * linesOf(title)) / 2 + LINE * 0.3), title, { italic: true }));
    }
    if (lz.equality) curves.push(curve([at(0, 0), at(1, 1)], undefined, { weight: 0.9 }));
    // The curves, deepest last; each letter beside its curve where it bows furthest.
    const ordered = [...panel.curves].sort((a, c) => LORENZ_K[a.inequality] - LORENZ_K[c.inequality]);
    ordered.forEach((c, j) => {
      const k = LORENZ_K[c.inequality];
      const pts: Array<[number, number]> = Array.from({ length: 41 }, (_, s) => {
        const p = s / 40;
        return at(p, p ** k);
      });
      curves.push(curve(pts, undefined, { stroke: c.style === 'dashed' ? 'dashed' : 'solid', weight: 1.1 }));
      if (c.label) {
        const p = k ** (-1 / (k - 1));
        // The shallower curve's letter toward the diagonal, the deeper one's away from it.
        const towards = ordered.length > 1 && j === 0;
        const d = (towards ? -1 : 1) * 11;
        const [cx, cy] = at(p, p ** k);
        labels.push(label(cx + ux(d * 0.7071), cy - uy(d * 0.7071), symbol(c.label) ?? T(c.label, c.label)));
      }
    });
    // The key beside the box (HKDSE 2022): "A: based on pre-tax income".
    let down = 0;
    keyLines[i].forEach((k) => {
      const h = LINE * linesOf(k.text);
      const [kx, ky] = at(1, 1);
      labels.push(label(kx + ux(10), ky - uy(down + h / 2), k.text, { align: 'left' }));
      down += h + LINE * 0.4;
    });
  });
  return {
    x: {},
    y: {},
    curves,
    points: [],
    labels,
    arrows: [],
    axes: 'none',
    plotAspect: H / W,
  };
}

function keyText(letter: string, name: BiText): BiText {
  return { en: [{ text: `${letter}: ` }, ...name.en], zh: [{ text: `${letter}：` }, ...name.zh] };
}

// ---- the question's words against the figure ----

const ENTITY = /\b(Economy|Country|Region|City|Place)\s+([A-Z])\b/g;
const ENTITY_ZH = /(經濟體|國家|地區|城市)\s*([A-Z])/g;
const MORE_EVEN = /more (?:even|equal|evenly)|less (?:uneven|unequal)|smaller Gini|lower Gini|較平均|較平等|堅尼系數較(?:小|低)/i;
const LESS_EVEN = /less (?:even|equal|evenly)|more (?:uneven|unequal)|larger Gini|higher Gini|greater inequality|較不平均|較不平等|堅尼系數較(?:大|高)/i;

/** The entities a text names ("Economy X", "Country A", 經濟體 X), as "Economy X". */
function entitiesIn(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(ENTITY)) out.add(`${m[1]} ${m[2]}`);
  for (const m of text.matchAll(ENTITY_ZH)) out.add(`${{ 經濟體: 'Economy', 國家: 'Country', 地區: 'Region', 城市: 'City' }[m[1]]} ${m[2]}`);
  return [...out];
}

/**
 * The stem's economies against the figure's boxes and keys, and the keyed comparison against
 * the drawing (u-25vr: the stem named Economy X and Economy Y, the figure drew "A: before tax,
 * B: after tax" and passed). Every economy the stem or an option names is a box's title or a
 * curve's key; every box title the figure prints is named by the question; when the key
 * compares two economies' equality, the more even one is drawn nearer the diagonal.
 */
export function checkLorenz(spec: DiagramSpec, mcq: { stem: string; statements: readonly string[]; options: readonly string[]; answer: number } | undefined, key: string): { issues: DiagramIssue[]; solved: SolvedKey | null } {
  const issues: DiagramIssue[] = [];
  const lz = spec.lorenz;
  if (!lz || !mcq) return { issues, solved: null };
  const error = (code: string, text: string) => issues.push({ level: 'error', code, text });
  const question = [mcq.stem, ...mcq.statements, ...mcq.options].join('\n');
  const named = entitiesIn(question);
  // Where each entity is on the figure: the box or the curve it names, with its depth.
  const drawn = new Map<string, number>();
  const figureText: string[] = [];
  for (const p of lz.panels) {
    const title = `${p.title.en} ${p.title.zh}`;
    figureText.push(title);
    for (const e of entitiesIn(title)) if (p.curves.length === 1) drawn.set(e, LORENZ_K[p.curves[0].inequality]);
    for (const c of p.curves) {
      const name = `${c.name.en} ${c.name.zh}`;
      figureText.push(name, c.label);
      for (const e of entitiesIn(name)) drawn.set(e, LORENZ_K[c.inequality]);
      // "curve A is Country A": a curve lettered with the entity's own letter.
      for (const e of named) if (!drawn.has(e) && c.label === e.slice(-1) && p.curves.length > 1) drawn.set(e, LORENZ_K[c.inequality]);
    }
  }
  const missing = named.filter((e) => !drawn.has(e));
  if (missing.length) {
    error(
      'lorenz.names',
      `The question names ${missing.join(' and ')}, but the figure shows no Lorenz curve for ${missing.length === 1 ? 'it' : 'them'}. Draw one box per economy titled "Lorenz curve of ${missing[0]}" (or a lettered curve whose key names it); the stem's words are fixed.`,
    );
  }
  const extra = entitiesIn(figureText.join('\n')).filter((e) => !named.includes(e));
  if (extra.length) error('lorenz.extra', `The figure names ${extra.join(', ')}, which the question does not.`);
  // "curve A", "Lorenz curve B": a letter the question gives a curve is a curve's letter.
  const letters = new Set(lz.panels.flatMap((p) => p.curves.map((c) => c.label)));
  const curveLetters = [...new Set([...question.matchAll(/\b(?:Lorenz )?curves? ([A-Z])\b|曲線\s*([A-Z])/g)].map((m) => m[1] ?? m[2]))];
  const noCurve = curveLetters.filter((l) => !letters.has(l) && !named.some((e) => e.endsWith(` ${l}`)));
  if (noCurve.length) error('lorenz.letters', `The question names curve ${noCurve.join(', ')}, which the figure does not letter.`);

  // The keyed comparison: "Economy X has a more even income distribution than Economy Y".
  // A box's lettered curves compare too: "curve B shows a more even distribution than curve A".
  for (const p of lz.panels) for (const c of p.curves) if (c.label) drawn.set(`curve ${c.label}`, LORENZ_K[c.inequality]);
  const solveOption = (option: string): boolean | null => {
    const curvesNamed = [...option.matchAll(/\b(?:Lorenz )?curve ([A-Z])\b|曲線\s*([A-Z])/gi)].map((m) => `curve ${(m[1] ?? m[2]).toUpperCase()}`);
    const ents = curvesNamed.length >= 2 ? curvesNamed : entitiesIn(option);
    if (ents.length < 1 || !drawn.has(ents[0])) return null;
    const more = MORE_EVEN.test(option);
    const less = LESS_EVEN.test(option);
    if (more === less) return null;
    const other = ents[1] ?? (curvesNamed.length >= 2 ? undefined : named.find((e) => e !== ents[0]));
    if (!other || !drawn.has(other)) return null;
    const a = drawn.get(ents[0])!;
    const b = drawn.get(other)!;
    if (a === b) return false;
    return more ? a < b : a > b;
  };
  const verdicts = mcq.options.map(solveOption);
  let solved: SolvedKey | null = null;
  const keyed = verdicts[mcq.answer];
  if (keyed === false) {
    error('lorenz.key', `The key is option ${'ABCD'[mcq.answer]}, but on the figure it is false: the economy with the more even distribution is the one whose curve is nearer the line of equality (a smaller "inequality"). Change the curves' inequality so the keyed option holds; the question's words are fixed.`);
  }
  if (keyed === true) {
    solved = { labels: [], option: mcq.answer, why: 'the more even distribution is the curve nearer the line of equality' };
    const twins = verdicts.map((v, i) => (v === true && i !== mcq.answer ? i : -1)).filter((i) => i >= 0);
    if (twins.length) error('lorenz.twoKeys', `Options ${[mcq.answer, ...twins].map((i) => 'ABCD'[i]).join(' and ')} are both true on the figure.`);
  }
  void key;
  return { issues, solved };
}

/** The figure in words, for the blind solve: which box or curve bows further. */
export function lorenzWords(spec: DiagramSpec): string {
  const lz = spec.lorenz;
  if (!lz) return '';
  const depth: Record<LorenzInequality, string> = { slight: 'very close to', moderate: 'somewhat below', high: 'well below', extreme: 'far below' };
  return lz.panels
    .map((p, i) => {
      const title = p.title.en || p.title.zh || `Box ${i + 1}`;
      const curves = p.curves.map((c) => `${c.label ? `curve ${c.label}` : 'the Lorenz curve'}${c.name.en ? ` (${c.name.en})` : ''} lies ${depth[c.inequality]} the line of equality`).join('; ');
      return `${title}: ${curves}.`;
    })
    .join('\n');
}
