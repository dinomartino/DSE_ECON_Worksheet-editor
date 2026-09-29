import { matchesTopic } from '@/model/topics';
import { usedWithClass } from './history';
import type { BankGroup } from './types';

export interface FillOptions {
  count: number;
  /** Topic code; a group qualifies when any of its versions matches (`matchesTopic`). */
  topic?: string;
  typeId?: string;
  /** The paper's class: questions already used with it rank after every fresh one. */
  classTag?: string;
  /** Root ids already in the paper (or already picked): never returned. */
  excludeRootIds?: Iterable<string>;
}

/**
 * Up to `count` groups to fill a paper with — deterministic: best match first (not used with
 * the class, then tagged with the exact topic over a sub-topic), then least recently used
 * (never used first), ties in `groups` order. ↻ = call again with the picks excluded.
 */
export function pickFill(groups: readonly BankGroup[], options: FillOptions): BankGroup[] {
  const excluded = new Set(options.excludeRootIds ?? []);
  const { topic, typeId, classTag } = options;
  const ranked = groups
    .map((group, order) => ({ group, order }))
    .filter(
      ({ group }) =>
        !excluded.has(group.rootId) &&
        (!typeId || group.rows[0]?.typeId === typeId) &&
        (!topic || group.rows.some((row) => matchesTopic(row.tags, topic))),
    )
    .map(({ group, order }) => ({
      group,
      order,
      usedWithClass: classTag && usedWithClass(group, classTag) ? 1 : 0,
      inexact: topic && !group.rows.some((row) => row.tags.includes(topic)) ? 1 : 0,
      lastUsed: group.usedIn[0]?.docUpdatedAt ?? '',
    }));
  ranked.sort(
    (a, b) =>
      a.usedWithClass - b.usedWithClass ||
      a.inexact - b.inexact ||
      (a.lastUsed < b.lastUsed ? -1 : a.lastUsed > b.lastUsed ? 1 : 0) ||
      a.order - b.order,
  );
  return ranked.slice(0, Math.max(0, options.count)).map((entry) => entry.group);
}
