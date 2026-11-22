import { computeNumbering } from '@/model/numbering';
import type { Worksheet } from '@/model/types';
import { qualityQuestions, questionEmpty } from '@/quality/collect';
import type { TranslateScope as AiScope } from '@/translate/types';
import { sha256 } from '@/sync/hash';
import type { CoverageQuestion } from './types';
import { markedUnits } from './units';

/**
 * What the coverage check reads of a paper (k-0317): the questions in scope with words,
 * keyed and numbered, with their marked units. And its fingerprint (k-0489 v2), so a saved
 * report can say the paper has changed since it was checked.
 */
export function coverageQuestions(ctx: { worksheet: Worksheet; scope: AiScope }): CoverageQuestion[] {
  const numbering = computeNumbering(ctx.worksheet);
  return qualityQuestions(ctx.worksheet, ctx.scope)
    .filter((q) => !questionEmpty(q))
    .map((view, index) => {
      const numbered = numbering.byQuestionId.get(view.questionId);
      const key = `q${index + 1}`;
      return { question: view, key, number: String(numbered?.number ?? index + 1), units: markedUnits(view, numbered?.question, key) };
    });
}

/** The whole paper as the check reads it. */
export const wholePaperQuestions = (worksheet: Worksheet): CoverageQuestion[] => coverageQuestions({ worksheet, scope: { kind: 'paper' } });

/**
 * A hash of everything the check reads of the whole paper: each question's number, marked
 * units and words. The same paper always gives the same value; any edit a check would see
 * (a word, a mark, a question added or moved) gives another. Whole paper even for a part's
 * check, so the note reads "the paper has changed", never a guess about which part.
 */
export function paperFingerprint(worksheet: Worksheet): string {
  const read = wholePaperQuestions(worksheet).map((q) => [q.number, q.units.map((u) => [u.label, u.marks]), q.question.format, q.question.anchors]);
  return sha256(JSON.stringify(read));
}
