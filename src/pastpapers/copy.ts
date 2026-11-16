import { planStimulusCopies, type Stimulus } from '@/library/stimuli';
import type { Question } from '@/model/types';
import type { PastPaperItem } from './pack';

/**
 * Taking questions out of the Past paper bank (k-0443). The bank is never written: every
 * way out is a copy (`copyQuestion`, at the store or the bank write), with fresh ids and
 * the question's `lineage.rootId` kept, so "Already in this paper" and Copy to my bank see
 * two copies of one past-paper question as one question.
 *
 * A shared stimulus ("Questions 8 and 9 refer to…") travels with its questions: once, in
 * front of the first of them, with `span` = how many of them came along
 * (`library/stimuli.ts`, which the 題庫's own Insert uses too).
 */

export { stimulusCopy, type Stimulus } from '@/library/stimuli';

export interface PlannedCopies {
  /** The questions to copy, in print order (the store or the bank write copies them). */
  questions: Question[];
  /** Per question: the stimulus copy to print right before it. */
  leads: (Stimulus | undefined)[];
  /** The topic documents they came from (`lineage.fromDocId`). */
  fromDocIds: string[];
  /** Picks dropped as a second pick of one question. */
  repeats: number;
}

/**
 * The picks in the order they print: one per question (`rootId`), and those sharing a
 * stimulus drawn together behind the first of them, in their paper's order.
 */
export function planCopies(items: readonly PastPaperItem[], skipRoots: ReadonlySet<string> = new Set()): PlannedCopies {
  const plan = planStimulusCopies(
    items.map((item) => ({ question: item.question, docId: item.docId, stimulus: item.stimulus, order: item.number })),
    skipRoots,
  );
  return {
    questions: plan.entries.map((entry) => entry.question),
    leads: plan.leads,
    fromDocIds: plan.entries.map((entry) => entry.docId),
    repeats: plan.repeats,
  };
}
