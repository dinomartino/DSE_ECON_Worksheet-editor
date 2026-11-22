import { depsError } from './translateShared';
import type { ReportLanguage } from '@/coverage/language';
import { reportLanguage } from '@/coverage/language';
import { percent, type CoverageReport } from '@/coverage/report';
import { leadSide } from '@/coverage/prompt';
import {
  coverageFromSaved,
  coverageRecord,
  paperNumbers,
  paperResult,
  setResult,
  titleIn,
  type CheckedPaper,
  type CoverageResult,
  type PaperRun,
} from '@/coverage/result';
import { runCoverage } from '@/coverage/run';
import type { CoverageDeps, CoverageQuestion, CoverageRunOutcome } from '@/coverage/types';
import { coverageQuestions, paperFingerprint, wholePaperQuestions } from '@/coverage/questions';
import { uiLanguage } from '@/i18n/language';
import { savedCoverageReports } from '@/model/coverageReports';
import { newId } from '@/model/factories';
import { pageSetupOf } from '@/model/page';
import { paperSetOf, setRoleOf } from '@/model/paperSet';
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
 * The finished check is kept with the paper (k-0489 v2, `keepCoverageReport`); the
 * questions are never touched.
 *
 * The report is written in the paper's language (`reportLanguage`, k-0489), and a paper in
 * a set can be checked with the rest of its set (`coverageSetVerb`): one report over every
 * paper, each paper's beside it.
 */

export const SCRATCH_JOB = 'coverage';

export { coverageQuestions };

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
    const paper: CheckedPaper = { worksheetId: ctx.worksheet.id, title: base.title, sent: total, fingerprint: paperFingerprint(ctx.worksheet), results };
    return {
      kind: 'report',
      summary: summaryOf(m.coverageHead, coverage.report, outcome),
      record: coverageRecord({ ...base, id: newId() }, [paper]),
      fresh: true,
    };
  },
};

/** The set's papers with questions, when there are two or more (one is just this paper). */
const setPapers = (ctx: VerbContext): Worksheet[] | undefined =>
  ctx.paperSet && ctx.paperSet.papers.length >= 2 ? ctx.paperSet.papers : undefined;

const wholePaper = wholePaperQuestions;

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
    const checked: CheckedPaper[] = [];
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
      const run = runs[i];
      checked.push({ worksheetId: worksheet.id, paper: run.paper, title: run.title, sent: run.sent, fingerprint: paperFingerprint(worksheet), results: run.results });
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
    const setId = paperSetOf(ctx.worksheet)?.id;
    return {
      kind: 'report',
      summary: summaryOf(m.coverageSetHead, coverage.report, { stopped, ...(fatal ? { fatal } : {}) }),
      record: coverageRecord({ ...base, id: newId(), ...(setId ? { setId } : {}) }, checked),
      fresh: true,
    };
  },
};

/** "22 Nov 2026: 31 of 49 key points (63%)": a saved check's line in the bar and the list. */
export function savedSummary(record: Parameters<typeof coverageFromSaved>[0]): string {
  const m = assistMessages();
  const { hit, of } = coverageFromSaved(record).report.breadth.keyPoints;
  const at = new Date(record.at);
  return m.coverageSavedHead(at.getDate(), at.getMonth() + 1, at.getFullYear(), hit, of, percent(of ? hit / of : null));
}

/**
 * Past coverage reports (k-0489 v2): the checks saved with this paper, the newest opened
 * straight away, the rest a pick away in the report. Nothing is sent and no key is needed.
 * Its id extends `check.syllabus`, so it is paused with the check (`isPaused`).
 */
export const coverageSavedVerb: AiVerb = {
  id: 'check.syllabus.saved',
  group: 'check',
  order: 32,
  needsKey: false,
  label: () => assistMessages().coverageSavedLabel,

  available(ctx) {
    const count = savedCoverageReports(ctx.worksheet).length;
    return count > 0 ? { count, unit: assistMessages().unitReports(count) } : null;
  },

  sendsLine() {
    return assistMessages().coverageSavedLine;
  },

  async run(ctx): Promise<VerbOutcome> {
    const latest = savedCoverageReports(ctx.worksheet)[0];
    if (!latest) return { kind: 'nothing', summary: assistMessages().coverageSavedNone };
    return { kind: 'report', summary: savedSummary(latest), record: latest, fresh: false };
  },
};

registerVerb(coverageVerb);
registerVerb(coverageSetVerb);
registerVerb(coverageSavedVerb);
