/**
 * Paste-to-structure (D1): the engine's shapes. Design: `docs/design/paste-import.md`.
 * Everything here is pure data; nothing is stored in a document.
 */
import type { Side } from '@/model/textSlots';
import type { InlineRun } from '@/model/types';

/** What one pasted line is, after the solver. */
export type Role =
  | 'heading' // section heading or instructions; not imported as a question
  | 'question'
  | 'stem' // continuation text of whatever is open
  | 'statement' // the (1)(2)(3) items of a combination MC
  | 'option'
  | 'part'
  | 'subpart'
  | 'marks'
  | 'answerSpace'
  | 'table'
  | 'source' // "Source A: …" panel, or a shared stem ("… Questions 8 and 9")
  | 'answerKey'
  | 'noise' // running header/footer, page number, margin boilerplate
  | 'ignore'; // blank

/** Label shapes. Each family is one numbering style; the solver gives each a level. */
export type Family =
  | 'n.' // 1.  1．  1、  1:  1⇥
  | 'n)'
  | '(n)'
  | 'Qn' // Q1, Question 1
  | '第n題'
  | '(a)'
  | 'a)'
  | 'a.'
  | '(i)'
  | 'i)'
  | 'i.'
  | 'A.' // A.  A⇥
  | 'A)'
  | '(A)'
  | '(一)'
  | '一、'
  | 'bullet';

export type Level = 'question' | 'part' | 'subpart' | 'option' | 'statement' | 'text';

export interface LabelInfo {
  family: Family;
  value: number;
  /** The other reading of `(i)`, `(v)`, `(x)`: letter 9/22/24 against roman 1/5/10. */
  alt?: { family: Family; value: number };
}

export interface ImageRef {
  src: string;
  widthPx?: number;
  heightPx?: number;
  /** The stored bytes' own size (`ImageBlock.naturalWidthPx`), when it differs from the display size. */
  naturalWidthPx?: number;
  naturalHeightPx?: number;
  alt?: string;
}

/** One line of the paste, whatever its source. Roles, pins and flags refer to `i`. */
export interface SourceLine {
  i: number;
  /** The body: label and trailing marks removed, formatting kept. */
  runs: InlineRun[];
  /** `runs` as plain text, trimmed. */
  text: string;
  /** The whole line as pasted, for display. */
  raw: string;
  label?: string;
  /** The label as runs plus its separator, to restore when the label is not structural. */
  labelRuns?: InlineRun[];
  labelInfo?: LabelInfo;
  labelSource?: 'text' | 'list';
  depth: number;
  cells?: InlineRun[][];
  tabOnly?: boolean;
  blank?: boolean;
  trailingMarks?: number;
  marksStyle?: MarksStyle;
  /** Two marks on one line ("(4 marks)⇥(3 marks)"): the extra one, kept for the flag. */
  extraMarks?: number;
  /** Detached labels ("A. B. C. D." or "(1) (2) (3)") that precede `runs`. */
  clump?: { family: Family; values: number[] };
  /** Answer formatting on the whole body: bold, highlight, colour, or a `*`. */
  emphasis?: 'bold' | 'highlight' | 'color' | 'star';
  /** A form feed (page break) came before this line. */
  pageBreak?: boolean;
  page?: number;
  x?: number;
  y?: number;
  image?: ImageRef;
}

export interface LineRole {
  role: Role;
  /** 0–1: how sure the rules are. The review screen surfaces the low ones. */
  confidence: number;
  pinned?: boolean;
  /** Index into `Outline.questions` of the question this line ended up in. */
  question?: number;
}

/** A teacher's fix. The solver re-runs with it; a role pin on a labelled line spreads to its family. */
export type Pin =
  | { kind: 'role'; line: number; role: Role }
  | { kind: 'newQuestion'; line: number }
  | { kind: 'join'; line: number }
  /** `line`: any line of the question. */
  | { kind: 'language'; line: number; side: Side }
  /** `line`: any line of the question; `index`: 0 = A. `from: 'sheet'`: set by `matchAnswers`. */
  | { kind: 'answer'; line: number; index: number; from?: 'sheet' }
  /**
   * A marking scheme or answer from an answer file (`matchAnswers`). `line`: any line of the
   * question; `part`/`subPart`: 0-based positions in it, absent for the question itself.
   * A written leaf gets `scheme` when any point has marks (or `each`/`max`), else `answer`;
   * an MC gets the text as its `explanation`. `notes`: a marker's notes, printed after the points.
   */
  | { kind: 'scheme'; line: number; part?: number; subPart?: number; points: SchemePoint[]; notes?: InlineRun[][]; each?: number; max?: number }
  /**
   * A picture the teacher added, placed right after `line`'s content in the question that
   * owns it (an option line: under that option). `id` tells two pictures on one line apart.
   */
  | { kind: 'image'; id: string; line: number; image: ImageRef }
  /** The figure slot at `line` needs no picture. */
  | { kind: 'noPicture'; line: number };

/** One marking point, verbatim: a line of the answer file with its own mark. */
export interface SchemePoint {
  runs: InlineRun[];
  marks?: number;
}

/** What a `scheme` pin put on a question, part or sub-part. */
export interface OutScheme {
  points: SchemePoint[];
  notes?: InlineRun[][];
  each?: number;
  max?: number;
}

export type MarksStyle = '(n marks)' | '[n]' | '（n分）';

/** The layout the solver inferred (or was given): small, explicit, and what a profile remembers. */
export interface LayoutProfile {
  question: Family[];
  part: Family[];
  subpart: Family[];
  option: Family[];
  statement: Family[];
  marks: MarksStyle[];
  /** Normalised line texts that are running headers/footers. */
  noise: string[];
  /** `paragraph`: one line per paragraph (Word). `visual`: one line per printed line (PDF). */
  lineMode: 'paragraph' | 'visual';
}

export type OutBlock =
  | { kind: 'paragraph'; lines: number[]; runs: InlineRun[] }
  | { kind: 'table'; lines: number[]; rows: InlineRun[][][] }
  | { kind: 'source'; lines: number[]; label: InlineRun[]; blocks: OutBlock[] }
  /**
   * `pin`: placed by an image pin (its id). `missing`: a figure slot, a picture lost in the
   * paste or one a caption refers to; it is never inserted (`buildImport`'s `preview` shows it).
   */
  | { kind: 'image'; lines: number[]; image: ImageRef; pin?: string; missing?: true };

export interface OutText {
  lines: number[];
  runs: InlineRun[];
  emphasis?: SourceLine['emphasis'];
  /** Pictures under an option (`McqOption.blocks`). */
  blocks?: OutBlock[];
}

export interface OutSubPart {
  start: number;
  label?: string;
  blocks: OutBlock[];
  marks?: number;
  answerSpace?: number;
  /** From an answer file (`scheme` pin). */
  scheme?: OutScheme;
}

export interface OutPart extends OutSubPart {
  /** Context printed above the part's label (`QuestionPart.blocksBefore`). */
  before: OutBlock[];
  subParts: OutSubPart[];
}

export interface OutQuestion {
  /** The line that opened it. */
  start: number;
  label?: string;
  number?: number;
  /** `written`: answered in words (parts, or one essay); `mc`: options. */
  kind: 'mc' | 'written';
  stem: OutBlock[];
  statements: OutText[];
  options: OutText[];
  parts: OutPart[];
  marks?: number;
  answerSpace?: number;
  answer?: { index: number; from: 'key' | 'format' | 'inline' | 'pin' | 'sheet' };
  /** From an answer file (`scheme` pin): a written question's own scheme, or an MC's explanation. */
  scheme?: OutScheme;
  side: Side;
}

/** A shared stem ("Study … and answer Questions 8 and 9") before question `before`. */
export interface OutStimulus {
  start: number;
  before: number;
  span: number;
  blocks: OutBlock[];
}

export interface Outline {
  questions: OutQuestion[];
  stimuli: OutStimulus[];
  /** Heading and instruction lines, in order. Not imported. */
  headings: number[];
  /** Question number → option index, from an answer key list. */
  answerKey: Record<number, number>;
}

export type FlagKind =
  | 'sequenceBreak' // a skipped or out-of-run number
  | 'numberRestart' // numbering restarted with no heading
  | 'optionCount' // an MC without 4 options (detail: the count)
  | 'statementCount' // detached statement labels and texts did not pair
  | 'noAnswer'
  | 'marksMoved' // marks re-attached away from where they sat
  | 'duplicateMarks'
  | 'unknownLine' // text with no clear role, kept in the stem
  | 'imageLost' // an image whose data the paste did not carry
  | 'figureMissing' // a caption ("Figure 1", 圖一) or reference ("the diagram below") with no picture
  | 'figureAsked' // an MC that asks "which diagram…" (哪一個圖) or names pictures as options, with none
  | 'optionsByOrder' // detached letters, options paired by order
  | 'textAfterOptions'
  | 'sharedStemFolded' // a shared stem kept in its first question (one lead per insert)
  | 'unlabelledStart' // content before the first number became a question
  | 'mixedContent'; // options and parts in one question, or text moved into the stem

export interface Flag {
  kind: FlagKind;
  line: number;
  question?: number;
  detail?: number;
}

export interface PasteInput {
  plain?: string;
  html?: string;
}

export interface AnalyseOptions {
  pins?: readonly Pin[];
  profile?: LayoutProfile;
  /** Force every question's side; default `auto` (by CJK share per question). */
  language?: Side | 'auto';
}

export interface Analysis {
  /** `scan`: an image-only paste or OCR-damaged text; the outline is a best effort. */
  kind: 'ok' | 'empty' | 'scan';
  /** `ocr`: text this app recognised on scanned pages (never called a scan; the dialog warns). */
  source: 'plain' | 'html' | 'docx' | 'pdf' | 'ocr';
  lines: SourceLine[];
  /** Index-aligned with `lines`. */
  roles: LineRole[];
  outline: Outline;
  flags: Flag[];
  profile: LayoutProfile;
}
