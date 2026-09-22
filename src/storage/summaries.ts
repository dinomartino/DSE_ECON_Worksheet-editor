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
