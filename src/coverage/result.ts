import { plain } from '@/model/text';
import type { PaperSize, Worksheet } from '@/model/types';
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
