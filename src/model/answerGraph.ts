import { bi } from './text';
import type { AnswerGraph } from './types';

/**
 * The graph answer space (§ `AnswerGraph`): blank axes a student draws a diagram on.
 *
 * Its height is counted in the page's own 12pt lines, never in points, so the box is a
 * whole number of body lines and the `.docx`'s fixed-line rhythm resumes exactly below
 * it (§ One fixed line, no paragraph spacing).
 */

/** One body line, the box's unit of height. */
export const ANSWER_GRAPH_LINE_PT = 12;

/** Height choices offered in the sidebar: roughly 5, 7, 8½ and 10 cm. */
export const ANSWER_GRAPH_PRESETS = [12, 16, 20, 24] as const;

export const ANSWER_GRAPH_MIN_LINES = 6;

/** Well under an A4 text column (~58 lines): the box must always fit one page whole. */
export const ANSWER_GRAPH_MAX_LINES = 40;

export const DEFAULT_ANSWER_GRAPH_LINES = 16;

/** A whole number of lines inside the allowed range; anything unreadable is the default. */
export function clampAnswerGraphLines(lines: number): number {
  if (!Number.isFinite(lines)) return DEFAULT_ANSWER_GRAPH_LINES;
  return Math.min(ANSWER_GRAPH_MAX_LINES, Math.max(ANSWER_GRAPH_MIN_LINES, Math.round(lines)));
}

/** The box's share of the text column. */
export function answerGraphWidthShare(graph: AnswerGraph): number {
  return graph.width === 'half' ? 0.5 : 1;
}

/**
 * A new box: half the column, labelled Price / Quantity with the origin "0" — the shape
 * of a demand-and-supply answer. The labels are seeded as data so a teacher can retype
 * or clear them.
 */
export function createAnswerGraph(): AnswerGraph {
  return {
    lines: DEFAULT_ANSWER_GRAPH_LINES,
    width: 'half',
    yTitle: bi('Price', '價格'),
    xTitle: bi('Quantity', '數量'),
    showOrigin: true,
  };
}
