import { depsError } from './translateShared';
import { editTargetKey } from '@/model/edits';
import { isDesktop } from '@/platform';
import { qualityQuestions, questionEmpty } from '@/quality/collect';
import { runQuality } from '@/quality/run';
import type { QualityFinding, QualityOutcome } from '@/quality/types';
import { createRunDeps } from '@/translate/deps';
import { registerVerb } from '../registry';
import type { AiVerb, ReviewItem, VerbContext, VerbOutcome } from '../types';

/**
 * E4 "Check question quality": findings a co-marker would raise, from the model plus the
 * deterministic checks. Writes nothing to the document.
 */

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function reviewItem(finding: QualityFinding): ReviewItem {
  const target = finding.anchor?.target;
  return {
    id: finding.id,
    tone: 'finding',
    ...(target ? { targetKey: editTargetKey(target) } : {}),
    questionId: finding.questionId,
    where: finding.where,
    notes: [finding.message, ...(finding.suggestion ? [`Suggested: ${finding.suggestion}`] : [])],
  };
}

/** "3 findings in 12 questions", with what did not finish. */
export function qualitySummary(outcome: QualityOutcome): string {
  const tail = [
    outcome.fatal ? `stopped: ${outcome.fatal.message}` : outcome.stopped ? 'stopped early' : '',
    outcome.failed ? `${plural(outcome.failed, 'question')} could not be checked` : '',
  ].filter(Boolean).join('; ');
  const head = `${plural(outcome.findings.length, 'finding')} in ${plural(outcome.total, 'question')}`;
  return tail ? `${head} (${tail})` : head;
}

export const qualityVerb: AiVerb = {
  id: 'check.quality',
  group: 'check',
  order: 20,
  needsKey: true,
  label: () => 'Check question quality',

  available(ctx: VerbContext) {
    const questions = qualityQuestions(ctx.worksheet, ctx.scope);
    if (questions.length === 0) return null;
    const count = questions.filter((q) => !questionEmpty(q)).length;
    return count > 0 ? { count, unit: 'questions' } : { count, unit: 'questions', disabledReason: 'These questions are blank' };
  },

  sendsLine(ctx, providerLabel) {
    const count = qualityQuestions(ctx.worksheet, ctx.scope).filter((q) => !questionEmpty(q)).length;
    return `Sends ${plural(count, 'question')} to ${providerLabel} with your key. Changes nothing.`;
  },

  async run(ctx, io): Promise<VerbOutcome> {
    const questions = qualityQuestions(ctx.worksheet, ctx.scope);
    const resolved = await createRunDeps({ glossary: false });
    if (!resolved.ok) return { kind: 'error', error: depsError(resolved, isDesktop()) };
    const { client, preset, model } = resolved.deps;
    const outcome = await runQuality(questions, { client, preset, model }, io.signal, ({ done, total }) =>
      io.progress(done, total, `Checking ${plural(total, 'question')}`),
    );
    // A run that stopped before anything came back is the error, not an empty review.
    if (outcome.fatal && outcome.reviewed === 0) return { kind: 'error', error: outcome.fatal };
    if (outcome.findings.length === 0) {
      const whole = outcome.reviewed === outcome.total;
      return {
        kind: 'nothing',
        summary: whole
          ? `No problems found in ${plural(outcome.total, 'question')}`
          : `No problems found in the ${outcome.reviewed} of ${plural(outcome.total, 'question')} checked`,
      };
    }
    return { kind: 'findings', summary: qualitySummary(outcome), items: outcome.findings.map(reviewItem) };
  },
};

registerVerb(qualityVerb);
