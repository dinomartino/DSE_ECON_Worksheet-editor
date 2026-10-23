import type { DocumentShape } from '@/model/documentShape';
import { resolveFlow } from '@/model/flow';
import type { LayoutElement, Question, Worksheet } from '@/model/types';
import { requireQuestionType } from '@/registry';
import { startsEveryQuestion } from './pageFlow';

/**
 * The air between questions: how many blank lines of the fixed 12pt grid separate one
 * top-level item from the next, and which stored number may widen it.
 *
 * One rule for every paper shape. The walker (`renderWorksheet`) decides the page with it
 * and the panels that offer the numbers (Setup's Between questions, a question's Space
 * above) read the same functions, so the control and the page cannot disagree. Applied
 * through `withLeadingGap`, which spells the gap on the item's own first paragraph so it
 * dies at a page top (§ *A boundary gap … dies at a page top*).
 */

/** One line: the rhythm of every paper before this was a setting, and of any paper nobody set. */
export const DEFAULT_GAP_LINES = 1;

/**
 * Blank lines under the MCQ paper's lead-in, before question 1. Measured off the
 * reference: rubric stands off by more than a neighbour, less than a whole question.
 */
export const QUESTION_COUNT_GAP_LINES = 2;

/**
 * What the previous flow item *was* — a boundary's width depends on both sides, which the
 * nodes alone cannot say.
 */
export interface PreviousItem {
  question?: Question;
  layout?: LayoutElement;
}

/**
 * The type's own measured number, asked on a Paper 1 only. The reference paper spaces its
 * questions wider than one line and the type states by how much (`examGapLines` on the
 * definition: the walker may not name a concrete type id). Every other shape keeps the
 * one-line rhythm until somebody chooses a number, so a saved paper does not move.
 */
function typeGapLines(shape: DocumentShape, question: Question): number | undefined {
  return shape === 'paper1' ? requireQuestionType(question).examGapLines : undefined;
}

/** A width below the ordinary line is no width at all: one line is the floor. */
function atLeastOneLine(lines: number | undefined): number {
  return lines !== undefined && lines > DEFAULT_GAP_LINES ? lines : DEFAULT_GAP_LINES;
}

/**
 * What "Default" means for this question on this shape, in blank lines: the type's
 * measured number on a Paper 1, one line anywhere else. The label the panels show.
 */
export function defaultGapLines(shape: DocumentShape, question: Question): number {
  return atLeastOneLine(typeGapLines(shape, question));
}

/**
 * Whether a stored gap number (a question's `gapBefore`, the paper's `examGapLines`) can
 * widen the boundary above `next`: only straight under a question of the same type. A
 * heading, a source, a page break or a question of another kind in between keeps its own
 * spacing, so the number is read there and nowhere else.
 */
export function gapNumberApplies(previous: PreviousItem | undefined, next: Question): boolean {
  return previous?.question !== undefined && previous.question.type === next.type;
}

/**
 * The width of the boundary between two consecutive flow items, in blank lines.
 *
 * Between two directly adjacent questions of the same type it is the nearest statement:
 * this question's own `gapBefore`, then the document's `examGapLines`, then — on a Paper 1
 * only — the type's measured default. Never on the first item of the page (nothing is
 * above it to be separated from). The lead-in and source stand-offs under them are the
 * reference paper's own rhythm and stay Paper 1's; elsewhere an element above a question
 * leaves the ordinary single line.
 */
export function boundaryGapLines(
  shape: DocumentShape,
  previous: PreviousItem | undefined,
  next: Question,
  /** The document's own choice (§ `Worksheet.examGapLines`); absent = the type's, then one line. */
  override?: number,
): number {
  if (!previous) return DEFAULT_GAP_LINES;

  if (previous.layout) {
    if (shape !== 'paper1') return DEFAULT_GAP_LINES;
    // A stimulus stands off from the questions it introduces the way the lead-in
    // stands off from question 1: nearer than a stranger, further than a line of text.
    return previous.layout.kind === 'questionCount' || previous.layout.kind === 'stimulus'
      ? QUESTION_COUNT_GAP_LINES
      : DEFAULT_GAP_LINES;
  }

  if (!gapNumberApplies(previous, next)) return DEFAULT_GAP_LINES;
  // Nearest statement wins: this question's own gap, then the document's, then the
  // shape's default for the type.
  return atLeastOneLine(next.gapBefore ?? override ?? typeGapLines(shape, next));
}

/**
 * The blank lines above a stimulus, mirroring `boundaryGapLines` for an element that is
 * not a question: after a question it takes the same wide boundary the next question
 * would — the stimulus opens a new question group, and on the one-line default it read as
 * a caption of the question above it. The width comes from the previous question's own
 * type (the walker may not name a concrete type), overridden by the document's
 * `examGapLines` exactly as a question boundary is.
 */
export function stimulusGapLines(
  shape: DocumentShape,
  previous: PreviousItem | undefined,
  override?: number,
): number {
  if (!previous?.question) return DEFAULT_GAP_LINES;
  return atLeastOneLine(override ?? typeGapLines(shape, previous.question));
}

/**
 * Why a question's own gap does or does not count, for the control that sets it.
 *
 * - `applies`: it sits straight under a question of the same type.
 * - `first`: nothing above it to be separated from.
 * - `afterElement`: a heading, source, text or page break stands above it.
 * - `unlikeAbove`: the question above is another kind.
 * - `startsPage`: it would apply, but the question starts a new page (`startOnNewPage`, or the paper's
 *   `startEveryQuestionOnNewPage`), and nothing is spaced above what leads a page.
 *
 * Read off the same flow the walker reads, so the sentence a panel prints is the page's.
 */
export type GapAboveStatus = 'applies' | 'first' | 'afterElement' | 'unlikeAbove' | 'startsPage';

export function gapAboveStatus(worksheet: Worksheet, questionId: string): GapAboveStatus {
  const flow = resolveFlow(worksheet);
  const at = flow.findIndex((item) => item.type === 'question' && item.id === questionId);
  const item = flow[at];
  // Not in the flow (a stale id): nothing to say, so do not say it is ignored.
  if (at < 0 || item?.type !== 'question') return 'applies';
  if (at === 0) return 'first';
  const above = flow[at - 1];
  if (above.type === 'layout') return 'afterElement';
  if (!gapNumberApplies({ question: above.question }, item.question)) return 'unlikeAbove';
  // Straight under a like question, so a sheet opens at this one itself, never at a heading
  // above it (`sheetStart`): the walker stamps no gap on what opens a sheet.
  return item.question.startOnNewPage === true || startsEveryQuestion(worksheet) ? 'startsPage' : 'applies';
}
