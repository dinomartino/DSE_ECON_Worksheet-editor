import { resolveFlow } from './flow';
// Type-only, so no runtime cycle can form through the shape module's own imports.
import type { DocumentShape } from './documentShape';
import type { Question, Worksheet } from './types';

/**
 * Derived numbering (§4). Numbers are never stored in the document; this module is
 * the single source of truth for both the preview and the exporters, so the two can
 * never disagree.
 */

/**
 * List geometry, in twips. **Each level's marker starts where its parent's text
 * starts** (`left - hanging` equals the level above's `left`). Lives in `model/`
 * because its three consumers (docx numbering, Preview.tsx, registry/structured) may
 * not import each other; one stale copy = page breaks in different places on screen
 * vs paper.
 */
export interface ListLevelIndent {
  /** Where the text column sits. */
  left: number;
  /** How far the marker alone is pulled back into the margin. */
  hanging: number;
}

export const QUESTION_LIST_INDENTS: readonly ListLevelIndent[] = [
  { left: 360, hanging: 360 },
  { left: 720, hanging: 360 },
  // A 360-twip hang is too narrow for three-character romans: "(iii)" collides with the
  // text. 450 leaves room up to "(viii)" while still starting the marker at 720.
  { left: 1170, hanging: 450 },
];

/** MCQ options are one flat level, indented under the stem. */
export const OPTION_LIST_INDENT: ListLevelIndent = { left: 1080, hanging: 360 };

/**
 * Statements start *at* the stem's own text column, not indented under it.
 *
 * The reference paper prints "(1)" flush under the first word of the stem — the same
 * column the question text runs in — and reserves the deeper indent for the A–D options
 * alone. That difference is what makes the two lists read as different things: the
 * statements are part of the question being asked, the options are the answers to it.
 * Sharing the option indent stacked them in one block with nothing but the marker shape
 * to tell them apart.
 *
 * So the marker hangs back into the question-number gutter at 360, exactly where the
 * stem's text begins, with the statement text a step further in at 720 — the same
 * marker-starts-where-its-parent's-text-starts rule the question levels follow.
 */
export const STATEMENT_LIST_INDENT: ListLevelIndent = { left: 720, hanging: 360 };

/**
 * Where a part's or sub-part's *continuation* paragraphs sit.
 *
 * A second paragraph inside part (a) carries no marker, so it is indented directly to
 * the same text column its first paragraph uses — `left` at that level.
 */
export const PART_TEXT_INDENT = QUESTION_LIST_INDENTS[1].left;
export const SUBPART_TEXT_INDENT = QUESTION_LIST_INDENTS[2].left;
/**
 * The stem's own continuation column. A second stem paragraph — the block after a
 * table, the sentence that carries the marks — has no `1.` marker, so without this it
 * fell back to the page margin and printed hanging in the question number's gutter,
 * out of line with every other line of the question it belongs to.
 */
export const STEM_TEXT_INDENT = QUESTION_LIST_INDENTS[0].left;

/**
 * One document's whole list geometry, so a paper can carry its own. The default
 * scheme is the constants above; the exam paper's is measured off the teacher's own
 * reference (`real_life_reference/hkdse_paper1_layout_1.docx`). Chosen by
 * `listIndentScheme(shape)` — derived from the document, never stored.
 */
export interface ListIndentScheme {
  question: readonly ListLevelIndent[];
  option: ListLevelIndent;
  statement: ListLevelIndent;
  /** Continuation columns: stem / part / sub-part paragraphs carrying no marker. */
  stemText: number;
  partText: number;
  subPartText: number;
}

export const DEFAULT_LIST_INDENTS: ListIndentScheme = {
  question: QUESTION_LIST_INDENTS,
  option: OPTION_LIST_INDENT,
  statement: STATEMENT_LIST_INDENT,
  stemText: STEM_TEXT_INDENT,
  partText: PART_TEXT_INDENT,
  subPartText: SUBPART_TEXT_INDENT,
};

/**
 * The MCQ paper's geometry, measured off the reference document **as Word lays it
 * out**, not as its XML spells it. The reference writes statements as literal "(1)" +
 * tab over `{left: 660, hanging: 180}` — but "(1)" is wider than the 180 hang, so the
 * tab overshoots the 660 stop and lands on the next default stop at **960**; its stem
 * continuation carries a leading tab to **480**. Copying the stored numbers reproduced
 * the overshoot as a marker overprinting the text. So this scheme states the rendered
 * columns: question `1.` at 0/480, statement `(1)` at 480/960 (a 480 hang "(1)" fits
 * inside, so native numbering's tab lands exactly on `left`), option `A.` at 964/1423.
 */
export const PAPER1_LIST_INDENTS: ListIndentScheme = {
  question: [{ left: 480, hanging: 480 }, QUESTION_LIST_INDENTS[1], QUESTION_LIST_INDENTS[2]],
  option: { left: 1423, hanging: 459 },
  statement: { left: 960, hanging: 480 },
  stemText: 480,
  partText: PART_TEXT_INDENT,
  subPartText: SUBPART_TEXT_INDENT,
};

/** Which scheme a document renders with. Keyed on shape, so it is never stored. */
export function listIndentScheme(shape: DocumentShape): ListIndentScheme {
  return shape === 'paper1' ? PAPER1_LIST_INDENTS : DEFAULT_LIST_INDENTS;
}

export interface NumberedQuestion {
  question: Question;
  /**
   * The `section` element this question falls under, or undefined before the first one.
   *
   * A question is not *contained* by a section — it simply follows a marker in the flow
   * — so this is derived by the same walk that assigns the number, and is what the
   * exporter keys its Word list stream on.
   */
  sectionId?: string;
  /** Display number, honouring per-section restart (1-based). */
  number: number;
}

export interface NumberingPlan {
  questions: NumberedQuestion[];
  byQuestionId: Map<string, NumberedQuestion>;
}

/**
 * Walk the document flow and assign question numbers.
 *
 * Numbering runs continuously until a `section` element that sets `restartNumbering`,
 * which resets the counter from that point on. Walking the *flow* rather than a nested
 * section list is what makes the restart happen where the heading actually sits: drag a
 * section marker above question 3 and the questions after it renumber, with no container
 * to move anything between.
 */
export function computeNumbering(worksheet: Worksheet): NumberingPlan {
  const questions: NumberedQuestion[] = [];
  let counter = 0;
  let sectionId: string | undefined;

  for (const item of resolveFlow(worksheet)) {
    if (item.type === 'layout') {
      if (item.element.kind !== 'section') continue;
      sectionId = item.element.id;
      if (item.element.restartNumbering) counter = 0;
      continue;
    }
    counter += 1;
    questions.push({ question: item.question, sectionId, number: counter });
  }

  const byQuestionId = new Map(questions.map((entry) => [entry.question.id, entry]));
  return { questions, byQuestionId };
}

const ROMAN: Array<[number, string]> = [
  [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'],
  [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'],
  [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
];

/** 1 -> "i", 2 -> "ii", 4 -> "iv" (sub-part labels). */
export function toLowerRoman(value: number): string {
  let remaining = value;
  let out = '';
  for (const [amount, numeral] of ROMAN) {
    while (remaining >= amount) {
      out += numeral;
      remaining -= amount;
    }
  }
  return out;
}

/** 0 -> "a", 25 -> "z", 26 -> "aa" (part labels, 0-based index). */
export function toLowerLetter(index: number): string {
  let out = '';
  let n = index;
  do {
    out = String.fromCharCode(97 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/** 0 -> "A" (MCQ option labels, 0-based index). */
export function toUpperLetter(index: number): string {
  return toLowerLetter(index).toUpperCase();
}

export const partLabel = (index: number) => `(${toLowerLetter(index)})`;
export const subPartLabel = (index: number) => `(${toLowerRoman(index + 1)})`;
export const statementLabel = (index: number) => `(${index + 1})`;
export const optionLabel = (index: number) => `${toUpperLetter(index)}.`;
