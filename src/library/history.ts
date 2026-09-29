import type { BankGroup, BankRow, BankUse } from './types';

/** Class tags compare trimmed and case-insensitive ("5A 2025-26" = "5a 2025-26 "). */
export function sameClass(a: string | undefined, b: string | undefined): boolean {
  const left = a?.trim().toLowerCase();
  return Boolean(left) && left === b?.trim().toLowerCase();
}

/** Newest document first; ties by docId, so the order never depends on input order. */
export function newestFirst(a: { docUpdatedAt: string; docId: string }, b: { docUpdatedAt: string; docId: string }): number {
  if (a.docUpdatedAt !== b.docUpdatedAt) return a.docUpdatedAt < b.docUpdatedAt ? 1 : -1;
  return a.docId < b.docId ? -1 : a.docId > b.docId ? 1 : 0;
}

/**
 * The papers holding a copy of `rootId` (every version), newest first, one entry per
 * document (its first copy's number). Bank documents are storage, not uses, so never count.
 */
export function usedIn(rootId: string, rows: readonly BankRow[]): BankUse[] {
  const byDoc = new Map<string, BankUse>();
  for (const row of rows) {
    if (row.rootId !== rootId || row.docKind !== 'paper' || byDoc.has(row.docId)) continue;
    byDoc.set(row.docId, {
      docId: row.docId,
      docTitle: row.docTitle,
      docUpdatedAt: row.docUpdatedAt,
      ...(row.classTag ? { classTag: row.classTag } : {}),
      ...(row.number !== undefined ? { number: row.number } : {}),
    });
  }
  return [...byDoc.values()].sort(newestFirst);
}

/** The most recent use of any version of this question with `classTag`; undefined if never. */
export function usedWithClass(group: BankGroup, classTag: string | undefined): BankUse | undefined {
  return group.usedIn.find((use) => sameClass(use.classTag, classTag));
}
