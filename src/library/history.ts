import { anySameStudents, classRefs, type ClassRef, type ClassTarget } from './cohort';
import type { BankGroup, BankRow, BankUse } from './types';

/**
 * Newest use date first (`usedOn`: sat, else made — never edited); ties by docId, so the
 * order never depends on input order and curating an old paper never promotes it.
 */
export function newestFirst(a: { usedOn: string; docId: string }, b: { usedOn: string; docId: string }): number {
  if (a.usedOn !== b.usedOn) return a.usedOn < b.usedOn ? 1 : -1;
  return a.docId < b.docId ? -1 : a.docId > b.docId ? 1 : 0;
}

/** A row's or use's classes on its date, cohorts derived. A draft has none. */
export function refsOf(entry: Pick<BankRow, 'classes' | 'usedOn'>): ClassRef[] {
  return classRefs(entry.classes, entry.usedOn);
}

/** Whether this paper row counts as a use with any of `targets`' students. Banks and drafts never do. */
export function rowUsedWith(row: Pick<BankRow, 'docKind' | 'classes' | 'usedOn'>, targets: readonly ClassTarget[]): boolean {
  return row.docKind === 'paper' && targets.length > 0 && anySameStudents(refsOf(row), targets);
}

/**
 * The papers holding a copy of `rootId` (every version), newest first, one entry per
 * document (its first copy's number). Bank documents are storage, not uses, so never
 * appear. Drafts (no classes) do: they show where a question lives, but `usedWith` skips them.
 */
export function usedIn(rootId: string, rows: readonly BankRow[]): BankUse[] {
  const byDoc = new Map<string, BankUse>();
  for (const row of rows) {
    if (row.rootId !== rootId || row.docKind !== 'paper' || byDoc.has(row.docId)) continue;
    byDoc.set(row.docId, {
      docId: row.docId,
      docTitle: row.docTitle,
      usedOn: row.usedOn,
      ...(row.classes ? { classes: row.classes } : {}),
      ...(row.number !== undefined ? { number: row.number } : {}),
    });
  }
  return [...byDoc.values()].sort(newestFirst);
}

/** The most recent use of any version of this question with `targets`' students; undefined if never. */
export function usedWith(group: BankGroup, targets: readonly ClassTarget[]): BankUse | undefined {
  if (targets.length === 0) return undefined;
  return group.usedIn.find((use) => anySameStudents(refsOf(use), targets));
}

/** The most recent real use (a paper with classes), whoever sat it; undefined if only drafts. */
export function lastUse(group: BankGroup): BankUse | undefined {
  return group.usedIn.find((use) => (use.classes?.length ?? 0) > 0);
}
