import { cleanPatternName, holdsPatterns, parsePatternTag, patternTag, samePatternName, withPattern } from '@/model/patterns';
import { TOPICS, topicOf } from '@/model/topics';
import { listQuestionTypes } from '@/registry';
import type { PatternRegistry } from '@/storage/patterns';
import { copyWrites, type TagEdit, type TagWrite } from './tagWrites';
import type { BankRow } from './types';

/**
 * The bank's side of 題型 (Patterns, § src/model/patterns.ts): the lists per sub-topic and
 * question type, the counts, and the edits a rename, merge or delete writes into every
 * copy. A 題型 is (sub-topic, type id, name); names match ignoring case and spacing. The
 * type id reaches this module only as data: MCQ and LQ lists are separate because rows
 * carry their type, never because of a branch here.
 */

export interface PatternId {
  /** A sub-topic code. */
  topic: string;
  typeId: string;
  name: string;
}

export interface PatternItem extends PatternId {
  /** Distinct questions (`rootId`) of this type carrying it. */
  count: number;
  /** In the registry: it stays listed with no question left. */
  registered: boolean;
}

export const samePattern = (a: PatternId, b: PatternId): boolean =>
  a.topic === b.topic && a.typeId === b.typeId && samePatternName(a.name, b.name);

const holdsPattern = (tags: readonly string[], pattern: PatternId) =>
  tags.some((tag) => {
    const ref = parsePatternTag(tag);
    return ref !== undefined && ref.topic === pattern.topic && samePatternName(ref.name, pattern.name);
  });

/** Whether a row (its tags are the root's shared set, derived) carries the 題型: its type and its name. */
export function rowHasPattern(row: Pick<BankRow, 'typeId' | 'tags'>, pattern: PatternId): boolean {
  return row.typeId === pattern.typeId && holdsPattern(row.tags, pattern);
}

/** The row's first 題型 under a sub-topic, in its own tag order. */
export function rowPattern(row: Pick<BankRow, 'tags'>, topic: string): string | undefined {
  return rowPatterns(row, topic)[0];
}

/** Every 題型 the row carries under a sub-topic, in tag order (parts may differ). */
export function rowPatterns(row: Pick<BankRow, 'tags'>, topic: string): string[] {
  const names: string[] = [];
  for (const tag of row.tags) {
    const ref = parsePatternTag(tag);
    if (ref && ref.topic === topic && !names.some((name) => samePatternName(name, ref.name))) names.push(ref.name);
  }
  return names;
}

/**
 * Every tag list a row holds, as one list: the derived `tags`, the question's own list and
 * each part's own, a list no leaf inherits included. What a rename or delete must reach.
 */
export function everyTag(row: Pick<BankRow, 'tags'> & Partial<Pick<BankRow, 'slots' | 'ownTags'>>): string[] {
  return [...new Set([...row.tags, ...(row.ownTags ?? []), ...(row.slots ?? []).flatMap((slot) => slot.own ?? [])])];
}

/** Where a list is scoped: a coarse or fine topic code (a coarse one takes its sub-topics), a type. */
export interface PatternScope {
  topic?: string;
  typeId?: string;
}

const inScope = (id: Pick<PatternId, 'topic' | 'typeId'>, scope: PatternScope) =>
  (!scope.typeId || id.typeId === scope.typeId) &&
  (!scope.topic || id.topic === scope.topic || topicOf(id.topic)?.parent === scope.topic);

const GUIDE_ORDER = new Map(
  TOPICS.flatMap((topic) => [topic, ...topic.children]).map((topic, index) => [topic.code, index] as const),
);

/** Guide order of sub-topic, then registry order of type, then name (naturally). */
export function comparePatterns(a: PatternId, b: PatternId): number {
  const types = listQuestionTypes().map((type) => type.id);
  const typeRank = (id: string) => (types.includes(id) ? types.indexOf(id) : types.length);
  return (
    (GUIDE_ORDER.get(a.topic) ?? Number.MAX_SAFE_INTEGER) - (GUIDE_ORDER.get(b.topic) ?? Number.MAX_SAFE_INTEGER) ||
    typeRank(a.typeId) - typeRank(b.typeId) ||
    a.typeId.localeCompare(b.typeId) ||
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })
  );
}

/**
 * Every 題型 in scope: the registry joined with the names found on questions. The
 * registry's spelling wins; a name only on questions is spelled as first seen. Counts are
 * distinct questions (`rootId`) of the 題型's type.
 */
export function listPatterns(rows: readonly BankRow[], registry: PatternRegistry, scope: PatternScope = {}): PatternItem[] {
  const items: PatternItem[] = [];
  const roots: Set<string>[] = [];
  const find = (id: PatternId) => items.findIndex((item) => samePattern(item, id));
  for (const entry of registry.patterns) {
    // A later build's sub-topic stays in the registry, unshown here.
    if (!holdsPatterns(entry.topic) || !inScope(entry, scope) || find(entry) >= 0) continue;
    items.push({ topic: entry.topic, typeId: entry.typeId, name: entry.name, count: 0, registered: true });
    roots.push(new Set());
  }
  for (const row of rows) {
    for (const tag of new Set(row.tags)) {
      const ref = parsePatternTag(tag);
      if (!ref) continue;
      const id = { topic: ref.topic, typeId: row.typeId, name: ref.name };
      if (!inScope(id, scope)) continue;
      let at = find(id);
      if (at < 0) {
        items.push({ ...id, count: 0, registered: false });
        roots.push(new Set());
        at = items.length - 1;
      }
      roots[at].add(row.rootId);
    }
  }
  items.forEach((item, i) => (item.count = roots[i].size));
  return items.sort(comparePatterns);
}

/** The names offered for one sub-topic and type, in list order. */
export function patternNames(rows: readonly BankRow[], registry: PatternRegistry, topic: string, typeId: string): string[] {
  return listPatterns(rows, registry, { topic, typeId })
    .filter((item) => item.topic === topic)
    .map((item) => item.name);
}

/** The listed name a typed one means (ignoring case and spacing), else the typed name cleaned. */
export function resolvePatternName(typed: string, names: readonly string[]): string {
  return names.find((name) => samePatternName(name, typed)) ?? cleanPatternName(typed);
}

/**
 * One write per copy of every question carrying the 題型 in any of its lists (`everyTag`,
 * so a part's list no leaf inherits is reached too), through `copyWrites`.
 */
export function patternWrites(rows: readonly BankRow[], pattern: PatternId): TagWrite[] {
  const roots = new Set(
    rows.filter((row) => row.typeId === pattern.typeId && holdsPattern(everyTag(row), pattern)).map((row) => row.rootId),
  );
  return copyWrites(rows, roots);
}

const mapPatternTag =
  (topic: string, from: string, to: (tag: string) => string | undefined): TagEdit =>
  (tags) => {
    const out: string[] = [];
    for (const tag of tags) {
      const ref = parsePatternTag(tag);
      const next = ref && ref.topic === topic && samePatternName(ref.name, from) ? to(tag) : tag;
      if (next !== undefined && !out.includes(next)) out.push(next);
    }
    return out;
  };

/** Rename (or merge into `to`): the 題型 tag becomes `to`'s, once. */
export const renamePatternEdit = (topic: string, from: string, to: string): TagEdit =>
  mapPatternTag(topic, from, () => patternTag(topic, to));

/** Delete: the 題型 tag goes; the question and its topics stay. */
export const removePatternEdit = (topic: string, name: string): TagEdit => mapPatternTag(topic, name, () => undefined);

/**
 * Set 題型 per sub-topic: a name sets it (one per sub-topic), `undefined` clears it.
 * Sub-topics not named are left as they are.
 */
export const setPatternsEdit =
  (patterns: Readonly<Record<string, string | undefined>>): TagEdit =>
  (tags) =>
    Object.entries(patterns).reduce<string[]>((acc, [topic, name]) => withPattern(acc, topic, name), [...tags]);

/**
 * A picker's 題型 per sub-topic as `setPatternsEdit` takes them: a name sets it, `null`
 * clears it. A sub-topic with none chosen is left alone (bulk, tag as you go), or with
 * `exact` (one question's whole state) cleared.
 */
export function patternEdits(
  chosen: Readonly<Record<string, string | null | undefined>> | undefined,
  exact = false,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [topic, name] of Object.entries(chosen ?? {})) {
    if (name) out[topic] = name;
    else if (name === null || exact) out[topic] = undefined;
  }
  return out;
}

/** Sub-topic → how many of the rows carry a 題型 under it. */
export function patternMix(rows: readonly Pick<BankRow, 'tags'>[]): Map<string, number> {
  const mix = new Map<string, number>();
  for (const row of rows) {
    const topics = new Set(row.tags.flatMap((tag) => parsePatternTag(tag)?.topic ?? []));
    for (const topic of topics) mix.set(topic, (mix.get(topic) ?? 0) + 1);
  }
  return mix;
}

/** `first`, then `second` on its result. */
export const thenEdit =
  (first: TagEdit, second: TagEdit): TagEdit =>
  (tags) =>
    second(first(tags));

/** Whether the row carries the named 題型 under the sub-topic, whatever its type. */
export function rowHasPatternName(row: Pick<BankRow, 'tags'>, topic: string, name: string): boolean {
  return rowPatterns(row, topic).some((own) => samePatternName(own, name));
}

/**
 * One sub-topic's questions (distinct `rootId` tagged with it) and how many of them carry
 * no 題型 under it, per type too: what the 題型 map lists as still to sort.
 */
export interface SubTopicTally {
  topic: string;
  questions: number;
  without: number;
  /** Questions without a 題型 here, by type id. */
  withoutByType: Record<string, number>;
}

/** Every known sub-topic some question is tagged with → its tally. */
export function subTopicTallies(rows: readonly Pick<BankRow, 'rootId' | 'typeId' | 'tags'>[]): Map<string, SubTopicTally> {
  const seen = new Map<string, Set<string>>();
  const out = new Map<string, SubTopicTally>();
  for (const row of rows) {
    for (const code of new Set(row.tags)) {
      if (!holdsPatterns(code)) continue;
      const roots = seen.get(code) ?? new Set<string>();
      if (roots.has(row.rootId)) continue;
      roots.add(row.rootId);
      seen.set(code, roots);
      const tally = out.get(code) ?? { topic: code, questions: 0, without: 0, withoutByType: {} };
      tally.questions += 1;
      if (rowPatterns(row, code).length === 0) {
        tally.without += 1;
        tally.withoutByType[row.typeId] = (tally.withoutByType[row.typeId] ?? 0) + 1;
      }
      out.set(code, tally);
    }
  }
  return out;
}

/** Where to start sorting: the sub-topics with the most questions without a 題型, then guide order. */
export function startingSubTopics(tallies: ReadonlyMap<string, SubTopicTally>, count = 3): SubTopicTally[] {
  return [...tallies.values()]
    .filter((tally) => tally.without > 0)
    .sort((a, b) => b.without - a.without || (GUIDE_ORDER.get(a.topic) ?? 0) - (GUIDE_ORDER.get(b.topic) ?? 0))
    .slice(0, count);
}

/** The type most of a sub-topic's unsorted questions are: what a new 題型 there starts as. */
export function likelyType(tally: SubTopicTally | undefined, types: readonly string[]): string | undefined {
  if (!tally) return types[0];
  return [...types].sort((a, b) => (tally.withoutByType[b] ?? 0) - (tally.withoutByType[a] ?? 0))[0];
}

/**
 * One sub-topic's 題型 as the map lists them: one list, MCQ and LQ together, by name and
 * then type, so a name set in both reads as two neighbouring lines.
 */
export function subTopicList(items: readonly PatternItem[], topic: string): PatternItem[] {
  const types = listQuestionTypes().map((type) => type.id);
  return items
    .filter((item) => item.topic === topic)
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }) ||
        types.indexOf(a.typeId) - types.indexOf(b.typeId),
    );
}

/**
 * Sort into a 題型: the sub-topic's 題型 becomes `name` on every list that holds the
 * sub-topic, and only there, so a part about another sub-topic gets no stray 題型 tag.
 * Given to a write as a whole-question edit (`wholeQuestion`), it reaches each part.
 */
export const sortIntoEdit =
  (topic: string, name: string): TagEdit =>
  (tags) =>
    tags.includes(topic) ? withPattern(tags, topic, name) : [...tags];

/** Take a sort back: the sub-topic's 題型 cleared wherever it sits. */
export const unsortEdit = (topic: string): TagEdit => (tags) => withPattern(tags, topic, undefined);

/**
 * One coarse topic's place in the sorting: its distinct questions under any of its
 * sub-topics, and how many of them still lack a 題型 under one of those.
 */
export interface TopicProgress {
  /** A coarse topic code. */
  topic: string;
  questions: number;
  notSorted: number;
}

/** The whole map's progress: questions with a sub-topic, those with a 題型 in every one. */
export interface SortProgress {
  questions: number;
  sorted: number;
  /** Per coarse topic with questions, guide order. */
  topics: TopicProgress[];
}

/** Where every question with a sub-topic stands; a question counts once (`rootId`). */
export function sortProgress(rows: readonly Pick<BankRow, 'rootId' | 'tags'>[]): SortProgress {
  const seen = new Set<string>();
  const perTopic = new Map<string, { questions: Set<string>; notSorted: Set<string> }>();
  let sorted = 0;
  for (const row of rows) {
    if (seen.has(row.rootId)) continue;
    const subs = [...new Set(row.tags.filter(holdsPatterns))];
    if (subs.length === 0) continue;
    seen.add(row.rootId);
    let all = true;
    for (const code of subs) {
      const parent = topicOf(code)?.parent;
      if (!parent) continue;
      const entry = perTopic.get(parent) ?? { questions: new Set<string>(), notSorted: new Set<string>() };
      entry.questions.add(row.rootId);
      if (rowPatterns(row, code).length === 0) {
        entry.notSorted.add(row.rootId);
        all = false;
      }
      perTopic.set(parent, entry);
    }
    if (all) sorted += 1;
  }
  const topics = TOPICS.filter((topic) => perTopic.has(topic.code)).map((topic) => {
    const entry = perTopic.get(topic.code)!;
    return { topic: topic.code, questions: entry.questions.size, notSorted: entry.notSorted.size };
  });
  return { questions: seen.size, sorted, topics };
}

/** Where to start: the coarse topics with the most questions to sort, then guide order. */
export function topicsToSort(progress: SortProgress, count = 3): TopicProgress[] {
  return progress.topics
    .filter((entry) => entry.notSorted > 0)
    .sort((a, b) => b.notSorted - a.notSorted || (GUIDE_ORDER.get(a.topic) ?? 0) - (GUIDE_ORDER.get(b.topic) ?? 0))
    .slice(0, count);
}

/** One sub-topic on the sort board: its questions still to sort, one row per question. */
export interface SortSection {
  topic: string;
  /** One row per question (its first copy), by type, then marks, then text. */
  notSorted: BankRow[];
  /** Questions with a 題型 here. */
  sorted: number;
}

/** The sort board for a coarse topic: each sub-topic with questions, guide order. */
export function sortSections(rows: readonly BankRow[], topic: string): SortSection[] {
  const parent = TOPICS.find((entry) => entry.code === topic);
  if (!parent) return [];
  const types = listQuestionTypes().map((type) => type.id);
  const typeRank = (id: string) => (types.includes(id) ? types.indexOf(id) : types.length);
  const out: SortSection[] = [];
  for (const child of parent.children) {
    const seen = new Set<string>();
    const notSorted: BankRow[] = [];
    let sorted = 0;
    for (const row of rows) {
      if (!row.tags.includes(child.code) || seen.has(row.rootId)) continue;
      seen.add(row.rootId);
      if (rowPatterns(row, child.code).length > 0) sorted += 1;
      else notSorted.push(row);
    }
    if (seen.size === 0) continue;
    notSorted.sort(
      (a, b) =>
        typeRank(a.typeId) - typeRank(b.typeId) ||
        a.marks - b.marks ||
        (a.excerpt.en || a.excerpt.zh).localeCompare(b.excerpt.en || b.excerpt.zh),
    );
    out.push({ topic: child.code, notSorted, sorted });
  }
  return out;
}

/**
 * A sub-topic's 題型 as the board's buckets: one per name (MCQ and LQ lines of the same
 * name are one bucket, since the tag never held the type), list order, with their counts.
 */
export interface SortBucket {
  name: string;
  /** The types it is listed under, registry order. */
  typeIds: string[];
  count: number;
}

export function sortBuckets(items: readonly PatternItem[], topic: string): SortBucket[] {
  const out: SortBucket[] = [];
  for (const item of subTopicList(items, topic)) {
    const same = out.find((bucket) => samePatternName(bucket.name, item.name));
    if (same) {
      if (!same.typeIds.includes(item.typeId)) same.typeIds.push(item.typeId);
      same.count += item.count;
    } else out.push({ name: item.name, typeIds: [item.typeId], count: item.count });
  }
  return out;
}
