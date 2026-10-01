import { isPatternTag, patternsIn, tagText } from '@/model/patterns';
import type { TopicNames } from '@/model/topics';
import { derivedTags, effectiveSlotTags, isTopicalTag, slotAtTarget, type SlotState, type TagState } from '@/model/tagSlots';
import type { TagSlotInfo } from '@/registry/types';

/**
 * What the Edit panel's Topic row shows for a question tagged per part (§ part-tags.md F1),
 * pure so it is tested without a DOM. The row itself is `PartTopics.tsx`.
 */

/** Which list the Topic row edits: the question's, one part's, or one sub-part's. */
export type TopicMode =
  | { kind: 'question' }
  | { kind: 'part'; key: string }
  | { kind: 'subPart'; key: string; parent: string };

/** The row's own choice, overriding the page: a part it was pointed at, or the whole question. */
export type TopicFocus = { key: string } | 'question' | undefined;

/**
 * The mode from the page's selection (`slotAtTarget`, the finest part holding what was
 * clicked) unless the row was pointed elsewhere. Nothing on the page naming a part, or a
 * key this question no longer has, is the whole question.
 */
export function topicMode(
  slots: readonly Pick<TagSlotInfo, 'key' | 'parent' | 'blockIds' | 'leadInIds' | 'answerIds'>[],
  targetKey: string | undefined,
  focus?: TopicFocus,
): TopicMode {
  const key = focus === 'question' ? undefined : (focus?.key ?? slotAtTarget(slots, targetKey)?.key);
  const slot = key === undefined ? undefined : slots.find((entry) => entry.key === key);
  if (!slot) return { kind: 'question' };
  return slot.parent !== undefined ? { kind: 'subPart', key: slot.key, parent: slot.parent } : { kind: 'part', key: slot.key };
}

/** One line of the whole-question view: a part, or a sub-part with its own topics. */
export interface PartTopicLine {
  key: string;
  /** "(a)", or "(ii)" for a sub-part, which sits under its part. */
  label: string;
  /** "(a)(ii)": the whole label, for a line read alone. */
  fullLabel: string;
  depth: 0 | 1;
  /** What it tests: topic codes and 題型, its own or inherited. */
  tags: string[];
  /**
   * Where they come from: its own list; the whole question (older topics set before parts
   * took their own, moved onto the parts by the first edit); or none at all.
   */
  from: 'own' | 'question' | 'none';
}

const subLabel = (slot: SlotState, parent: SlotState | undefined) =>
  parent && slot.label.startsWith(parent.label) ? slot.label.slice(parent.label.length) : slot.label;

/**
 * The parts in print order, each with what it tests; a sub-part is listed only when it has
 * its own topics (one that follows its part says nothing its part does not).
 */
export function partTopicLines(state: TagState): PartTopicLine[] {
  const effective = effectiveSlotTags(state);
  const byKey = new Map(state.slots.map((slot) => [slot.key, slot]));
  const lines: PartTopicLine[] = [];
  for (const slot of state.slots) {
    const tags = (effective.get(slot.key) ?? []).filter(isTopicalTag);
    if (slot.parent !== undefined) {
      if (!slot.own) continue;
      lines.push({ key: slot.key, label: subLabel(slot, byKey.get(slot.parent)), fullLabel: slot.label, depth: 1, tags, from: 'own' });
      continue;
    }
    const from = slot.own ? 'own' : tags.length > 0 ? 'question' : 'none';
    lines.push({ key: slot.key, label: slot.label, fullLabel: slot.label, depth: 0, tags, from });
  }
  return lines;
}

/** The parts that test nothing yet: leaves with no topic, by their whole label ("(c)", "(a)(i)"). */
export function untaggedParts(state: TagState): string[] {
  const effective = effectiveSlotTags(state);
  return state.slots.filter((slot) => slot.leaf && !(effective.get(slot.key) ?? []).some(isTopicalTag)).map((slot) => slot.label);
}

const sameSet = (a: readonly string[], b: readonly string[]) => {
  const x = new Set(a);
  return x.size === new Set(b).size && b.every((tag) => x.has(tag));
};

/** Do the parts test different things? False with no parts, or when every leaf tests the same. */
export function partsDiffer(state: TagState): boolean {
  const effective = effectiveSlotTags(state);
  const leaves = state.slots.filter((slot) => slot.leaf).map((slot) => (effective.get(slot.key) ?? []).filter(isTopicalTag));
  return leaves.some((tags) => !sameSet(tags, leaves[0]));
}

/** "Law of demand · Price elasticity of demand · Price ceiling": names, a 題型 by its name. */
export function topicNames(tags: readonly string[], names: TopicNames = 'en'): string {
  return tags.map((tag) => tagText(tag, names)).join(' · ');
}

/** The free and system tags the question itself holds (never a part's). */
export const questionFreeTags = (state: TagState): string[] => state.tags.filter((tag) => !isTopicalTag(tag));

/**
 * The Outline's tag line for a question tagged per part: the derived names, or with the
 * parts testing different things, each part's names after its label ("(a) Law of demand
 * (b) Market failure"), so a cut-off line still says it is by part. The tooltip lists
 * every part, the ones with no topic too.
 */
export function outlineTagLine(
  state: TagState,
  names: TopicNames = 'en',
  words: { noTopic: string; tags: string } = { noTopic: 'No topic yet', tags: 'Tags:' },
): { text: string; title: string; byPart: boolean } | undefined {
  const lines = partTopicLines(state);
  const free = questionFreeTags(state);
  const byPart = partsDiffer(state);
  const named = lines.filter((line) => line.tags.length > 0);
  if (named.length === 0 && free.length === 0) return undefined;
  const text = byPart
    ? [...named.map((line) => `${line.fullLabel} ${topicNames(line.tags, names)}`), ...(free.length ? [topicNames(free, names)] : [])].join(' ')
    : topicNames(derivedTags(state), names);
  const title = [
    ...lines.map((line) => `${line.fullLabel} ${line.tags.length ? topicNames(line.tags, names) : words.noTopic}`),
    ...(free.length ? [`${words.tags} ${free.join(', ')}`] : []),
  ].join('\n');
  return { text, title, byPart };
}

/** A line's topics without their 題型, each with its 題型 name (the row shows them together). */
export function topicsWithPatterns(tags: readonly string[]): { topic: string; pattern?: string }[] {
  return tags
    .filter((tag) => !isPatternTag(tag))
    .map((topic) => {
      const pattern = patternsIn(tags, topic)[0];
      return pattern ? { topic, pattern } : { topic };
    });
}
