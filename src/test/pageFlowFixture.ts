import { readFileSync } from 'node:fs';
import { createWorksheetFrom } from '@/model/newWorksheet';
import { newId } from '@/model/factories';
import { parseWorksheet } from '@/storage/document';
import type { McqQuestion, Question, StructuredQuestion, Worksheet } from '@/model/types';

/**
 * The papers behind the `page-flow/` samples (`npm run samples`): what a teacher sees when a question
 * is kept on one page or started on a new one, on a classroom worksheet, a booklet and a Paper 1.
 * The classroom paper is `test-fixtures/manual/page-flow-mix.json`, the one opened by hand and by
 * `scripts/page-flow-verify.mjs`, so the file the user opens in Word is the paper they set up in the
 * app. Read from the repository root, where the samples run.
 *
 * Left alone, that paper is three sheets with Q3 cut across pages 1–2 and Q5 across pages 2–3.
 * Its questions, in order: Q1, Q2, Q3 (Section A), Q4, Q5, an MC (Section B).
 */

/** What to ask of each question of the classroom paper, by its place in the list (0 = Q1). */
export interface PageFlowAsks {
  start?: number[];
  keep?: number[];
}

/** The classroom paper with the asks applied; `{}` is the paper as saved, the control. */
export function buildPageFlowPaper(asks: PageFlowAsks = {}): Worksheet {
  const worksheet = parseWorksheet(readFileSync('test-fixtures/manual/page-flow-mix.json', 'utf8'));
  return {
    ...worksheet,
    questions: worksheet.questions.map((question, index) => ({
      ...question,
      ...(asks.start?.includes(index) ? { startOnNewPage: true } : {}),
      ...(asks.keep?.includes(index) ? { keepOnOnePage: true } : {}),
    })) as Question[],
  };
}

/**
 * A booklet (Question-Answer Book) with three questions in Section A, the second asking to start a
 * new page and the third to be kept on one: its answer space fills a page and a half, so a sheet
 * ends inside every question left alone, and the booklet's frame, cover and furniture meet the break.
 */
export function buildPageFlowBooklet(): Worksheet {
  const base = createWorksheetFrom({ documentType: 'lqMock', seedSample: true });
  const sample = base.questions[0] as StructuredQuestion;
  const copies: StructuredQuestion[] = [2, 3].map(() => ({
    ...structuredClone(sample),
    id: newId(),
    parts: sample.parts.map((part) => ({ ...structuredClone(part), id: newId() })),
  }));
  const at = base.flow.findIndex((item) => item.id === sample.id) + 1;
  copies[0] = { ...copies[0], startOnNewPage: true };
  copies[1] = { ...copies[1], keepOnOnePage: true };
  return {
    ...base,
    questions: [sample, ...copies],
    flow: [
      ...base.flow.slice(0, at),
      ...copies.map((copy) => ({ type: 'question' as const, id: copy.id })),
      ...base.flow.slice(at),
    ],
  };
}

/**
 * A Paper 1 (cover, then the lead-in and twelve MC) whose tenth question asks to start a new page, so
 * the exam paper's cover, running header and footer meet the break.
 */
export function buildPageFlowPaper1(): Worksheet {
  const base = createWorksheetFrom({ documentType: 'paper1', seedSample: true });
  const sample = base.questions.find((question) => question.type === 'mcq')!;
  const copies: Question[] = Array.from({ length: 11 }, () => ({
    ...structuredClone(sample),
    id: newId(),
    options: (sample as McqQuestion).options.map((option) => ({ ...structuredClone(option), id: newId() })),
  })) as Question[];
  const at = base.flow.findIndex((item) => item.id === sample.id) + 1;
  const questions = [sample, ...copies].map((question, index) =>
    index === 9 ? { ...question, startOnNewPage: true } : question,
  ) as Question[];
  return {
    ...base,
    questions,
    flow: [
      ...base.flow.slice(0, at),
      ...copies.map((copy) => ({ type: 'question' as const, id: copy.id })),
      ...base.flow.slice(at),
    ],
  };
}
