import { parsePatternTag, samePatternName } from '@/model/patterns';
import { matchesTopic } from '@/model/topics';
import type { PatternId } from './patterns';
import type { BankRow, BankSlot } from './types';

/** What a heading or filter names: a topic code (a coarse one takes its sub-topics), or a 題型. */
export type SlotQuery = { topic: string } | { pattern: PatternId };

/**
 * The parts of a row's question that test what `query` names, for "(b) tests this": its
 * leaf slots (a part without sub-parts, or a sub-part) whose topics match, in print order.
 * Empty when the row has no slots, when every leaf matches (the whole question does: say
 * nothing), or when none does (the match came from elsewhere).
 */
export function slotsMatching(row: Pick<BankRow, 'typeId' | 'slots'>, query: SlotQuery): BankSlot[] {
  const leaves = (row.slots ?? []).filter((slot) => slot.leaf);
  const hits = leaves.filter((slot) =>
    'topic' in query
      ? matchesTopic(slot.tags, query.topic)
      : row.typeId === query.pattern.typeId &&
        slot.tags.some((tag) => {
          const ref = parsePatternTag(tag);
          return ref !== undefined && ref.topic === query.pattern.topic && samePatternName(ref.name, query.pattern.name);
        }),
  );
  return hits.length === leaves.length ? [] : hits;
}
