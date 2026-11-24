import type { SourceQuestion } from './types';

/**
 * What a reference has that the studio cannot write yet (k-0544 step 7): several diagrams in
 * the stem (a grid "(1)"–"(4)", HKDSE 2023 Paper 1 Q36), a diagram for every option, or a table
 * under every option. The writer gives a question at most one diagram, in the stem, and words
 * for options (k-0545 lifts that). So, when the teacher asked for a question close to such a
 * reference, the studio says so instead of silently handing back another form.
 */
export interface ReferenceGap {
  /** Pictures printed in the stem or passage (only 2 or more is a gap). */
  pictures: number;
  optionPictures: boolean;
  optionTables: boolean;
}

/** The form this reference has that a draft cannot follow, or undefined when it has none. */
export function referenceGap(source: Pick<SourceQuestion, 'figurePlaces' | 'optionTables'>): ReferenceGap | undefined {
  const places = source.figurePlaces ?? [];
  const pictures = places.filter((p) => !p.startsWith('option')).length;
  const optionPictures = places.some((p) => p.startsWith('option'));
  const optionTables = Boolean(source.optionTables);
  return pictures >= 2 || optionPictures || optionTables ? { pictures, optionPictures, optionTables } : undefined;
}

/** A gap as a finding's values (numbers only: findings carry no booleans). */
export const gapParams = (gap: ReferenceGap): Record<string, number> => ({
  pictures: gap.pictures,
  optionPictures: gap.optionPictures ? 1 : 0,
  optionTables: gap.optionTables ? 1 : 0,
});
