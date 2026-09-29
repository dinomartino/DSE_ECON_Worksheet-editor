import { copyQuestion } from '@/model/lineage';
import { createWorksheetFrom } from '@/model/newWorksheet';
import { topicOf } from '@/model/topics';
import type { Question, Worksheet } from '@/model/types';
import { getQuestionType } from '@/registry';

/** A picked question and the document it was read from. */
export interface PickedQuestion {
  question: Question;
  fromDocId: string;
}

/**
 * "New worksheet from these": a classroom worksheet (no sections, so nothing reorders
 * them) holding a copy of each pick, numbered in the order picked. Copies get fresh ids
 * and keep `lineage` (`copyQuestion`); a type this build does not know is left out, as
 * `insertQuestionCopies` does. Titled after the topic when every pick shares one.
 */
export function worksheetFromPicks(picks: readonly PickedQuestion[]): Worksheet {
  const known = picks.filter((pick) => getQuestionType(pick.question.type));
  const topic = sharedTopic(known.map((pick) => pick.question));
  const base = createWorksheetFrom({
    documentType: 'classroom',
    sections: false,
    ...(topic ? { title: topic.en, titleZh: topic.zh } : {}),
  });
  const questions = known.map((pick) => copyQuestion(pick.question, pick.fromDocId));
  return {
    ...base,
    questions,
    flow: [...base.flow, ...questions.map((question) => ({ type: 'question' as const, id: question.id }))],
  };
}

/** The one coarse topic every question is tagged under, if there is exactly one. */
export function sharedTopic(questions: readonly Question[]): { en: string; zh: string } | undefined {
  if (questions.length === 0) return undefined;
  let shared: Set<string> | undefined;
  for (const question of questions) {
    const coarse = new Set(
      (question.tags ?? []).flatMap((tag) => {
        const topic = topicOf(tag);
        return topic ? [topic.parent ?? topic.code] : [];
      }),
    );
    shared = shared ? new Set([...shared].filter((code) => coarse.has(code))) : coarse;
  }
  if (!shared || shared.size !== 1) return undefined;
  const topic = topicOf([...shared][0]);
  return topic ? { en: topic.en, zh: topic.zh } : undefined;
}
