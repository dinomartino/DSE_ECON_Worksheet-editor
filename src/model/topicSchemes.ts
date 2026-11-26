import { MCQ_SECTION_ROWS } from './mcqTopics';

/**
 * **Topic schemes** (k-0569, `Outbox/k-0569/PLAN.md` § 4): the lists a question bank groups
 * by, beside the EDB codes a question stores (`model/topics.ts`). Today one scheme exists,
 * the teacher's **MCQ topics** (DSEcon Mentor's 72, `mcqTopics.ts`); a later LQ scheme
 * merges and renames some of them (`from`), so `schemeFor` is the one place that will pick.
 *
 * A scheme topic is stored on a question only as a **system tag** (`@mcq:<key>`, the `@`
 * namespace `topics.ts` reserved), beside the EDB codes it stands for, and only where those
 * codes alone do not already say it (`model/mcqView.ts`).
 */

export type TopicSchemeId = 'mcq' | 'lq';

export interface SchemeTopic {
  /** Frozen slug (Mentor's `key`), the part after the tag prefix. */
  key: string;
  en: string;
  zh: string;
  /** 'A'…'J' (an LQ scheme may add 'EL1'/'EL2'). */
  section: string;
  /** The EDB codes it stands for. */
  edb: readonly string[];
  /** LQ only: the MCQ keys a merged heading takes in. */
  from?: readonly string[];
}

export interface SchemeSection {
  key: string;
  en: string;
  zh: string;
}

export interface TopicScheme {
  id: TopicSchemeId;
  tagPrefix: string;
  sections: readonly SchemeSection[];
  /** In the list's own order. */
  topics: readonly SchemeTopic[];
}

export const MCQ_TAG_PREFIX = '@mcq:';

export const MCQ_SCHEME: TopicScheme = {
  id: 'mcq',
  tagPrefix: MCQ_TAG_PREFIX,
  sections: MCQ_SECTION_ROWS.map(({ key, en, zh }) => ({ key, en, zh })),
  topics: MCQ_SECTION_ROWS.flatMap((section) =>
    section.topics.map((topic) => ({ key: topic.key, en: topic.en, zh: topic.zh, section: section.key, edb: topic.edb })),
  ),
};

/**
 * The scheme a question's topics are read in. Every type reads the MCQ topics for now
 * (the user, D2 of k-0569); an LQ scheme will answer for the other types here.
 */
export function schemeFor(type?: string): TopicSchemeId {
  void type;
  return 'mcq';
}

const BY_KEY = new Map(MCQ_SCHEME.topics.map((topic) => [topic.key, topic]));

/** The MCQ topic a key names; undefined for a key this build does not list. */
export function mcqTopic(key: string): SchemeTopic | undefined {
  return BY_KEY.get(key);
}

/** `@mcq:per-unit-tax` → 'per-unit-tax'; undefined for any other tag. Known or not. */
export function mcqTagKey(tag: unknown): string | undefined {
  if (typeof tag !== 'string' || !tag.startsWith(MCQ_TAG_PREFIX)) return undefined;
  const key = tag.slice(MCQ_TAG_PREFIX.length);
  return /^[a-z0-9-]+$/.test(key) ? key : undefined;
}

/** A tag in the `@mcq:` form, known to this build or not. */
export const isMcqTag = (tag: unknown): tag is string => mcqTagKey(tag) !== undefined;

/** The tag that stores an MCQ topic. */
export const mcqTag = (key: string): string => `${MCQ_TAG_PREFIX}${key}`;
