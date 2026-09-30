import { addTopics, atSlot, changeEdit, inheritAtSlot, removeTopics, stateEdit, wholeQuestion, type StateEdit, type TagEdit } from '@/library/tagWrites';
import { parsePatternTag, samePatternName, withPattern } from '@/model/patterns';
import { collapseTagState, effectiveSlotTags, normalizeTagState, slotRef, type SlotState, type TagState } from '@/model/tagSlots';
import { topicOf } from '@/model/topics';

/**
 * Tagging a question part by part in the bank (Edit topics, tag as you go): a draft of the
 * question's tag state, and each pick as the `StateEdit` a save replays on every copy. The
 * target is the whole question (`undefined`: every part) or one part or sub-part by its
 * slot key. Pure; the screens hold the draft and the edits.
 */

/** Where a pick lands: `undefined` is the whole question, else a part's or sub-part's key. */
export type PartTarget = string | undefined;

/** A state as a write would edit it: older whole-question topics moved onto the parts, stored form. */
export const draftOf = (state: TagState): TagState => collapseTagState(normalizeTagState(state));

/** The draft after an edit, in stored form. */
export const applyDraft = (state: TagState, edit: StateEdit): TagState => collapseTagState(edit(state));

const leaves = (state: TagState) => state.slots.filter((slot) => slot.leaf);

/** The lists a target reads: the whole question's leaves (its own list without parts), or the one slot's topics. */
function listsAt(state: TagState, at: PartTarget): string[][] {
  if (state.slots.length === 0) return [state.tags];
  const effective = effectiveSlotTags(state);
  if (at !== undefined) return [effective.get(at) ?? []];
  return leaves(state).map((slot) => effective.get(slot.key) ?? []);
}

/** A target's ticks: topic codes on every list it reads, and those on only some (where, by label). */
export interface Ticks {
  ticked: ReadonlySet<string>;
  /** Whole question only: a code on some parts, with the parts' labels ("(a)", "(b)(ii)"). */
  partial: ReadonlyMap<string, string[]>;
}

export function ticksAt(state: TagState, at: PartTarget): Ticks {
  const lists = listsAt(state, at);
  const codes = [...new Set(lists.flat().filter((tag) => topicOf(tag)))];
  const ticked = new Set<string>();
  const partial = new Map<string, string[]>();
  for (const code of codes) {
    if (lists.every((list) => list.includes(code))) ticked.add(code);
    else partial.set(code, whereTested(state, code));
  }
  return { ticked, partial };
}

/** The parts testing `code`, by label: a part whose every sub-part tests it reads as the part. */
export function whereTested(state: TagState, code: string): string[] {
  const effective = effectiveSlotTags(state);
  const has = (slot: SlotState) => (effective.get(slot.key) ?? []).includes(code);
  const out: string[] = [];
  for (const slot of state.slots.filter((entry) => entry.parent === undefined)) {
    if (slot.leaf) {
      if (has(slot)) out.push(slot.label);
      continue;
    }
    const subs = state.slots.filter((entry) => entry.parent === slot.key);
    const testing = subs.filter(has);
    if (testing.length > 0 && testing.length === subs.length) out.push(slot.label);
    else out.push(...testing.map((sub) => sub.label));
  }
  return out;
}

/** A list edit lifted to the target: every part, or one part found by key in each copy. */
export function editAt(state: TagState, at: PartTarget, edit: TagEdit): StateEdit {
  if (at === undefined) return wholeQuestion(edit);
  const ref = slotRef(state.slots, at);
  return ref ? atSlot(ref, edit) : stateEdit((current) => current);
}

/** Tick or untick a topic on the target. On the whole question it goes on, or comes off, every part. */
export const toggleAt = (state: TagState, at: PartTarget, code: string, on: boolean): StateEdit =>
  editAt(state, at, on ? addTopics([code]) : removeTopics([code]));

/** The target's topics made `after` (from `before`, what it showed): only the change, so other parts keep theirs. */
export const changeAt = (state: TagState, at: PartTarget, before: readonly string[], after: readonly string[]): StateEdit =>
  editAt(state, at, changeEdit(before, after));

const patternIn = (list: readonly string[], topic: string) => {
  for (const tag of list) {
    const ref = parsePatternTag(tag);
    if (ref?.topic === topic) return ref.name;
  }
  return undefined;
};

/**
 * The target's 題型 under a sub-topic: the one name every list holding the sub-topic
 * agrees on, else none (`undefined`, and `mixed` when they differ).
 */
export function patternAt(state: TagState, at: PartTarget, topic: string): { name?: string; mixed: boolean } {
  const names = listsAt(state, at)
    .filter((list) => list.includes(topic))
    .map((list) => patternIn(list, topic));
  const first = names[0];
  const same = names.every((name) => (name && first ? samePatternName(name, first) : name === first));
  return same ? { ...(first ? { name: first } : {}), mixed: false } : { mixed: true };
}

/** Set (a name) or clear (`undefined`) the 題型 under a sub-topic, on the target's lists that hold it. */
export const patternEditAt = (state: TagState, at: PartTarget, topic: string, name: string | undefined): StateEdit =>
  editAt(state, at, (tags) => (tags.includes(topic) ? withPattern(tags, topic, name) : [...tags]));

/** A sub-part back to its part's topics ("Same as (a)"). */
export function sameAsPart(state: TagState, key: string): StateEdit {
  const ref = slotRef(state.slots, key);
  return ref ? inheritAtSlot(ref) : stateEdit((current) => current);
}

/** Whether any part (or, without parts, the question) has a topic. */
export const hasTopic = (state: TagState): boolean => listsAt(state, undefined).some((list) => list.some((tag) => topicOf(tag)));

/** Every topic code in any list of the state: what a tag-as-you-go Undo takes off again. */
export const everyCode = (state: TagState): string[] => [
  ...new Set([state.tags, ...state.slots.map((slot) => slot.own ?? [])].flat().filter((tag) => topicOf(tag))),
];

/** One row of the part column: the slot, its short label ("(ii)" under (a)), and what it tests. */
export interface PartLine {
  key: string;
  label: string;
  short: string;
  /** A sub-part: indented under its part. */
  sub: boolean;
  /** A sub-part with no list of its own: it has its part's topics. */
  inherits: boolean;
  /** The part's label a sub-part takes its topics from. */
  parentLabel?: string;
  codes: string[];
}

export function partLines(state: TagState): PartLine[] {
  const effective = effectiveSlotTags(state);
  const byKey = new Map(state.slots.map((slot) => [slot.key, slot]));
  return state.slots.map((slot) => {
    const parent = slot.parent !== undefined ? byKey.get(slot.parent) : undefined;
    const short = parent && slot.label.startsWith(parent.label) ? slot.label.slice(parent.label.length) : slot.label;
    return {
      key: slot.key,
      label: slot.label,
      short,
      sub: parent !== undefined,
      inherits: parent !== undefined && !slot.own,
      ...(parent ? { parentLabel: parent.label } : {}),
      codes: (effective.get(slot.key) ?? []).filter((tag) => topicOf(tag)),
    };
  });
}

/**
 * What a save put where, for the Undo line: the topics on every part first (no label),
 * then each part's others (a part whose sub-parts agree reads as the part).
 */
export function savedByPart(state: TagState): { label?: string; codes: string[] }[] {
  const lists = listsAt(state, undefined).map((list) => list.filter((tag) => topicOf(tag)));
  const common = (lists[0] ?? []).filter((code) => lists.every((list) => list.includes(code)));
  const out: { label?: string; codes: string[] }[] = common.length > 0 ? [{ codes: common }] : [];
  if (state.slots.length === 0 || lists.every((list) => sameList(list, common))) return out;
  const effective = effectiveSlotTags(state);
  const codes = (slot: SlotState) => (effective.get(slot.key) ?? []).filter((tag) => topicOf(tag) && !common.includes(tag));
  for (const slot of state.slots.filter((entry) => entry.parent === undefined)) {
    const subs = state.slots.filter((entry) => entry.parent === slot.key);
    if (subs.length === 0 || subs.every((sub) => sameList(codes(sub), codes(subs[0])))) {
      const list = subs.length === 0 ? codes(slot) : codes(subs[0]);
      if (list.length > 0) out.push({ label: slot.label, codes: list });
      continue;
    }
    for (const sub of subs) if (codes(sub).length > 0) out.push({ label: sub.label, codes: codes(sub) });
  }
  return out;
}

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((tag) => b.includes(tag));

/** How a target reads in teacher words: "the whole question", "part (b)", "sub-part (a)(ii)". */
export function targetName(state: TagState, at: PartTarget): string {
  if (at === undefined) return 'the whole question';
  const slot = state.slots.find((entry) => entry.key === at);
  if (!slot) return 'the whole question';
  return `${slot.parent !== undefined ? 'sub-part' : 'part'} ${slot.label}`;
}
