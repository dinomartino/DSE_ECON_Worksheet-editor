import { bankTopicDisplay, VIEW_SECTIONS, viewSectionOf, type ViewTopic } from '@/model/mcqView';
import { mcqTag, mcqTopic } from '@/model/topicSchemes';
import { parentCode, type TopicNames } from '@/model/topics';
import type { TopicEntry } from './pack';

/**
 * The Past paper bank's topics under their section, A to J (k-0446; since k-0569 the
 * sections of the teacher's MCQ topics, `model/mcqView.ts`, the same the 題庫 groups by).
 * A topic whose id is one of the MCQ topics sits in that topic's section (Circular Flow in
 * F, as on DSEcon Mentor); any other is placed by the first of its `syllabus` codes this
 * build reads. Inside a section the topics keep the list's order.
 */

/** The group of topics no known part claims (no codes, or only a later build's). */
export const OTHER_PART = '';

export interface TopicGroup {
  /** The coarse code (`C`), or `OTHER_PART`. */
  code: string;
  /** The section; absent for `OTHER_PART`. */
  part?: ViewTopic;
  topics: TopicEntry[];
  /** The topics' question counts added up; absent when none of them says. */
  questions?: number;
}

/** The section a topic sits in: its MCQ topic's (`circular-flow` → F), else its first readable code's (`["C.ped"]` → C). */
export function partOf(entry: TopicEntry): string | undefined {
  if (mcqTopic(entry.id)) return viewSectionOf(mcqTag(entry.id));
  for (const code of entry.syllabus ?? []) {
    const section = viewSectionOf(parentCode(code) ?? code);
    if (section) return section;
  }
  return undefined;
}

/**
 * The topics by part, parts in the guide's order, empty parts left out, `OTHER_PART` last.
 * Undefined when no topic names a part (an export before k-0446): the picker lists the
 * topics flat, as before.
 */
export function groupTopics(topics: readonly TopicEntry[]): TopicGroup[] | undefined {
  const byPart = new Map<string, TopicEntry[]>();
  let named = false;
  for (const entry of topics) {
    const code = partOf(entry) ?? OTHER_PART;
    if (code !== OTHER_PART) named = true;
    byPart.set(code, [...(byPart.get(code) ?? []), entry]);
  }
  if (!named) return undefined;
  const order: Array<{ code: string; part?: ViewTopic }> = [...VIEW_SECTIONS.map((part) => ({ code: part.code, part })), { code: OTHER_PART }];
  return order.flatMap(({ code, part }) => {
    const members = byPart.get(code);
    if (!members) return [];
    const counted = members.filter((t) => t.questions !== undefined);
    return [{
      code,
      ...(part ? { part } : {}),
      topics: members,
      ...(counted.length > 0 ? { questions: counted.reduce((n, t) => n + (t.questions ?? 0), 0) } : {}),
    }];
  });
}

/** The group holding a topic, by id. */
export function groupOf(groups: readonly TopicGroup[] | undefined, topicId: string | undefined): TopicGroup | undefined {
  return topicId === undefined ? undefined : groups?.find((g) => g.topics.some((t) => t.id === topicId));
}

/** A part's name in the question language (`names`); `other` for `OTHER_PART`. */
export function partName(group: TopicGroup, names: TopicNames, other: string): string {
  return group.part ? bankTopicDisplay(group.code, names) : other;
}

/**
 * The groups a topic filter leaves: a topic stays when the words are in its name (either
 * language) or id; a part whose own name (either language) holds them keeps every topic.
 * A part cut down counts only its topics left. Empty words leave every group as it is.
 */
export function filterGroups(groups: readonly TopicGroup[], words: string): TopicGroup[] {
  const needle = words.trim().toLowerCase();
  if (needle === '') return [...groups];
  const has = (...texts: string[]) => texts.some((text) => text.toLowerCase().includes(needle));
  return groups.flatMap((group) => {
    if (group.part && has(group.part.en, group.part.zh)) return [group];
    const topics = group.topics.filter((t) => has(t.title.en, t.title.zh, t.id));
    if (topics.length === 0) return [];
    // The part's count then adds up the topics shown, not the whole part.
    const counted = topics.filter((t) => t.questions !== undefined);
    const cut: TopicGroup = { code: group.code, ...(group.part ? { part: group.part } : {}), topics };
    if (counted.length > 0) cut.questions = counted.reduce((n, t) => n + (t.questions ?? 0), 0);
    return [cut];
  });
}
