/**
 * An answer file read on its own: MC keys (grids, tables, "1–5 BCDAA") and marking
 * schemes (part labels, a mark per point, marker notes). Every line gets a `use`;
 * nothing is dropped, and text stays verbatim. `matchAnswers` places the entries.
 */
import { normalizeRuns, sliceRichText } from '@/model/text';
import type { InlineRun } from '@/model/types';
import type { ReadPaste } from './index';
import { fold, matchKey } from './normalize';
import { pasteKind } from './scan';
import type { SchemePoint, SourceLine } from './types';

export interface AnswerPoint extends SchemePoint {
  /** The lines it was read from; empty when it came from elsewhere (OCR, AI). */
  lines: number[];
}

/** A marker's note ("1a. no → 0", "accept …"), kept apart from the points. */
export interface AnswerNote {
  runs: InlineRun[];
  lines: number[];
}

/**
 * One question's (or part's) answer. Any source can make these: `matchAnswers` reads
 * only `sectionIndex`, `question`, `part`, `subPart`, `letter(s)`, `points`, `notes`,
 * `each`, `max` and `marks`, never the lines.
 */
export interface AnswerEntry {
  /** The section heading it sits under, verbatim ("Part B: long questions"). */
  section?: string;
  /** Into `AnswerSheet.sections`. */
  sectionIndex: number;
  question: number;
  /** Lower-case label without brackets: "a", "ii". */
  part?: string;
  subPart?: string;
  /** 0 = A. With several accepted ("A/C"), the first; all are in `letters`. */
  letter?: number;
  letters?: number[];
  /** All its point text, verbatim, joined by line breaks. */
  runs?: InlineRun[];
  points?: AnswerPoint[];
  notes?: AnswerNote[];
  /** The marks the sheet gives it: stated on its label line, else the points' total. */
  marks?: number;
  /** `n@`: every point earns n. */
  each?: number;
  /** `max: n`. */
  max?: number;
  /** The line that opened it (-1 when not from a line), and every line it took. */
  line: number;
  lines: number[];
}

export type AnswerLineUse = 'blank' | 'title' | 'section' | 'key' | 'entry' | 'point' | 'note' | 'marks' | 'rule' | 'noise' | 'unknown';

export interface AnswerSection {
  index: number;
  /** The heading, verbatim. Absent for a section started by a numbering restart. */
  title?: string;
  /** "A", "B": Part A, Section A, 甲部. "P1", "P2": Paper 1, Paper II, 卷一. */
  key?: string;
  /** The paper-level key ("P2") in force, from a "Paper II" heading above it. */
  paper?: string;
  line?: number;
}

export interface AnswerSheet {
  /** `scan`: no text layer (or OCR text); entries, if any, are a best effort. */
  kind: 'key' | 'scheme' | 'mixed' | 'empty' | 'scan';
  /** A PDF's page count, for "scanned, 6 pages". */
  pages?: number;
  lines: SourceLine[];
  entries: AnswerEntry[];
  sections: AnswerSection[];
  /** Index-aligned with `lines`. */
  uses: AnswerLineUse[];
  /** Lines with text no entry took (`uses` `unknown`): the UI shows them. */
  unknown: number[];
}

const plain = (runs: readonly InlineRun[]) => runs.map((r) => r.text).join('');
const letterIndex = (ch: string) => ch.toUpperCase().charCodeAt(0) - 65;

// ---- keys ----

const LETTERS = String.raw`[A-E](?:\s*(?:\/|,|、|or|或)\s*[A-E])*`;
const PAIR = new RegExp(String.raw`(?:Q\s*)?(\d{1,3})\s*[.)\-:、]?\s*\(?(${LETTERS})\)?(?![A-Za-z])`, 'g');
const RANGE = /(\d{1,3})\s*(?:-|–|—|~|至|to)\s*(\d{1,3})\s*[.:)]?\s*((?:[A-E]\s*){2,})(?![A-Za-z])/g;
const LETTER_ONLY = new RegExp(String.raw`^\(?(${LETTERS})\)?\.?$`);
/** "B. Because…", "B⇥because…", "B — …": a letter, then its explanation. */
const LETTER_LEAD = /^\(?([A-E])\)?(?:\s*[.:)—–-]\s+|\t|\s{2,})(?=\S)/;

const lettersOf = (s: string) => [...s.matchAll(/[A-E]/g)].map((m) => letterIndex(m[0]));

export interface KeyPair {
  question: number;
  letters: number[];
}

/** The answers in a key line ("1. B 2. C", "1C⇥6B", "1–5 BCDAA"), or null when anything else is on it. */
export function keyLine(text: string): KeyPair[] | null {
  let rest = matchKey(text);
  const out: Array<KeyPair & { at: number }> = [];
  for (const m of rest.matchAll(RANGE)) {
    const from = +m[1];
    const letters = lettersOf(m[3]);
    if (+m[2] - from + 1 !== letters.length) return null;
    letters.forEach((l, k) => out.push({ question: from + k, letters: [l], at: m.index + k / 100 }));
  }
  rest = rest.replace(RANGE, (s) => ' '.repeat(s.length));
  for (const m of rest.matchAll(PAIR)) out.push({ question: +m[1], letters: lettersOf(m[2]), at: m.index });
  rest = rest.replace(PAIR, '');
  if (!out.length || !/^[\s,;|]*$/.test(rest)) return null;
  return out.sort((a, b) => a.at - b.at).map(({ question, letters }) => ({ question, letters }));
}

/** What a key cell misread by OCR looks like: short, digits and letters, no words. */
const GARBLED_CELL = /^[\dA-Za-z().,:;/'"|*-]{1,8}$/;

/**
 * A key row read cell by cell, then word by word inside a cell that is not a key: one
 * misread cell ("8C" read as "803") loses only its own answer, never the row. Needs three
 * answers and at most one bad cell in four; a word that is not cell-shaped means the line
 * is something else.
 */
export function keyCells(texts: readonly string[]): KeyPair[] | null {
  const pairs: KeyPair[] = [];
  let bad = 0;
  for (const text of texts) {
    if (!text.trim()) continue;
    const whole = keyLine(text);
    if (whole) {
      pairs.push(...whole);
      continue;
    }
    for (const token of matchKey(text).trim().split(/\s+/)) {
      const one = keyLine(token);
      if (one) pairs.push(...one);
      else if (GARBLED_CELL.test(token)) bad++;
      else return null;
    }
  }
  const distinct = new Set(pairs.map((p) => p.question)).size === pairs.length;
  return pairs.length >= 3 && distinct && bad <= Math.max(1, Math.floor(pairs.length / 4)) ? pairs : null;
}

const cellsOf = (line: SourceLine) => line.raw.split(/\t+|\s{2,}/).map((c) => c.trim()).filter(Boolean);

/**
 * A row of question numbers above a row of letters (a key table laid sideways). The
 * letter row may have been split into several lines ("B⇥C⇥D" reads as option letters):
 * `lines` is how many lines it took.
 */
function sidewaysKey(top: SourceLine, below: readonly SourceLine[]): { pairs: KeyPair[]; lines: number } | null {
  const nums = cellsOf(top).map((c) => c.replace(/[.:)]$/, ''));
  if (nums.length > 2 && !/^\d+$/.test(nums[0])) nums.shift();
  if (nums.length < 2 || !nums.every((n, k) => /^\d{1,3}$/.test(n) && (k === 0 || +n === +nums[k - 1] + 1))) return null;
  const lets: string[] = [];
  let used = 0;
  for (const line of below) {
    if (lets.length >= nums.length || line.blank) break;
    const tokens = line.raw.split(/\s+/).map((t) => matchKey(t).replace(/[.:)]$/, '')).filter(Boolean);
    if (!used && tokens.length && !/^[A-E]$/.test(tokens[0])) tokens.shift();
    if (!tokens.every((t) => /^[A-E]$/.test(t))) return null;
    lets.push(...tokens);
    used++;
  }
  if (lets.length !== nums.length) return null;
  return { pairs: nums.map((n, k) => ({ question: +n, letters: [letterIndex(lets[k])] })), lines: used };
}

// ---- headings ----

const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };
const CN = '一二三四';

const SECTION: Array<[RegExp, (m: RegExpExecArray) => string]> = [
  [/^paper\s*([IV]{1,3}|\d)\b/i, (m) => `P${ROMAN[m[1].toLowerCase()] ?? +m[1]}`],
  [/^(?:試?卷)\s*([一二三四]|\d)/, (m) => `P${CN.indexOf(m[1]) + 1 || m[1]}`],
  [/^(?:part|section)\s*([A-Z]|[IVX]{2,4}|\d{1,2})\b/i, (m) => (m[1].length > 1 && !/^\d+$/.test(m[1]) ? String(ROMAN[m[1].toLowerCase()]) : m[1].toUpperCase())],
  [/^([甲乙丙丁])\s*部/, (m) => String.fromCharCode(65 + '甲乙丙丁'.indexOf(m[1]))],
];

/** "Part B", "Section A", 甲部 → "B", "A", "A"; "Paper II", 卷一 → "P2", "P1"; else undefined. */
export function sectionKey(text: string): string | undefined {
  const t = matchKey(text);
  for (const [re, key] of SECTION) {
    const m = re.exec(t);
    if (m) return key(m);
  }
  return undefined;
}

const TITLE =
  /^(answers?|answer\s+key|key|keys|marking\s+schemes?|suggested\s+answers?|solutions?|mark\s+scheme|question(\s+no\.?)?(\s+(answer|key))?|答案|參考答案|建議答案|評卷參考|評分準則|評分參考|題號(\s*答案)?)\s*[:：]?$/i;
const NOISE = [/^\s*\d{1,3}\s*$/, /^page\s+\d+(\s+of\s+\d+)?$/i, /^-\s*\d+\s*-$/, /©/, /^第\s*\d+\s*頁/, /^-+\s*(to\s+be\s+continued|end\s+of\b)/i];

// ---- marks ----

const NUM = String.raw`(\d{1,2}(?:\.\d{1,2})?|½)`;
const num = (s: string) => (s === '½' ? 0.5 : +s);
/** One marks token: "(1)", "[2]", "(0.5)", "(1 mark)", "1M", "1A", "2分", "(2分)"; `@` forms are per point. */
const MARK_TOKEN = new RegExp(String.raw`^(?:[([]\s*${NUM}\s*(?:marks?|分)?\s*[)\]]|${NUM}\s*(?:M|A|marks?|分)|${NUM}\s*@|@\s*${NUM})$`, 'i');
const TRAILING = new RegExp(String.raw`(?:^|\s)((?:[([]\s*${NUM}\s*(?:marks?|分)?\s*[)\]]|${NUM}\s*(?:M|A|marks?)|${NUM}\s*@|@\s*${NUM}))\s*$`, 'i');
/** "(1)" inside a line: the mark for the words before it. */
const INLINE = new RegExp(String.raw`[([]\s*${NUM}\s*(?:marks?|分)?\s*[)\]]`, 'gi');
const RULE_TOKEN = /^(?:(\d{1,2})\s*@|@\s*(\d{1,2})|max(?:imum)?\.?\s*[:：]?\s*(\d{1,2})(?:\s*marks?)?|最高\s*(\d{1,2})\s*分)$/i;
const TRAILING_RULE = /\s*[([]\s*((?:\d{1,2}\s*@|@\s*\d{1,2}|max\.?\s*[:：]?\s*\d{1,2})(?:\s*[,;，；]\s*(?:\d{1,2}\s*@|@\s*\d{1,2}|max\.?\s*[:：]?\s*\d{1,2}))*)\s*[)\]]\s*$/i;
/** A cell or line written to a marker, not the candidate. */
const NOTE_HINT = /→|->|\bok\b|\baccept|\breject|\bdo not\b|\bdon't\b|\bignore|\baward|\bdeduct|\bonly\s+\d|\bmax\b|^-\s*\d|\b0\s*(overall)?$|不給分|扣|接受|只給|最多/i;

type Marks = { marks?: number; each?: number };

function markToken(text: string): Marks | null {
  const m = MARK_TOKEN.exec(fold(text).trim());
  if (!m) return null;
  const marks = m[1] ?? m[2];
  return marks !== undefined ? { marks: num(marks) } : { each: num(m[3] ?? m[4]) };
}

/** "Max: 4", "1@", "1@; max: 2", 最高4分 — a group's rules — or null. */
function ruleOf(text: string): { each?: number; max?: number } | null {
  const tokens = fold(text).trim().replace(/^[([]|[)\]]$/g, '').split(/\s*[,;，；]\s*/).filter(Boolean);
  if (!tokens.length) return null;
  const out: { each?: number; max?: number } = {};
  for (const token of tokens) {
    const m = RULE_TOKEN.exec(token.trim());
    if (!m) return null;
    if (m[1] ?? m[2]) out.each = +(m[1] ?? m[2]);
    else out.max = +(m[3] ?? m[4]);
  }
  return out;
}

// ---- labels ----

interface Head {
  question?: number;
  part?: string;
  subPart?: string;
  /** A lower-case roman that could be a letter: `(i)`, `(v)`, `(x)`. */
  either?: boolean;
  /** Characters of the text (or first cell) the head took, with the space after it. */
  length: number;
  /** The head was the whole first cell. */
  cell?: boolean;
}

const PART = String.raw`(?:\(\s*([a-h])\s*\)|([a-h])(?:[).]|(?=\s*\(\s*[ivx])))`;
const SUB = String.raw`(?:\(\s*([ivx]{1,4})\s*\)|\.?([ivx]{1,4})[).]?)`;
/** "1(a)", "3a)", "1a.", "9a(i)", "Q3 (b)(ii)", "6.(a)". */
const COMPOUND = new RegExp(String.raw`^(?:Q(?:uestion)?\s*\.?\s*)?(\d{1,3})\s*[.、:]?\s*${PART}\s*(?:${SUB})?\s*\.?(?=\s|$)`);
/** "ci.", "c.ii", "d.i .", "(c)(ii)": a part and sub-part with no number. */
const PART_SUB = /^(?:\(\s*([a-h])\s*\)|([a-h])\.?)\s*(?:\(\s*([ivx]{1,4})\s*\)|([ivx]{1,4})[).]?)\s*\.?(?=\s|$)/;
const NUMERIC_FAMILIES = new Set(['n.', 'n)', 'Qn', '第n題']);

function compound(text: string): Head | null {
  const folded = fold(text);
  const m = COMPOUND.exec(folded);
  const n = m ? null : PART_SUB.exec(folded);
  const hit = m ?? n;
  if (!hit) return null;
  const gap = /^\s*/.exec(text.slice(hit[0].length))![0].length;
  if (m) return { question: +m[1], part: m[2] ?? m[3], ...(m[4] ?? m[5] ? { subPart: m[4] ?? m[5] } : {}), length: m[0].length + gap };
  return { part: n![1] ?? n![2], subPart: n![3] ?? n![4], length: n![0].length + gap };
}

function headOf(line: SourceLine): Head | null {
  const info = line.labelInfo;
  if (info && line.labelSource) {
    if (NUMERIC_FAMILIES.has(info.family)) return { question: info.value, length: 0 };
    if (info.family === '(a)' || info.family === 'a)' || info.family === 'a.') return { part: String.fromCharCode(96 + info.value), length: 0 };
    if (info.family === '(i)' || info.family === 'i)' || info.family === 'i.') {
      const roman = Object.keys(ROMAN).find((k) => ROMAN[k] === info.value)!;
      return { subPart: roman, either: Boolean(info.alt), length: 0 };
    }
    return compound(`${line.label}${line.text ? ` ${line.text}` : ''}`);
  }
  const first = line.cells ? plain(line.cells[0]).trim() : line.text;
  const head = compound(first);
  if (!head) return null;
  return line.cells && head.length >= first.length ? { ...head, cell: true } : head;
}

// ---- the read ----

function trim(runs: InlineRun[]): InlineRun[] {
  const text = plain(runs);
  const start = text.length - text.trimStart().length;
  return normalizeRuns(sliceRichText(runs, start, text.trimEnd().length));
}

/** Table cells as one line, a space between them. */
const joinCells = (cells: readonly InlineRun[][]) => trim(cells.flatMap((c, k) => (k ? [{ text: ' ' }, ...c] : c)));

interface Segment {
  runs: InlineRun[];
  marks?: number;
}

/**
 * A line's text cut at each inline mark: "Yes (1) the tax falls (1)" → two points. A
 * bracketed number joined to another by "and", "or" or a comma ("(1) and (2) only") is text.
 */
function segments(runs: InlineRun[]): { segs: Segment[]; marks: Marks | null; rule: { each?: number; max?: number } | null } {
  let text = plain(runs);
  let rule: { each?: number; max?: number } | null = null;
  const r = TRAILING_RULE.exec(fold(text));
  if (r && r.index > 0) {
    rule = ruleOf(r[1]);
    if (rule) {
      runs = sliceRichText(runs, 0, r.index);
      text = plain(runs);
    }
  }
  const segs: Segment[] = [];
  let from = 0;
  const folded = fold(text);
  for (const m of folded.matchAll(INLINE)) {
    const before = folded.slice(0, m.index);
    const after = folded.slice(m.index + m[0].length);
    if (!before.slice(from).trim() || /[)\]]\s*(?:and|or|及|或|&|,|、)\s*$/i.test(before) || /^\s*(?:and|or|及|或|&|,|、)\s*[([]\s*\d/i.test(after)) continue;
    segs.push({ runs: trim(sliceRichText(runs, from, m.index)), marks: num(m[1]) });
    from = m.index + m[0].length;
    // "(1)." — the stop belongs to the words before.
    const stop = /^[.,;:。，；：]+/.exec(after);
    if (stop) {
      segs[segs.length - 1].runs = normalizeRuns([...segs[segs.length - 1].runs, ...sliceRichText(runs, from, from + stop[0].length)]);
      from += stop[0].length;
    }
  }
  const tail = trim(sliceRichText(runs, from, text.length));
  if (tail.length) {
    const t = TRAILING.exec(fold(plain(tail)));
    const token = t && t.index + t[0].length === plain(tail).length ? markToken(t[1]) : null;
    if (token && token.marks !== undefined) segs.push({ runs: trim(sliceRichText(tail, 0, t!.index)), marks: token.marks });
    else if (token) return { segs: [...segs, { runs: trim(sliceRichText(tail, 0, t!.index)) }], marks: token, rule };
    else segs.push({ runs: tail });
  }
  return { segs: segs.filter((s) => s.runs.length || s.marks !== undefined), marks: null, rule };
}

interface Body {
  segs: Segment[];
  /** A per-point `@` mark, or a mark with no words before it. */
  marks: Marks | null;
  rule: { each?: number; max?: number } | null;
  /** A marker-notes cell. */
  note?: InlineRun[];
}

/** A line's body after its head: marks and rules split off, cells joined by a space, a notes column apart. */
function bodyOf(line: SourceLine, head: Head | null): Body {
  const stated: Marks | null = line.trailingMarks !== undefined ? { marks: line.trailingMarks } : null;
  if (line.cells) {
    const cells = line.cells.map((c) => [...c]);
    if (head?.cell) cells.shift();
    else if (head?.length) cells[0] = sliceRichText(cells[0], head.length, plain(cells[0]).length);
    while (cells.length && !plain(cells[cells.length - 1]).trim()) cells.pop();
    const tokenAt = cells.findIndex((c, k) => k > 0 && markToken(plain(c)));
    const token = tokenAt >= 0 ? markToken(plain(cells[tokenAt])) : null;
    // "answer | (1) | note", or "answer (1) | note": the last cell speaks to the marker.
    const texts = cells.map((c, k) => (k === tokenAt ? '' : plain(c).trim()));
    const filled = texts.flatMap((t, k) => (t ? [k] : []));
    const last = filled[filled.length - 1];
    const inlineMarked = filled.length >= 2 && INLINE.test(texts[filled[0]]);
    INLINE.lastIndex = 0;
    const noteAt = filled.length >= 2 && ((tokenAt >= 0 && last > tokenAt) || inlineMarked || NOTE_HINT.test(texts[last])) ? last : -1;
    const joined = joinCells(cells.filter((_, k) => texts[k] && k !== noteAt));
    const parts = segments(joined);
    let segs = parts.segs;
    let marks = parts.marks ?? stated;
    if (token?.marks !== undefined && segs.length && segs[segs.length - 1].marks === undefined) segs = [...segs.slice(0, -1), { ...segs[segs.length - 1], marks: token.marks }];
    else if (token) marks = token;
    return { segs, marks, rule: parts.rule, ...(noteAt >= 0 ? { note: trim(cells[noteAt]) } : {}) };
  }
  const runs = head?.length ? sliceRichText(line.runs, head.length, plain(line.runs).length) : line.runs;
  const parts = segments(trim(runs));
  if (stated && parts.segs.length && parts.segs[parts.segs.length - 1].marks === undefined) {
    parts.segs[parts.segs.length - 1].marks = stated.marks;
    return { ...parts, marks: parts.marks };
  }
  return { ...parts, marks: parts.marks ?? stated };
}

const ENDS_SENTENCE = /[.?!。？！:：;；]["'”’)]?$/;
const keyOf = (e: Pick<AnswerEntry, 'question' | 'part' | 'subPart'>) => `${e.question}:${e.part ?? ''}:${e.subPart ?? ''}`;

class Reader {
  readonly entries: AnswerEntry[] = [];
  readonly sections: AnswerSection[] = [{ index: 0 }];
  readonly uses: AnswerLineUse[];
  private cur: AnswerEntry | undefined;
  private curDepth = 0;
  private lastQ: number | undefined;
  private lastKind: 'key' | 'scheme' | undefined;
  private lastPointLine = -1;
  /** After a repeated label ("1a. no → 0"), lines are notes on that entry until the next label. */
  private noting = false;
  private paper: string | undefined;

  constructor(readonly lines: readonly SourceLine[]) {
    this.uses = lines.map(() => 'unknown');
  }

  private get section(): AnswerSection {
    return this.sections[this.sections.length - 1];
  }

  private inSection(): AnswerEntry[] {
    return this.entries.filter((e) => e.sectionIndex === this.section.index);
  }

  private newSection(title?: string, line?: number): void {
    const key = title ? sectionKey(title) : undefined;
    if (key?.startsWith('P')) this.paper = key;
    const fields = { ...(title ? { title } : {}), ...(key ? { key } : {}), ...(this.paper ? { paper: this.paper } : {}), ...(line !== undefined ? { line } : {}) };
    if (this.inSection().length) this.sections.push({ index: this.sections.length, ...fields });
    else Object.assign(this.section, fields);
    this.cur = undefined;
    this.noting = false;
    this.lastQ = undefined;
  }

  private open(question: number, line: number, at: Partial<AnswerEntry> = {}): AnswerEntry {
    const entry: AnswerEntry = {
      ...(this.section.title ? { section: this.section.title } : {}),
      sectionIndex: this.section.index,
      question,
      ...at,
      line,
      lines: [line],
    };
    this.entries.push(entry);
    this.lastQ = question;
    return entry;
  }

  private setLetters(entry: AnswerEntry, letters: number[]): void {
    entry.letter = letters[0];
    if (letters.length > 1) entry.letters = letters;
  }

  private addNote(entry: AnswerEntry, runs: InlineRun[], line: number): void {
    if (!runs.length) return;
    const notes = (entry.notes ??= []);
    notes.push({ runs, lines: [line] });
    if (!entry.lines.includes(line)) entry.lines.push(line);
  }

  /** A line's points onto the entry. The first joins the last point when the line only wraps it. */
  private addBody(entry: AnswerEntry, body: Body, line: SourceLine): void {
    if (body.rule?.each !== undefined) entry.each = body.rule.each;
    if (body.rule?.max !== undefined) entry.max = body.rule.max;
    if (body.marks?.each !== undefined) entry.each = body.marks.each;
    const points = (entry.points ??= []);
    body.segs.forEach((seg, k) => {
      const prev = points[points.length - 1];
      const adjacent = k === 0 && prev && this.lastPointLine === line.i - 1 && prev.marks === undefined;
      const prevLine = prev ? this.lines[prev.lines[prev.lines.length - 1]] : undefined;
      const rows = adjacent && prevLine?.cells && line.cells && !this.lines[line.i]?.labelInfo;
      const wrap = adjacent && !line.cells && /^[a-z]/.test(plain(seg.runs)) && !ENDS_SENTENCE.test(plain(prev.runs));
      if (seg.runs.length && (rows || wrap)) {
        prev.runs = normalizeRuns([...prev.runs, { text: rows ? '\n' : ' ' }, ...seg.runs]);
        prev.lines.push(line.i);
        if (seg.marks !== undefined) prev.marks = seg.marks;
      } else if (seg.runs.length) {
        points.push({ runs: seg.runs, ...(seg.marks !== undefined ? { marks: seg.marks } : {}), lines: [line.i] });
      } else if (seg.marks !== undefined) this.looseMark(entry, seg.marks);
    });
    if (body.marks?.marks !== undefined) this.looseMark(entry, body.marks.marks);
    if (body.note) this.addNote(entry, body.note, line.i);
    this.lastPointLine = line.i;
    if (!entry.lines.includes(line.i)) entry.lines.push(line.i);
  }

  /** A mark with no words of its own ("(1)" under a table or a diagram): the last unmarked point's. */
  private looseMark(entry: AnswerEntry, marks: number): void {
    const open = [...(entry.points ?? [])].reverse().find((p) => p.marks === undefined);
    if (open) open.marks = marks;
    else if (entry.points?.length) entry.points.push({ runs: [], marks, lines: [] });
    else entry.marks ??= marks;
  }

  /** Whether a numbered head starts an entry here, a new section, or is a numbered point. */
  private place(head: Head, line: SourceLine): 'here' | 'restart' | 'point' {
    const n = head.question!;
    const last = this.lastQ;
    if (last === undefined) return 'here';
    if (n > last && n <= last + 15) return 'here';
    // The same number again: the next part, or a marker's note on one already read.
    if (n === last) return 'here';
    const deeper = this.cur && line.depth > this.curDepth;
    if (n <= last && !deeper && (this.lastKind === 'key' || head.part || this.inSection().some((e) => e.question === n && e.points?.length))) return 'restart';
    return 'point';
  }

  read(): void {
    const { lines } = this;
    for (let k = 0; k < lines.length; k++) {
      const line = lines[k];
      const mark = (u: AnswerLineUse) => (this.uses[line.i] = u);
      if (line.blank || line.tabOnly || (!line.raw.trim() && !line.image && !line.cells)) {
        mark('blank');
        continue;
      }
      if (line.image) continue;
      const text = matchKey(line.text);
      if (!line.labelInfo && sectionKey(text) !== undefined && text.length < 80) {
        this.newSection(line.text, line.i);
        mark('section');
        continue;
      }
      if (!line.labelInfo && NOISE.some((re) => re.test(text))) {
        mark('noise');
        continue;
      }
      const full = [line.label ?? '', ...(line.cells ? line.cells.map(plain) : [line.text])].join(' ');
      const flat = keyLine(full) ?? keyCells(line.cells ? line.cells.map((c, n) => (n === 0 && line.label ? `${line.label} ${plain(c)}` : plain(c))) : [full]);
      const sideways = flat ? null : sidewaysKey(line, lines.slice(k + 1, k + 4));
      if (flat || sideways) {
        this.keyPairs(flat ?? sideways!.pairs, line);
        mark('key');
        for (let j = 0; j < (sideways?.lines ?? 0); j++) this.uses[lines[++k].i] = 'key';
        continue;
      }
      if (!line.labelInfo && (line.cells ? line.cells.every((c) => TITLE.test(matchKey(plain(c)))) : TITLE.test(text))) {
        mark('title');
        continue;
      }
      if (this.tryHead(headOf(line), line)) {
        mark(this.noting ? 'note' : 'entry');
        continue;
      }
      const cur = this.cur;
      if (!cur) {
        mark(this.entries.length ? 'unknown' : 'title');
        continue;
      }
      const lone = line.labelInfo?.family === '(n)' && !line.text && !line.cells;
      const rule = !line.labelInfo && !line.cells ? ruleOf(line.text) : null;
      if (rule) {
        if (rule.each !== undefined) cur.each = rule.each;
        if (rule.max !== undefined) cur.max = rule.max;
        cur.lines.push(line.i);
        mark('rule');
        continue;
      }
      const withLabel = line.labelRuns && !lone ? trim([...line.labelRuns, ...line.runs]) : line.runs;
      if (this.noting) {
        this.addNote(cur, line.cells ? joinCells(line.cells) : withLabel, line.i);
        mark('note');
        continue;
      }
      if (!cur.points?.length && cur.letter === undefined && LETTER_ONLY.test(matchKey(plain(withLabel)))) {
        this.setLetters(cur, lettersOf(matchKey(plain(withLabel))));
        cur.lines.push(line.i);
        mark('entry');
        continue;
      }
      const body: Body = lone
        ? { segs: [], marks: { marks: line.labelInfo!.value }, rule: null }
        : line.labelRuns
          ? bodyOf({ ...line, runs: withLabel }, null)
          : bodyOf(line, null);
      this.addBody(cur, body, line);
      mark(body.segs.some((s) => s.runs.length) ? 'point' : body.note ? 'note' : 'marks');
    }
    this.finish();
  }

  private keyPairs(pairs: KeyPair[], line: SourceLine): void {
    for (const pair of pairs) {
      const again = this.inSection().some((e) => e.question === pair.question && e.letter !== undefined && !e.part);
      if (again) this.newSection();
      const entry = this.open(pair.question, line.i);
      this.setLetters(entry, pair.letters);
      this.cur = pairs.length === 1 ? entry : undefined;
    }
    this.noting = false;
    this.curDepth = line.depth;
    this.lastKind = 'key';
  }

  private tryHead(head: Head | null, line: SourceLine): boolean {
    if (!head) return false;
    let question = head.question;
    let part = head.part;
    let subPart = head.subPart;
    if (question !== undefined) {
      // A table row ("50⇥400⇥5") is not a question.
      if (line.cells && line.cells.slice(head.cell ? 1 : 0).every((c) => /^[\d\s.,%$-]*$/.test(plain(c)))) return false;
      const where = this.place(head, line);
      if (where === 'point') return false;
      if (where === 'restart') this.newSection();
    } else {
      const cur = this.cur;
      if (!cur || this.lastKind === 'key') return false;
      question = cur.question;
      if (subPart && !part && head.either && (!cur.part || (cur.part === 'h' && subPart === 'i'))) {
        part = String.fromCharCode(96 + ({ i: 9, v: 22, x: 24 } as Record<string, number>)[subPart]);
        subPart = undefined;
      } else if (subPart && !part) part = cur.part;
      if (!part) return false;
    }
    const at = { question, ...(part ? { part } : {}), ...(subPart ? { subPart } : {}) };
    const body = bodyOf(line, head);
    const existing = this.inSection().find((e) => keyOf(e) === keyOf(at));
    if (existing) {
      // The same label again: a marker's note on that answer ("1a. no → 0"). A bare
      // label ("(i)" over a diagram) only returns to it.
      this.cur = existing;
      this.lastQ = question;
      const hasBody = body.segs.length || body.note || body.marks;
      if (!hasBody) return true;
      this.noting = true;
      const runs = line.cells ? joinCells(line.cells) : trim(line.labelRuns ? [...line.labelRuns, ...line.runs] : line.runs);
      this.addNote(existing, runs, line.i);
      return true;
    }
    this.noting = false;
    const entry = this.open(question, line.i, at);
    this.cur = entry;
    this.curDepth = line.depth;
    this.lastKind = 'scheme';
    const first = body.segs[0] ? matchKey(plain(body.segs[0].runs)) : '';
    if (body.segs.length === 1 && LETTER_ONLY.test(first) && body.segs[0].marks === undefined) {
      this.setLetters(entry, lettersOf(first));
      this.lastKind = 'key';
      if (body.note) this.addNote(entry, body.note, line.i);
      return true;
    }
    const lead = body.segs[0] ? LETTER_LEAD.exec(plain(body.segs[0].runs)) : null;
    if (lead) {
      entry.letter = letterIndex(lead[1]);
      body.segs[0] = { ...body.segs[0], runs: trim(sliceRichText(body.segs[0].runs, lead[0].length, plain(body.segs[0].runs).length)) };
    }
    if (!body.segs.length && body.marks?.marks !== undefined) {
      entry.marks = body.marks.marks;
      body.marks = null;
    }
    this.addBody(entry, body, line);
    return true;
  }

  /** Entries that took nothing (a bare "3." before its parts) go; their lines keep `entry`. */
  private finish(): void {
    for (let k = this.entries.length - 1; k >= 0; k--) {
      const e = this.entries[k];
      if (e.points && !e.points.length) delete e.points;
      if (e.letter === undefined && !e.points && !e.notes && e.marks === undefined) this.entries.splice(k, 1);
    }
    for (const e of this.entries) {
      if (e.points) e.runs = normalizeRuns(e.points.flatMap((p, k) => (k ? [{ text: '\n' }, ...p.runs] : p.runs)));
      if (e.points && e.marks === undefined) {
        const sum = e.points.reduce((n, p) => n + (e.each ?? p.marks ?? 0), 0);
        const total = e.max !== undefined ? Math.min(sum, e.max) : sum;
        if (total > 0) e.marks = Math.round(total * 100) / 100;
      }
    }
    const kept = this.sections.filter((s) => this.entries.some((e) => e.sectionIndex === s.index) || s.title);
    const map = new Map(kept.map((s, k) => [s.index, k]));
    for (const e of this.entries) e.sectionIndex = map.get(e.sectionIndex) ?? 0;
    this.sections.splice(0, this.sections.length, ...kept.map((s, k) => ({ ...s, index: k })));
    if (!this.sections.length) this.sections.push({ index: 0 });
  }
}

/** Read an answer file: keys and schemes as entries, every line accounted for. */
export function readAnswerSheet(read: ReadPaste & { pages?: number }): AnswerSheet {
  const reader = new Reader(read.lines);
  reader.read();
  const { entries, sections, uses } = reader;
  const keys = entries.some((e) => e.letter !== undefined);
  const schemes = entries.some((e) => e.letter === undefined && e.points?.length);
  const kind: AnswerSheet['kind'] =
    pasteKind(read.lines, read.source) === 'scan' ? 'scan' : !entries.length ? 'empty' : keys && schemes ? 'mixed' : keys ? 'key' : 'scheme';
  const unknown = read.lines.flatMap((l) => (uses[l.i] === 'unknown' && (l.raw.trim() || l.image || l.cells) ? [l.i] : []));
  return { kind, ...(read.pages !== undefined ? { pages: read.pages } : {}), lines: read.lines, entries, sections, uses, unknown };
}
