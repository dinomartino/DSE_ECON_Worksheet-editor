import type { Question, Worksheet } from '@/model/types';
import { derivedTags } from '@/model/tagSlots';
import { SYLLABUS, type SyllabusTopic } from '@/syllabus';

/**
 * The ✦ Write panel's opener (k-0516 B): how many of the paper's questions are tagged with each
 * compulsory topic, from the tags alone (no AI, nothing sent), and the first topic with none.
 * A gap is offered only when enough of the paper is tagged for the count to mean something.
 */
export interface TopicCount {
  topic: SyllabusTopic;
  count: number;
}

export interface PaperCoverage {
  topics: TopicCount[];
  /** Questions with at least one topic tag. */
  tagged: number;
  total: number;
  /** The first compulsory topic with no question, when the paper is tagged enough to say so. */
  gap?: SyllabusTopic;
}

/** Fewer tagged questions than this, and an empty topic says nothing about the paper. */
export const MIN_TAGGED = 3;

const topicsOf = (question: Question): Set<string> =>
  new Set(derivedTags(question).flatMap((tag) => (/^[A-Z](?:\.|$)/.test(tag) ? [tag.split('.')[0]] : [])));

export function paperCoverage(worksheet: Pick<Worksheet, 'questions'>): PaperCoverage {
  const compulsory = SYLLABUS.topics.filter((t) => t.part === 'compulsory');
  const counts = new Map(compulsory.map((t) => [t.code, 0]));
  let tagged = 0;
  for (const question of worksheet.questions) {
    const topics = topicsOf(question);
    if (topics.size > 0) tagged += 1;
    for (const code of topics) if (counts.has(code)) counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  const topics = compulsory.map((topic) => ({ topic, count: counts.get(topic.code) ?? 0 }));
  const gap = tagged >= MIN_TAGGED ? topics.find((t) => t.count === 0)?.topic : undefined;
  return { topics, tagged, total: worksheet.questions.length, ...(gap ? { gap } : {}) };
}
