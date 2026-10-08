import { rollupTopic, topicNamesFor, topicOf, TOPICS } from '@/model/topics';
import type { LanguageMode } from '@/model/types';
import { paperLanguage } from '@/settings/paperLanguage';
import { uiLanguage } from '@/i18n/language';
import { resolveMessages } from '@/i18n/catalogue';
import type { UiLanguage } from '@/settings/language';
import type { BankGroup, BankRow, BankSlot } from '@/library/types';
import { refsOf, rowUsedWith } from '@/library/history';
import { comparePatterns, rowPatterns, type PatternId } from '@/library/patterns';
import { slotsMatching, type SlotQuery } from '@/library/slotMatch';
import type { TextTopic } from '@/library/termTopics';
import type { Glossary } from '@/glossary';
import { holdsPatterns } from '@/model/patterns';
import { classChoices, typeName, type ClassChoice, type TopicPick } from './bankPage';
import { BANK_PAGE_MESSAGES as M } from './bankPage.messages';
import { topicName } from './topicText';

const words = (lang: UiLanguage) => resolveMessages(M, lang);

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

/**
 * One question under one heading. A question tagged with two sub-topics (or two 題型) of the
 * page is listed under each, one entry per heading: ↑ ↓ and "Question n of N" walk entries.
 */
export interface RailEntry {
  /** `section|part|rootId`: unique on the page, and what the stage remembers. */
  key: string;
  group: BankGroup;
  /** What its heading names, for "Part (b) tests this"; absent under "No topic". */
  query?: SlotQuery;
  /** The other headings on this page that list the same question, as they read. */
  alsoIn: string[];
}

export interface RailSection {
  /** A topic code, 'general' (the coarse code only) or 'none' (no topic). */
  key: string;
  label: string;
  /** In reading order: by 題型 when `parts` is set. */
  entries: RailEntry[];
  /** A sub-topic's questions by 題型, then "No 題型"; absent when none of them has one. */
  parts?: RailPart[];
}

/** One 題型 inside a sub-topic section, or its questions with none (`pattern` absent). */
export interface RailPart {
  key: string;
  label: string;
  /** The 題型's type ("MCQ", "LQ"); absent for "No 題型". */
  kind?: string;
  pattern?: PatternId;
  entries: RailEntry[];
}

const GUIDE_ORDER = new Map(
  TOPICS.flatMap((topic) => [topic, ...topic.children]).map((topic, index) => [topic.code, index] as const),
);

const unique = <T>(list: readonly T[]) => [...new Set(list)];

/**
 * The review rail's headings. Inside a coarse topic: its sub-topics in guide order, then
 * "General" for questions tagged only with the coarse code. Everywhere else (all
 * questions, search results): the coarse topics in guide order, then "No topic". A
 * question is listed under every heading its tags (every part's) name, each entry saying
 * where else it is; groups keep their incoming order within a section.
 */
export function railSections(
  groups: readonly BankGroup[],
  topic: TopicPick,
  lang: UiLanguage = uiLanguage(),
  view: LanguageMode = paperLanguage(),
): RailSection[] {
  const m = words(lang);
  const picked = topic === 'all' || topic === 'untagged' ? undefined : topicOf(topic);
  const buckets = new Map<string, BankGroup[]>();
  const put = (key: string, group: BankGroup) => buckets.set(key, [...(buckets.get(key) ?? []), group]);

  for (const group of groups) {
    const tags = group.rows[0]?.tags ?? [];
    if (picked && picked.parent) {
      put(picked.code, group);
    } else if (picked) {
      const fine = unique(tags.filter((tag) => topicOf(tag)?.parent === picked.code));
      for (const code of fine.length > 0 ? fine : ['general']) put(code, group);
    } else {
      const coarse = unique(tags.map(rollupTopic).flatMap((t) => (t ? [t.parent ?? t.code] : [])));
      for (const code of coarse.length > 0 ? coarse : ['none']) put(code, group);
    }
  }

  const label = (key: string) => {
    if (key === 'general') return m.general;
    if (key === 'none') return m.noTopic;
    const found = topicOf(key);
    return found ? (found.parent ? topicName(key, view) : `${found.code} · ${topicName(key, view)}`) : key;
  };
  const query = (key: string): SlotQuery | undefined =>
    key === 'none' ? undefined : { topic: key === 'general' && picked ? picked.code : key };
  const rank = (key: string) => (key === 'general' || key === 'none' ? Number.MAX_SAFE_INTEGER : (GUIDE_ORDER.get(key) ?? 0));
  const sections = [...buckets]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([key, list]) =>
      withParts(m.noPattern, {
        key,
        label: label(key),
        entries: list.map((group) => ({ key: `${key}||${group.rootId}`, group, query: query(key), alsoIn: [] })),
      }),
    );
  return withAlsoIn(sections);
}

/**
 * A sub-topic section split by 題型: each 題型 (sub-topic, type, name) in list order, then
 * "No 題型" last. A question is listed under every 題型 it carries for this sub-topic (its
 * parts may differ). Entries keep their incoming order inside a part; the section's
 * `entries` follow the parts.
 */
function withParts(noPattern: string, section: RailSection): RailSection {
  if (!holdsPatterns(section.key)) return section;
  const parts = new Map<string, RailPart>();
  const none: RailEntry[] = [];
  for (const entry of section.entries) {
    const lead = entry.group.rows[0];
    const names = lead ? rowPatterns(lead, section.key) : [];
    if (!lead || names.length === 0) {
      none.push({ ...entry, key: `${section.key}|none|${entry.group.rootId}` });
      continue;
    }
    for (const name of names) {
      const key = `${lead.typeId}\u0000${name.toLocaleLowerCase()}`;
      const part = parts.get(key) ?? {
        key,
        label: name,
        kind: typeName(lead.typeId),
        pattern: { topic: section.key, typeId: lead.typeId, name },
        entries: [],
      };
      // The entry key lands in a DOM attribute and a selector: no NUL there.
      const entryKey = `${section.key}|${lead.typeId}/${name.toLocaleLowerCase()}|${entry.group.rootId}`;
      part.entries.push({ ...entry, key: entryKey, query: { pattern: part.pattern! } });
      parts.set(key, part);
    }
  }
  if (parts.size === 0) return section;
  const ordered = [...parts.values()].sort((a, b) => comparePatterns(a.pattern!, b.pattern!));
  if (none.length > 0) ordered.push({ key: 'none', label: noPattern, entries: none });
  return { ...section, entries: ordered.flatMap((part) => part.entries), parts: ordered };
}

/** Each entry's other headings: another 題型 of its own section by name, another section by its label. */
function withAlsoIn(sections: readonly RailSection[]): RailSection[] {
  const places = new Map<string, { entry: string; section: RailSection; part?: RailPart }[]>();
  for (const section of sections) {
    for (const part of section.parts ?? [undefined]) {
      for (const entry of part ? part.entries : section.entries) {
        const root = entry.group.rootId;
        places.set(root, [...(places.get(root) ?? []), { entry: entry.key, section, part }]);
      }
    }
  }
  const alsoIn = (entry: RailEntry, section: RailSection) =>
    unique(
      (places.get(entry.group.rootId) ?? [])
        .filter((place) => place.entry !== entry.key)
        .map((place) => (place.section === section ? (place.part?.label ?? section.label) : place.section.label)),
    );
  return sections.map((section) => {
    const fill = (entries: readonly RailEntry[]) => entries.map((entry) => ({ ...entry, alsoIn: alsoIn(entry, section) }));
    if (!section.parts) return { ...section, entries: fill(section.entries) };
    const parts = section.parts.map((part) => ({ ...part, entries: fill(part.entries) }));
    return { ...section, parts, entries: parts.flatMap((part) => part.entries) };
  });
}

/** The rail's entries in reading order: what ↑ ↓ and "Question n of N" step through. */
export function railOrder(sections: readonly RailSection[]): RailEntry[] {
  return sections.flatMap((section) => section.entries);
}

/**
 * Where the stage's question is in `order`: the remembered entry while it still lists this
 * question, else the question's first entry; -1 when the question is not listed.
 */
export function entryIndex(order: readonly RailEntry[], rootId: string | undefined, entryKey: string | undefined): number {
  if (rootId === undefined) return -1;
  const remembered = entryKey === undefined ? -1 : order.findIndex((entry) => entry.key === entryKey && entry.group.rootId === rootId);
  return remembered >= 0 ? remembered : order.findIndex((entry) => entry.group.rootId === rootId);
}

/* ------------------------------------------------------------------------------------ */
/* Which part tests it                                                                  */
/* ------------------------------------------------------------------------------------ */

/**
 * The parts of `row`'s question that test what `query` names, in print order; a part whose
 * every sub-part matches stands for them ("(a)", not "(a)(i)" and "(a)(ii)"). Empty when the
 * whole question does, none does, or it is not tagged by part (`slotsMatching`).
 */
export function partsTesting(row: Pick<BankRow, 'typeId' | 'slots'>, query: SlotQuery | undefined): BankSlot[] {
  if (!query) return [];
  const hits = new Set(slotsMatching(row, query).map((slot) => slot.key));
  if (hits.size === 0) return [];
  const slots = row.slots ?? [];
  const whole = (part: BankSlot) => {
    const subs = slots.filter((sub) => sub.parent === part.key && sub.leaf);
    return part.leaf ? hits.has(part.key) : subs.length > 0 && subs.every((sub) => hits.has(sub.key));
  };
  const out: BankSlot[] = [];
  for (const slot of slots) {
    if (slot.parent === undefined ? whole(slot) : hits.has(slot.key) && !out.some((part) => part.key === slot.parent)) out.push(slot);
  }
  return out;
}

/** "(a)", "(a)(ii) and (c)", "(a), (b) and (d)". */
export function partList(labels: readonly string[], lang: UiLanguage = uiLanguage()): string {
  if (labels.length <= 1) return labels[0] ?? '';
  const m = words(lang);
  return m.partsAnd(labels.slice(0, -1).join(m.sep), labels[labels.length - 1]);
}

/** The rail row's line: "Part (b) tests this", "Parts (a)(ii) and (c) test this". */
export function testsThisText(labels: readonly string[], lang: UiLanguage = uiLanguage()): string | undefined {
  if (labels.length === 0) return undefined;
  const m = words(lang);
  return labels.length === 1 ? m.partTestsThis(labels[0]) : m.partsTestThis(partList(labels, lang));
}

/** The stage's line: "Part (b) tests Price elasticity of demand", "Parts (a) and (c) test Calculate PED". */
export function testsWhatText(
  labels: readonly string[],
  query: SlotQuery | undefined,
  lang: UiLanguage = uiLanguage(),
  view: LanguageMode = paperLanguage(),
): string | undefined {
  if (labels.length === 0 || !query) return undefined;
  const m = words(lang);
  const what = 'topic' in query ? topicName(query.topic, view) : query.pattern.name;
  return labels.length === 1 ? m.partTests(labels[0], what) : m.partsTest(partList(labels, lang), what);
}

/** "Also in Law of demand", "Also in Law of demand and Price ceiling". */
export function alsoInText(alsoIn: readonly string[], lang: UiLanguage = uiLanguage()): string | undefined {
  return alsoIn.length === 0 ? undefined : words(lang).alsoIn(partList(alsoIn, lang));
}

/**
 * The Topics fact of a question tagged by part: one line per part in print order, a part
 * whose sub-parts all test the same standing for them. Undefined when every part tests the
 * same (the question's list says it all) or it is not tagged by part.
 */
export function topicsByPart(row: Pick<BankRow, 'slots'>): { label: string; tags: string[] }[] | undefined {
  const slots = row.slots ?? [];
  const leaves = slots.filter((slot) => slot.leaf);
  const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((tag) => b.includes(tag));
  if (leaves.length === 0 || leaves.every((leaf) => same(leaf.tags, leaves[0].tags))) return undefined;
  const lines: { label: string; tags: string[] }[] = [];
  for (const slot of slots) {
    if (slot.parent !== undefined) continue;
    const subs = slots.filter((sub) => sub.parent === slot.key && sub.leaf);
    if (slot.leaf || subs.length === 0) lines.push({ label: slot.label, tags: slot.tags });
    else if (subs.every((sub) => same(sub.tags, subs[0].tags))) lines.push({ label: slot.label, tags: subs[0].tags });
    else lines.push(...subs.map((sub) => ({ label: sub.label, tags: sub.tags })));
  }
  return lines;
}

/* ------------------------------------------------------------------------------------ */
/* Tag as you go                                                                        */
/* ------------------------------------------------------------------------------------ */

/** Keys offered before "… All topics": the row holds six, numbered 1 to 6. */
export const SUGGESTION_COUNT = 5;

/** At most this many keys go to topics the question's own words point to, so neighbours still show. */
export const TEXT_SUGGESTION_COUNT = 3;

/**
 * The topics offered for an untagged question, best first. First those its own words point
 * to (`fromText`, `src/library/termTopics.ts:textTopics`, the best three). Then the topic
 * codes on the other questions in the same document: most questions first, then the
 * nearest by printed number, then guide order. Then the codes used most across the whole
 * bank (distinct questions). Free tags are never offered.
 */
export function suggestTopics(
  target: Pick<BankRow, 'docId' | 'rootId' | 'number'>,
  rows: readonly BankRow[],
  limit = SUGGESTION_COUNT,
  fromText: readonly Pick<TextTopic, 'code'>[] = [],
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
  const text = fromText.map((topic) => topic.code).filter((code) => topicOf(code)).slice(0, TEXT_SUGGESTION_COUNT);
  return [...new Set([...text, ...first, ...rest])].slice(0, limit);
}

/**
 * For the suggested keys that came from the question's words: the terms that found them,
 * as the key's tooltip names them ("price ceiling 價格上限", the glossary's English and
 * first 中文). A code the neighbours also suggest still names its terms.
 */
export function termsByTopic(
  hits: readonly TextTopic[],
  suggestions: readonly string[],
  glossary: Pick<Glossary, 'entries'> | null,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (!glossary) return out;
  const preferred = (key: string) => glossary.entries.find((entry) => entry.en === key)?.preferred;
  for (const hit of hits) {
    if (!suggestions.includes(hit.code)) continue;
    out.set(hit.code, hit.terms.map((key) => [key, preferred(key)].filter(Boolean).join(' ')));
  }
  return out;
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
export function latestClassUsage(rows: readonly BankRow[], lang: UiLanguage = uiLanguage()): ClassUsage | undefined {
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
    label: ref.cohort !== undefined ? `${ref.name} · ${choice.label}` : words(lang).classLabel(ref.name),
    used: used.size,
    total: new Set(rows.map((row) => row.rootId)).size,
  };
}

/** The key's lines: the coarse code, then the sub-topic's (or topic's) own name; a bilingual view adds the 中文 under it. */
export function suggestionLabel(code: string, view: LanguageMode = paperLanguage()): { code: string; name: string; zh?: string } {
  const topic = topicOf(code);
  if (!topic) return { code, name: code };
  const names = topicNamesFor(view, 'wide');
  if (names === 'both') return { code: topic.parent ?? topic.code, name: topic.en, zh: topic.zh };
  return { code: topic.parent ?? topic.code, name: topic[names] };
}
