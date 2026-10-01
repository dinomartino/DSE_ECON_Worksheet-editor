import type { DocumentType } from '@/model/newWorksheet';

/**
 * The four kinds of document, in the order a teacher meets them: the one definition the
 * empty desk's cards and the new-worksheet gallery both read, so they can never name a
 * kind differently. Each names what the choice *includes*: nothing else needs asking.
 */
export interface StartKind {
  type: DocumentType;
  title: string;
  /** What the choice includes, under the new-worksheet gallery. */
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

/**
 * The type the New worksheet button preselects: the last one created, per viewer. The key
 * sits outside the `econ-worksheet:` prefix, which the store treats as documents.
 */
const LAST_KIND_KEY = 'econgen.lastNewType';

export function readLastKind(): DocumentType {
  try {
    const stored = window.localStorage.getItem(LAST_KIND_KEY);
    return START_KINDS.find((kind) => kind.type === stored)?.type ?? 'classroom';
  } catch {
    return 'classroom';
  }
}

export function writeLastKind(type: DocumentType): void {
  try {
    window.localStorage.setItem(LAST_KIND_KEY, type);
  } catch {
    // Private mode or blocked storage: the button just starts on Classroom.
  }
}
