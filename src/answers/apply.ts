import { mapSame, patch } from '@/model/textSlots';
import type { Worksheet } from '@/model/types';
import { getQuestionType } from '@/registry';
import type { AnswerApplyReport, AnswerWrite } from './types';

/**
 * Writes fills through the registry hook, one pass. A leaf whose stamp changed since the
 * plan (the teacher edited it, or its text, meanwhile) is skipped; the hook itself writes
 * only into empty fields. The same `Worksheet` when nothing was written.
 */
export function applyAnswerWrites(ws: Worksheet, writes: readonly AnswerWrite[]): { worksheet: Worksheet; report: AnswerApplyReport } {
  const report: AnswerApplyReport = { applied: [], skipped: [] };
  const byQuestion = new Map<string, AnswerWrite[]>();
  for (const write of writes) byQuestion.set(write.questionId, [...(byQuestion.get(write.questionId) ?? []), write]);
  const reached = new Set<string>();
  const questions = mapSame(ws.questions, (question) => {
    const pending = byQuestion.get(question.id);
    const hook = getQuestionType(question.type)?.mapAnswers;
    if (!pending || !hook) return question;
    return hook(question, (leaf) => {
      const write = pending.find((w) => w.leafKey === leaf.key);
      if (!write) return undefined;
      reached.add(write.key);
      if (leaf.stamp !== write.stamp) {
        report.skipped.push({ key: write.key, reason: 'changed' });
        return undefined;
      }
      report.applied.push(write.key);
      return write.fill;
    });
  });
  for (const write of writes) if (!reached.has(write.key)) report.skipped.push({ key: write.key, reason: 'gone' });
  return { worksheet: patch(ws, { questions }), report };
}
