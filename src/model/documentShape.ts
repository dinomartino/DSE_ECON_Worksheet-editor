import { coverHasPanel } from './cover';
import { isQabDocument } from './pageFurniture';
import type { LayoutElement, Worksheet } from './types';

/**
 * What shape a document is, and what that shape permits.
 *
 * The four documents this app makes are not four sets of features — they are four
 * *papers*, and most of the toolbox does not apply to any one of them. An MCQ paper has
 * no answer space (the candidate marks a separate answer sheet) and no sections; a
 * Question-Answer Book has no ruled worksheet lines and no header. Offering those
 * anyway is not neutral: a teacher who adds dotted answer space to a Paper 1 has built
 * something the real paper cannot be, and nothing tells them until it prints.
 *
 * **Derived from the document, never stored.** `isQabDocument` reads the furniture and
 * `coverHasPanel` reads the panel, both because the shape *is* those things rather than
 * a flag beside them — a document assembled by hand, pasted, or loaded from an older
 * build gets the same answer as one the wizard built. A stored `documentType` would be
 * a second answer to a question the content already settles, and the two would part
 * company the first time a teacher deleted a cover.
 *
 * The rule this file exists to keep: **withhold, and say why — never grey out in
 * silence.** A control that is present but dead reads as a bug; a control that is
 * absent with a sentence explaining it reads as a decision (§ `DocumentSettings`).
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
 * Layout elements this document has no use for.
 *
 * Not a matter of taste: each of these produces something the paper it is offered on
 * cannot contain.
 *
 * - **An MCQ paper has no writing room.** Its candidate answers on a machine-read sheet
 *   (the reference's own cover instruction 1 says so), so ruled lines, dotted answer
 *   space and fill-to-page all describe a page that does not exist. It also runs as one
 *   unbroken sequence of questions, so a section marker would restart numbering the
 *   paper never restarts.
 * - **A Question-Answer Book has no ruled worksheet lines.** Its answer space is the
 *   dotted `answerSpace` primitive at the reference's own pitch; `answerLines` is the
 *   worksheet's 24pt ruled space and a different mechanism entirely (§ the dotted
 *   answer line is a different primitive). Both on one page is two rhythms.
 *
 * Everything absent from this list stays offered. A heading, a note, a divider, a page
 * break and blank space are all things a real paper of either kind carries.
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
