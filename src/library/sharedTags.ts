import { tagSearchWords } from '@/model/patterns';
import type { Question } from '@/model/types';
import type { BankRow } from './types';

/**
 * A question read from its document, given the tags its bank row shows (the root's union,
 * `withSharedTags`): its own first, then the rest. Every copy taken from the bank goes
 * through this, so the new copy starts with every topic the bank showed, not only the
 * picked copy's. The same object when nothing is added.
 */
export function withRowTags<Q extends Question>(question: Q, row: Pick<BankRow, 'tags'>): Q {
  const own = question.tags ?? [];
  const added = row.tags.filter((tag, i) => !own.includes(tag) && row.tags.indexOf(tag) === i);
  return added.length > 0 ? { ...question, tags: [...own, ...added] } : question;
}

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
    const words = added.flatMap(tagSearchWords);
    return {
      ...row,
      tags: [...tags],
      searchText: [row.searchText, ...words].filter(Boolean).join('\n').toLowerCase(),
    };
  });
}
