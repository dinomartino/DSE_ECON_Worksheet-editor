import { aiErrorInfo } from '@/ai/errors';
import type { AiErrorInfo } from '@/ai/types';
import { planAnswers } from '@/answers/plan';
import { runAnswers, writesFor } from '@/answers/run';
import type { AnswerApplyReport, AnswerPlan, AnswersOutcome, AnswerTarget, RunDeps } from '@/answers/types';
import { editTargetKey } from '@/model/edits';
import { useWorksheetStore } from '@/store/worksheetStore';
import { createRunDeps } from '@/translate/deps';
import { registerVerb } from '../registry';
import type { AiVerb, ReviewItem, VerbContext, VerbOutcome } from '../types';

/**
 * E1: model answers, HKEAA mark schemes and MCQ rationales for what the scope leaves
 * empty. Inserted directly (one commit, one ⌘Z) and shown in the teacher version.
 */

export type AnswerDepsResult = { ok: true; deps: RunDeps } | { ok: false; error: AiErrorInfo };

/** Settings → client, preset and glossary (the translation engine's resolution). */
export async function answerDeps(): Promise<AnswerDepsResult> {
  const resolved = await createRunDeps();
  if (resolved.ok) return { ok: true, deps: resolved.deps };
  return { ok: false, error: aiErrorInfo(resolved.reason === 'noModel' ? 'model' : 'notConfigured', resolved.provider) };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The page text the fill lives on in the teacher version; none for a scheme alone. */
function targetKeyOf(target: AnswerTarget, outcome: AnswersOutcome): string | undefined {
  const fill = outcome.results.get(target.key)?.fill;
  if (!fill) return undefined;
  if (fill.shape === 'written') {
    return fill.answer && target.leaf.shape === 'written' ? editTargetKey(target.leaf.answerTarget) : undefined;
  }
  const leaf = target.leaf;
  if (leaf.shape !== 'choice') return undefined;
  // The key's rationale first: it is the one a teacher checks.
  const filled = leaf.options.filter((option) => fill.rationales[option.id]);
  const first = filled.find((option) => option === leaf.options[leaf.answerIndex]) ?? filled[0];
  return first ? editTargetKey(first.target) : undefined;
}

export function reviewItems(plan: AnswerPlan, outcome: AnswersOutcome, report: AnswerApplyReport): ReviewItem[] {
  const applied = new Set(report.applied);
  const stale = new Set(report.skipped.map((s) => s.key));
  const items: ReviewItem[] = [];
  for (const [key, target] of plan.targets) {
    const result = outcome.results.get(key);
    if (!result) continue;
    const base = { id: key, where: target.where, questionId: target.questionId };
    if (applied.has(key)) {
      const targetKey = targetKeyOf(target, outcome);
      items.push({ ...base, tone: result.status === 'look' ? 'look' : 'inserted', ...(targetKey ? { targetKey } : {}), notes: result.notes });
    } else if (stale.has(key)) {
      items.push({ ...base, tone: 'failed', notes: ['Changed while writing — not inserted'] });
    } else if (result.status === 'failed') {
      items.push({ ...base, tone: 'failed', notes: result.notes });
    }
  }
  return items;
}

export function makeWriteAnswersVerb(deps: () => Promise<AnswerDepsResult> = answerDeps): AiVerb {
  const plan = (ctx: VerbContext) => planAnswers(ctx.worksheet, ctx.scope, ctx.mode);
  return {
    id: 'write.answers',
    group: 'write',
    order: 0,
    needsKey: true,
    label: () => 'Write answers & mark scheme',
    available(ctx) {
      const count = plan(ctx).targets.size;
      return count > 0 ? { count, unit: 'parts' } : null;
    },
    sendsLine(ctx, providerLabel) {
      return `Sends ${plural(plan(ctx).targets.size, 'part')} to ${providerLabel} with your key`;
    },
    async run(ctx, io): Promise<VerbOutcome> {
      const answers = plan(ctx);
      if (answers.targets.size === 0) return { kind: 'nothing', summary: 'Nothing to fill here' };
      const resolved = await deps();
      if (!resolved.ok) return { kind: 'error', error: resolved.error };
      const outcome = await runAnswers(answers, resolved.deps, io.signal, ({ done, total }) => io.progress(done, total));
      if (outcome.fatal && outcome.results.size === 0) return { kind: 'error', error: outcome.fatal };

      const store = useWorksheetStore.getState();
      const report = store.applyAnswerFills(writesFor(answers, outcome), { worksheetId: answers.worksheetId });
      const items = reviewItems(answers, outcome, report);
      const tail = outcome.stopped ? ' — stopped' : outcome.fatal ? ` — ${outcome.fatal.message}` : '';
      if (report.applied.length === 0) {
        return items.length > 0
          ? { kind: 'findings', summary: `Nothing inserted${tail}`, items }
          : { kind: 'nothing', summary: `Nothing inserted${tail}` };
      }
      const committed = useWorksheetStore.getState().worksheet;
      const live = () => useWorksheetStore.getState().worksheet === committed;
      return {
        kind: 'inserted',
        summary: `Filled ${plural(report.applied.length, 'part')}${tail}`,
        items,
        undo: { live, run: () => live() && useWorksheetStore.getState().undo() },
        showTeacher: true,
      };
    },
  };
}

registerVerb(makeWriteAnswersVerb());
