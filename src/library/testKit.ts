import { createMcqQuestion, createParagraphBlock, createStructuredQuestion, createWorksheet } from '@/model/factories';
import { bi } from '@/model/text';
import type { Question, Worksheet } from '@/model/types';
import type { BankRow } from './types';

/** Test-only builders for the bank's modules. */

/** A multiple-choice question with a bilingual stem and options. */
export function choiceQuestion(en: string, zh = '', tags?: string[]): Question {
  const question = createMcqQuestion();
  question.blocks = [createParagraphBlock(bi(en, zh))];
  question.options = question.options.map((option, i) => ({ ...option, text: bi(`Option ${i + 1}`, `選項${i + 1}`) }));
  return tags ? { ...question, tags } : question;
}

/** A structured question: stem plus one part. */
export function partsQuestion(en: string, zh = ''): Question {
  const question = createStructuredQuestion();
  question.blocks = [createParagraphBlock(bi(en, zh))];
  return question;
}

/** A saved document holding `questions` in that order. */
export function docWith(questions: Question[], extra: Partial<Worksheet> = {}): Worksheet {
  const worksheet = createWorksheet();
  return {
    ...worksheet,
    questions,
    flow: questions.map((q) => ({ type: 'question' as const, id: q.id })),
    ...extra,
  };
}

let seq = 0;
/** A minimal row; override what the test is about. */
export function row(overrides: Partial<BankRow> = {}): BankRow {
  seq += 1;
  return {
    docId: 'doc',
    docTitle: 'Doc',
    docUpdatedAt: '2026-01-01T00:00:00.000Z',
    usedOn: '2026-01-01',
    docKind: 'paper',
    questionId: `q${seq}`,
    rootId: `q${seq}`,
    typeId: 'choice',
    marks: 1,
    tags: [],
    excerpt: { en: '', zh: '' },
    searchText: '',
    hasDiagram: false,
    languages: ['en'],
    contentKey: `k${seq}`,
    ...overrides,
  };
}
