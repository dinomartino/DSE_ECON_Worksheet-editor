import type { Worksheet } from '@/model/types';
import type { WorksheetSummary } from './types';

/**
 * How an index array becomes a file list — shared by every store so they cannot drift.
 *
 * **One damaged entry may not cost the whole list.** The index is the only route to a
 * saved worksheet (§ the start screen), so an empty list reads as "all your work is
 * gone" — and it used to be one keystroke away: entries were cast unvalidated and
 * sorted on `updatedAt`, so a single row missing that field threw inside the sort, hit
 * the catch, and returned `[]` while every document sat intact in storage.
 *
 * So each entry is judged on its own. A row is kept when it carries the two fields the
 * list cannot work without — an `id` to open and a `title` to print; anything else it
 * holds is passed through untouched (a newer build's fields survive an older build's
 * read, as `__unknown` does for documents). An undated row sorts last rather than being
 * dropped: a document with a missing timestamp is still a document.
 */
export function usableSummaries(parsed: unknown): WorksheetSummary[] {
  if (!Array.isArray(parsed)) return [];
  const usable = parsed.filter(
    (entry): entry is WorksheetSummary =>
      !!entry &&
      typeof entry === 'object' &&
      typeof (entry as WorksheetSummary).id === 'string' &&
      typeof (entry as WorksheetSummary).title === 'string',
  );
  return usable.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
}

/** The index after a save: this document's fresh summary first, no duplicate row. */
export function withSummaryFirst(
  summaries: WorksheetSummary[],
  summary: WorksheetSummary,
): WorksheetSummary[] {
  return [summary, ...summaries.filter((entry) => entry.id !== summary.id)];
}

/**
 * The revision of the row `summarize` writes. At 2 a row records `kind`, so one without
 * it is a paper. A row below 2 (written or rebuilt by v0.5.0 or earlier) lacks `kind`
 * even for a bank: its missing kind is not evidence, so `kindRepairs` reads the document.
 */
export const INDEX_ROW_REV = 2;

/** Whether this row's missing `kind` can be trusted (§ INDEX_ROW_REV). */
function recordsKind(entry: WorksheetSummary): boolean {
  return typeof entry.indexRev === 'number' && entry.indexRev >= INDEX_ROW_REV;
}

/** `row` with its kind as the document has it, marked as recording kind. */
function withKind(row: WorksheetSummary, kind: unknown): WorksheetSummary {
  const next: WorksheetSummary = { ...row, indexRev: INDEX_ROW_REV };
  if (typeof kind === 'string') next.kind = kind;
  else delete next.kind;
  return next;
}

/**
 * The rows written before `kind` was, repaired from their documents, by id. A document
 * that is missing or will not load is skipped: its row stays as it was, still listed.
 */
export async function kindRepairs(
  rows: readonly WorksheetSummary[],
  load: (id: string) => Promise<Pick<Worksheet, 'kind'> | undefined>,
): Promise<Map<string, WorksheetSummary>> {
  const repairs = new Map<string, WorksheetSummary>();
  for (const row of rows) {
    if (recordsKind(row)) continue;
    const doc = await load(row.id).catch(() => undefined);
    if (doc) repairs.set(row.id, withKind(row, doc.kind));
  }
  return repairs;
}

/**
 * The raw index array with `repairs` written in; every other entry, a damaged one
 * included, is left as it was. Meant for a fresh read: a row already revised, or saved
 * since it was checked (`updatedAt` moved), is not overwritten.
 */
export function withKindRepairs(parsed: unknown, repairs: ReadonlyMap<string, WorksheetSummary>): unknown {
  if (!Array.isArray(parsed)) return parsed;
  return parsed.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return entry;
    const row = entry as WorksheetSummary;
    const repair = typeof row.id === 'string' ? repairs.get(row.id) : undefined;
    if (!repair || recordsKind(row) || row.updatedAt !== repair.updatedAt) return entry;
    return withKind(row, repair.kind);
  });
}
