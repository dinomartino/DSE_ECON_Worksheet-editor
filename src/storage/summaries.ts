import type { Worksheet } from '@/model/types';
import { paperSetOf, setRoleOf } from '@/model/paperSet';
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
 * The revision of the row `summarize` writes, and what a row at it can be trusted for:
 *  - 2: it records `kind`, so one without it is a paper. A row below 2 (written or rebuilt by
 *    v0.5.0 or earlier) lacks `kind` even for a bank.
 *  - 3: it also records `set` and `paper` (paper sets, k-0299), so one without them is in no
 *    set / no exam paper. A row below 3 (any build before sets, including one that just
 *    re-saved a member) may lack them for a paper that has them.
 * A missing fact on a row below the revision is not evidence, so `kindRepairs` reads the
 * document, once, and writes what it holds.
 */
export const INDEX_ROW_REV = 3;

/** What a row records about its document beyond the counts: kind, set and exam paper. */
export type RowFacts = Pick<WorksheetSummary, 'kind' | 'set' | 'paper'>;

/**
 * The facts `summarize` writes and a repair restores, from the document. Each only when set:
 * a bank (or a later build's kind, passed through), a valid set, a Paper 1 or 2.
 */
export function rowFacts(worksheet: Worksheet): RowFacts {
  const set = paperSetOf(worksheet);
  // A shape this build half-knows reads as no exam paper rather than a failed save or repair.
  let paper: RowFacts['paper'];
  try {
    paper = setRoleOf(worksheet);
  } catch {
    paper = undefined;
  }
  return {
    ...(typeof worksheet.kind === 'string' ? { kind: worksheet.kind } : {}),
    ...(set ? { set: { id: set.id, name: set.name } } : {}),
    ...(paper ? { paper } : {}),
  };
}

/** Whether this row's missing facts can be trusted (§ INDEX_ROW_REV). */
function recordsFacts(entry: WorksheetSummary): boolean {
  return typeof entry.indexRev === 'number' && entry.indexRev >= INDEX_ROW_REV;
}

/** `row` with its facts as the document has them, marked as recording them. */
function withFacts(row: WorksheetSummary, facts: RowFacts): WorksheetSummary {
  const next: WorksheetSummary = { ...row, indexRev: INDEX_ROW_REV };
  delete next.kind;
  delete next.set;
  delete next.paper;
  return { ...next, ...facts };
}

/**
 * The rows written before their facts were, repaired from their documents, by id. A document
 * that is missing or will not load is skipped: its row stays as it was, still listed.
 */
export async function kindRepairs(
  rows: readonly WorksheetSummary[],
  load: (id: string) => Promise<Worksheet | undefined>,
): Promise<Map<string, WorksheetSummary>> {
  const repairs = new Map<string, WorksheetSummary>();
  for (const row of rows) {
    if (recordsFacts(row)) continue;
    const doc = await load(row.id).catch(() => undefined);
    if (doc) repairs.set(row.id, withFacts(row, rowFacts(doc)));
  }
  return repairs;
}

/** A row's own facts, only those it holds. */
function factsOf(row: WorksheetSummary): RowFacts {
  return {
    ...(row.kind !== undefined ? { kind: row.kind } : {}),
    ...(row.set !== undefined ? { set: row.set } : {}),
    ...(row.paper !== undefined ? { paper: row.paper } : {}),
  };
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
    if (!repair || recordsFacts(row) || row.updatedAt !== repair.updatedAt) return entry;
    return withFacts(row, factsOf(repair));
  });
}
