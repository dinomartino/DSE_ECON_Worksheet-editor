import { matchItem, paperKey, papersOf, sittingKey, type PaperChoice, type PastPaperQuery, type SourceInfo } from './pack';

/**
 * The Past paper bank by year (k-0497, user u-nlb5): every paper the bank holds under its exam
 * and year, read off the source tags the bank already carries (`DSE2016/P1/Q34`), so the list
 * needs no topic downloaded when the list has its search index. HKDSE first, newest year first
 * (2026 … 2012, then the Practice and Sample papers), then HKCEE, then HKALE. A year holds its
 * papers in paper order; its questions show in paper, then question-number order.
 */

export type YearExam = Exclude<SourceInfo['exam'], 'other'>;

/** The order exams are listed in: the current exam first, as teachers reach for it most. */
export const YEAR_EXAMS: readonly YearExam[] = ['HKDSE', 'HKCEE', 'HKALE'];

/** One exam year (`DSE2016`): the papers of it in the bank. */
export interface Sitting {
  /** `sittingKey`: `DSE2016`, `DSESP`. */
  key: string;
  exam: YearExam;
  /** A paper's source, for its year or sample / practice mark (`whenLabel`). */
  source: SourceInfo;
  /** In paper order. */
  papers: PaperChoice[];
  questions: number;
}

export interface ExamYears {
  exam: YearExam;
  /** Newest first; the practice and sample papers after the years. */
  sittings: Sitting[];
  questions: number;
}

/** Newest first; a practice paper, then a sample paper, after every dated year. */
const sittingRank = (s: Pick<SourceInfo, 'year' | 'special'>) => (s.special === 'PP' ? 1 : s.special === 'SP' ? 0 : 10_000 + (s.year ?? 0));

/** Two sources in the by-year order: exam, newest year, paper, question number. */
export function compareByYear(a: SourceInfo, b: SourceInfo): number {
  const exam = (s: SourceInfo) => {
    const at = YEAR_EXAMS.indexOf(s.exam as YearExam);
    return at < 0 ? YEAR_EXAMS.length : at;
  };
  return (
    exam(a) - exam(b) ||
    sittingRank(b) - sittingRank(a) ||
    (a.paper ?? 0) - (b.paper ?? 0) ||
    (a.number ?? 0) - (b.number ?? 0)
  );
}

/** The papers (`papersOf`) under their exam and year, in the by-year order; empty exams left out. */
export function groupByYear(papers: readonly PaperChoice[]): ExamYears[] {
  const byKey = new Map<string, Sitting>();
  for (const paper of papers) {
    if (paper.source.exam === 'other') continue;
    const key = sittingKey(paper.source);
    if (!key) continue;
    const known = byKey.get(key);
    if (known) {
      known.papers.push(paper);
      known.questions += paper.questions;
    } else {
      byKey.set(key, { key, exam: paper.source.exam, source: paper.source, papers: [paper], questions: paper.questions });
    }
  }
  for (const sitting of byKey.values()) sitting.papers.sort((a, b) => (a.source.paper ?? 0) - (b.source.paper ?? 0));
  return YEAR_EXAMS.flatMap((exam) => {
    const sittings = [...byKey.values()].filter((s) => s.exam === exam).sort((a, b) => sittingRank(b.source) - sittingRank(a.source));
    return sittings.length === 0 ? [] : [{ exam, sittings, questions: sittings.reduce((n, s) => n + s.questions, 0) }];
  });
}

/** Every sitting of the groups, in list order. */
export const sittingsOf = (groups: readonly ExamYears[]): Sitting[] => groups.flatMap((g) => g.sittings);

/** The sitting a paper key (`DSE2016/P1`) belongs to: `DSE2016`. */
export const sittingOfPaper = (key: string) => key.split('/')[0] ?? '';

/** What the by-year view shows, from the questions the bank lists and the teacher's filters. */
export interface YearSelection {
  /** Every paper under its exam and year, as the exam and year filters leave them. */
  groups: ExamYears[];
  /** The open year: the one chosen while the filters keep it, else the list's first (the newest HKDSE). */
  sitting?: Sitting;
  /** One paper of the open year, when the teacher narrowed to it. */
  paper?: string;
  /** The question filter: the open year (or paper) and the words; by every year, the words and the exam and year filters. */
  query: PastPaperQuery;
}

export function yearSelection(
  rows: readonly { source: SourceInfo; searchText: string }[],
  filters: { words: string; exams: readonly SourceInfo['exam'][]; from?: number; to?: number; paper?: string },
  chosen: string | undefined,
  everyYear: boolean,
): YearSelection {
  const range = { exams: filters.exams, from: filters.from, to: filters.to };
  const groups = groupByYear(papersOf(rows.filter((row) => matchItem(row, range))));
  const all = sittingsOf(groups);
  const sitting = all.find((s) => s.key === chosen) ?? all[0];
  const paper = filters.paper !== undefined && sitting?.papers.some((p) => p.key === filters.paper) ? filters.paper : undefined;
  const query: PastPaperQuery = everyYear
    ? { words: filters.words, ...range }
    : // No year at all (nothing listed): a sitting no tag has, so nothing matches.
      { words: filters.words, sitting: sitting?.key ?? '-', ...(paper ? { paper } : {}) };
  return { groups, ...(sitting ? { sitting } : {}), ...(paper ? { paper } : {}), query };
}

/** A row of the by-year list a keyboard walks: a year, or (under the open year) one of its papers. */
export interface YearRow {
  /** The year's key (`DSE2016`) or the paper's (`AL2005/P2`). */
  id: string;
  sitting: string;
  paper?: string;
}

/** The rows on show: each open exam's years, and under the open year its papers when it has more than one. */
export function yearRows(groups: readonly ExamYears[], closed: ReadonlySet<YearExam>, open: string | undefined): YearRow[] {
  return groups.flatMap((group) =>
    closed.has(group.exam)
      ? []
      : group.sittings.flatMap((sitting) => [
          { id: sitting.key, sitting: sitting.key },
          ...(sitting.key === open && sitting.papers.length > 1
            ? sitting.papers.map((p) => ({ id: p.key, sitting: sitting.key, paper: p.key }))
            : []),
        ]),
  );
}

/**
 * Where a key moves from the row `id`: ↑ / ↓ the row above or below, Home / End the first and
 * last year, → a year's first paper, ← from a paper back to its year. Undefined: the key does
 * not move (the edge of the list, or a key this list does not use).
 */
export function stepYearRow(rows: readonly YearRow[], id: string, key: string): YearRow | undefined {
  const at = rows.findIndex((row) => row.id === id);
  if (at < 0) return undefined;
  const years = rows.filter((row) => row.paper === undefined);
  switch (key) {
    case 'ArrowDown':
      return rows[at + 1];
    case 'ArrowUp':
      return rows[at - 1];
    case 'Home':
      return years[0]?.id === id ? undefined : years[0];
    case 'End':
      return years.at(-1)?.id === id ? undefined : years.at(-1);
    case 'ArrowRight':
      return rows[at].paper === undefined && rows[at + 1]?.paper !== undefined ? rows[at + 1] : undefined;
    case 'ArrowLeft':
      return rows[at].paper !== undefined ? years.find((row) => row.sitting === rows[at].sitting) : undefined;
    default:
      return undefined;
  }
}

export { paperKey };
