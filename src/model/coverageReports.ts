import type { SavedCoverageReport, SavedCoverageRun, SavedPick, SavedQuestionResult, Worksheet } from './types';

/**
 * Saved syllabus coverage checks (k-0489 v2): every check, one paper's or a whole set's, is
 * kept with the paper (`Worksheet.coverageReports`), so a teacher who closes the report
 * without downloading the PDF loses nothing. It lives in the document itself, so it goes
 * wherever the paper goes: autosave, sync, a `.json` copy, a backup.
 *
 * - **Older builds keep it.** It changes nothing a paper prints, so it never raises the
 *   written schema version (`writtenSchemaVersion`): 0.10.0 and older open the paper as
 *   always, editable, and carry the field through their saves untouched (`__unknown`).
 * - **Read tolerantly.** A record that is not one of ours is dropped on load; a record of a
 *   newer format (`v` above 1) is kept as it is and never shown or counted.
 * - **A few per paper.** At most `MAX_COVERAGE_REPORTS` readable records; the oldest goes
 *   when a new one comes in.
 * - **Belongs to this paper.** A duplicate leaves them behind (`duplicateWorksheet`,
 *   `duplicateSetPapers`); a record naming another paper (copied by an older build) is
 *   not shown here.
 */

export const MAX_COVERAGE_REPORTS = 5;
export const COVERAGE_RECORD_VERSION = 1;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const oneOf = <T extends string>(value: unknown, options: readonly T[]): value is T =>
  typeof value === 'string' && (options as readonly string[]).includes(value);

const isPick = (value: unknown): value is SavedPick =>
  isRecord(value) &&
  isString(value.code) &&
  (value.w === 1 || value.w === 2) &&
  oneOf(value.band, ['know', 'apply', 'evaluate']) &&
  oneOf(value.conf, ['high', 'medium', 'low']) &&
  isString(value.why);

const isResult = (value: unknown): value is SavedQuestionResult =>
  isRecord(value) &&
  isString(value.number) &&
  typeof value.ok === 'boolean' &&
  Array.isArray(value.units) &&
  value.units.every(
    (unit) => isRecord(unit) && isString(unit.label) && isCount(unit.marks) && Array.isArray(unit.picks) && unit.picks.every(isPick),
  );

const isRun = (value: unknown): value is SavedCoverageRun =>
  isRecord(value) &&
  isString(value.worksheetId) &&
  (value.paper === undefined || isCount(value.paper)) &&
  isString(value.title) &&
  isCount(value.sent) &&
  isString(value.fingerprint) &&
  Array.isArray(value.results) &&
  value.results.every(isResult);

/** A record this build reads (format 1, every field in shape). */
export function isSavedCoverageReport(value: unknown): value is SavedCoverageReport {
  return (
    isRecord(value) &&
    value.v === COVERAGE_RECORD_VERSION &&
    isString(value.id) &&
    isString(value.at) &&
    !Number.isNaN(Date.parse(value.at)) &&
    oneOf(value.scope, ['paper', 'part', 'set']) &&
    oneOf(value.language, ['en', 'zh']) &&
    isString(value.title) &&
    oneOf(value.pageSize, ['A4', 'A3', 'Letter', 'Legal']) &&
    isString(value.syllabus) &&
    (value.setId === undefined || isString(value.setId)) &&
    Array.isArray(value.runs) &&
    value.runs.length > 0 &&
    value.runs.every(isRun)
  );
}

/** A newer build's record: kept untouched, never read. */
const isNewerRecord = (value: unknown): boolean =>
  isRecord(value) && typeof value.v === 'number' && value.v > COVERAGE_RECORD_VERSION;

/**
 * The stored field as loaded: not a list → nothing; each entry kept when this build reads it
 * or a newer build wrote it, dropped otherwise. Empty → undefined.
 */
export function normalizeCoverageReports(raw: unknown): unknown[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const kept = raw.filter((entry) => isSavedCoverageReport(entry) || isNewerRecord(entry));
  return kept.length > 0 ? kept : undefined;
}

/** The checks shown with this paper, newest first: ours, and naming this paper. */
export function savedCoverageReports(worksheet: Pick<Worksheet, 'id' | 'coverageReports'>): SavedCoverageReport[] {
  return (worksheet.coverageReports ?? [])
    .filter(isSavedCoverageReport)
    .filter((record) => record.runs.some((run) => run.worksheetId === worksheet.id))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/**
 * `worksheet` with `record` kept: newest first, one of each id, at most
 * `MAX_COVERAGE_REPORTS` readable records (the oldest dropped). A newer build's records stay.
 */
export function withCoverageReport<T extends Pick<Worksheet, 'coverageReports'>>(worksheet: T, record: SavedCoverageReport): T {
  const stored = worksheet.coverageReports ?? [];
  const ours = stored
    .filter(isSavedCoverageReport)
    .filter((entry) => entry.id !== record.id)
    .concat(record)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, MAX_COVERAGE_REPORTS);
  const newer = stored.filter(isNewerRecord);
  return { ...worksheet, coverageReports: [...ours, ...newer] };
}

/** `worksheet` without the record `id`; the field goes when nothing is left. Unchanged when absent. */
export function withoutCoverageReport<T extends Pick<Worksheet, 'coverageReports'>>(worksheet: T, id: string): T {
  const stored = worksheet.coverageReports ?? [];
  const next = stored.filter((entry) => !(isRecord(entry) && entry.id === id && isSavedCoverageReport(entry)));
  if (next.length === stored.length) return worksheet;
  if (next.length > 0) return { ...worksheet, coverageReports: next };
  const { coverageReports: _gone, ...rest } = worksheet;
  void _gone;
  return rest as T;
}
