/**
 * Page chrome: a file's running header and footer, page 1's own variants, and the
 * masthead (the heading block above the first question). The readers find the pieces
 * (`docxChrome.ts`, `pdfLayout.ts`); this module says what a piece of text is and which
 * leading lines are a masthead, and `chromePlan.ts` maps the result onto the model.
 * Pure: no DOM, no store. Design: `docs/design/paste-import.md` § 12.
 */
import { labelLevel, parseLabel } from './labels';
import { labelZone } from './normalize';

export type ChromeZone = 'left' | 'center' | 'right';
export const CHROME_ZONES: readonly ChromeZone[] = ['left', 'center', 'right'];

/** How a piece printed; `size` in points, only when it differs from the body text. */
export interface ChromeStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  size?: number;
}

/** One printed piece of a row: the band fields the model has. */
export type ChromePiece = ChromeStyle &
  (
    | { kind: 'text'; text: string }
    | { kind: 'pageNumber'; pattern: 'plain' | 'pDot' | 'longForm'; prefix: string; suffix: string }
    | { kind: 'fillIn'; prefix: string; suffix: string; widthCh: number }
    | { kind: 'totalMarks'; prefix: string; suffix: string; marks: number }
  );

export interface ChromeRow {
  left: ChromePiece[];
  center: ChromePiece[];
  right: ChromePiece[];
  /** A rule under the row (masthead). */
  rule?: boolean;
}

/** A header or footer: its rows top to bottom. `rows: []` is a blank edge (page 1 left empty). */
export interface DetectedChrome {
  rows: ChromeRow[];
  rule?: boolean;
}

export type ChromeWhere = 'header' | 'footer' | 'masthead';

/** Why a part could not be reproduced; the dialog words it. */
export type ChromeReason =
  | 'picture' // a logo, picture or drawing
  | 'table' // laid out as a table
  | 'textBox'
  | 'tooMany' // more than three pieces on one line
  | 'evenPages' // a different header on even pages
  | 'otherSection' // a section with its own header (a cover page)
  | 'pageCount' // "1 / 6": the page count has no place in a page number field
  | 'marksDiffer' // the stated full marks differ from the questions' total
  | 'noCoverPlace' // masthead text the cover has no field for
  | 'noHeader'; // the Paper 2 booklet prints no running header

export interface ChromeLeftover {
  where: ChromeWhere;
  /** The text to copy, pieces on one line separated by tabs, rows by newlines. */
  text: string;
  reason: ChromeReason;
  /** `marksDiffer`: what the file says and what the questions add up to. */
  marks?: { stated: number; counted: number };
}

export interface PageChrome {
  header?: DetectedChrome;
  footer?: DetectedChrome;
  /** Page 1's own header (Word's first-page header). `rows: []`: none on page 1. */
  firstPageHeader?: DetectedChrome;
  firstPageFooter?: DetectedChrome;
  /** The heading block before the first question, its lines taken out of the review. */
  masthead?: ChromeRow[];
  unsupported: ChromeLeftover[];
}

/** A page number field as a reader marks it inside text: Word's PAGE and NUMPAGES. */
export const PAGE_MARK = '';
export const PAGES_MARK = '';

export const emptyRow = (): ChromeRow => ({ left: [], center: [], right: [] });
export const rowIsEmpty = (row: ChromeRow) => CHROME_ZONES.every((z) => row[z].length === 0);
export const hasChrome = (chrome: PageChrome | undefined): chrome is PageChrome =>
  !!chrome && !!(chrome.header || chrome.footer || chrome.firstPageHeader || chrome.firstPageFooter || chrome.masthead?.length || chrome.unsupported.length);

// ---- text of pieces and rows ----

/** A piece as text: the page number as `#`, the page count as `N`, a fill-in's rule as underscores. */
export function pieceText(piece: ChromePiece): string {
  switch (piece.kind) {
    case 'text':
      return piece.text;
    case 'pageNumber':
      return `${piece.prefix}${piece.pattern === 'pDot' ? 'P.#' : piece.pattern === 'longForm' ? 'Page # of N' : '#'}${piece.suffix}`;
    case 'fillIn':
      return `${piece.prefix}${'_'.repeat(piece.widthCh)}${piece.suffix}`;
    case 'totalMarks':
      return `${piece.prefix}${piece.marks}${piece.suffix}`;
  }
}

/** A row as one line of text, zones separated by tabs. */
export function rowText(row: ChromeRow): string {
  return CHROME_ZONES.map((z) => row[z].map(pieceText).join(' ').trim())
    .filter(Boolean)
    .join('\t');
}

const unmark = (text: string) => text.replaceAll(PAGE_MARK, '#').replaceAll(PAGES_MARK, 'N');

// ---- what a piece of text is ----

/** A blank to write in: underscores, dot leaders, full-width low lines. */
const BLANK_SOURCE = '_{3,}|＿{2,}|\\.{5,}|…{2,}|‥{2,}|·{5,}';
const BLANK = new RegExp(BLANK_SOURCE);
const BLANKS = new RegExp(BLANK_SOURCE, 'g');
/** Labels that are a fill-in even with no blank after them (the rule was a drawn line). */
const FILL_LABEL = /^(name|student'?s? name|class|class no\.?|no\.|number|date|group|姓名|班別|班級|學號|座號|日期|組別)\s*[:：]?$/i;
const MARKS_LINE = /^(.*?(?:full marks|total marks|total|maximum marks|marks|滿分|總分|全卷)\s*[:：]?\s*)(\d{1,3})(\s*(?:marks?|分)?\s*[.。]?\s*)$/i;

/**
 * One positioned piece of text (a tab stop's worth, or a PDF word group) as fields:
 * a page number, a total marks line, fill-in blanks with their labels, or plain text.
 */
export function classifyText(raw: string, style: ChromeStyle = {}): { pieces: ChromePiece[]; pageCount?: string } {
  const text = raw.replace(/\s+/g, (s) => (s.includes('\n') ? ' ' : s)).trim();
  if (!text) return { pieces: [] };
  const styled = (p: object) => ({ ...p, ...style }) as unknown as ChromePiece;

  if (text.includes(PAGE_MARK)) {
    const long = new RegExp(`^(.*?)Page\\s*${PAGE_MARK}\\s*of\\s*${PAGES_MARK}(.*)$`, 'i').exec(text);
    if (long) return { pieces: [styled({ kind: 'pageNumber', pattern: 'longForm', prefix: long[1], suffix: long[2] })] };
    const dot = new RegExp(`^(.*?)P\\.\\s*${PAGE_MARK}(.*)$`).exec(text);
    const at = text.indexOf(PAGE_MARK);
    const prefix = dot ? dot[1] : text.slice(0, at);
    let suffix = dot ? dot[2] : text.slice(at + 1);
    let pageCount: string | undefined;
    if (suffix.includes(PAGES_MARK)) {
      // "1 / 6", "第1頁，共6頁": the count has no place in the field; say so, keep the number.
      pageCount = unmark(text);
      suffix = suffix.replace(new RegExp(`\\s*(?:of|/|／|，?\\s*共)?\\s*${PAGES_MARK}\\s*(?:頁)?`), '');
    }
    const others = (s: string) => s.replaceAll(PAGE_MARK, '').replaceAll(PAGES_MARK, '');
    return {
      pieces: [styled({ kind: 'pageNumber', pattern: dot ? 'pDot' : 'plain', prefix: others(prefix), suffix: others(suffix) })],
      ...(pageCount ? { pageCount } : {}),
    };
  }

  const marks = MARKS_LINE.exec(text);
  if (marks && !BLANK.test(text)) return { pieces: [styled({ kind: 'totalMarks', prefix: marks[1], marks: +marks[2], suffix: marks[3] })] };

  const pieces: ChromePiece[] = [];
  let from = 0;
  for (const m of text.matchAll(BLANKS)) {
    const label = text.slice(from, m.index);
    const width = Math.max(4, Math.min(40, [...m[0]].length));
    // Text before the label belongs to a field of its own ("Assessment 1 Name:") only when it is not a label.
    const split = /^(.*?\S)\s{2,}(\S[^]*)$/.exec(label.trim());
    if (split && !FILL_LABEL.test(split[1].trim())) {
      pieces.push(styled({ kind: 'text', text: split[1] }));
      pieces.push(styled({ kind: 'fillIn', prefix: split[2].trim(), suffix: '', widthCh: width }));
    } else pieces.push(styled({ kind: 'fillIn', prefix: label.trim(), suffix: '', widthCh: width }));
    from = m.index + m[0].length;
  }
  const rest = text.slice(from).trim();
  if (pieces.length) {
    const last = pieces[pieces.length - 1];
    // "( )" after a blank is the class-number box: it rides on the field.
    if (rest && /^[(（][\s　]*[)）]$/.test(rest) && last.kind === 'fillIn') last.suffix = ` ${rest}`;
    else if (rest) pieces.push(...restPieces(rest, styled));
    return { pieces };
  }
  return { pieces: restPieces(text, styled) };
}

/** Text with no blank: a bare fill-in label, or labels set apart by wide gaps, else one text. */
function restPieces(text: string, styled: (p: object) => ChromePiece): ChromePiece[] {
  const parts = text.split(/\s{3,}|　{2,}/).filter((p) => p.trim());
  if (parts.length > 1 && parts.every((p) => FILL_LABEL.test(p.trim()))) {
    return parts.map((p) => styled({ kind: 'fillIn', prefix: p.trim(), suffix: '', widthCh: 14 }));
  }
  if (FILL_LABEL.test(text.trim())) return [styled({ kind: 'fillIn', prefix: text.trim(), suffix: '', widthCh: 14 })];
  return [styled({ kind: 'text', text })];
}

// ---- positioned segments → a row ----

export interface Segment {
  text: string;
  zone: ChromeZone;
  style?: ChromeStyle;
}

/**
 * Segments (each already given a zone) as a row. Several in one zone stay in order.
 * More than three non-empty segments cannot be told apart by position: `tooMany`.
 */
export function rowOf(segments: readonly Segment[]): { row: ChromeRow; pageCount?: string } | { tooMany: string } {
  const inked = segments.filter((s) => s.text.trim());
  if (inked.length > 3) return { tooMany: unmark(inked.map((s) => s.text.trim()).join('\t')) };
  const row = emptyRow();
  let pageCount: string | undefined;
  for (const s of inked) {
    const got = classifyText(s.text, s.style);
    row[s.zone].push(...got.pieces);
    pageCount ??= got.pageCount;
  }
  return { row, ...(pageCount ? { pageCount } : {}) };
}

/** Zone of a tab stop or a piece at `at` (0–1 across the text column). */
export const zoneAt = (at: number): ChromeZone => (at < 1 / 3 ? 'left' : at < 2 / 3 ? 'center' : 'right');

// ---- the masthead ----

const SECTION = /^\s*(section|part)\s+([A-D]|[1-4]|I{1,3}|IV)\b|^\s*[甲乙丙丁]部/i;
const INSTRUCTIONS = /^\s*(general\s+)?(instructions?|notes? to candidates|answer\s+(all|any|the following|each)|read (the|each|all)|there (are|is) \d|this (paper|question paper|section)|attempt (all|any)|write your answers|考生須知|試卷須知|作答須知|注意事項|答題須知|本試卷|全部題目|回答全部|作答全部)/i;
const MARKS_OR_TIME = /^\s*((full|total|maximum)\s+marks|marks\s*[:：]|time(\s+allowed)?\s*[:：]|duration|date\s*[:：]|總分|滿分|全卷|時間|限時|考試時間|日期)|\b\d+\s*(hours?|minutes?|mins?)\b|(小時|分鐘)/i;
const TITLEISH = /exam|examination|test|assessment|quiz|paper|worksheet|exercise|mock|term|school|college|academy|secondary|class|form\s*\d|S\.?\s*[1-6]\b|economics|測驗|考試|試卷|工作紙|練習|模擬|學校|書院|中學|學院|經濟|中[一二三四五六]|年度/i;

const PROSE = /[.?？。:：;；]$|^(?:(?:study|read|refer|answer|consider|look|use|explain|describe|the following|below)\b|以下|閱讀|參考|細閱|根據)/i;

/** What the reader knows about a line beyond its text. */
export interface MastheadHints {
  centred?: boolean;
  bold?: boolean;
  /** Larger than the body text. */
  large?: boolean;
  /** A table row: its cell count. */
  cells?: number;
  /** A picture line. */
  image?: boolean;
}

export type MastheadVerdict = 'masthead' | 'skip' | 'stop';

/**
 * Is this leading line part of the masthead? `skip` for a blank line; `stop` at the first
 * question, section heading, instructions, long prose, picture, or text that does not
 * look like a heading, a blank to fill or a marks/time line.
 */
export function mastheadVerdict(text: string, hints: MastheadHints = {}): MastheadVerdict {
  const t = text.replace(/\s+/g, ' ').trim();
  if (hints.image) return 'stop';
  if (!t) return 'skip';
  if (t.length > 100) return 'stop';
  const label = parseLabel(labelZone(`${t} `));
  if (label && labelLevel(label.family) !== 'text') return 'stop';
  if (SECTION.test(t) || INSTRUCTIONS.test(t)) return 'stop';
  if ((hints.cells ?? 0) > 4) return 'stop';
  if (BLANK.test(t) || FILL_LABEL.test(t) || text.trim().split(/\s{3,}|\t|　{2,}/).every((p) => FILL_LABEL.test(p.trim()))) return 'masthead';
  if (MARKS_OR_TIME.test(t) && t.length <= 70) return 'masthead';
  // A sentence or an instruction to the reader ("Study the table below.") is content.
  if (PROSE.test(t)) return 'stop';
  if (t.length <= 80 && (hints.centred || hints.bold || hints.large || TITLEISH.test(t))) return 'masthead';
  return 'stop';
}

/** At most this many lines: a longer run of short lines is the paper's content, not its heading. */
export const MASTHEAD_MAX = 8;

/** How many leading lines (blank ones included) the masthead takes: the run of `masthead` verdicts. */
export function mastheadSpan(verdicts: readonly MastheadVerdict[]): number {
  let taken = 0;
  let end = 0;
  for (let k = 0; k < verdicts.length; k++) {
    const v = verdicts[k];
    if (v === 'stop') break;
    if (v === 'masthead') {
      if (++taken > MASTHEAD_MAX) break;
      end = k + 1;
    }
  }
  return end;
}
