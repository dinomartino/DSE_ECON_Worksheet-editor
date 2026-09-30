import type { DocumentType } from '@/model/newWorksheet';

/**
 * The four ways to start, shared by the start screen's rows and the empty desk's
 * welcome cards, so the two can never name a kind differently. Every one opens the same
 * `NewWorksheetForm`; the kind only preselects its document type.
 */
export interface StartKind {
  type: DocumentType;
  title: string;
  /** The row's line: what the choice includes. */
  hint: string;
  /** The welcome card's shorter line, under the sketch of the page. */
  caption: string;
  titleZh: string;
}

export const START_KINDS: readonly StartKind[] = [
  {
    type: 'classroom',
    title: 'Classroom worksheet',
    hint: 'MCQ + structured questions. No cover.',
    caption: 'Everyday practice: MCQ and structured questions.',
    titleZh: '課堂工作紙',
  },
  {
    type: 'lqWorksheet',
    title: 'LQ worksheet',
    hint: 'Long questions with dotted answer space. No exam furniture.',
    caption: 'Long questions with dotted lines to write on.',
    titleZh: '長題目工作紙',
  },
  {
    type: 'paper1',
    title: 'Paper 1 mock · MCQ',
    hint: 'Exam cover; answers on a separate answer sheet.',
    caption: 'An MCQ paper with an exam cover.',
    titleZh: '卷一模擬試卷',
  },
  {
    type: 'lqMock',
    title: 'Paper 2 mock · booklet',
    hint: 'Question-Answer Book: cover, Sections A–C, page frame.',
    caption: 'A Question-Answer Book, Sections A to C.',
    titleZh: '卷二模擬試卷',
  },
];
