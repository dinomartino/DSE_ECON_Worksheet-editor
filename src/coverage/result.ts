import { COVERAGE_RECORD_VERSION } from '@/model/coverageReports';
import { plain } from '@/model/text';
import type { PaperSize, SavedCoverageReport, SavedQuestionResult, Worksheet } from '@/model/types';
import { SYLLABUS } from '@/syllabus';
import type { ReportLanguage } from './language';
import { buildReport, type CoverageReport, type ElectiveChoice } from './report';
import type { QuestionResult } from './types';

/**
 * What a coverage run hands the reader (k-0489): the report, the language it is written in
 * (the paper's), what was analysed, and for a whole set each paper's own report beside the
 * combined one. Rebuilt whole when the teacher picks the Elective Part counted.
 */

export type CoverageScope = 'paper' | 'part' | 'set';

export interface PaperCoverage {
  /** Paper 1, Paper 2: what the set calls it. */
  paper: number;
  title: string;
  report: CoverageReport;
}

export interface CoverageResult {
  /** The saved check it was built from (`SavedCoverageReport.id`). */
  id?: string;
  language: ReportLanguage;
  /** The paper's title, or the set's name. */
  title: string;
  scope: CoverageScope;
  /** ISO time the run finished: the report's date. */
  at: string;
  /** The printed report's sheet size: the (first) paper's. */
  pageSize: PaperSize;
  /** One paper: its report. A set: every paper's results together. */
  report: CoverageReport;
  /** A set only, in set order. */
  papers?: PaperCoverage[];
}

/** One paper's run, as the set's verb collects it. */
export interface PaperRun {
  paper: number;
  title: string;
  results: QuestionResult[];
  sent: number;
}

/** The paper's name in `language` where it has one: its file name, else its title. */
export function titleIn(worksheet: Pick<Worksheet, 'name' | 'title'>, language: ReportLanguage): string {
  const other = language === 'en' ? 'zh' : 'en';
  return worksheet.name?.trim() || plain(worksheet.title[language]).trim() || plain(worksheet.title[other]).trim();
}

export function paperResult(
  base: Omit<CoverageResult, 'report' | 'papers'>,
  results: QuestionResult[],
  sent: number,
  choice: ElectiveChoice = 'auto',
): CoverageResult {
  return { ...base, report: buildReport(results, sent, choice) };
}

/** A whole set: the combined report over every paper's results, each paper's beside it. */
export function setResult(base: Omit<CoverageResult, 'report' | 'papers'>, runs: PaperRun[], choice: ElectiveChoice = 'auto'): CoverageResult {
  const all = runs.flatMap((run) => run.results.map((result) => ({ ...result, paper: run.paper })));
  const sent = runs.reduce((n, run) => n + run.sent, 0);
  return {
    ...base,
    report: buildReport(all, sent, choice),
    papers: runs.map((run) => ({ paper: run.paper, title: run.title, report: buildReport(run.results, run.sent, choice) })),
  };
}

/**
 * The papers' numbers in a set: Paper 1 and Paper 2 by what each is (`setRoleOf`), else by
 * place in set order (two papers of one kind, or neither kind).
 */
export function paperNumbers(roles: readonly (string | undefined)[]): number[] {
  const byRole = roles.map((role) => (role === 'paper1' ? 1 : role === 'paper2' ? 2 : 0));
  const unique = byRole.every((n) => n > 0) && new Set(byRole).size === byRole.length;
  return unique ? byRole : roles.map((_, i) => i + 1);
}

/** What a check keeps of each question's result (k-0489 v2): no temporary-file keys, no `outside`. */
export function toSavedResults(results: readonly QuestionResult[]): SavedQuestionResult[] {
  return results.map((result) => ({
    number: result.number,
    ok: result.ok,
    units: result.units.map((unit) => ({
      label: unit.label,
      marks: unit.marks,
      picks: unit.picks.map(({ code, w, band, conf, why }) => ({ code, w, band, conf, why })),
    })),
  }));
}

/** A saved check's results, as the report builder reads them. */
export function fromSavedResults(saved: readonly SavedQuestionResult[]): QuestionResult[] {
  return saved.map((result) => ({
    questionId: '',
    number: result.number,
    ok: result.ok,
    units: result.units.map((unit) => ({ key: `${result.number}${unit.label}`, label: unit.label, marks: unit.marks, picks: unit.picks, outside: '' })),
  }));
}

/** One paper as a check read it, for the record. */
export interface CheckedPaper {
  worksheetId: string;
  paper?: number;
  title: string;
  sent: number;
  fingerprint: string;
  results: readonly QuestionResult[];
}

/** The record a finished check is saved as. */
export function coverageRecord(
  base: Omit<CoverageResult, 'report' | 'papers' | 'id'> & { id: string; setId?: string },
  papers: readonly CheckedPaper[],
): SavedCoverageReport {
  return {
    v: COVERAGE_RECORD_VERSION,
    id: base.id,
    at: base.at,
    scope: base.scope,
    language: base.language,
    title: base.title,
    pageSize: base.pageSize,
    syllabus: SYLLABUS.id,
    ...(base.setId ? { setId: base.setId } : {}),
    runs: papers.map((p) => ({
      worksheetId: p.worksheetId,
      ...(p.paper !== undefined ? { paper: p.paper } : {}),
      title: p.title,
      sent: p.sent,
      fingerprint: p.fingerprint,
      results: toSavedResults(p.results),
    })),
  };
}

/**
 * The report a saved check reads as: built again from what the AI said then, so it shows
 * exactly what was checked whatever the paper says now. `choice`: the Elective Part counted.
 */
export function coverageFromSaved(record: SavedCoverageReport, choice: ElectiveChoice = 'auto'): CoverageResult {
  const base = { id: record.id, language: record.language, title: record.title, scope: record.scope, at: record.at, pageSize: record.pageSize };
  if (record.scope !== 'set') {
    const run = record.runs[0];
    return paperResult(base, fromSavedResults(run.results), run.sent, choice);
  }
  const runs: PaperRun[] = record.runs.map((run, i) => ({ paper: run.paper ?? i + 1, title: run.title, results: fromSavedResults(run.results), sent: run.sent }));
  return setResult(base, runs, choice);
}

/**
 * Which papers of a saved check read differently now: their positions in `record.runs`.
 * `fingerprintOf` gives a paper's fingerprint now, or undefined when the paper is not at
 * hand (not loaded, deleted): such a paper is not called changed.
 */
export function changedRuns(record: SavedCoverageReport, fingerprintOf: (worksheetId: string) => string | undefined): number[] {
  return record.runs.flatMap((run, i) => {
    const now = fingerprintOf(run.worksheetId);
    return now !== undefined && now !== run.fingerprint ? [i] : [];
  });
}
