import { matchesTopic } from '@/model/topics';
import type { ClassTarget } from './cohort';
import { lastUse, usedWith } from './history';
import type { BankGroup } from './types';

export interface FillOptions {
  count: number;
  /** Topic code; a group qualifies when any of its versions matches (`matchesTopic`). */
  topic?: string;
  typeId?: string;
  /** The paper's classes: questions already used with their students rank after every fresh one. */
  usedWith?: readonly ClassTarget[];
  /** Root ids already in the paper (or already picked): never returned. */
  excludeRootIds?: Iterable<string>;
}

/**
 * Up to `count` groups to fill a paper with — deterministic: best match first (not used with
 * the class, then tagged with the exact topic over a sub-topic), then least recently used
 * (never used first; drafts are not uses and only break ties), ties in `groups` order.
 * ↻ = call again with the picks excluded.
 */
export function pickFill(groups: readonly BankGroup[], options: FillOptions): BankGroup[] {
  const excluded = new Set(options.excludeRootIds ?? []);
  const { topic, typeId } = options;
  const targets = options.usedWith ?? [];
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
      usedWithClass: usedWith(group, targets) ? 1 : 0,
      inexact: topic && !group.rows.some((row) => row.tags.includes(topic)) ? 1 : 0,
      lastUsed: lastUse(group)?.usedOn ?? '',
      lastSeen: group.usedIn[0]?.usedOn ?? '',
    }));
  ranked.sort(
    (a, b) =>
      a.usedWithClass - b.usedWithClass ||
      a.inexact - b.inexact ||
      compare(a.lastUsed, b.lastUsed) ||
      compare(a.lastSeen, b.lastSeen) ||
      a.order - b.order,
  );
  return ranked.slice(0, Math.max(0, options.count)).map((entry) => entry.group);
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
