/**
 * Detectors: each looks at one line and may suggest one role with a weight. Adding a
 * convention means adding a detector here; the solver weighs the suggestions and then
 * settles labelled lines by sequence.
 */
import { labelLevel, marksOnly } from './labels';
import { matchKey, repeatKey } from './normalize';
import type { Family, Level, Role, SourceLine } from './types';

export interface DetectContext {
  lineMode: 'paragraph' | 'visual';
  lines: readonly SourceLine[];
  /** `repeatKey` → the lines that share it. */
  repeats: ReadonlyMap<string, readonly number[]>;
  /** `repeatKey`s known to be noise (profile, pins). */
  noise: ReadonlySet<string>;
  levelOf: (family: Family) => Level;
}

export interface Candidate {
  role: Role;
  weight: number;
}

export type Detector = (line: SourceLine, ctx: DetectContext) => Candidate | null;

const NOISE = [
  /^©/,
  /©\s*\d{4}/,
  /all rights reserved/i,
  /保留版權/,
  /^go\s*on\s*to\s*the\s*next\s*page/i,
  /^(please\s+)?turn\s+over\.?$/i,
  /^p\.?\s*t\.?\s*o\.?$/i,
  /^\d{4}-DSE-[A-Z]+/,
  /^page\s+\d+(\s+of\s+\d+)?$/i,
  /^-\s*\d+\s*-$/,
  /^第\s*\d+\s*頁/,
  /寫於邊界以外的答案/,
  /answers written in the margins/i,
  /請在此貼上電腦條碼/,
  /^candidate\s+number/i,
  /^\*[A-Z0-9]{6,}\*$/,
  /^★/,
];

const HEADING = [
  /^(part|section|paper)\s+([A-Z]|[IVX]+|\d+)\b/i,
  /^[甲乙丙丁]\s*部/,
  /^end\s+of\s+(section|paper|part)/i,
  /^(試卷|全卷)完/,
  /^instructions?\b/i,
  /^(試題|考生)須知/,
  /^there\s+(are|is)\s+\d+\s+questions/i,
  /^answer\s+(all|any)\b/i,
  /^choose\s+the\s+best\s+answer/i,
  /^本試卷/,
  /^(time\s+allowed|full\s+marks|total\s+marks)\b/i,
  /^(name|class|class\s+no\.?|student\s+no\.?|date)\s*[:：]/i,
  /^(姓名|班別|學號)\s*[:：]/,
  /^(multiple[- ]choice|short|long|structured|data[- ]response|essay)\s+questions?\b/i,
];

/** "Study … and answer Questions 8 and 9", "Questions 3 to 5 refer to …", 第8及9題. */
const SHARED = [/\bquestions\s+\d{1,3}\s*(?:and|to|&|-|–)\s*\d{1,3}\b/i, /第\s*\d{1,3}\s*(?:及|至|和|與|、)\s*(?:第\s*)?\d{1,3}\s*題/];
const SOURCE = [/^(source|extract|data|material)\s+[A-Z0-9]{1,2}\b\s*[:：.]?/i, /^資料\s*[A-Z甲乙丙丁一二三四五]/];

export function sharedSpan(text: string): number | undefined {
  for (const re of [/\bquestions\s+(\d{1,3})\s*(?:and|to|&|-|–)\s*(\d{1,3})\b/i, /第\s*(\d{1,3})\s*(?:及|至|和|與|、)\s*(?:第\s*)?(\d{1,3})\s*題/]) {
    const m = re.exec(text);
    if (m && +m[2] > +m[1] && +m[2] - +m[1] < 10) return +m[2] - +m[1] + 1;
  }
  return undefined;
}

const KEY_PAIR = /(\d{1,3})\s*[.)\-:：、]?\s*\(?([A-E])\)?(?![A-Za-z])/g;

/** The answers in a key line ("1. B  2. C", "1⇥B⇥2⇥C"), or null when the line is not one. */
export function keyPairs(line: SourceLine): Array<[number, number]> | null {
  const body = line.cells ? line.cells.map((c) => c.map((r) => r.text).join('')).join(' ') : line.text;
  const source = matchKey(`${line.label ?? ''} ${body}`);
  const pairs: Array<[number, number]> = [];
  for (const m of source.matchAll(KEY_PAIR)) pairs.push([+m[1], m[2].charCodeAt(0) - 64]);
  if (!pairs.length) return null;
  const rest = source.replace(KEY_PAIR, '').replace(/[\s,;|]/g, '');
  return rest === '' ? pairs : null;
}

/** "Ans: B", "Answer: (C)", 答案：D. */
export function inlineAnswer(text: string): number | undefined {
  const m = /^(?:ans(?:wer)?|答案)\s*[:：]?\s*\(?([A-E])\)?\.?$/i.exec(matchKey(text));
  return m ? m[1].toUpperCase().charCodeAt(0) - 64 : undefined;
}

const INSTRUCTION = /^(write|answer|read|do\s+not|all\s+questions|this\s+paper|candidates?|you\s+(must|should|are)|use|check|attempt|fill|present|the\s+(diagrams|questions|answers))\b|^(本試卷|考生|作答|須|請)/i;

export const DETECTORS: readonly Detector[] = [
  function blank(line) {
    return line.blank ? { role: 'ignore', weight: 1 } : null;
  },
  function answerLine(line) {
    return line.tabOnly ? { role: 'answerSpace', weight: 0.95 } : null;
  },
  function image(line) {
    return line.image ? { role: 'stem', weight: 0.6 } : null;
  },
  function marksLine(line) {
    if (line.labelInfo || line.clump) return null;
    if (line.trailingMarks !== undefined && line.text === '') return { role: 'marks', weight: 0.95 };
    return marksOnly(line.text) ? { role: 'marks', weight: 0.95 } : null;
  },
  function noisePattern(line) {
    const text = matchKey(line.raw);
    return NOISE.some((re) => re.test(text)) ? { role: 'noise', weight: 0.9 } : null;
  },
  function knownNoise(line, ctx) {
    return line.raw.trim() && ctx.noise.has(repeatKey(line.raw)) ? { role: 'noise', weight: 1 } : null;
  },
  function runningHeader(line, ctx) {
    const text = matchKey(line.raw);
    if (line.labelInfo || text.length < 6 || /[.?。？:：]$/.test(text) || !/[A-Za-z㐀-鿿]{3}/.test(text)) return null;
    const at = ctx.repeats.get(repeatKey(line.raw)) ?? [];
    // A running header repeats a page apart; repeated content sits close together.
    const apart = at.length >= 2 && at.every((i, k) => k === 0 || i - at[k - 1] >= 8);
    const pageish = /\d|©/.test(text);
    if (apart && pageish && (ctx.lineMode === 'visual' || at.length >= 3)) return { role: 'noise', weight: ctx.lineMode === 'visual' ? 0.8 : 0.6 };
    return null;
  },
  function pageEdge(line, ctx) {
    // A title line printed beside a page footer ("© … 4" then "School … Assessment 1").
    if (ctx.lineMode !== 'visual' || line.labelInfo || line.text.length > 100 || /[.?。？:：]$/.test(line.text)) return null;
    if (!/\d/.test(line.text) || !/[A-Za-z㐀-鿿]{3}/.test(line.text)) return null;
    const near = [ctx.lines[line.i - 1], ctx.lines[line.i + 1]].some((n) => n && NOISE.some((re) => re.test(matchKey(n.raw))));
    return near ? { role: 'noise', weight: 0.6 } : null;
  },
  function pageNumber(line) {
    if (line.labelInfo) return null;
    return /^\s*\d{1,3}\s*$/.test(line.raw) ? { role: 'noise', weight: 0.55 } : null;
  },
  function heading(line) {
    if (line.labelInfo || line.cells) return null;
    const text = matchKey(line.text);
    return text.length < 120 && HEADING.some((re) => re.test(text)) ? { role: 'heading', weight: 0.85 } : null;
  },
  function sharedStem(line) {
    if (line.labelInfo) return null;
    return SHARED.some((re) => re.test(matchKey(line.text))) ? { role: 'source', weight: 0.9 } : null;
  },
  function sourceLabel(line) {
    if (line.labelInfo) return null;
    return SOURCE.some((re) => re.test(matchKey(line.text))) ? { role: 'source', weight: 0.85 } : null;
  },
  function answerKey(line) {
    if (inlineAnswer(`${line.label ?? ''} ${line.text}`.trim()) !== undefined) return { role: 'answerKey', weight: 0.95 };
    if (/^(answers?|answer\s+key|key|答案)\s*[:：]?$/i.test(matchKey(line.text)) && !line.labelInfo) return { role: 'answerKey', weight: 0.7 };
    const pairs = keyPairs(line);
    if (!pairs) return null;
    // A lone "1. B" could be a question whose text is a letter: two pairs, or the label, decide it.
    return pairs.length >= 2 || line.labelInfo ? { role: 'answerKey', weight: 0.92 } : null;
  },
  function table(line) {
    return line.cells && !line.labelInfo ? { role: 'table', weight: 0.8 } : null;
  },
  function flattenedRow(line, ctx) {
    if (ctx.lineMode !== 'visual' || line.labelInfo || line.cells) return null;
    return /(?:^|\s)[\d$%.,\u00A0 ]*\d[%]?\s+[$]?\d[\d,.\u00A0 ]*%?$/.test(line.text) && line.text.length < 90 ? { role: 'table', weight: 0.5 } : null;
  },
  function label(line, ctx) {
    if (!line.labelInfo && !line.clump) return null;
    const family = line.clump?.family ?? line.labelInfo!.family;
    const level = ctx.levelOf(family);
    const role: Role = level === 'text' ? 'stem' : level;
    return { role, weight: level === 'text' ? 0.5 : 0.8 };
  },
  function instructionItem(line) {
    if (!line.labelInfo || labelLevel(line.labelInfo.family) !== 'question') return null;
    return INSTRUCTION.test(matchKey(line.text)) ? { role: 'heading', weight: 0.45 } : null;
  },
  function continuation() {
    return { role: 'stem', weight: 0.4 };
  },
];

/** Whether a line reads as an instruction ("Write your name…"), for rejecting instruction lists. */
export function isInstruction(line: SourceLine): boolean {
  return INSTRUCTION.test(matchKey(line.text));
}

export function isShared(text: string): boolean {
  return SHARED.some((re) => re.test(matchKey(text)));
}

/** Every detector's suggestion for each line, strongest first. */
export function detect(lines: readonly SourceLine[], ctx: DetectContext): Candidate[][] {
  return lines.map((line) =>
    DETECTORS.map((d) => d(line, ctx))
      .filter((c): c is Candidate => !!c)
      .sort((a, b) => b.weight - a.weight),
  );
}
