import { depsError } from './translateShared';
import { editTargetKey } from '@/model/edits';
import { isDesktop } from '@/platform';
import { qualityQuestions, questionEmpty } from '@/quality/collect';
import { runQuality } from '@/quality/run';
import type { QualityFinding, QualityOutcome } from '@/quality/types';
import { createRunDeps } from '@/translate/deps';
import { assistMessages } from '../text';
import { registerVerb } from '../registry';
import type { AiVerb, ReviewItem, VerbContext, VerbOutcome } from '../types';

/**
 * E4 "Check question quality": findings a co-marker would raise, from the model plus the
 * deterministic checks. Writes nothing to the document.
 */

function reviewItem(finding: QualityFinding): ReviewItem {
  const target = finding.anchor?.target;
  return {
    id: finding.id,
    tone: 'finding',
    ...(target ? { targetKey: editTargetKey(target) } : {}),
    questionId: finding.questionId,
    where: finding.where,
    notes: [finding.message, ...(finding.suggestion ? [assistMessages().suggested(finding.suggestion)] : [])],
  };
}

/** "3 findings in 12 questions", with what did not finish. */
export function qualitySummary(outcome: QualityOutcome): string {
  const m = assistMessages();
  const tail = [
    outcome.fatal ? m.qualityStoppedWith(outcome.fatal.message) : outcome.stopped ? m.qualityStoppedEarly : '',
    outcome.failed ? m.qualityCouldNot(outcome.failed) : '',
  ].filter(Boolean).join(m.tailJoin);
  const head = m.qualityHead(outcome.findings.length, outcome.total);
  return tail ? m.qualityWithTail(head, tail) : head;
}

export const qualityVerb: AiVerb = {
  id: 'check.quality',
  group: 'check',
  order: 20,
  needsKey: true,
  label: () => assistMessages().qualityLabel,

  available(ctx: VerbContext) {
    const questions = qualityQuestions(ctx.worksheet, ctx.scope);
    if (questions.length === 0) return null;
    const count = questions.filter((q) => !questionEmpty(q)).length;
    const unit = assistMessages().unitQuestions(count);
    return count > 0 ? { count, unit } : { count, unit, disabledReason: assistMessages().questionsBlank };
  },

  sendsLine(ctx, providerLabel) {
    const count = qualityQuestions(ctx.worksheet, ctx.scope).filter((q) => !questionEmpty(q)).length;
    return assistMessages().sendsQuestions(count, providerLabel);
  },

  async run(ctx, io): Promise<VerbOutcome> {
    const questions = qualityQuestions(ctx.worksheet, ctx.scope);
    const resolved = await createRunDeps({ glossary: false });
    if (!resolved.ok) return { kind: 'error', error: depsError(resolved, isDesktop()) };
    const { client, preset, model } = resolved.deps;
    const outcome = await runQuality(questions, { client, preset, model }, io.signal, ({ done, total }) =>
      io.progress(done, total, assistMessages().checkingQuestions(total)),
    );
    // A run that stopped before anything came back is the error, not an empty review.
    if (outcome.fatal && outcome.reviewed === 0) return { kind: 'error', error: outcome.fatal };
    if (outcome.findings.length === 0) {
      const whole = outcome.reviewed === outcome.total;
      return {
        kind: 'nothing',
        summary: whole
          ? assistMessages().noProblems(outcome.total)
          : assistMessages().noProblemsPartial(outcome.reviewed, outcome.total),
      };
    }
    return { kind: 'findings', summary: qualitySummary(outcome), items: outcome.findings.map(reviewItem) };
  },
};

registerVerb(qualityVerb);
