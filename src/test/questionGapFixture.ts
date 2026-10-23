import { readFileSync } from 'node:fs';
import { createWorksheetFrom } from '@/model/newWorksheet';
import { newId } from '@/model/factories';
import { parseWorksheet } from '@/storage/document';
import type { StructuredQuestion, Worksheet } from '@/model/types';

/**
 * The papers behind the `question-gap/` samples (`npm run samples`): what a teacher sees when the
 * air between questions is set on a classroom worksheet and on a booklet. The classroom paper is
 * `test-fixtures/manual/question-gap-mix.json`, the one opened by hand and by
 * `scripts/question-gap-verify.mjs`, so the file the user opens in Word is the paper they set up in
 * the app. Read from the repository root, where the samples run.
 */

/** Ten MC and three structured questions on a classroom worksheet; `lines` is Setup's Between questions. */
export function buildQuestionGapPaper(lines?: number): Worksheet {
  const worksheet = parseWorksheet(readFileSync('test-fixtures/manual/question-gap-mix.json', 'utf8'));
  return lines === undefined ? worksheet : { ...worksheet, examGapLines: lines };
}

/**
 * The same paper with some boundaries stated one by one: Q3 asks for six lines, Q5 for one (tighter
 * than the paper's two) and the second structured question for four. The rest follow Setup.
 */
export function buildQuestionGapOwnNumbers(): Worksheet {
  const worksheet = buildQuestionGapPaper(2);
  const own: Record<number, number> = { 2: 6, 4: 1, 11: 4 };
  return {
    ...worksheet,
    questions: worksheet.questions.map((question, index) =>
      own[index] === undefined ? question : { ...question, gapBefore: own[index] },
    ),
  };
}

/**
 * A booklet (Question-Answer Book) with three like questions in Section A, `lines` between them.
 * Its answer space fills a page and a half, so a page ends inside the run: the gap meets a break.
 */
export function buildQuestionGapBooklet(lines: number): Worksheet {
  const base = createWorksheetFrom({ documentType: 'lqMock', seedSample: true });
  const sample = base.questions[0] as StructuredQuestion;
  const copies: StructuredQuestion[] = [2, 3].map(() => ({
    ...structuredClone(sample),
    id: newId(),
    parts: sample.parts.map((part) => ({ ...structuredClone(part), id: newId() })),
  }));
  const at = base.flow.findIndex((item) => item.id === sample.id) + 1;
  return {
    ...base,
    examGapLines: lines,
    questions: [sample, ...copies],
    flow: [
      ...base.flow.slice(0, at),
      ...copies.map((copy) => ({ type: 'question' as const, id: copy.id })),
      ...base.flow.slice(at),
    ],
  };
}
