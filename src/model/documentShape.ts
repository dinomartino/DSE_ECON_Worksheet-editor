import { coverHasPanel } from './cover';
import { isQabDocument } from './pageFurniture';
import type { LayoutElement, Worksheet } from './types';

/**
 * What shape a document is, and what that shape permits. **Derived from the document,
 * never stored** — a hand-assembled or older-build document gets the same answer as a
 * wizard-built one, and a stored `documentType` would be a second answer to a
 * question the content settles. The rule: withhold and say why, never grey out in
 * silence.
 */

export type DocumentShape = 'classroom' | 'paper1' | 'lqWorksheet' | 'lqMock';

/**
 * Which of the four this document is.
 *
 * Order matters: the booklet is checked first because it has *both* furniture and a
 * panelled cover, so testing the cover first would call it a Paper 1.
 */
export function documentShape(worksheet: Worksheet): DocumentShape {
  if (isQabDocument(worksheet)) return 'lqMock';
  if (worksheet.cover && !coverHasPanel(worksheet.cover)) return 'paper1';
  // A plain LQ worksheet has no cover and no furniture; what distinguishes it from a
  // classroom worksheet is that its questions carry dotted answer space. That is a
  // property of content rather than shape, so it is not inferred here — both answer
  // "classroom" and neither withholds anything the other needs.
  return 'classroom';
}

/**
 * Layout elements this document has no use for — each produces something the paper
 * cannot contain: an MCQ paper has no writing room and no numbering restarts; a QAB's
 * answer space is the dotted primitive, so ruled lines are a second rhythm.
 * Everything absent from this list stays offered.
 */
export function hiddenLayoutKinds(shape: DocumentShape): ReadonlySet<LayoutElement['kind']> {
  switch (shape) {
    case 'paper1':
      return new Set(['answerLines', 'answerSpace', 'section', 'partHeader']);
    case 'lqMock':
      // `questionCount` is the MCQ paper's lead-in. The booklet counts nothing of the
      // sort — its candidate is told which questions to answer, not how many exist —
      // and a long-question paper stating "There are 14 questions" would invite
      // answering all of them.
      return new Set(['answerLines', 'questionCount']);
    default:
      return new Set(['questionCount']);
  }
}

/** Whether this document should offer a given layout element at all. */
export function offersLayoutKind(shape: DocumentShape, kind: LayoutElement['kind']): boolean {
  return !hiddenLayoutKinds(shape).has(kind);
}

/**
 * Why a control is missing, in one sentence, for the surface that withheld it.
 *
 * Every hidden thing owes the teacher a reason — the difference between a tool that has
 * opinions and a tool that looks broken.
 */
export const SHAPE_REASON: Record<Exclude<DocumentShape, 'classroom' | 'lqWorksheet'>, string> = {
  paper1: 'A Paper 1 is answered on a separate answer sheet, so it carries no writing room and no sections.',
  lqMock: 'A Question-Answer Book uses its own dotted answer space, at the reference booklet’s pitch.',
};
