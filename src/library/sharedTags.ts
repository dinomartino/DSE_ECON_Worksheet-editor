import { tagSearchWords } from '@/model/patterns';
import { stringTags } from '@/model/topics';
import type { Question } from '@/model/types';
import type { BankRow } from './types';

/**
 * One truth for tags (C6): every copy of a question (same `rootId`) reads one set, so
 * coverage, the review rail, filters, search, Fill and the Topic row agree even where a
 * write could not reach every copy (hidden, trashed, newer-build, restored).
 *
 * **The newest tag change wins.** A copy's `tagsAt` stamps its last tag write; the set is
 * the tags of the copy stamped last. A removal therefore sticks: an unreachable copy keeps
 * the tag, but its older stamp loses. Derived at read time; documents keep their own.
 */

/** One copy as the resolution reads it: its string tags and when they were last written. */
export interface TagCopy {
  tags: readonly string[];
  tagsAt?: unknown;
}

/** A question's one tag set, and the stamp of the change it comes from (absent: none stamped). */
export interface SharedTags {
  tags: string[];
  tagsAt?: string;
}

/** A `tagsAt` as a time, or `undefined` when absent or unreadable (ranked as unstamped). */
export function tagTime(tagsAt: unknown): number | undefined {
  if (typeof tagsAt !== 'string') return undefined;
  const time = Date.parse(tagsAt);
  return Number.isNaN(time) ? undefined : time;
}

/**
 * The shared set of one question's copies: the tags of the copy with the newest `tagsAt`.
 * An unstamped copy (every copy saved before stamping existed) ranks oldest; when no copy
 * is stamped, the union of all, as before stamping. Copies tied on the newest time give
 * their union. Each tag once, in the order the copies give them. Deterministic for a
 * given order; the union is the same set in any order.
 *
 * Stamps come from each device's clock, so two devices that disagree can let an earlier
 * change win. Kept simple on purpose (§ docs/design/question-library.md, "One tag set").
 */
export function sharedTags(copies: readonly TagCopy[]): SharedTags {
  let newest: number | undefined;
  let at: string | undefined;
  for (const copy of copies) {
    const time = tagTime(copy.tagsAt);
    if (time !== undefined && (newest === undefined || time > newest)) {
      newest = time;
      at = copy.tagsAt as string;
    }
  }
  const winners = newest === undefined ? copies : copies.filter((copy) => tagTime(copy.tagsAt) === newest);
  const tags: string[] = [];
  for (const copy of winners) for (const tag of copy.tags) if (!tags.includes(tag)) tags.push(tag);
  return at === undefined ? { tags } : { tags, tagsAt: at };
}

/** Each root's shared set (`sharedTags`) over its rows. */
export function sharedTagsByRoot(rows: readonly Pick<BankRow, 'rootId' | 'tags' | 'tagsAt'>[]): Map<string, SharedTags> {
  const copies = new Map<string, TagCopy[]>();
  for (const row of rows) copies.set(row.rootId, [...(copies.get(row.rootId) ?? []), row]);
  return new Map([...copies].map(([rootId, list]) => [rootId, sharedTags(list)]));
}

const sameList = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((tag, i) => tag === b[i]);

/** The words `rowsOf` appends to `searchText` for these tags (its last lines). */
const tagWords = (tags: readonly string[]) => tags.flatMap(tagSearchWords).join('\n').toLowerCase();

/** `searchText` with the row's own tag words swapped for the shared set's. */
function sharedSearchText(row: BankRow, tags: readonly string[]): string {
  const own = tagWords(row.tags);
  let printed = row.searchText;
  // `rowsOf` puts tag words last; a row built another way keeps its text and gains the words.
  if (own && printed === own) printed = '';
  else if (own && printed.endsWith(`\n${own}`)) printed = printed.slice(0, -own.length - 1);
  return [printed, tagWords(tags)].filter(Boolean).join('\n');
}

/**
 * `rows` with every row's `tags` and `tagsAt` set to its question's shared set
 * (`sharedTagsByRoot`), and `searchText` matching those tags: a tag the shared set dropped
 * no longer finds the row. A row already holding its set is returned as the same object.
 */
export function withSharedTags(rows: readonly BankRow[]): BankRow[] {
  const byRoot = sharedTagsByRoot(rows);
  return rows.map((row) => {
    const shared = byRoot.get(row.rootId);
    if (!shared || (sameList(shared.tags, row.tags) && shared.tagsAt === row.tagsAt)) return row;
    const { tagsAt: _own, ...rest } = row;
    void _own;
    return {
      ...rest,
      tags: [...shared.tags],
      ...(shared.tagsAt !== undefined ? { tagsAt: shared.tagsAt } : {}),
      searchText: sameList(shared.tags, row.tags) ? row.searchText : sharedSearchText(row, shared.tags),
    };
  });
}

/**
 * A copy's tags made the shared set: the same array when it already holds that set (in
 * any order), else the set in its order, then any tag that is not a string (never ours to
 * drop). `undefined` for no tags.
 */
export function adoptTags(own: string[] | undefined, shared: readonly string[]): string[] | undefined {
  const list = own ?? [];
  const strings = stringTags(list);
  const set = [...new Set(shared)];
  if (set.length === new Set(strings).size && set.every((tag) => strings.includes(tag))) return own;
  const next = [...set, ...list.filter((tag) => typeof tag !== 'string')];
  return next.length > 0 ? next : undefined;
}

/**
 * A question read from its document, given the tags its bank row shows (the shared set,
 * `withSharedTags`). Every copy taken from the bank goes through this, so the new copy
 * starts with the set the bank showed, not the picked copy's own (which may be stale), and
 * with that set's stamp, so it never outranks a later change. The same object when nothing
 * changes.
 */
export function withRowTags<Q extends Question>(question: Q, row: Pick<BankRow, 'tags' | 'tagsAt'>): Q {
  const tags = adoptTags(question.tags, row.tags);
  const tagsAt = row.tagsAt ?? question.tagsAt;
  if (tags === question.tags && tagsAt === question.tagsAt) return question;
  const { tags: _tags, tagsAt: _at, ...rest } = question;
  void _tags;
  void _at;
  return { ...rest, ...(tags ? { tags } : {}), ...(tagsAt !== undefined ? { tagsAt } : {}) } as Q;
}
