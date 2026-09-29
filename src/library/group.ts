import { newestFirst, usedIn } from './history';
import type { BankGroup, BankRow } from './types';

/**
 * Rows grouped by `rootId` — every copy of one question, however edited. Rows in a group
 * are newest first by use date (`newestFirst`), so editing an old paper never makes its copy
 * the lead; groups are ordered by their lead row, then `rootId`, deterministic for any input.
 */
export function groupRows(rows: readonly BankRow[]): BankGroup[] {
  const byRoot = new Map<string, BankRow[]>();
  for (const row of rows) {
    const list = byRoot.get(row.rootId);
    if (list) list.push(row);
    else byRoot.set(row.rootId, [row]);
  }
  const groups = [...byRoot].map(([rootId, list]): BankGroup => {
    const sorted = [...list].sort((a, b) => newestFirst(a, b) || compare(a.questionId, b.questionId));
    return {
      rootId,
      rows: sorted,
      versions: new Set(sorted.map((row) => row.contentKey)).size,
      usedIn: usedIn(rootId, sorted),
    };
  });
  return groups.sort((a, b) => newestFirst(a.rows[0], b.rows[0]) || compare(a.rootId, b.rootId));
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
