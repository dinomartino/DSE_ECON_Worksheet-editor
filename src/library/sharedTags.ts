import { tagSearchWords } from '@/model/patterns';
import {
  collapseTagState,
  derivedTags,
  effectiveSlotTags,
  isTopicalTag,
  matchSlots,
  normalizeTagState,
  stateFor,
  tagStateOf,
  withTagState,
  type TagState,
} from '@/model/tagSlots';
import { stringTags } from '@/model/topics';
import type { Question } from '@/model/types';
import type { BankRow, BankSlot } from './types';

/**
 * One truth for tags (C6): every copy of a question (same `rootId`) reads one set, so
 * coverage, the review rail, filters, search, Fill and the Topic row agree even where a
 * write could not reach every copy (hidden, trashed, newer-build, restored).
 *
 * **The newest tag change wins.** A copy's `tagsAt` stamps its last tag write; the set is
 * the tags of the copy stamped last. A removal therefore sticks: an unreachable copy keeps
 * the tag, but its older stamp loses. Derived at read time; documents keep their own.
 *
 * On a question tagged per part the unit is its whole **tag state** (`model/tagSlots.ts`):
 * the winner's question list and every part's list, mapped onto each copy slot by slot
 * (`sharedState`, `model/tagSlots.ts:stateFor`). One stamp covers them all.
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

/** The copies stamped newest, and that stamp; every copy when none is stamped. */
function newestOf<C extends { tagsAt?: unknown }>(copies: readonly C[]): { winners: readonly C[]; at?: string } {
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
  return at === undefined ? { winners } : { winners, at };
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
  const { winners, at } = newestOf(copies);
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
const unique = (tags: readonly string[]) => [...new Set(tags)];

/** One copy as the state resolution reads it: its tag state and when it was last written. */
export interface StateCopy {
  state: TagState;
  tagsAt?: unknown;
}

/** A question's one tag state, and the stamp of the change it comes from (absent: none stamped). */
export interface SharedState {
  state: TagState;
  tagsAt?: string;
}

/** `other` added to `base`, list by list over matched slots (both normalized). */
function unionState(base: TagState, other: TagState): TagState {
  if (base.slots.length === 0) return { tags: unique([...base.tags, ...derivedTags(other)]), slots: [] };
  if (other.slots.length === 0) {
    // A copy tagged as a whole: its topics reach every part, as a whole-question edit would.
    const topics = other.tags.filter(isTopicalTag);
    return {
      tags: unique([...base.tags, ...other.tags.filter((tag) => !isTopicalTag(tag))]),
      slots: base.slots.map((slot) =>
        slot.parent === undefined && topics.length > 0 ? { ...slot, own: unique([...(slot.own ?? []), ...topics]) } : slot,
      ),
    };
  }
  const match = matchSlots(base.slots, other.slots);
  const byKey = new Map(other.slots.map((slot) => [slot.key, slot]));
  const baseEffective = effectiveSlotTags(base);
  const otherEffective = effectiveSlotTags(other);
  return {
    tags: unique([...base.tags, ...other.tags]),
    slots: base.slots.map((slot) => {
      const key = match.get(slot.key);
      const theirs = key === undefined ? undefined : byKey.get(key);
      if (!theirs || (!slot.own && !theirs.own)) return slot;
      // A normalized part without a list has none; a sub-part without one has its part's.
      const own =
        slot.parent === undefined
          ? unique([...(slot.own ?? []), ...(theirs.own ?? [])])
          : unique([...(baseEffective.get(slot.key) ?? []), ...(otherEffective.get(theirs.key) ?? [])]);
      return { ...slot, own };
    }),
  };
}

/**
 * The shared state of one question's copies (`sharedTags`, over whole states): the state
 * of the copy with the newest `tagsAt`. Copies tied on the newest time, or no stamped copy
 * at all, give their union, list by list over matched slots (`matchSlots`), each normalized
 * first (`normalizeTagState`) so older whole-question topics count on every part; when no
 * copy has a part list, the union stays on the question. For copies without slots this is
 * exactly `sharedTags`.
 */
export function sharedState(copies: readonly StateCopy[]): SharedState {
  const { winners, at } = newestOf(copies);
  let state: TagState;
  if (winners.length === 0) state = { tags: [], slots: [] };
  else if (winners.length === 1) state = winners[0].state;
  else if (!winners.some((copy) => copy.state.slots.some((slot) => slot.own))) {
    // No copy tagged a part: the union stays on the question, so its parts still inherit
    // (the editor's "Set on the whole question"), as each copy shows on its own.
    state = { tags: unique(winners.flatMap((copy) => copy.state.tags)), slots: winners[0].state.slots };
  } else {
    state = collapseTagState(
      winners.slice(1).reduce((acc, copy) => unionState(acc, normalizeTagState(copy.state)), normalizeTagState(winners[0].state)),
    );
  }
  return at === undefined ? { state } : { state, tagsAt: at };
}

/** A row's tag state: its own list and its slots' own lists (on a published row, the shared state's). */
export function stateOfRow(row: {
  tags: readonly string[];
  slots?: readonly BankSlot[];
  ownTags?: readonly string[];
}): TagState {
  if (!row.slots) return { tags: [...row.tags], slots: [] };
  return {
    tags: [...(row.ownTags ?? [])],
    slots: row.slots.map((slot) => ({
      key: slot.key,
      path: slot.path,
      label: slot.label,
      ...(slot.parent !== undefined ? { parent: slot.parent } : {}),
      leaf: slot.leaf,
      ...(slot.own && slot.own.length > 0 ? { own: [...slot.own] } : {}),
    })),
  };
}

/** The row fields a tag state gives: the derived `tags`, and with slots each one's lists and `ownTags`. */
export function rowTagFields(state: TagState): Pick<BankRow, 'tags' | 'slots' | 'ownTags'> {
  const tags = [...derivedTags(state)];
  if (state.slots.length === 0) return { tags };
  const effective = effectiveSlotTags(state);
  const slots: BankSlot[] = state.slots.map((slot) => ({
    key: slot.key,
    path: slot.path,
    label: slot.label,
    ...(slot.parent !== undefined ? { parent: slot.parent } : {}),
    leaf: slot.leaf,
    ...(slot.own ? { own: [...slot.own] } : {}),
    tags: [...(effective.get(slot.key) ?? [])],
  }));
  return { tags, slots, ownTags: [...state.tags] };
}

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

const slotsJson = (fields: Pick<BankRow, 'slots' | 'ownTags'>) => JSON.stringify([fields.ownTags, fields.slots]);

/**
 * `rows` with every row's tags set to its question's shared state (`sharedState` over the
 * rows of its root, mapped onto this copy by `stateFor`): `tags`, `tagsAt`, `slots`,
 * `ownTags`, and `searchText` matching the derived tags, so a tag the shared state dropped
 * no longer finds the row. A row already holding its state is returned as the same object.
 */
export function withSharedTags(rows: readonly BankRow[]): BankRow[] {
  const states = rows.map(stateOfRow);
  const copies = new Map<string, StateCopy[]>();
  rows.forEach((row, index) => {
    copies.set(row.rootId, [...(copies.get(row.rootId) ?? []), { state: states[index], tagsAt: row.tagsAt }]);
  });
  const byRoot = new Map([...copies].map(([rootId, list]) => [rootId, sharedState(list)]));
  return rows.map((row, index) => {
    const shared = byRoot.get(row.rootId);
    if (!shared) return row;
    const fields = rowTagFields(stateFor(states[index], shared.state));
    const sameTags = sameList(fields.tags, row.tags);
    if (sameTags && shared.tagsAt === row.tagsAt && slotsJson(fields) === slotsJson(row)) return row;
    const { tagsAt: _own, slots: _slots, ownTags: _ownTags, ...rest } = row;
    void _own;
    void _slots;
    void _ownTags;
    return {
      ...rest,
      tags: fields.tags,
      ...(shared.tagsAt !== undefined ? { tagsAt: shared.tagsAt } : {}),
      ...(fields.slots ? { slots: fields.slots, ownTags: fields.ownTags } : {}),
      searchText: sameTags ? row.searchText : sharedSearchText(row, fields.tags),
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
 * A question read from its document, given the tags its bank row shows (the shared state,
 * `withSharedTags`). Every copy taken from the bank goes through this, so the new copy
 * starts with what the bank showed, not the picked copy's own (which may be stale): the
 * question list and each part's list, by the picked copy's own slot keys (`copyQuestion`
 * then stamps part roots, so the new copy's keys equal the source's). It takes that
 * state's stamp, so it never outranks a later change. The same object when nothing changes.
 */
export function withRowTags<Q extends Question>(
  question: Q,
  row: Pick<BankRow, 'tags' | 'tagsAt'> & Partial<Pick<BankRow, 'slots' | 'ownTags'>>,
): Q {
  const tagged = withTagState(question, stateFor(tagStateOf(question), stateOfRow(row)));
  const tagsAt = row.tagsAt ?? question.tagsAt;
  if (tagged === question && tagsAt === question.tagsAt) return question;
  const { tagsAt: _at, ...rest } = tagged;
  void _at;
  return { ...rest, ...(tagsAt !== undefined ? { tagsAt } : {}) } as Q;
}
