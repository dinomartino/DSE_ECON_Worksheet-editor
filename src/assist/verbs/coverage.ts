import { depsError } from './translateShared';
import { buildReport, percent } from '@/coverage/report';
import { leadSide } from '@/coverage/prompt';
import { runCoverage } from '@/coverage/run';
import type { CoverageQuestion } from '@/coverage/types';
import { markedUnits } from '@/coverage/units';
import { uiLanguage } from '@/i18n/language';
import { computeNumbering } from '@/model/numbering';
import { isDesktop } from '@/platform';
import { openScratch, sweepScratch } from '@/platform/scratch';
import { qualityQuestions, questionEmpty } from '@/quality/collect';
import { createRunDeps } from '@/translate/deps';
import { assistMessages } from '../text';
import { registerVerb } from '../registry';
import type { AiVerb, VerbContext, VerbOutcome } from '../types';

/**
 * Check syllabus coverage (k-0317, design § 10.11 of
 * `docs/research/2026-11-syllabus-analysis.md`): every question with words goes to the AI
 * provider set in Settings (the one Chinese translation uses), each question's result goes
 * to a temporary file, the report is built from those files, and the files are deleted.
 * Writes nothing to the document.
 */

export const SCRATCH_JOB = 'coverage';

/** The questions in scope with words, keyed and numbered, with their marked units. */
export function coverageQuestions(ctx: Pick<VerbContext, 'worksheet' | 'scope'>): CoverageQuestion[] {
  const numbering = computeNumbering(ctx.worksheet);
  return qualityQuestions(ctx.worksheet, ctx.scope)
    .filter((q) => !questionEmpty(q))
    .map((view, index) => {
      const numbered = numbering.byQuestionId.get(view.questionId);
      const key = `q${index + 1}`;
      return { question: view, key, number: String(numbered?.number ?? index + 1), units: markedUnits(view, numbered?.question, key) };
    });
}

export const coverageVerb: AiVerb = {
  id: 'check.syllabus',
  group: 'check',
  order: 30,
  needsKey: true,
  label: () => assistMessages().coverageLabel,

  available(ctx) {
    const all = qualityQuestions(ctx.worksheet, ctx.scope);
    if (all.length === 0) return null;
    const count = all.filter((q) => !questionEmpty(q)).length;
    const unit = assistMessages().unitQuestions(count);
    return count > 0 ? { count, unit } : { count, unit, disabledReason: assistMessages().questionsBlank };
  },

  sendsLine(ctx, providerLabel) {
    return assistMessages().sendsCoverage(coverageQuestions(ctx).length, providerLabel);
  },

  async run(ctx, io): Promise<VerbOutcome> {
    const m = assistMessages();
    const questions = coverageQuestions(ctx);
    const resolved = await createRunDeps({ glossary: false });
    if (!resolved.ok) return { kind: 'error', error: depsError(resolved, isDesktop()) };
    const { client, preset, model } = resolved.deps;
    await sweepScratch(SCRATCH_JOB);
    const scratch = await openScratch(SCRATCH_JOB);
    let outcome;
    try {
      outcome = await runCoverage(questions, { client, preset, model }, scratch, {
        side: leadSide(questions),
        whyLanguage: uiLanguage() === 'en' ? 'en' : 'zh',
        signal: io.signal,
        onProgress: (done, total) => io.progress(done, total, m.analysingQuestions(total)),
      });
    } finally {
      await scratch.dispose();
    }
    const { results, total } = outcome;
    const analysed = results.filter((r) => r.ok).length;
    if (outcome.fatal && analysed === 0) return { kind: 'error', error: outcome.fatal };
    const report = buildReport(results, total);
    const tagged = report.units.some((u) => u.picks.length > 0);
    if (!tagged) return { kind: 'nothing', summary: m.coverageNothing };
    const { hit, of } = report.breadth.keyPoints;
    const head = m.coverageHead(hit, of, percent(of ? hit / of : null));
    const tail = [
      outcome.fatal ? m.qualityStoppedWith(outcome.fatal.message) : outcome.stopped ? m.qualityStoppedEarly : '',
      report.missing ? m.coverageNotAnalysed(report.missing) : '',
    ].filter(Boolean).join(m.tailJoin);
    return {
      kind: 'report',
      summary: tail ? m.qualityWithTail(head, tail) : head,
      report,
      rebuild: (choice) => buildReport(results, total, choice),
    };
  },
};

registerVerb(coverageVerb);
