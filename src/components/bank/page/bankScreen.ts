import { TOPICS, topicOf } from '@/model/topics';
import type { BankGroup, BankRow } from '@/library/types';
import { refsOf, rowUsedWith } from '@/library/history';
import { comparePatterns, rowPattern } from '@/library/patterns';
import { holdsPatterns } from '@/model/patterns';
import { classChoices, typeName, type ClassChoice, type TopicPick } from './bankPage';

/**
 * The Question bank screen's pure half: which level is showing, how the review rail is
 * sectioned, and which topics the tagging mode offers first.
 */

/* ------------------------------------------------------------------------------------ */
/* Levels                                                                               */
/* ------------------------------------------------------------------------------------ */

/**
 * All topics (the landing page), one topic or every question as a review page (`search`
 * when it was opened by typing in the bar), the untagged questions one at a time, or the
 * 題型 manage page (scoped to a topic when opened from one).
 */
export type BankLevel =
  | { kind: 'topics' }
  | { kind: 'review'; topic: TopicPick; search?: boolean }
  | { kind: 'untagged' }
  | { kind: 'patterns'; topic?: string };

export const TOPICS_LEVEL: BankLevel = { kind: 'topics' };

/** Esc and "← Topics": a review, the tagging mode or the 題型 page goes back to the topics; the topics go home. */
export function levelUp(level: BankLevel): BankLevel | 'home' {
  return level.kind === 'topics' ? 'home' : TOPICS_LEVEL;
}

/**
 * Typing in the bar. From the topics, text opens every question as search results; a
 * search emptied goes back to the topics. Inside a topic, or on All questions, the text
 * narrows the list in place.
 */
export function levelForSearch(level: BankLevel, text: string): BankLevel {
  const typed = text.trim().length > 0;
  if (level.kind === 'topics' && typed) return { kind: 'review', topic: 'all', search: true };
  if (level.kind === 'review' && level.search && !typed) return TOPICS_LEVEL;
  return level;
}

const LEVEL_KEY = 'econgen.bankLevel';
const RAIL_KEY = 'econgen.bankRailHidden';

/** A stored level, validated: an unknown topic, or a search (its text is not kept), is the topics. */
export function parseLevel(raw: string | null | undefined): BankLevel {
  if (!raw) return TOPICS_LEVEL;
  try {
    const value = JSON.parse(raw) as Partial<{ kind: string; topic: string }>;
    if (value.kind === 'untagged') return { kind: 'untagged' };
    if (value.kind === 'patterns') {
      return typeof value.topic === 'string' && topicOf(value.topic) ? { kind: 'patterns', topic: value.topic } : { kind: 'patterns' };
    }
    if (value.kind === 'review' && typeof value.topic === 'string') {
      if (value.topic === 'all' || topicOf(value.topic)) return { kind: 'review', topic: value.topic };
    }
  } catch {
    // Not JSON: fall through.
  }
  return TOPICS_LEVEL;
}

export function serializeLevel(level: BankLevel): string {
  if (level.kind === 'review') return level.search ? JSON.stringify(TOPICS_LEVEL) : JSON.stringify({ kind: 'review', topic: level.topic });
  if (level.kind === 'patterns') return JSON.stringify(level.topic ? { kind: 'patterns', topic: level.topic } : { kind: 'patterns' });
  return JSON.stringify({ kind: level.kind });
}

/** The level last left, per viewer; storage can be missing or blocked, so every read is guarded. */
export function readLevel(): BankLevel {
  try {
    return parseLevel(window.localStorage.getItem(LEVEL_KEY));
  } catch {
    return TOPICS_LEVEL;
  }
}

export function writeLevel(level: BankLevel): void {
  try {
    window.localStorage.setItem(LEVEL_KEY, serializeLevel(level));
  } catch {
    // Private mode or blocked storage: the level just doesn't outlive the visit.
  }
}

export function readRailHidden(): boolean {
  try {
    return window.localStorage.getItem(RAIL_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeRailHidden(hidden: boolean): void {
  try {
    window.localStorage.setItem(RAIL_KEY, hidden ? '1' : '0');
  } catch {
    // As above.
  }
}

/* ------------------------------------------------------------------------------------ */
/* Rail sections                                                                        */
/* ------------------------------------------------------------------------------------ */

export interface RailSection {
  /** A topic code, 'general' (the coarse code only) or 'none' (no topic). */
  key: string;
  label: string;
  /** In reading order: by 題型 when `parts` is set. */
  groups: BankGroup[];
  /** A sub-topic's questions by 題型, then "No 題型"; absent when none of them has one. */
  parts?: RailPart[];
}

/** One 題型 inside a sub-topic section, or its questions with none (`pattern` absent). */
export interface RailPart {
  key: string;
  label: string;
  /** The 題型's type ("MCQ", "LQ"); absent for "No 題型". */
  kind?: string;
  pattern?: { topic: string; typeId: string; name: string };
  groups: BankGroup[];
}

const GUIDE_ORDER = new Map(
  TOPICS.flatMap((topic) => [topic, ...topic.children]).map((topic, index) => [topic.code, index] as const),
);

/**
 * The review rail's headings. Inside a coarse topic: its sub-topics in guide order, then
 * "General" for questions tagged only with the coarse code. Everywhere else (all
 * questions, search results): the coarse topics in guide order, then "No topic". A
 * question sits once, under its first matching tag in its own tag order (the order the
 * teacher gave them); groups keep their incoming order within a section.
 */
export function railSections(groups: readonly BankGroup[], topic: TopicPick): RailSection[] {
  const picked = topic === 'all' || topic === 'untagged' ? undefined : topicOf(topic);
  const buckets = new Map<string, BankGroup[]>();
  const put = (key: string, group: BankGroup) => buckets.set(key, [...(buckets.get(key) ?? []), group]);

  for (const group of groups) {
    const tags = group.rows[0]?.tags ?? [];
    if (picked && picked.parent) {
      put(picked.code, group);
    } else if (picked) {
      const fine = tags.find((tag) => topicOf(tag)?.parent === picked.code);
      put(fine ?? 'general', group);
    } else {
      const coarse = tags.map((tag) => topicOf(tag)).find((t) => t !== undefined);
      put(coarse ? (coarse.parent ?? coarse.code) : 'none', group);
    }
  }

  const label = (key: string) => {
    if (key === 'general') return 'General';
    if (key === 'none') return 'No topic';
    const found = topicOf(key);
    return found ? (found.parent ? found.en : `${found.code} · ${found.en}`) : key;
  };
  const rank = (key: string) => (key === 'general' || key === 'none' ? Number.MAX_SAFE_INTEGER : (GUIDE_ORDER.get(key) ?? 0));
  return [...buckets]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([key, list]) => withParts({ key, label: label(key), groups: list }));
}

/**
 * A sub-topic section split by 題型: each 題型 (sub-topic, type, name) in list order, then
 * "No 題型" last. A question sits under its first 題型 for this sub-topic. Groups keep
 * their incoming order inside a part; the section's `groups` follow the parts.
 */
function withParts(section: RailSection): RailSection {
  if (!holdsPatterns(section.key)) return section;
  const parts = new Map<string, RailPart>();
  const none: BankGroup[] = [];
  for (const group of section.groups) {
    const lead = group.rows[0];
    const name = lead ? rowPattern(lead, section.key) : undefined;
    if (!lead || !name) {
      none.push(group);
      continue;
    }
    const key = `${lead.typeId}\u0000${name.toLocaleLowerCase()}`;
    const part = parts.get(key) ?? {
      key,
      label: name,
      kind: typeName(lead.typeId),
      pattern: { topic: section.key, typeId: lead.typeId, name },
      groups: [],
    };
    part.groups.push(group);
    parts.set(key, part);
  }
  if (parts.size === 0) return section;
  const ordered = [...parts.values()].sort((a, b) => comparePatterns(a.pattern!, b.pattern!));
  if (none.length > 0) ordered.push({ key: 'none', label: 'No 題型', groups: none });
  return { ...section, groups: ordered.flatMap((part) => part.groups), parts: ordered };
}

/** The rail's groups in reading order: what ↑ ↓ and "Question n of N" step through. */
export function railOrder(sections: readonly RailSection[]): BankGroup[] {
  return sections.flatMap((section) => section.groups);
}

/* ------------------------------------------------------------------------------------ */
/* Tag as you go                                                                        */
/* ------------------------------------------------------------------------------------ */

/** Keys offered before "… All topics": the row holds six, numbered 1 to 6. */
export const SUGGESTION_COUNT = 5;

/**
 * The topics offered for an untagged question, best first. First the topic codes on the
 * other questions in the same document: most questions first, then the nearest by printed
 * number, then guide order. Then the codes used most across the whole bank (distinct
 * questions). Free tags are never offered.
 */
export function suggestTopics(
  target: Pick<BankRow, 'docId' | 'rootId' | 'number'>,
  rows: readonly BankRow[],
  limit = SUGGESTION_COUNT,
): string[] {
  const local = new Map<string, { roots: Set<string>; distance: number }>();
  const overall = new Map<string, Set<string>>();
  for (const row of rows) {
    const codes = [...new Set(row.tags)].filter((tag) => topicOf(tag));
    for (const code of codes) {
      overall.set(code, (overall.get(code) ?? new Set()).add(row.rootId));
      if (row.docId !== target.docId || row.rootId === target.rootId) continue;
      const distance =
        row.number !== undefined && target.number !== undefined ? Math.abs(row.number - target.number) : Number.MAX_SAFE_INTEGER;
      const entry = local.get(code) ?? { roots: new Set<string>(), distance };
      entry.roots.add(row.rootId);
      entry.distance = Math.min(entry.distance, distance);
      local.set(code, entry);
    }
  }
  const guide = (code: string) => GUIDE_ORDER.get(code) ?? Number.MAX_SAFE_INTEGER;
  const size = (code: string) => overall.get(code)?.size ?? 0;
  const first = [...local]
    .sort(
      ([a, x], [b, y]) =>
        y.roots.size - x.roots.size || x.distance - y.distance || size(b) - size(a) || guide(a) - guide(b),
    )
    .map(([code]) => code);
  const rest = [...overall.keys()].filter((code) => !local.has(code)).sort((a, b) => size(b) - size(a) || guide(a) - guide(b));
  return [...first, ...rest].slice(0, limit);
}

/* ------------------------------------------------------------------------------------ */
/* Class usage                                                                          */
/* ------------------------------------------------------------------------------------ */

export interface ClassUsage {
  /** The filter "Show the questions … has not used" applies: the class's cohort, or the class. */
  choice: ClassChoice;
  /** How the strip names it: "5A · DSE 2027", or "Class 5A" when no cohort derives. */
  label: string;
  /** Distinct questions used on a paper with these students. */
  used: number;
  /** Distinct questions in the bank. */
  total: number;
}

/**
 * The quiet strip beside the untagged one: how much of the bank the students of the most
 * recent use (by use date, never by edit) have already seen. Undefined when no paper names a class.
 */
export function latestClassUsage(rows: readonly BankRow[]): ClassUsage | undefined {
  let latest: BankRow | undefined;
  for (const row of rows) {
    if (row.docKind !== 'paper' || !row.classes?.length) continue;
    if (!latest || row.usedOn > latest.usedOn || (row.usedOn === latest.usedOn && row.docId < latest.docId)) latest = row;
  }
  const ref = latest ? refsOf(latest)[0] : undefined;
  if (!ref) return undefined;
  const id = ref.cohort !== undefined ? `dse:${ref.cohort}` : `class:${ref.key}`;
  const choice = classChoices(rows).find((entry) => entry.id === id);
  if (!choice) return undefined;
  const used = new Set(rows.filter((row) => rowUsedWith(row, [choice.target])).map((row) => row.rootId));
  return {
    choice,
    label: ref.cohort !== undefined ? `${ref.name} · ${choice.label}` : `Class ${ref.name}`,
    used: used.size,
    total: new Set(rows.map((row) => row.rootId)).size,
  };
}

/** The key's two lines: the coarse code, and the sub-topic's (or topic's) own name. */
export function suggestionLabel(code: string): { code: string; name: string } {
  const topic = topicOf(code);
  if (!topic) return { code, name: code };
  return { code: topic.parent ?? topic.code, name: topic.en };
}
