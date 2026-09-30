import { paperKind } from '@/model/documentShape';
import type { Worksheet } from '@/model/types';
import { listQuestionTypes } from '@/registry';

/**
 * Which question types a paper normally takes, for the 題庫 tab: its type filter and Fill
 * start there, and an insert of another type is noted, never refused. Read from each
 * type's `paperKinds` (the registry), so no type is named here.
 *
 * The exam papers are decided by their shape: Paper 1 is answered on an MCQ answer sheet,
 * a Question-Answer Book is written in. A worksheet (classroom or LQ) also takes whatever
 * it already holds, so a classroom sheet with dotted answer space and MCQs keeps both.
 */
export function paperTypeIds(worksheet: Worksheet): string[] {
  const kind = paperKind(worksheet);
  const byKind = listQuestionTypes()
    .filter((type) => !type.paperKinds || type.paperKinds.includes(kind))
    .map((type) => type.id);
  if (kind === 'paper1' || kind === 'lqMock') return byKind;
  const held = new Set(worksheet.questions.map((question) => question.type));
  return listQuestionTypes()
    .map((type) => type.id)
    .filter((id) => byKind.includes(id) || held.has(id));
}

/** The tab's starting type filter: the one type this paper takes, or '' (any) when it takes more. */
export function paperTypeFilter(worksheet: Worksheet): string {
  const ids = paperTypeIds(worksheet);
  return ids.length === 1 ? ids[0] : '';
}

/** The type ids among `typeIds` this paper does not normally take, each once, in order. */
export function typesOutsidePaper(worksheet: Worksheet, typeIds: readonly string[]): string[] {
  const takes = new Set(paperTypeIds(worksheet));
  return [...new Set(typeIds)].filter((id) => !takes.has(id));
}
