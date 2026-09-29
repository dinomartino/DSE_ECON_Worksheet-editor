import { topicLabel } from '@/model/topics';
import type { BankRow } from './types';

/**
 * One truth for tags: every copy of a question (same `rootId`) reads the union of all its
 * copies' tags, so coverage, the review rail, filters, search and the Topics fact agree
 * even where copies were tagged apart. Derived at read time; documents keep their own.
 */

/** Each root's tags: every tag on any of its rows, once, in the order `rows` gives them. */
export function tagsByRoot(rows: readonly BankRow[]): Map<string, string[]> {
  const byRoot = new Map<string, string[]>();
  for (const row of rows) {
    const list = byRoot.get(row.rootId);
    if (!list) byRoot.set(row.rootId, [...new Set(row.tags)]);
    else for (const tag of row.tags) if (!list.includes(tag)) list.push(tag);
  }
  return byRoot;
}

/**
 * `rows` with every row's `tags` set to its root's union (`tagsByRoot`), and the added
 * tags' codes and names joined onto `searchText`. A row already holding the union is
 * returned as the same object.
 */
export function withSharedTags(rows: readonly BankRow[]): BankRow[] {
  const byRoot = tagsByRoot(rows);
  return rows.map((row) => {
    const tags = byRoot.get(row.rootId) ?? row.tags;
    if (tags.length === row.tags.length && tags.every((tag, i) => tag === row.tags[i])) return row;
    const added = tags.filter((tag) => !row.tags.includes(tag));
    const words = added.flatMap((tag) => [tag, topicLabel(tag, 'en'), topicLabel(tag, 'zh')]);
    return {
      ...row,
      tags: [...tags],
      searchText: [row.searchText, ...words].filter(Boolean).join('\n').toLowerCase(),
    };
  });
}
