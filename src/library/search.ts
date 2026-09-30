import { matchesTopic } from '@/model/topics';
import { rowUsedWith } from './history';
import type { BankQuery, BankRow } from './types';

/**
 * The rows `query` admits, in their given order. Text is every whitespace-separated word,
 * case-insensitive, each found in the question (either language, its topic names) or in
 * the title of the paper it lives in, so "Mock 2026" finds that paper's questions. The
 * title is read here, not stored in `searchText`: a renamed paper is found by its new name
 * with no index rebuild. `notUsedWith` reads uses from `rows` itself, so pass the whole
 * index, not a pre-filtered slice.
 */
export function searchRows(rows: readonly BankRow[], query: BankQuery): BankRow[] {
  const words = (query.text ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const targets = query.notUsedWith ?? [];
  const usedWithClass =
    targets.length > 0 ? new Set(rows.filter((row) => rowUsedWith(row, targets)).map((row) => row.rootId)) : undefined;
  const { min, max } = query.marks ?? {};
  const titles = new Map<string, string>();
  const titleOf = (row: BankRow) => {
    let title = titles.get(row.docId);
    if (title === undefined) titles.set(row.docId, (title = row.docTitle.toLowerCase()));
    return title;
  };
  return rows.filter(
    (row) =>
      words.every((word) => row.searchText.includes(word) || titleOf(row).includes(word)) &&
      (!query.topic || matchesTopic(row.tags, query.topic)) &&
      (!query.typeId || row.typeId === query.typeId) &&
      (min === undefined || row.marks >= min) &&
      (max === undefined || row.marks <= max) &&
      (!usedWithClass || !usedWithClass.has(row.rootId)) &&
      (!query.fromDocId || row.docId === query.fromDocId) &&
      (!query.excludeDocId || row.docId !== query.excludeDocId),
  );
}
