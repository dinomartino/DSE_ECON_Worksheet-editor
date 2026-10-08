/**
 * Label and marks shapes. Every pattern runs on `labelZone()` text, so full-width
 * brackets and Cyrillic look-alikes in a label read as ASCII while offsets still index
 * the original line.
 */
import type { Family, LabelInfo, Level, MarksStyle } from './types';

const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12 };
const CN: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

const letterValue = (ch: string) => ch.toLowerCase().charCodeAt(0) - 96;
const cnValue = (s: string) => (s.length === 1 ? CN[s] : s === '十' ? 10 : s[0] === '十' ? 10 + CN[s[1]] : CN[s[0]] * 10 + (CN[s[1]] ?? 0));

/** A label read off the start of a line; `length` covers the label and the whitespace after it. */
export interface ParsedLabel extends LabelInfo {
  length: number;
  text: string;
}

type Rule = { re: RegExp; read: (m: RegExpExecArray) => LabelInfo | null; guard?: (rest: string) => boolean };

/** "1⇥text" is a label; "1⇥40" or "A⇥20⇥30" is a table row. */
const PROSE_AFTER_TAB = (rest: string) => !rest.trim().includes('\t') && /[A-Za-z㐀-鿿]{2,}/.test(rest);

/** Lower-case letter or roman: `(i)` is both, and the solver settles which. */
function lowerOf(token: string, letter: Family, roman: Family): LabelInfo | null {
  const r = ROMAN[token];
  if (token.length === 1 && 'ivx'.includes(token)) return { family: roman, value: r, alt: { family: letter, value: letterValue(token) } };
  if (token.length === 1) return token <= 'h' ? { family: letter, value: letterValue(token) } : null;
  return r ? { family: roman, value: r } : null;
}

// Order matters: the first rule that matches wins. `(?=\s|$)` keeps "1.5" and "e.g." out.
const RULES: Rule[] = [
  { re: /^第\s*(\d{1,3})\s*題[.:、]?/, read: (m) => ({ family: '第n題', value: +m[1] }) },
  { re: /^Q(?:uestion)?\s*\.?\s*(\d{1,3})\s*[.:)]?(?=\s|$)/, read: (m) => ({ family: 'Qn', value: +m[1] }) },
  { re: /^\(\s*(\d{1,2})\s*\)/, read: (m) => ({ family: '(n)', value: +m[1] }) },
  // "6.(a)": a part label pressed against the number.
  { re: /^(\d{1,3})\s?[.、:](?=\s|$|\([a-z]{1,4}\))/, read: (m) => ({ family: 'n.', value: +m[1] }) },
  { re: /^(\d{1,3})\)(?=\s|$)/, read: (m) => ({ family: 'n)', value: +m[1] }) },
  { re: /^(\d{1,3})(?=\t)/, read: (m) => ({ family: 'n.', value: +m[1] }), guard: PROSE_AFTER_TAB },
  { re: /^\(\s*([a-z]{1,4})\s*\)/, read: (m) => lowerOf(m[1], '(a)', '(i)') },
  { re: /^([a-z]{1,4})\)(?=\s|$)/, read: (m) => lowerOf(m[1], 'a)', 'i)') },
  { re: /^([a-z]{1,4})\.(?=\s|$)/, read: (m) => lowerOf(m[1], 'a.', 'i.') },
  { re: /^\(\s*([A-H])\s*\)/, read: (m) => ({ family: '(A)', value: letterValue(m[1]) }) },
  { re: /^([A-H])[.:](?=\s|$)/, read: (m) => ({ family: 'A.', value: letterValue(m[1]) }) },
  { re: /^([A-H])\)(?=\s|$)/, read: (m) => ({ family: 'A)', value: letterValue(m[1]) }) },
  { re: /^([A-H])(?=\t)/, read: (m) => ({ family: 'A.', value: letterValue(m[1]) }), guard: PROSE_AFTER_TAB },
  { re: /^\(\s*([一二三四五六七八九十]{1,2})\s*\)/, read: (m) => ({ family: '(一)', value: cnValue(m[1]) }) },
  { re: /^([一二三四五六七八九十]{1,2})、/, read: (m) => ({ family: '一、', value: cnValue(m[1]) }) },
  { re: /^[•●▪◦·∙§o](?=\s)/, read: () => ({ family: 'bullet', value: 0 }) },
];

/** Parse a label at the start of `zone` (already `labelZone`d, leading whitespace removed). */
export function parseLabel(zone: string): ParsedLabel | null {
  for (const rule of RULES) {
    const m = rule.re.exec(zone);
    if (!m) continue;
    if (rule.guard && !rule.guard(zone.slice(m[0].length))) continue;
    const info = rule.read(m);
    if (!info || !Number.isFinite(info.value)) return null;
    const gap = /^[\s]*/.exec(zone.slice(m[0].length))![0].length;
    return { ...info, text: m[0], length: m[0].length + gap };
  }
  return null;
}

/** The level a family takes when nothing else is known. */
export function labelLevel(family: Family): Level {
  switch (family) {
    case 'n.': case 'n)': case 'Qn': case '第n題': return 'question';
    case '(a)': case 'a)': case 'a.': return 'part';
    case '(i)': case 'i)': case 'i.': return 'subpart';
    case 'A.': case 'A)': case '(A)': return 'option';
    case '(n)': return 'statement';
    default: return 'text';
  }
}

export const NUMERIC: ReadonlySet<Family> = new Set(['n.', 'n)', 'Qn', '第n題', '(n)']);

// ---- marks ----

const MARKS_PATTERNS: Array<{ re: RegExp; style: MarksStyle }> = [
  { re: /[([]\s*(\d{1,2})\s*marks?\s*[)\]]/i, style: '(n marks)' },
  { re: /[(]\s*(?:共\s*)?(\d{1,2})\s*分\s*[)]/, style: '（n分）' },
  { re: /\[\s*(\d{1,2})\s*\]/, style: '[n]' },
];

export interface ParsedMarks {
  marks: number;
  style: MarksStyle;
  /** Where the marks text starts in the line. */
  at: number;
}

/** Marks at the very end of a line: "(3 marks)", "[3]", "（3分）". */
export function trailingMarks(line: string): ParsedMarks | null {
  const zone = asciiTail(line);
  for (const { re, style } of MARKS_PATTERNS) {
    const m = new RegExp(`${re.source}\\s*$`, re.flags).exec(zone);
    if (m) return { marks: +m[1], style, at: m.index };
  }
  return null;
}

/** Full-width brackets at the end of a line read as ASCII, length-preserving. */
function asciiTail(line: string): string {
  return line.replace(/[（）［］]/g, (ch) => ({ '（': '(', '）': ')', '［': '[', '］': ']' })[ch]!);
}

/** A whole line that is only marks, e.g. "⇥⇥⇥(3 marks)" or "3 marks". */
export function marksOnly(text: string): ParsedMarks | null {
  const t = text.trim();
  const found = trailingMarks(t);
  if (found && found.at === 0) return found;
  const bare = /^(\d{1,2})\s*marks?$/i.exec(t);
  return bare ? { marks: +bare[1], style: '(n marks)', at: 0 } : null;
}
