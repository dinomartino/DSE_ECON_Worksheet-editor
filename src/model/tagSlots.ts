import { getQuestionType } from '@/registry';
import type { TagSlotInfo } from '@/registry/types';
import { PATTERN_SEPARATOR } from './patterns';
import { isTopicCode, stringTags } from './topics';
import type { Question } from './types';

/**
 * Topics and 題型 per part (§ docs/design/part-tags.md). A type that tags per place says
 * where through its registry hooks (`tagSlots`, `withSlotTags`); this module is the only
 * shared code that reads them, and it never names a type.
 *
 * A question's **tag state** is its own list plus each slot's own list. The rules:
 * - a part's topics are its own list, else the question's older whole-question topics
 *   (the lists develop builds wrote, read in place, moved down on the first write);
 * - a sub-part's own list **replaces** its part's; absent, it has its part's;
 * - the question's topics are **derived**: every leaf's topics in print order, then the
 *   question's free and system tags. A part's list that no leaf inherits does not count;
 * - an empty own list is stored as absent, and so is a sub-part's list equal to its part's;
 * - free tags stay on the question; a part holds topic codes and 題型 only.
 */

/** A topic code (known or not) or a 題型: what a part may hold. System `@` tags are not. */
export function isTopicalTag(tag: string): boolean {
  return isTopicCode(tag) || (typeof tag === 'string' && tag.includes(PATTERN_SEPARATOR));
}

/** One slot as a state holds it: where it is, and its own list (absent = inherits). */
export interface SlotState {
  key: string;
  path: string;
  label: string;
  parent?: string;
  leaf: boolean;
  /** Its own list, strings only and never empty; absent = inherits. */
  own?: string[];
}

/** A question's tag lists: its own, and each slot's in print order (none: tagged as a whole). */
export interface TagState {
  /** The question's own list (strings): free and system tags, and older whole-question topics. */
  tags: string[];
  slots: SlotState[];
}

/** Where a slot sits, so an edit can find it in another copy (`matchSlots`). */
export interface SlotRef {
  key: string;
  path: string;
  /** `shapeOf` the copy the slot was picked in: the path counts only in a copy shaped alike. */
  shape: string;
}

/** The question's slots through its type (`tagSlots`); none for a type without them. */
export function questionTagSlots(question: Question): TagSlotInfo[] {
  return getQuestionType(question.type)?.tagSlots?.(question) ?? [];
}

const slotOf = (info: TagSlotInfo): SlotState => {
  const own = stringTags(info.own);
  return {
    key: info.key,
    path: info.path,
    label: info.label,
    ...(info.parent !== undefined ? { parent: info.parent } : {}),
    leaf: info.leaf,
    ...(own.length > 0 ? { own } : {}),
  };
};

/** A question's tag state as stored (strings only; an own list of none reads as absent). */
export function tagStateOf(question: Question): TagState {
  return { tags: stringTags(question.tags), slots: questionTagSlots(question).map(slotOf) };
}

const unique = (tags: readonly string[]) => [...new Set(tags)];
const sameSet = (a: readonly string[], b: readonly string[]) => {
  const x = new Set(a);
  const y = new Set(b);
  return x.size === y.size && [...x].every((tag) => y.has(tag));
};

/** The question list's topics: every untagged part's default until the first write moves them. */
const legacyTopics = (state: TagState) => state.tags.filter(isTopicalTag);

/** Each slot's effective topics (what it tests), by key. */
export function effectiveSlotTags(state: TagState): Map<string, string[]> {
  const legacy = legacyTopics(state);
  const out = new Map<string, string[]>();
  for (const slot of state.slots) {
    const inherited = slot.parent !== undefined ? (out.get(slot.parent) ?? legacy) : legacy;
    out.set(slot.key, slot.own && slot.own.length > 0 ? slot.own : inherited);
  }
  return out;
}

const isState = (value: Question | TagState): value is TagState =>
  Array.isArray((value as TagState).slots) && !('type' in value);

/**
 * The question's tags as one list: with slots, every leaf's topics in print order, then the
 * question's own free and system tags; without, its own list as stored (strings).
 */
export function derivedTags(value: Question | TagState): string[] {
  const state = isState(value) ? value : tagStateOf(value);
  if (state.slots.length === 0) return state.tags;
  const effective = effectiveSlotTags(state);
  return unique([
    ...state.slots.filter((slot) => slot.leaf).flatMap((slot) => effective.get(slot.key) ?? []),
    ...state.tags.filter((tag) => !isTopicalTag(tag)),
  ]);
}

/**
 * Older whole-question topics moved down (§ Existing data): each top-level part with no
 * own list takes them as its own, and the question keeps its free and system tags. Pure;
 * every write normalizes before its edit, opening never does. Same object when nothing moves.
 */
export function normalizeTagState(state: TagState): TagState {
  if (state.slots.length === 0) return state;
  const legacy = legacyTopics(state);
  if (legacy.length === 0) return state;
  return {
    tags: state.tags.filter((tag) => !isTopicalTag(tag)),
    slots: state.slots.map((slot) => (slot.parent === undefined && !slot.own ? { ...slot, own: [...legacy] } : slot)),
  };
}

const withoutOwn = (slot: SlotState): SlotState => {
  const next = { ...slot };
  delete next.own;
  return next;
};

/**
 * A state as it is stored: an empty own list absent, a sub-part's list that equals its
 * part's topics absent (it says nothing new), each list once per tag.
 */
export function collapseTagState(state: TagState): TagState {
  const slots = state.slots.map((slot) => {
    if (!slot.own) return slot;
    const own = unique(slot.own);
    return own.length === 0 ? withoutOwn(slot) : { ...slot, own };
  });
  const collapsed = { tags: unique(state.tags), slots };
  const effective = effectiveSlotTags(collapsed);
  const legacy = legacyTopics(collapsed);
  collapsed.slots = slots.map((slot) => {
    if (slot.parent === undefined || !slot.own) return slot;
    const parent = effective.get(slot.parent) ?? legacy;
    return sameSet(slot.own, parent) ? withoutOwn(slot) : slot;
  });
  return collapsed;
}

/** Same lists (as sets) for the question and for each slot, own or inherited alike. */
export function sameTagState(a: TagState, b: TagState): boolean {
  if (!sameSet(a.tags, b.tags) || a.slots.length !== b.slots.length) return false;
  return a.slots.every((slot, index) => {
    const other = b.slots[index];
    if (slot.key !== other.key) return false;
    if (!slot.own || !other.own) return !slot.own && !other.own;
    return sameSet(slot.own, other.own);
  });
}

/** The slots' layout as one string: equal for copies with the same parts and sub-parts. */
export const shapeOf = (slots: readonly Pick<SlotState, 'path'>[]): string => slots.map((slot) => slot.path).join(',');

/** Same number of parts, and of sub-parts under each. */
export const sameShape = (a: readonly Pick<SlotState, 'path'>[], b: readonly Pick<SlotState, 'path'>[]): boolean =>
  shapeOf(a) === shapeOf(b);

/**
 * Which slot of `b` is each slot of `a` (a key → b key). Slots pair by key (the part's
 * `rootId`, so a reordered copy pairs right); leftovers pair by position only when the two
 * are shaped alike, since a position means nothing across a structural edit.
 */
export function matchSlots(
  a: readonly Pick<SlotState, 'key' | 'path'>[],
  b: readonly Pick<SlotState, 'key' | 'path'>[],
): Map<string, string> {
  const out = new Map<string, string>();
  const taken = new Set<string>();
  const keys = new Set(b.map((slot) => slot.key));
  for (const slot of a) {
    if (keys.has(slot.key) && !taken.has(slot.key)) {
      out.set(slot.key, slot.key);
      taken.add(slot.key);
    }
  }
  if (!sameShape(a, b)) return out;
  const byPath = new Map(b.map((slot) => [slot.path, slot.key]));
  for (const slot of a) {
    if (out.has(slot.key)) continue;
    const key = byPath.get(slot.path);
    if (key !== undefined && !taken.has(key)) {
      out.set(slot.key, key);
      taken.add(key);
    }
  }
  return out;
}

/** The slot `ref` names in `slots`: by key, else by position in a copy of the same shape. */
export function findSlot<S extends Pick<SlotState, 'key' | 'path'>>(slots: readonly S[], ref: SlotRef): S | undefined {
  return (
    slots.find((slot) => slot.key === ref.key) ??
    (shapeOf(slots) === ref.shape ? slots.find((slot) => slot.path === ref.path) : undefined)
  );
}

/** A reference to the slot keyed `key` among `slots`, to find it in other copies. */
export function slotRef(slots: readonly Pick<SlotState, 'key' | 'path'>[], key: string): SlotRef | undefined {
  const slot = slots.find((entry) => entry.key === key);
  return slot ? { key: slot.key, path: slot.path, shape: shapeOf(slots) } : undefined;
}

/**
 * `shared` (the winning copy's state) as `copy` shows it: the question list, and for each of
 * the copy's slots the matched slot's own list (absent there, absent here); a slot the
 * winner has no match for keeps its own. A copy without slots takes the winner's derived
 * tags; a winner without slots tags the copy as a whole (its slots inherit).
 */
export function stateFor(copy: TagState, shared: TagState): TagState {
  if (copy.slots.length === 0) return { tags: derivedTags(shared), slots: [] };
  if (shared.slots.length === 0) return { tags: [...shared.tags], slots: copy.slots.map(withoutOwn) };
  const match = matchSlots(copy.slots, shared.slots);
  const byKey = new Map(shared.slots.map((slot) => [slot.key, slot]));
  return {
    tags: [...shared.tags],
    slots: copy.slots.map((slot) => {
      const key = match.get(slot.key);
      if (key === undefined) return slot;
      const own = byKey.get(key)?.own;
      return own ? { ...slot, own: [...own] } : withoutOwn(slot);
    }),
  };
}

/**
 * A stored list made to hold `next`: the same array when it already holds that set (in any
 * order), else `next` once each, then any entry that is not a string (never ours to drop).
 * `undefined` for nothing.
 */
export function adoptList(own: unknown, next: readonly string[]): unknown[] | undefined {
  const list = Array.isArray(own) ? (own as unknown[]) : [];
  // Unchanged is the very value stored, even one that is not a list (a later build's).
  if (sameSet(stringTags(list), next)) return own as unknown[] | undefined;
  const out = [...unique(next), ...list.filter((tag) => typeof tag !== 'string')];
  return out.length > 0 ? out : undefined;
}

/**
 * The question holding `state`: its own list, and each slot's own list through the type's
 * `withSlotTags` (slots paired by `matchSlots`; a slot `state` does not name is untouched).
 * Lists already holding their set keep their array; entries that are not strings are kept.
 * No stamp and no normalizing: callers decide both. The same object when nothing changes.
 */
export function withTagState<Q extends Question>(question: Q, state: TagState): Q {
  let next = question;
  const definition = getQuestionType(question.type);
  if (definition?.withSlotTags && state.slots.length > 0) {
    const infos = questionTagSlots(question);
    const match = matchSlots(infos, state.slots);
    const byKey = new Map(state.slots.map((slot) => [slot.key, slot]));
    const owns = new Map<string, readonly unknown[] | undefined>();
    for (const info of infos) {
      const key = match.get(info.key);
      if (key === undefined) continue;
      const list = adoptList(info.own, byKey.get(key)?.own ?? []);
      if (list !== info.own) owns.set(info.key, list);
    }
    if (owns.size > 0) next = definition.withSlotTags(question, owns) as Q;
  }
  const tags = adoptList(question.tags, state.tags);
  if (tags === question.tags) return next;
  const { tags: _old, ...rest } = next;
  void _old;
  return (tags ? { ...rest, tags } : rest) as Q;
}

/**
 * The slot an edit target names (`model/edits.ts:editTargetKey`): a block it prints or
 * leads in with, or its answer. The finest wins: a sub-part before its part.
 */
export function slotAtTarget<S extends Pick<TagSlotInfo, 'parent' | 'blockIds' | 'leadInIds' | 'answerIds'>>(
  slots: readonly S[],
  targetKey: string | undefined,
): S | undefined {
  if (!targetKey) return undefined;
  const [kind, id] = targetKey.split(':');
  if (!id) return undefined;
  const answer = kind === 'partAnswer' || kind === 'subPartAnswer';
  const holds = (slot: S) => (answer ? slot.answerIds.includes(id) : slot.blockIds.includes(id) || slot.leadInIds.includes(id));
  return slots.find((slot) => slot.parent !== undefined && holds(slot)) ?? slots.find(holds);
}

/**
 * The ids a highlight of these slots covers: each slot's printed blocks and answers, and
 * those of the sub-parts under it (its interlude is context, not the part). Matches the
 * ids `export/clipboard.ts:nodeTarget` reads off the IR.
 */
export function slotHighlightIds(
  slots: readonly Pick<TagSlotInfo, 'key' | 'parent' | 'blockIds' | 'answerIds'>[],
  keys: Iterable<string>,
): Set<string> {
  const wanted = new Set(keys);
  const out = new Set<string>();
  for (const slot of slots) {
    if (!wanted.has(slot.key) && !(slot.parent !== undefined && wanted.has(slot.parent))) continue;
    for (const id of [...slot.blockIds, ...slot.answerIds]) out.add(id);
  }
  return out;
}
