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
import type { SchemeGroup, SchemePoint, SchemeShape, SourceLine } from './types';

export interface AnswerPoint extends SchemePoint {
  /** The lines it was read from; empty when it came from elsewhere (OCR, AI). */
  lines: number[];
  /** It opened with a dash ("- …"), taken off: the next undashed line carries it on. */
  dashed?: boolean;
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
export interface AnswerEntry extends SchemeShape {
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
  /** An MC key's "D (69)": the % who chose the right answer (k-0480). */
  percent?: number;
  /** The line that opened it (-1 when not from a line), and every line it took. */
  line: number;
  lines: number[];
}

export type AnswerLineUse =
  | 'blank'
  | 'title'
  | 'section'
  | 'key'
  | 'entry'
  | 'point'
  | 'note'
  | 'marks'
  | 'rule'
  /** A group's heading, EC, content max or a level (k-0480). */
  | 'heading'
  /** A comment on candidates' performance (k-0480). */
  | 'comment'
  | 'noise'
  | 'unknown';

/** A paragraph of the comments on candidates' performance (k-0480). */
export interface AnswerComment {
  /** The paper-level key ("P1", "P2") in force, from a "Paper 1" heading above it. */
  paper?: string;
  runs: InlineRun[];
  lines: number[];
}

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
  /** The comments on candidates' performance, when the file has them (k-0480). */
  comments?: AnswerComment[];
}

const plain = (runs: readonly InlineRun[]) => runs.map((r) => r.text).join('');
const letterIndex = (ch: string) => ch.toUpperCase().charCodeAt(0) - 65;

// ---- keys ----

const LETTERS = String.raw`[A-E](?:\s*(?:\/|,|、|or|或)\s*[A-E])*`;
/** An examination report's "D (69)" / "D (69%)": the % who chose it (k-0480). */
const PERCENT = String.raw`(?:\s*[(（]\s*(\d{1,3}(?:\.\d)?)\s*%?\s*[)）])?`;
const PAIR = new RegExp(String.raw`(?:Q\s*)?(\d{1,3})\s*[.)\-:、]?\s*\(?(${LETTERS})\)?(?![A-Za-z])${PERCENT}`, 'g');
const RANGE = /(\d{1,3})\s*(?:-|–|—|~|至|to)\s*(\d{1,3})\s*[.:)]?\s*((?:[A-E]\s*){2,})(?![A-Za-z])/g;
const LETTER_ONLY = new RegExp(String.raw`^\(?(${LETTERS})\)?\.?$`);
/** "B. Because…", "B⇥because…", "B — …": a letter, then its explanation. */
const LETTER_LEAD = /^\(?([A-E])\)?(?:\s*[.:)—–-]\s+|\t|\s{2,})(?=\S)/;

const lettersOf = (s: string) => [...s.matchAll(/[A-E]/g)].map((m) => letterIndex(m[0]));

export interface KeyPair {
  question: number;
  letters: number[];
  /** "D (69)": % correct, 0–100. */
  percent?: number;
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
  for (const m of rest.matchAll(PAIR)) {
    const percent = m[3] !== undefined ? +m[3] : undefined;
    if (percent !== undefined && percent > 100) return null;
    out.push({ question: +m[1], letters: lettersOf(m[2]), ...(percent !== undefined ? { percent } : {}), at: m.index });
  }
  rest = rest.replace(PAIR, '');
  if (!out.length || !/^[\s,;|]*$/.test(rest)) return null;
  return out.sort((a, b) => a.at - b.at).map(({ question, letters, percent }) => ({ question, letters, ...(percent !== undefined ? { percent } : {}) }));
}

/** A % with no letter before it: "(79)", what is left of "A (79)" when OCR lost the letter. */
const BARE_PERCENT = /^[(（]\d{1,3}(?:\.\d)?%?[)）]$/;

/** What is left of a key cell when OCR loses part of it: a number, a letter or two, a doubled letter. */
const KEY_DEBRIS = /^(?:\d{1,3}[.)]?|[A-E]{1,3})$/;

/**
 * A row inside a run of key rows (k-0480) whose letter OCR lost ("11. (92)  36. A (79)"):
 * still a key row. The whole pairs in it are read; what is left must be key-shaped (a
 * number, a letter or two, a bare %), with at least one pair or % in the row.
 */
function keyRunRow(texts: readonly string[]): KeyPair[] | null {
  const pairs: KeyPair[] = [];
  let percents = 0;
  for (const text of texts) {
    let rest = matchKey(text);
    for (const m of rest.matchAll(PAIR)) {
      const percent = m[3] !== undefined ? +m[3] : undefined;
      pairs.push({ question: +m[1], letters: lettersOf(m[2]), ...(percent !== undefined && percent <= 100 ? { percent } : {}) });
    }
    rest = rest.replace(PAIR, ' ');
    for (const token of rest.trim().split(/\s+/).filter(Boolean)) {
      if (BARE_PERCENT.test(token)) percents++;
      else if (!KEY_DEBRIS.test(token)) return null;
    }
  }
  const distinct = new Set(pairs.map((p) => p.question)).size === pairs.length;
  return distinct && pairs.length + percents > 0 ? pairs : null;
}

/** What a key cell misread by OCR looks like: short, digits and letters, no words. */
const GARBLED_CELL = /^[\dA-Za-z().,:;/'"|*-]{1,8}$/;

/**
 * A key row read cell by cell, then word by word inside a cell that is not a key: one
 * misread cell ("8C" read as "803") loses only its own answer, never the row. Needs three
 * answers and at most one bad cell in four; a word that is not cell-shaped means the line
 * is something else.
 */
export function keyCells(texts: readonly string[], options: { inRun?: boolean } = {}): KeyPair[] | null {
  if (options.inRun) return keyRunRow(texts);
  const pairs: KeyPair[] = [];
  let bad = 0;
  let percents = 0;
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
      else if (BARE_PERCENT.test(token)) percents++;
      else if (GARBLED_CELL.test(token)) bad++;
      else return null;
    }
  }
  const distinct = new Set(pairs.map((p) => p.question)).size === pairs.length;
  void percents;
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
const NOISE = [/^\s*(?:marks|分數|分)\s*$/i, /^\s*\d{1,3}\s*$/, /^page\s+\d+(\s+of\s+\d+)?$/i, /^-\s*\d+\s*-$/, /©/, /^第\s*\d+\s*頁/, /^-+\s*(to\s+be\s+continued|end\s+of\b)/i];

// ---- marks ----

const NUM = String.raw`(\d{1,2}(?:\.\d{1,2})?|½)`;
const num = (s: string) => (s === '½' ? 0.5 : +s);
/** One marks token: "(1)", "[2]", "(0.5)", "(1 mark)", "1M", "1A", "2分", "(2分)"; `@` forms are per point. */
const MARK_TOKEN = new RegExp(String.raw`^(?:[([]\s*${NUM}\s*(?:marks?|分)?\s*[)\]]|${NUM}\s*(?:M|A|marks?|分)|${NUM}\s*@|@\s*${NUM})$`, 'i');
const TRAILING = new RegExp(String.raw`(?:^|\s)((?:[([]\s*${NUM}\s*(?:marks?|分)?\s*[)\]]|${NUM}\s*(?:M|A|marks?)|${NUM}\s*@|@\s*${NUM}))\s*$`, 'i');
/** "(1)" inside a line: the mark for the words before it. */
const INLINE = new RegExp(String.raw`[([]\s*${NUM}\s*(?:marks?|分)?\s*[)\]]`, 'gi');
const RULE_TOKEN = /^(?:(\d{1,2})\s*@|@\s*(\d{1,2})|max(?:imum)?\.?\s*[:：]?\s*(\d{1,2})(?:\s*marks?)?|最高\s*[:：]?\s*(\d{1,2})\s*分?)$/i;
const TRAILING_RULE = /\s*[([]\s*((?:\d{1,2}\s*@|@\s*\d{1,2}|max\.?\s*[:：]?\s*\d{1,2})(?:\s*[,;，；]\s*(?:\d{1,2}\s*@|@\s*\d{1,2}|max\.?\s*[:：]?\s*\d{1,2}))*)\s*[)\]]\s*$/i;
/** The same at a line's end with no brackets, as a scheme's marks column leaves it ("… max: 2", "… 最高：4"; k-0480). */
const TRAILING_BARE_RULE = /\s+((?:max(?:imum)?\.?\s*[:：]\s*\d{1,2}|最高\s*[:：]?\s*\d{1,2}\s*分?)(?:\s+(?:\d{1,2}\s*@|max(?:imum)?\.?\s*[:：]\s*\d{1,2}|最高\s*[:：]?\s*\d{1,2}\s*分?))*)\s*$/i;
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
  // "2@; max: 4", or with only a space between them: "2@ max: 4", "2@ 最高：4" (k-0480).
  const tokens = fold(text)
    .trim()
    .replace(/^[([]|[)\]]$/g, '')
    .split(/\s*[,;，；]\s*|\s+(?=max\b|maximum\b|最高|\d{1,2}\s*@|@)/i)
    .filter(Boolean);
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

// ---- scheme structure (k-0480) ----

const COUNT: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, 一: 1, 首: 1, 兩: 2, 二: 2, 三: 3, 四: 4, 五: 5 };
/** "[Mark the FIRST point only.]", "[Mark the FIRST TWO points only.]", [只批閱首項。], [只批閱首兩項。]. */
const FIRST_ONLY_EN = /^[[(]?\s*(?:mark|only\s+mark)\s+the\s+first\s+(?:(\d|one|two|three|four|five)\s+)?points?\s+only\s*\.?\s*[\])]?\.?$/i;
const FIRST_ONLY_ZH = /^[[［(（]?\s*只(?:批閱|評閱|評)首\s*([一兩二三四五\d])?\s*(?:項|點|個)\s*[。.]?\s*[\]］)）]?$/;
/** "Marks for effective communication (EC: max 2 marks)", 有效傳意（最高 2 分）. */
const EC_HEAD = /effective\s+communication|^\(?EC\b|有效傳意|傳意分/i;
const EC_MAX = /(?:max(?:imum)?\.?\s*[:：]?\s*|最高\s*[:：]?\s*)(\d{1,2})/i;
/** "The maximum mark for content is 12 marks." / 內容最高 12 分. */
const CONTENT_MAX = /maximum\s+marks?\s+for\s+(?:the\s+)?content\s+(?:is|=)\s*(\d{1,2})|content\s*[:：(（]?\s*max(?:imum)?\.?\s*[:：]?\s*(\d{1,2})|[內内]容(?:分)?(?:的)?(?:最高|上限)(?:分數)?(?:為|是|：|:)?\s*(\d{1,2})\s*分/i;
/** "L3 (7–9 marks): …", "Level 2 [4-6]", 第三級（7-9分）. */
const LEVEL = /^(?:L(?:evel)?\s*(\d)|第\s*([一二三四五\d])\s*級)\s*[([（［]?\s*(\d{1,2})\s*(?:-|–|—|~|至|to)\s*(\d{1,2})\s*(?:marks?|分)?\s*[)\]）］]?\s*[:：.]?\s*/i;
/** The header row of an EC table: "Marks | Performance", 分數 | 表現. */
const EC_HEADER = /^(?:marks?\s*(?:performance|descriptors?)|分數\s*(?:表現|描述))$/i;
/** "Comments on candidates' performance", 考生表現評論 / 考生表現. */
const COMMENTS_HEAD = /^(?:general\s+)?comments?\s+on\s+candidates['’]?\s*performance|^candidates['’]?\s*performance\b|^考生表現(?:評論|評述)?\s*$|^對考生表現的評論/i;
const BULLET = /^[-–—•·●▪]\s*/;
/** The comments table's header: "Question Number | Performance in General | Popularity (%)", 題目 | 整體表現 | 選題百分率. */
const COMMENT_HEADER = /^(?:(?:question|number|no\.?|performance\s+in\s+general|popularity|\(?%\)?|題目|題號|整體表現|選題百分率)\s*)+$/i;
/** A key's footnote: "Note: Figures in brackets indicate the percentages of candidates choosing the correct answers." / 括號內數字為答對百分率. */
const KEY_NOTE = /^(?:note|註|注)?\s*[:：]?\s*(?:figures?|numbers?)\s+in\s+brackets|percentages?\s+of\s+candidates|括號內(?:的)?數字|答對百分率/i;

const countOf = (word: string | undefined) => (word === undefined ? 1 : /^\d$/.test(word) ? +word : (COUNT[word.toLowerCase()] ?? 1));

/** A group's take-first rule from its own line, or null. */
export function firstOnlyRule(text: string): number | null {
  const t = fold(text).trim();
  const en = FIRST_ONLY_EN.exec(t);
  if (en) return countOf(en[1]);
  const zh = FIRST_ONLY_ZH.exec(t);
  return zh ? countOf(zh[1]) : null;
}

/**
 * A group's heading: a short line ending in a colon, with no marks on it ("Possible
 * reasons:", "Verbal elaboration:", 在圖1中顯示：). A sentence that runs on is not one.
 */
export function isSchemeHeading(text: string): boolean {
  const t = text.trim().replace(BULLET, '');
  if (t.length < 3 || t.length > 90 || !/[:：]$/.test(t)) return false;
  if (/[([（]\s*\d{1,2}(?:\.\d)?\s*(?:marks?|分)?\s*[)\]）]/i.test(t)) return false;
  return !/^(?:note|notes|remarks?|註|備註)\s*[:：]$/i.test(t);
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
  const r = TRAILING_RULE.exec(fold(text)) ?? TRAILING_BARE_RULE.exec(fold(text));
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
    const last = segs[segs.length - 1];
    if (token && token.marks !== undefined) segs.push({ runs: trim(sliceRichText(tail, 0, t!.index)), marks: token.marks });
    else if (token) return { segs: [...segs, { runs: trim(sliceRichText(tail, 0, t!.index)) }], marks: token, rule };
    // "… increase in business (2) visitors' expenditure …": a paragraph whose mark sat beside
    // its first line, its lines joined after it. The rest of the sentence is the same point (k-0480).
    else if (last?.marks !== undefined && last.runs.length && !ENDS_SENTENCE.test(plain(last.runs)) && (/^[a-z]/.test(plain(tail)) || cjkJoin(plain(last.runs), plain(tail))))
      last.runs = normalizeRuns([...last.runs, ...(cjkJoin(plain(last.runs), plain(tail)) ? [] : [{ text: ' ' }]), ...tail]);
    else segs.push({ runs: tail });
  }
  return { segs: segs.filter((s) => s.runs.length || s.marks !== undefined), marks: null, rule };
}

interface Body {
  segs: Segment[];
  /** Read from table cells of which only one held words: it wraps like a line, not a row. */
  single?: boolean;
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
    // A group's rule in the marks column ("max: 2" beside a point, k-0480): the rule, not a note.
    let cellRule: { each?: number; max?: number } | null = null;
    for (let k = cells.length - 1; k > 0; k--) {
      const rule = markToken(plain(cells[k])) ? null : ruleOf(plain(cells[k]));
      if (rule) {
        cellRule = { ...rule, ...(cellRule ?? {}) };
        cells.splice(k, 1);
      }
    }
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
    const rule = cellRule || parts.rule ? { ...(parts.rule ?? {}), ...(cellRule ?? {}) } : null;
    const single = texts.filter((t, k) => t && k !== noteAt && k !== tokenAt).length === 1;
    return { segs, marks, rule, ...(single ? { single: true } : {}), ...(noteAt >= 0 ? { note: trim(cells[noteAt]) } : {}) };
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
const CJK_END = /[\u3400-\u9fff\uf900-\ufaff，、（）「」]$/;
const CJK_START = /^[\u3400-\u9fff\uf900-\ufaff（「]/;
/** Two pieces of Chinese text run on with no space between them. */
const cjkJoin = (before: string, after: string) => CJK_END.test(before.trimEnd()) && CJK_START.test(after.trimStart());

/** A point's leading dash ("- ", "– ", "• ") off: the key prints its own bullet. */
function stripBullet(runs: readonly InlineRun[]): InlineRun[] {
  const text = plain(runs);
  const m = /^\s*[-–—•·●▪]\s*/.exec(text);
  return m ? sliceRichText([...runs], m[0].length, text.length) : [...runs];
}
const stripBulletText = (text: string) => text.replace(/^\s*[-–—•·●▪]\s*/, '');
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
  /** The entry whose EC table is being read (k-0480). */
  private ecFor: AnswerEntry | undefined;
  /** The entry whose last level descriptor is still being read (k-0480). */
  private levelFor: AnswerEntry | undefined;
  /** Inside "Comments on candidates' performance" (k-0480): every line is a comment. */
  private commenting = false;
  /** The last line with text was a key row (k-0480). */
  private keyRun = false;
  readonly comments: AnswerComment[] = [];
  private commentLine = -1;

  /** Each page's text width: where its full lines end (PDF and scans; k-0480). */
  private readonly pageRight = new Map<number, number>();

  constructor(readonly lines: readonly SourceLine[]) {
    this.uses = lines.map(() => 'unknown');
    const rights = new Map<number, number[]>();
    for (const line of lines) {
      if (line.right === undefined || line.page === undefined || line.text.length < 30) continue;
      rights.set(line.page, [...(rights.get(line.page) ?? []), line.right]);
    }
    for (const [page, list] of rights) {
      const sorted = [...list].sort((a, b) => a - b);
      this.pageRight.set(page, sorted[Math.floor(sorted.length * 0.8)]);
    }
  }

  /** The page knows where this line's text ends. */
  private measured(line: SourceLine | undefined): boolean {
    return line?.right !== undefined && line.page !== undefined && this.pageRight.has(line.page);
  }

  /** The line runs on to the text's right edge: its words carry on in the next line. */
  private full(line: SourceLine | undefined): boolean {
    const right = line?.page !== undefined ? this.pageRight.get(line.page) : undefined;
    return right !== undefined && line?.right !== undefined && line.right >= right - 14;
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

  /** The group new points and rules go to: the last one, when the entry has groups. */
  private groupIndex(entry: AnswerEntry): number | undefined {
    return entry.groups ? entry.groups.length - 1 : undefined;
  }

  /**
   * Give the entry groups: the points read so far (and the entry's own `n@`/`max`) become
   * an unheaded first group. Nothing changes when it has groups already.
   */
  private grouped(entry: AnswerEntry): SchemeGroup[] {
    if (entry.groups) return entry.groups;
    const first: SchemeGroup = { ...(entry.each !== undefined ? { each: entry.each } : {}), ...(entry.max !== undefined ? { max: entry.max } : {}) };
    delete entry.each;
    delete entry.max;
    for (const point of entry.points ?? []) point.group = 0;
    entry.groups = [first];
    return entry.groups;
  }

  /** A heading starts a group; the first group takes it while it is still empty and unheaded. */
  private startGroup(entry: AnswerEntry, heading: InlineRun[], line: number): void {
    const hadGroups = Boolean(entry.groups);
    const groups = this.grouped(entry);
    const last = groups[groups.length - 1];
    const empty = !(entry.points ?? []).some((p) => p.group === groups.length - 1);
    if (!last.heading && empty && (hadGroups || !entry.points?.length)) last.heading = heading;
    else groups.push({ heading });
    if (!entry.lines.includes(line)) entry.lines.push(line);
    this.levelFor = undefined;
    this.ecFor = undefined;
  }

  /** `n@`, `max`, take-first: onto the current group, or the entry while it has none. */
  private setRule(entry: AnswerEntry, rule: Partial<SchemeGroup>): void {
    if (rule.take !== undefined) this.grouped(entry);
    const target: SchemeGroup | AnswerEntry = entry.groups ? entry.groups[entry.groups.length - 1] : entry;
    if (rule.each !== undefined) target.each = rule.each;
    if (rule.max !== undefined) target.max = rule.max;
    if (rule.take !== undefined && entry.groups) Object.assign(target, { take: rule.take, firstOnly: true });
  }

  /**
   * HKEAA's structure lines (k-0480): a group heading, the EC table, the stated content
   * mark, level descriptors, "[Mark the FIRST n points only.]". True when the line was one.
   */
  private structure(entry: AnswerEntry, line: SourceLine, text: string): boolean {
    const content = CONTENT_MAX.exec(fold(text));
    if (content) {
      entry.contentMax = +(content[1] ?? content[2] ?? content[3]);
      this.ecFor = undefined;
      this.levelFor = undefined;
      entry.lines.push(line.i);
      return true;
    }
    if (EC_HEAD.test(text) && text.length < 120) {
      const max = EC_MAX.exec(fold(text));
      entry.ec = { max: max ? +max[1] : 2, rows: [] };
      this.ecFor = entry;
      this.levelFor = undefined;
      entry.lines.push(line.i);
      return true;
    }
    const take = firstOnlyRule(text);
    if (take !== null) {
      this.setRule(entry, { take });
      entry.lines.push(line.i);
      return true;
    }
    const level = LEVEL.exec(fold(text));
    if (level) {
      const n = level[1] ? +level[1] : countOf(level[2]);
      const runs = trim(sliceRichText(line.runs, Math.min(level[0].length, plain(line.runs).length), plain(line.runs).length));
      const levels = (entry.levels ??= []);
      levels.push({ min: +level[3], max: +level[4], runs });
      void n;
      this.levelFor = entry;
      this.ecFor = undefined;
      entry.lines.push(line.i);
      return true;
    }
    if (isSchemeHeading(text)) {
      this.startGroup(entry, trim(stripBullet(line.labelRuns ? [...line.labelRuns, ...line.runs] : line.runs)), line.i);
      return true;
    }
    return false;
  }

  /** A line of an EC table: "2 | statements…" starts a row; a line with no mark adds to the last. */
  private ecLine(entry: AnswerEntry, line: SourceLine): boolean {
    const ec = entry.ec!;
    const cells = line.cells ? line.cells.map((c) => plain(c).trim()) : [];
    // A bullet OCR read as "0" or "φ" glued to the statement ("0Present answers…").
    const whole = ((line.label ? `${line.label} ` : '') + (line.cells ? cells.join(' ') : line.text)).replace(/(^|\s)[0oφΦ●](?=[A-Z][a-z])/g, '$1');
    if (EC_HEADER.test(fold(whole).replace(/[\s|]+/g, ' ').trim().replace(/ /g, ''))) return true;
    if (EC_HEADER.test(fold(whole).replace(/[\s|]+/g, ''))) return true;
    const lead = /^\s*([0-3])(?:\s*(?:marks?|分))?(?:[\s.:：)]+|$)/i.exec(whole);
    if (lead) {
      const rest = whole.slice(lead[0].length).trim();
      ec.rows.push({ marks: +lead[1], runs: rest ? [{ text: stripBulletText(rest) }] : [] });
      entry.lines.push(line.i);
      return true;
    }
    const row = ec.rows[ec.rows.length - 1];
    if (!row) return false;
    // The next row's mark and first words glued onto this line's end ("…符號。 0 沒有以…").
    const glued = /^(.*[。.!?！？])\s+([0-3])\s+(\S.*)$/.exec(whole.trim());
    if (glued && +glued[2] < row.marks) {
      this.ecLine(entry, { ...line, cells: undefined, label: undefined, labelInfo: undefined, runs: [{ text: glued[1] }], text: glued[1] });
      ec.rows.push({ marks: +glued[2], runs: [{ text: stripBulletText(glued[3]) }] });
      return true;
    }
    const add = stripBulletText(whole.trim());
    const gap = !row.runs.length ? '' : BULLET.test(whole.trim()) || ENDS_SENTENCE.test(plain(row.runs)) ? '\n' : cjkJoin(plain(row.runs), add) ? '' : ' ';
    row.runs = normalizeRuns([...row.runs, ...(gap ? [{ text: gap }] : []), { text: add }]);
    entry.lines.push(line.i);
    return true;
  }

  /** One line of the comments on candidates' performance. */
  private commentOf(line: SourceLine): void {
    const runs = line.cells ? joinCells(line.cells) : trim(line.labelRuns ? [...line.labelRuns, ...line.runs] : line.runs);
    if (!runs.length) return;
    const last = this.comments[this.comments.length - 1];
    const starts = Boolean(line.labelInfo) || Boolean(headOf(line)) || !last || this.commentLine !== line.i - 1 || last.paper !== this.paper || BULLET.test(plain(runs));
    if (starts) this.comments.push({ ...(this.paper ? { paper: this.paper } : {}), runs, lines: [line.i] });
    else {
      const gap = cjkJoin(plain(last.runs), plain(runs)) ? '' : ' ';
      last.runs = normalizeRuns([...last.runs, { text: gap }, ...runs]);
      last.lines.push(line.i);
    }
    this.commentLine = line.i;
  }

  private addNote(entry: AnswerEntry, runs: InlineRun[], line: number): void {
    if (!runs.length) return;
    const notes = (entry.notes ??= []);
    notes.push({ runs, lines: [line] });
    if (!entry.lines.includes(line)) entry.lines.push(line);
  }

  /** A line's points onto the entry. The first joins the last point when the line only wraps it. */
  private addBody(entry: AnswerEntry, body: Body, line: SourceLine): void {
    if (body.rule) this.setRule(entry, body.rule);
    if (body.marks?.each !== undefined) this.setRule(entry, { each: body.marks.each });
    const points = (entry.points ??= []);
    const group = this.groupIndex(entry);
    body.segs.forEach((seg, k) => {
      const prev = points[points.length - 1];
      const after = k === 0 && prev && prev.group === group && this.lastPointLine === line.i - 1;
      const adjacent = after && prev.marks === undefined;
      const prevLine = prev ? this.lines[prev.lines[prev.lines.length - 1]] : undefined;
      const cells = Boolean(line.cells) && !body.single;
      const rows = adjacent && prevLine?.cells && cells && !this.lines[line.i]?.labelInfo;
      const segText = plain(seg.runs);
      // A dash list (HKEAA's points): a line with no dash of its own carries on the point above.
      const dashed = adjacent && !cells && prev.dashed && !BULLET.test(segText) && !line.labelInfo;
      // A line that ran to the right edge, or a sentence that carries on in lower case, wraps
      // into this one — also under a mark printed beside a paragraph's first line (k-0480).
      const open = after && !cells && !line.labelInfo && !ENDS_SENTENCE.test(plain(prev.runs)) && !(prev.marks !== undefined && seg.marks !== undefined);
      // Where the page says where lines end (PDF, scans), a short line ends its point even
      // when the next opens in lower case (a list whose dashes OCR lost).
      const carries = open && (this.measured(prevLine) ? this.full(prevLine) : /^[a-z]/.test(segText) || cjkJoin(plain(prev.runs), segText));
      const wrap = dashed || (open && carries);
      if (seg.runs.length && (rows || wrap)) {
        const gap = rows ? '\n' : cjkJoin(plain(prev.runs), segText) ? '' : ' ';
        prev.runs = normalizeRuns([...prev.runs, ...(gap ? [{ text: gap }] : []), ...seg.runs]);
        prev.lines.push(line.i);
        if (seg.marks !== undefined) prev.marks = seg.marks;
      } else if (seg.runs.length) {
        // "- point", or a dash set tight against Chinese ("-當過夜旅客…").
        const isDashed = /^[-–—•·●▪](?:\s|(?=[\u3400-\u9fff]))/.test(segText);
        // OCR reads a dash before English as 一: off, but OCR saw only some dashes, so no dash list.
        const misread = /^[一ー]\s*(?=[A-Za-z])/.exec(segText);
        const runs = isDashed ? trim(stripBullet(seg.runs)) : misread ? trim(sliceRichText(seg.runs, misread[0].length, segText.length)) : seg.runs;
        points.push({
          runs,
          ...(seg.marks !== undefined ? { marks: seg.marks } : {}),
          ...(group !== undefined ? { group } : {}),
          ...(isDashed ? { dashed: true } : {}),
          lines: [line.i],
        });
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
    else if (entry.points?.length) entry.points.push({ runs: [], marks, lines: [], ...(entry.groups ? { group: entry.groups.length - 1 } : {}) });
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
      const whole = matchKey(`${line.label ? `${line.label} ` : ''}${line.cells ? line.cells.map(plain).join(' ') : line.text}`).trim();
      if (COMMENTS_HEAD.test(whole)) {
        this.commenting = true;
        this.cur = undefined;
        this.ecFor = undefined;
        this.levelFor = undefined;
        mark('title');
        continue;
      }
      if (this.commenting) {
        const key = !line.labelInfo && text.length < 80 ? sectionKey(text) : undefined;
        if (key) {
          if (key.startsWith('P')) this.paper = key;
          this.commentLine = -1;
          mark('section');
        } else if (NOISE.some((re) => re.test(whole))) mark('noise');
        else if (COMMENT_HEADER.test(whole)) mark('title');
        else {
          this.commentOf(line);
          mark('comment');
        }
        continue;
      }
      const ecHead = this.ecFor ? headOf(line) : null;
      const ecRowMark = ecHead && ecHead.question !== undefined && ecHead.question <= 3 && !ecHead.part;
      if (this.ecFor && this.ecFor === this.cur && !CONTENT_MAX.test(fold(whole)) && (!ecHead || ecRowMark)) {
        if (this.ecLine(this.ecFor, line)) {
          mark('heading');
          continue;
        }
        this.ecFor = undefined;
      }
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
      const inRun =
        flat || sideways || !this.keyRun
          ? null
          : keyCells(line.cells ? line.cells.map((c, n) => (n === 0 && line.label ? `${line.label} ${plain(c)}` : plain(c))) : [full], { inRun: true });
      if (inRun) {
        if (inRun.length) this.keyPairs(inRun, line);
        mark('key');
        continue;
      }
      if (this.keyRun && KEY_NOTE.test(whole)) {
        mark('title');
        continue;
      }
      this.keyRun = false;
      if (flat || sideways) {
        this.keyRun = true;
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
      if (!this.noting && !lone && this.structure(cur, line, whole)) {
        mark(firstOnlyRule(whole) !== null ? 'rule' : 'heading');
        continue;
      }
      const rule = !line.labelInfo && !line.cells ? ruleOf(line.text) : null;
      if (rule) {
        this.setRule(cur, rule);
        cur.lines.push(line.i);
        mark('rule');
        continue;
      }
      if (this.levelFor === cur && cur.levels?.length && !this.noting) {
        const level = cur.levels[cur.levels.length - 1];
        const add = line.cells ? joinCells(line.cells) : trim(line.labelRuns ? [...line.labelRuns, ...line.runs] : line.runs);
        const gap = !level.runs.length ? '' : BULLET.test(plain(add)) ? '\n' : cjkJoin(plain(level.runs), plain(add)) ? '' : ' ';
        level.runs = normalizeRuns([...level.runs, ...(gap ? [{ text: gap }] : []), ...add]);
        cur.lines.push(line.i);
        mark('heading');
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
      if (pair.percent !== undefined) entry.percent = pair.percent;
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
    this.ecFor = undefined;
    this.levelFor = undefined;
    const entry = this.open(question, line.i, at);
    this.cur = entry;
    this.curDepth = line.depth;
    this.lastKind = 'scheme';
    // "11. (a) Possible reasons:", "12. (e) Marks for effective communication (EC: max 2
    // marks)": the label line carries the first group's heading, or EC (k-0480).
    if (body.segs.length === 1 && body.segs[0].marks === undefined && !body.note) {
      const runs = body.segs[0].runs;
      if (this.structure(entry, { ...line, runs, labelRuns: undefined }, plain(runs))) {
        if (body.marks?.marks !== undefined) entry.marks = body.marks.marks;
        if (body.rule) this.setRule(entry, body.rule);
        return true;
      }
    }
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
    for (const e of this.entries) settleGroups(e);
    for (let k = this.entries.length - 1; k >= 0; k--) {
      const e = this.entries[k];
      if (e.points && !e.points.length) delete e.points;
      const shaped = e.groups?.some((g) => g.heading) || e.ec || e.contentMax !== undefined || e.levels?.length;
      if (e.letter === undefined && !e.points && !e.notes && e.marks === undefined && !shaped) this.entries.splice(k, 1);
    }
    for (const e of this.entries) {
      if (e.points) e.runs = normalizeRuns(e.points.flatMap((p, k) => (k ? [{ text: '\n' }, ...p.runs] : p.runs)));
      if (e.marks === undefined) {
        const total = entryTotal(e);
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

/**
 * The groups as read, settled (k-0480): one unheaded group with no take-first rule is
 * the entry itself again (its `n@`/`max` back on the entry, as before groups existed);
 * a headed group with no points stays, since the heading is text the scheme prints. An
 * entry with one point spanning sentences and its mark is HKEAA's paragraph style.
 */
function settleGroups(e: AnswerEntry): void {
  for (const point of e.points ?? []) delete point.dashed;
  if (e.ec && !e.ec.rows.length) delete e.ec;
  e.levels?.sort((a, b) => a.min - b.min);
  if (e.groups) {
    const [only] = e.groups;
    if (e.groups.length === 1 && !only.heading && only.take === undefined) {
      if (only.each !== undefined) e.each = only.each;
      if (only.max !== undefined) e.max = only.max;
      delete e.groups;
      for (const point of e.points ?? []) delete point.group;
    }
  }
  const [point, ...more] = e.points ?? [];
  if (!e.groups && point && !more.length && (point.marks ?? 0) >= 2 && sentences(plain(point.runs)) >= 2) e.paragraph = true;
}

/** Sentences in a point: full stops followed by more words. */
const sentences = (text: string) => (text.trim().match(/[.?!。？！](?=\s|$|[\u3400-\u9fff])/g) ?? []).length;

/** What the sheet's scheme for an entry adds up to: content (stated, levels or points) plus EC. */
function entryTotal(e: AnswerEntry): number {
  const ec = e.ec?.max ?? 0;
  if (e.contentMax !== undefined) return e.contentMax + ec;
  if (e.levels?.length) return Math.max(...e.levels.map((l) => l.max)) + ec;
  const points = e.points ?? [];
  const groups: SchemeGroup[] = e.groups ?? [{ ...(e.each !== undefined ? { each: e.each } : {}), ...(e.max !== undefined ? { max: e.max } : {}) }];
  let total = 0;
  groups.forEach((g, k) => {
    const marks = points.filter((p) => (e.groups ? p.group === k : true)).map((p) => g.each ?? p.marks ?? 0);
    const counted = g.take !== undefined ? (g.firstOnly ? marks.slice(0, g.take) : [...marks].sort((a, b) => b - a).slice(0, g.take)) : marks;
    const sum = counted.reduce((n, m) => n + m, 0);
    total += g.max !== undefined ? Math.min(sum, g.max) : sum;
  });
  return total + ec;
}

/** Read an answer file: keys and schemes as entries, every line accounted for. */
export function readAnswerSheet(read: ReadPaste & { pages?: number }): AnswerSheet {
  const reader = new Reader(read.lines);
  reader.read();
  const { entries, sections, uses, comments } = reader;
  const keys = entries.some((e) => e.letter !== undefined);
  const schemes = entries.some((e) => e.letter === undefined && e.points?.length);
  const kind: AnswerSheet['kind'] =
    pasteKind(read.lines, read.source) === 'scan' ? 'scan' : !entries.length ? 'empty' : keys && schemes ? 'mixed' : keys ? 'key' : 'scheme';
  const unknown = read.lines.flatMap((l) => (uses[l.i] === 'unknown' && (l.raw.trim() || l.image || l.cells) ? [l.i] : []));
  return {
    kind,
    ...(read.pages !== undefined ? { pages: read.pages } : {}),
    lines: read.lines,
    entries,
    sections,
    uses,
    unknown,
    ...(comments.length ? { comments } : {}),
  };
}
