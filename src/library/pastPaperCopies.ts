import { rootIdOf } from '@/model/lineage';
import type { PastPaperOrigin, Question, Worksheet } from '@/model/types';
import { contentKey } from './contentKey';

/**
 * Past-paper copies and the 題庫 (k-0559, user u-rkoi). A question taken from the Past paper
 * bank into a paper is the exam's question, not the teacher's: while it says exactly what it
 * said as it went in, the 題庫 (which is every saved paper's questions, `indexer.ts:rowsOf`)
 * leaves it out. Once the teacher edits what it says (stem, options, answer, pictures,
 * tables: anything `contentKey` reads), it is their own question, adapted from its source
 * tag, and the 題庫 shows it like any other. Its number, place, topics and Show source are
 * not what it says, so they change nothing.
 *
 * The rule compares with the copy's own record (`QuestionLineage.pastPaper`), never with the
 * bank, so it needs no download and a later publish of the bank changes nothing. Undoing an
 * edit back to the exact words makes it the past paper's question again.
 *
 * A bank document (`kind: 'bank'`) is always shown whole: what is there was put there on
 * purpose (Copy to my question bank, Copy to bank).
 */

/** A copy's past-paper origin, read tolerantly (a hand-edited file may hold anything there). */
export function pastPaperOriginOf(question: Pick<Question, 'lineage'>): PastPaperOrigin | undefined {
  const origin = (question.lineage as { pastPaper?: unknown } | undefined)?.pastPaper as Partial<PastPaperOrigin> | undefined;
  if (!origin || typeof origin !== 'object') return undefined;
  return typeof origin.tag === 'string' && typeof origin.key === 'string' && origin.key ? { tag: origin.tag, key: origin.key } : undefined;
}

/**
 * `question` marked as the bank's question `tag`, saying what it says now. Its `rootId` is
 * kept (so "Already in this paper" still sees two copies as one); other lineage fields too.
 */
export function withPastPaperOrigin<Q extends Question>(question: Q, tag: string): Q {
  const lineage = question.lineage && typeof question.lineage === 'object' ? question.lineage : undefined;
  return { ...question, lineage: { ...lineage, rootId: rootIdOf(question), pastPaper: { tag, key: contentKey(question) } } };
}

/** A past-paper copy that still says exactly what it said as it went in. */
export function isUnchangedPastPaperCopy(question: Question): boolean {
  const origin = pastPaperOriginOf(question);
  return origin !== undefined && origin.key === contentKey(question);
}

/**
 * The source tag a teacher's own question was adapted from: a past-paper copy they have
 * edited. Undefined for an unchanged copy and for every other question.
 */
export function adaptedFrom(question: Question): string | undefined {
  const origin = pastPaperOriginOf(question);
  return origin && origin.key !== contentKey(question) ? origin.tag || undefined : undefined;
}

/** Whether the 題庫 shows this question of `doc`: all of a bank's, a paper's but its unchanged past-paper copies. */
export function showsInBank(question: Question, doc: Pick<Worksheet, 'kind'>): boolean {
  return doc.kind === 'bank' || !isUnchangedPastPaperCopy(question);
}
