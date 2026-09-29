import { matchesTopic } from '@/model/topics';
import { rowUsedWith } from './history';
import type { BankQuery, BankRow } from './types';

/**
 * The rows `query` admits, in their given order. Text is every whitespace-separated word,
 * case-insensitive, in either language; `notUsedWith` reads uses from `rows` itself,
 * so pass the whole index, not a pre-filtered slice.
 */
export function searchRows(rows: readonly BankRow[], query: BankQuery): BankRow[] {
  const words = (query.text ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const targets = query.notUsedWith ?? [];
  const usedWithClass =
    targets.length > 0 ? new Set(rows.filter((row) => rowUsedWith(row, targets)).map((row) => row.rootId)) : undefined;
  const { min, max } = query.marks ?? {};
  return rows.filter(
    (row) =>
      words.every((word) => row.searchText.includes(word)) &&
      (!query.topic || matchesTopic(row.tags, query.topic)) &&
      (!query.typeId || row.typeId === query.typeId) &&
      (min === undefined || row.marks >= min) &&
      (max === undefined || row.marks <= max) &&
      (!usedWithClass || !usedWithClass.has(row.rootId)) &&
      (!query.fromDocId || row.docId === query.fromDocId) &&
      (!query.excludeDocId || row.docId !== query.excludeDocId),
  );
}
