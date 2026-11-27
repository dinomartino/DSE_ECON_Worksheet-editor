import type { Diagram } from '@/model/diagram';
import { tickKey } from './compile';
import { plainOf } from './text';
import type { DiagramIssue } from './types';

/**
 * The labels a question names, and the labels a diagram prints (k-0534). An MCQ whose
 * options are Q₁–Q₄ must have all four on the figure: the draft that showed only Q₂ and Q₄
 * is what this catches. Labels compare as `tickKey`s ("Q_1" = "Q₁" = "Q1").
 */

/** Curve and tick names with a number or subscript (Q1, P_c, S₂, SRAS_1, E0, D_{1}) and the lettered ones (Pc, Qd, Qs, Wm). A bare letter is too common in prose to count. */
const SYMBOL =
  /(?<![A-Za-z0-9_])(?:(P[cefmw]|Q[cdefs]|Wm)(?![A-Za-z0-9])|(SRAS|LRAS|PPC|PPF|PPB|MSC|MSB|MPC|MPB|AD|AS|MC|MB|MR|AC|[PQSDEWYL])(?:_\{([A-Za-z0-9]{1,3})\}|_([A-Za-z0-9]{1,3})|([₀-₉]+)|([0-9]{1,2}))(?![A-Za-z0-9]))/g;
/** Area letters: "area A + B", "areas B and C", "面積 A + B", and an option that is only letters joined by + ("A + B + C"). */
const AREA_EN = /\b(?:[Aa]reas?|[Rr]egions?)\s+([A-H](?:\s*(?:\+|,|and|or|&)\s*[A-H])*)(?![A-Za-z])/g;
const AREA_ZH = /(?:面積|區域)\s*([A-H](?:\s*(?:\+|＋|、|及|和|與)\s*[A-H])*)(?![A-Za-z])/g;
const POINT_EN = /\b[Pp]oints?\s+([A-H](?:\s*(?:,|and|or|&)\s*[A-H])*)(?![A-Za-z])/g;
const POINT_ZH = /點\s*([A-H](?:\s*(?:、|及|和|與)\s*[A-H])*)(?![A-Za-z])|(?<![A-Za-z])([A-H])\s*點/g;
const LETTERS_ONLY = /^\s*[A-H](?:\s*\+\s*[A-H])+\s*$/;

const SUB: Record<string, string> = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' };

function letters(group: string): string[] {
  return group.match(/[A-H]/g) ?? [];
}

/** Every label a piece of text names, as keys, in order of first mention. */
export function labelsIn(raw: string): string[] {
  // "Q1Q2" (a segment, as HKDSE writes a shortage) is two labels.
  const text = raw.replace(/([0-9₀-₉}])(?=[A-Z])/g, '$1 ');
  const out: string[] = [];
  const add = (key: string) => {
    if (key && !out.includes(key)) out.push(key);
  };
  for (const m of text.matchAll(SYMBOL)) {
    if (m[1]) {
      add(tickKey(m[1]));
      continue;
    }
    const index = m[3] ?? m[4] ?? (m[5] ? [...m[5]].map((c) => SUB[c] ?? c).join('') : undefined) ?? m[6] ?? '';
    add(tickKey(`${m[2]}${index}`));
  }
  for (const re of [AREA_EN, AREA_ZH, POINT_EN, POINT_ZH]) {
    for (const m of text.matchAll(re)) letters(m[1] ?? m[2] ?? '').forEach(add);
  }
  if (LETTERS_ONLY.test(text)) letters(text).forEach(add);
  return out;
}

/** Every label the diagram prints, as keys: curve names, point names, ticks, free text, area and bracket labels. */
export function diagramLabels(diagram: Diagram): Set<string> {
  const out = new Set<string>();
  const add = (t: Parameters<typeof plainOf>[0]) => {
    const text = plainOf(t).trim();
    if (!text) return;
    out.add(tickKey(text));
    // "S₁ = S₀ + t" also names S₁ and S₀.
    for (const key of labelsIn(text)) out.add(key);
  };
  for (const c of diagram.curves) add(c.label);
  for (const p of diagram.points) {
    add(p.label);
    add(p.xTickLabel);
    add(p.yTickLabel);
  }
  for (const l of diagram.labels) add(l.text);
  // An area labelled "E + F" is ONE area: it does not print E and F (k-0577: a merged DWL passed as two).
  for (const a of diagram.areas ?? []) {
    const text = plainOf(a.label).trim();
    if (text) out.add(tickKey(text));
  }
  for (const s of diagram.spans ?? []) add(s.label);
  // A flow chart's words (k-0588): its letters are read by `flow.ts:checkFlow`.
  for (const n of diagram.flow?.nodes ?? []) add(n.label);
  for (const a of diagram.flow?.arrows ?? []) {
    add(a.label);
    add(a.labelBelow);
  }
  return out;
}

/** An option that is only area or point letters: "A", "B + C", "Area a", "areas E and F". */
const LETTER_OPTION = /^\s*(?:(?:the\s+)?(?:areas?|regions?|points?)\s+|面積\s*|區域\s*|點\s*)?[A-Ha-h](?:\s*(?:\+|＋|and|及|和|與|、)\s*[A-Ha-h])*\s*$/i;

/** The labels a question names: each piece read on its own, and letters-only options read as letters when every option is one. */
export function questionLabels(question: QuestionWords): string[] {
  const out: string[] = [];
  for (const piece of [question.stem, ...question.statements, ...question.options]) for (const key of labelsIn(piece)) if (!out.includes(key)) out.push(key);
  if (question.options.length && question.options.every((o) => LETTER_OPTION.test(o))) {
    for (const o of question.options) for (const l of o.replace(/areas?|regions?|points?|the|and|面積|區域|點/gi, ' ').match(/[A-Ha-h]/g) ?? []) if (!out.includes(tickKey(l))) out.push(tickKey(l));
  }
  return out;
}

export interface QuestionWords {
  stem: string;
  statements: readonly string[];
  options: readonly string[];
}

/**
 * Every label the question prints must be on the diagram; numbered ticks (three or more
 * of one letter, as an MCQ's Q₁–Q₄) run left to right along the x-axis and bottom to top
 * along the y-axis, the way every HKDSE figure numbers them.
 */
export function checkLabels(question: QuestionWords, diagram: Diagram, opts: { order?: boolean } = {}): DiagramIssue[] {
  const issues: DiagramIssue[] = [];
  const printed = diagramLabels(diagram);
  const named = questionLabels(question);
  const missing = named.filter((key) => !printed.has(key));
  if (missing.length) {
    issues.push({
      level: 'error',
      code: 'label.missing',
      text: `The question names ${missing.join(', ')}, but the diagram does not label ${missing.length === 1 ? 'it' : 'them'}. Every label the stem or an option names must be drawn: add the points (with their ticks) or rename them.`,
    });
  }
  // A scene's labels are tied to its parts (k-0577): P₁ above P₀ under a tax is the usual HKDSE naming, not a slip.
  if (opts.order !== false) issues.push(...tickOrder(diagram, 'x'), ...tickOrder(diagram, 'y'));
  return issues;
}

function tickOrder(diagram: Diagram, axis: 'x' | 'y'): DiagramIssue[] {
  const ticks: Array<{ at: number; key: string }> = [];
  for (const p of diagram.points) {
    const label = axis === 'x' ? p.xTickLabel : p.yTickLabel;
    const dropped = p.dropTo?.includes(axis);
    if (label && dropped) ticks.push({ at: axis === 'x' ? p.at.x : p.at.y, key: tickKey(plainOf(label)) });
  }
  for (const c of diagram.curves) {
    const d = c.derive;
    if (axis === 'y' && d?.kind === 'level' && c.label) ticks.push({ at: c.points[0]?.y ?? 0, key: tickKey(plainOf(c.label)) });
    if (axis === 'x' && d?.kind === 'vertical' && c.label) ticks.push({ at: c.points[0]?.x ?? 0, key: tickKey(plainOf(c.label)) });
  }
  const families = new Map<string, Array<{ at: number; n: number; key: string }>>();
  for (const t of ticks) {
    const m = /^([A-Z]+)(\d+)$/.exec(t.key);
    if (!m) continue;
    const list = families.get(m[1]) ?? [];
    if (!list.some((x) => x.key === t.key)) list.push({ at: t.at, n: Number(m[2]), key: t.key });
    families.set(m[1], list);
  }
  const issues: DiagramIssue[] = [];
  for (const [base, list] of families) {
    if (list.length < 3) continue;
    const sorted = [...list].sort((a, b) => a.at - b.at);
    const inOrder = sorted.every((t, i) => i === 0 || t.n > sorted[i - 1].n);
    if (!inOrder) {
      issues.push({
        level: 'error',
        code: 'label.order',
        text: `The ${axis === 'x' ? 'x-axis ticks read' : 'y-axis ticks read'} ${sorted.map((t) => t.key).join(', ')} ${axis === 'x' ? 'from left to right' : 'from bottom to top'}; number the ${base} ticks in that order (${base}1 ${axis === 'x' ? 'nearest the origin' : 'lowest'}), and make the key name the right one.`,
      });
    }
  }
  return issues;
}

/** The labels one option names; an option of plain words names none. */
export function optionLabels(option: string): string[] {
  return labelsIn(option);
}
