import { depsError } from './translateShared';
import type { ReportLanguage } from '@/coverage/language';
import { reportLanguage } from '@/coverage/language';
import { percent, type CoverageReport } from '@/coverage/report';
import { leadSide } from '@/coverage/prompt';
import { paperNumbers, paperResult, setResult, titleIn, type CoverageResult, type PaperRun } from '@/coverage/result';
import { runCoverage } from '@/coverage/run';
import type { CoverageDeps, CoverageQuestion, CoverageRunOutcome } from '@/coverage/types';
import { markedUnits } from '@/coverage/units';
import { uiLanguage } from '@/i18n/language';
import { computeNumbering } from '@/model/numbering';
import { pageSetupOf } from '@/model/page';
import { setRoleOf } from '@/model/paperSet';
import type { Worksheet } from '@/model/types';
import { isDesktop } from '@/platform';
import { openScratch, sweepScratch } from '@/platform/scratch';
import { qualityQuestions, questionEmpty } from '@/quality/collect';
import { createRunDeps } from '@/translate/deps';
import { assistMessages } from '../text';
import { registerVerb } from '../registry';
import type { AiVerb, VerbContext, VerbIO, VerbOutcome } from '../types';

/**
 * Check syllabus coverage (k-0317, design § 10.11 of
 * `docs/research/2026-11-syllabus-analysis.md`): every question with words goes to the AI
 * provider set in Settings (the one Chinese translation uses), each question's result goes
 * to a temporary file, the report is built from those files, and the files are deleted.
 * Writes nothing to the document.
 *
 * The report is written in the paper's language (`reportLanguage`, k-0489), and a paper in
 * a set can be checked with the rest of its set (`coverageSetVerb`): one report over every
 * paper, each paper's beside it.
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

const appLanguage = (): ReportLanguage => (uiLanguage() === 'en' ? 'en' : 'zh');

/** One paper's questions through the model, each result in a temporary file deleted after. */
async function analysePaper(
  questions: CoverageQuestion[],
  deps: CoverageDeps,
  language: ReportLanguage,
  signal: AbortSignal,
  onProgress: (done: number, total: number) => void,
): Promise<CoverageRunOutcome> {
  const scratch = await openScratch(SCRATCH_JOB);
  try {
    return await runCoverage(questions, deps, scratch, { side: leadSide(questions), whyLanguage: language, signal, onProgress });
  } finally {
    await scratch.dispose();
  }
}

/** The bar's line: the headline, and why it may be partial. */
function summaryOf(head: (hit: number, of: number, pct: string) => string, report: CoverageReport, outcome: { stopped: boolean; fatal?: { message: string } }): string {
  const m = assistMessages();
  const { hit, of } = report.breadth.keyPoints;
  const line = head(hit, of, percent(of ? hit / of : null));
  const tail = [
    outcome.fatal ? m.qualityStoppedWith(outcome.fatal.message) : outcome.stopped ? m.qualityStoppedEarly : '',
    report.missing ? m.coverageNotAnalysed(report.missing) : '',
  ].filter(Boolean).join(m.tailJoin);
  return tail ? m.qualityWithTail(line, tail) : line;
}

const tagged = (result: CoverageResult) => result.report.units.some((u) => u.picks.length > 0);

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
    const language = reportLanguage([questions], ctx.mode.language, appLanguage());
    await sweepScratch(SCRATCH_JOB);
    const outcome = await analysePaper(questions, resolved.deps, language, io.signal, (done, total) =>
      io.progress(done, total, m.analysingQuestions(total)));
    const { results, total } = outcome;
    const analysed = results.filter((r) => r.ok).length;
    if (outcome.fatal && analysed === 0) return { kind: 'error', error: outcome.fatal };
    const base = {
      language,
      title: titleIn(ctx.worksheet, language),
      scope: ctx.scope.kind === 'paper' ? ('paper' as const) : ('part' as const),
      at: new Date().toISOString(),
      pageSize: pageSetupOf(ctx.worksheet).paper,
    };
    const coverage = paperResult(base, results, total);
    if (!tagged(coverage)) return { kind: 'nothing', summary: m.coverageNothing };
    return {
      kind: 'report',
      summary: summaryOf(m.coverageHead, coverage.report, outcome),
      coverage,
      rebuild: (choice) => paperResult(base, results, total, choice),
    };
  },
};

/** The set's papers with questions, when there are two or more (one is just this paper). */
const setPapers = (ctx: VerbContext): Worksheet[] | undefined =>
  ctx.paperSet && ctx.paperSet.papers.length >= 2 ? ctx.paperSet.papers : undefined;

const wholePaper = (worksheet: Worksheet) => coverageQuestions({ worksheet, scope: { kind: 'paper' } });

/**
 * Check coverage for the whole set (k-0489): every paper of the open paper's set, whole,
 * one after another through the same provider; one report over them all (each key point
 * counted once across the set, marks added as printed) with each paper's own beside it.
 * Its id extends `check.syllabus`, so pausing that pauses this too (`isPaused`).
 */
export const coverageSetVerb: AiVerb = {
  id: 'check.syllabus.set',
  group: 'check',
  order: 31,
  needsKey: true,
  label: () => assistMessages().coverageSetLabel,

  available(ctx) {
    const papers = setPapers(ctx);
    if (!papers) return null;
    const m = assistMessages();
    const withWords = papers.filter((paper) => wholePaper(paper).length > 0).length;
    return withWords >= 2
      ? { count: papers.length, unit: m.unitPapers(papers.length) }
      : { count: papers.length, unit: m.unitPapers(papers.length), disabledReason: m.setBlank };
  },

  sendsLine(ctx, providerLabel) {
    const papers = setPapers(ctx) ?? [];
    const n = papers.reduce((sum, paper) => sum + wholePaper(paper).length, 0);
    return assistMessages().sendsCoverageSet(n, papers.length, providerLabel);
  },

  async run(ctx, io: VerbIO): Promise<VerbOutcome> {
    const m = assistMessages();
    const papers = (setPapers(ctx) ?? []).map((worksheet) => ({ worksheet, questions: wholePaper(worksheet) })).filter((p) => p.questions.length > 0);
    if (papers.length === 0) return { kind: 'nothing', summary: m.coverageNothing };
    const resolved = await createRunDeps({ glossary: false });
    if (!resolved.ok) return { kind: 'error', error: depsError(resolved, isDesktop()) };
    const language = reportLanguage(papers.map((p) => p.questions), ctx.mode.language, appLanguage());
    const numbers = paperNumbers(papers.map((p) => setRoleOf(p.worksheet)));
    const grand = papers.reduce((n, p) => n + p.questions.length, 0);
    await sweepScratch(SCRATCH_JOB);

    const runs: PaperRun[] = [];
    let stopped = false;
    let fatal: CoverageRunOutcome['fatal'];
    let before = 0;
    for (const [i, { worksheet, questions }] of papers.entries()) {
      if (io.signal.aborted || fatal) {
        stopped ||= io.signal.aborted;
        break;
      }
      const offset = before;
      const outcome = await analysePaper(questions, resolved.deps, language, io.signal, (done) =>
        io.progress(offset + done, grand, m.analysingPaper(i + 1, papers.length, questions.length)));
      before += questions.length;
      stopped ||= outcome.stopped;
      fatal ??= outcome.fatal;
      runs.push({ paper: numbers[i], title: titleIn(worksheet, language), results: outcome.results, sent: outcome.total });
    }
    // Papers never reached still count as sent, so the report says they were not analysed.
    for (const [i, { worksheet, questions }] of papers.entries()) {
      if (i >= runs.length) runs.push({ paper: numbers[i], title: titleIn(worksheet, language), results: [], sent: questions.length });
    }

    const analysed = runs.reduce((n, run) => n + run.results.filter((r) => r.ok).length, 0);
    if (fatal && analysed === 0) return { kind: 'error', error: fatal };
    const base = {
      language,
      title: ctx.paperSet!.name.trim() || titleIn(ctx.worksheet, language),
      scope: 'set' as const,
      at: new Date().toISOString(),
      pageSize: pageSetupOf(papers[0].worksheet).paper,
    };
    const coverage = setResult(base, runs);
    if (!tagged(coverage)) return { kind: 'nothing', summary: m.coverageNothing };
    return {
      kind: 'report',
      summary: summaryOf(m.coverageSetHead, coverage.report, { stopped, ...(fatal ? { fatal } : {}) }),
      coverage,
      rebuild: (choice) => setResult(base, runs, choice),
    };
  },
};

registerVerb(coverageVerb);
registerVerb(coverageSetVerb);
