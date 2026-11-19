import type { Worksheet } from './types';

/**
 * The document's line spacing (`Worksheet.lineSpacing`, k-0468; GitHub issue #7: "行距是否可以
 * 調整？"): how many times its single height each line of the questions is, as Word's
 * Line spacing multiple. Single is the default and is stored as absence, so a document
 * that never had the field, or was set back to Single, prints exactly as before.
 */

/** The choices Document setup offers, Word's own: Single, 1.15, 1.5, Double. */
export const LINE_SPACINGS = [1, 1.15, 1.5, 2] as const;

/** What an absent `lineSpacing` means. */
export const DEFAULT_LINE_SPACING = 1;

/** The widest spacing read; a larger value (or a newer build's oddity) reads as Single. */
export const MAX_LINE_SPACING = 3;

/**
 * The document's line spacing as a multiple. Absent, not a number, or outside (1, 3] is
 * Single: an older build's file has none, and a value this build cannot print is kept in
 * the file untouched (it is a known key) but printed single rather than guessed at.
 */
export function lineSpacingOf(worksheet: Pick<Worksheet, 'lineSpacing'>): number {
  const value = worksheet.lineSpacing;
  return typeof value === 'number' && Number.isFinite(value) && value > 1 && value <= MAX_LINE_SPACING
    ? value
    : DEFAULT_LINE_SPACING;
}

/**
 * The document at `spacing`: Single removes the field, anything else stores it. The same
 * object when nothing changes, so `commit` records no undo step for a no-op.
 */
export function withLineSpacing(worksheet: Worksheet, spacing: number): Worksheet {
  const stored = spacing > DEFAULT_LINE_SPACING && spacing <= MAX_LINE_SPACING ? spacing : undefined;
  if (worksheet.lineSpacing === stored) return worksheet;
  const next: Worksheet = { ...worksheet, lineSpacing: stored };
  if (stored === undefined) delete next.lineSpacing;
  return next;
}
