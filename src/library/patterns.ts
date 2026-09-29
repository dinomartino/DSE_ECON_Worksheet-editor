import { cleanPatternName, parsePatternTag, patternTag, samePatternName, withPattern } from '@/model/patterns';
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

/** Whether a row (its tags are the root's union) carries the 題型: its type and its name. */
export function rowHasPattern(row: Pick<BankRow, 'typeId' | 'tags'>, pattern: PatternId): boolean {
  if (row.typeId !== pattern.typeId) return false;
  return row.tags.some((tag) => {
    const ref = parsePatternTag(tag);
    return ref !== undefined && ref.topic === pattern.topic && samePatternName(ref.name, pattern.name);
  });
}

/** The row's first 題型 under a sub-topic, in its own tag order. */
export function rowPattern(row: Pick<BankRow, 'tags'>, topic: string): string | undefined {
  for (const tag of row.tags) {
    const ref = parsePatternTag(tag);
    if (ref && ref.topic === topic) return ref.name;
  }
  return undefined;
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
    if (!inScope(entry, scope) || find(entry) >= 0) continue;
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

/** One write per copy of every question carrying the 題型 (`copyWrites`). */
export function patternWrites(rows: readonly BankRow[], pattern: PatternId): TagWrite[] {
  const roots = new Set(rows.filter((row) => rowHasPattern(row, pattern)).map((row) => row.rootId));
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
