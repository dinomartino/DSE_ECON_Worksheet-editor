import { usableSummaries } from './summaries';
import type { TrashedSummary, WorksheetSummary } from './types';

/**
 * Trash rules shared by both stores, so they cannot drift.
 *
 * Trash is a *separate* list beside the index, never a flag on an index row: an older
 * build reads the index without knowing about Trash, and would show a flagged row as a
 * live document. To it, a trashed document is simply not listed.
 */

export const TRASH_RETENTION_DAYS = 30;
const DAY_MS = 86_400_000;

/** Trash rows judged one at a time, like the index — most recently deleted first. */
export function usableTrash(parsed: unknown): TrashedSummary[] {
  const rows = usableSummaries(parsed) as TrashedSummary[];
  return rows.sort((a, b) => String(b.deletedAt ?? '').localeCompare(String(a.deletedAt ?? '')));
}

/**
 * Apply the retention window. A row past it is `expired`; a row with no readable date
 * is re-dated to now — a fresh window, never an instant purge on bad data.
 */
export function settleTrash(
  rows: TrashedSummary[],
  now: number,
): { kept: TrashedSummary[]; expired: TrashedSummary[]; changed: boolean } {
  const kept: TrashedSummary[] = [];
  const expired: TrashedSummary[] = [];
  let changed = false;
  for (const row of rows) {
    const deleted = Date.parse(row.deletedAt);
    if (Number.isNaN(deleted)) {
      kept.push({ ...row, deletedAt: new Date(now).toISOString() });
      changed = true;
    } else if (now - deleted >= TRASH_RETENTION_DAYS * DAY_MS) {
      expired.push(row);
      changed = true;
    } else {
      kept.push(row);
    }
  }
  return { kept, expired, changed };
}

/** Whole days since deletion, and whole days left before the purge (at least 0). */
export function trashAge(deletedAt: string, now: number): { daysAgo: number; daysLeft: number } {
  const deleted = Date.parse(deletedAt);
  if (Number.isNaN(deleted)) return { daysAgo: 0, daysLeft: TRASH_RETENTION_DAYS };
  const elapsed = Math.max(0, now - deleted);
  return {
    daysAgo: Math.floor(elapsed / DAY_MS),
    daysLeft: Math.max(0, Math.ceil((TRASH_RETENTION_DAYS * DAY_MS - elapsed) / DAY_MS)),
  };
}

/** A Trash row as an index row again. */
export function untrashed(row: TrashedSummary): WorksheetSummary {
  const summary: Partial<TrashedSummary> = { ...row };
  delete summary.deletedAt;
  return summary as WorksheetSummary;
}
