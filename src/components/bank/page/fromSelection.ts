import { withRowTags } from '@/library/sharedTags';
import type { BankRow } from '@/library/types';
import { copyQuestion } from '@/model/lineage';
import { createWorksheetFrom } from '@/model/newWorksheet';
import { rollupTopic, topicOf } from '@/model/topics';
import type { Question, Worksheet } from '@/model/types';
import { getQuestionType } from '@/registry';
import type { WorksheetStore } from '@/storage/types';
import { uniquePicks } from './addToOpen';

/** A picked question and the document it was read from. */
export interface PickedQuestion {
  question: Question;
  fromDocId: string;
}

/**
 * The rows' questions read from their documents, in order, each document loaded once; a
 * question no longer there is left out. Each carries the tags its row shows (the union
 * over every copy, `withRowTags`), so both "New worksheet from these" and "Add to" give
 * the copy every topic the bank showed.
 */
export async function readPicks(
  store: Pick<WorksheetStore, 'load'>,
  rows: readonly Pick<BankRow, 'docId' | 'questionId' | 'tags'>[],
): Promise<PickedQuestion[]> {
  const docs = new Map<string, Worksheet | undefined>();
  const out: PickedQuestion[] = [];
  for (const row of rows) {
    if (!docs.has(row.docId)) docs.set(row.docId, await store.load(row.docId).catch(() => undefined));
    const question = docs.get(row.docId)?.questions.find((q) => q.id === row.questionId);
    if (question) out.push({ question: withRowTags(question, row), fromDocId: row.docId });
  }
  return out;
}

/**
 * "New worksheet from these": a classroom worksheet (no sections, so nothing reorders
 * them) holding a copy of each pick, numbered in the order picked. Copies get fresh ids
 * and keep `lineage` (`copyQuestion`); a type this build does not know is left out, as
 * `insertQuestionCopies` does, and so is a second copy of a question already picked
 * (`uniquePicks`). Titled and named after the topic when every pick shares one; otherwise
 * named `BANK_WORKSHEET_NAME` and left untitled.
 */
export function worksheetFromPicks(picks: readonly PickedQuestion[]): Worksheet {
  const known = uniquePicks(picks).filter((pick) => getQuestionType(pick.question.type));
  const topic = sharedTopic(known.map((pick) => pick.question));
  const base = createWorksheetFrom({
    documentType: 'classroom',
    sections: false,
    name: topic ? topic.en : BANK_WORKSHEET_NAME,
    ...(topic ? { title: topic.en, titleZh: topic.zh } : {}),
  });
  const questions = known.map((pick) => copyQuestion(pick.question, pick.fromDocId));
  return {
    ...base,
    questions,
    flow: [...base.flow, ...questions.map((question) => ({ type: 'question' as const, id: question.id }))],
  };
}

/** The filing name of a worksheet made from picks that share no topic. */
export const BANK_WORKSHEET_NAME = 'Questions from bank';

/** The one coarse topic every question is tagged under, if there is exactly one. */
export function sharedTopic(questions: readonly Question[]): { en: string; zh: string } | undefined {
  if (questions.length === 0) return undefined;
  let shared: Set<string> | undefined;
  for (const question of questions) {
    const coarse = new Set(
      (question.tags ?? []).flatMap((tag) => {
        const topic = rollupTopic(tag);
        return topic ? [topic.parent ?? topic.code] : [];
      }),
    );
    shared = shared ? new Set([...shared].filter((code) => coarse.has(code))) : coarse;
  }
  if (!shared || shared.size !== 1) return undefined;
  const topic = topicOf([...shared][0]);
  return topic ? { en: topic.en, zh: topic.zh } : undefined;
}
