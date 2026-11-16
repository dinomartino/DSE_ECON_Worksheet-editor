import { newId } from '@/model/factories';
import { blockIdOwners, rootIdOf } from '@/model/lineage';
import type { LayoutElement, Question } from '@/model/types';
import type { PastPaperItem } from './pack';

/**
 * Taking questions out of the Past paper bank (k-0443). The bank is never written: every
 * way out is a copy (`copyQuestion`, at the store or the bank write), with fresh ids and
 * the question's `lineage.rootId` kept, so "Already in this paper" and Copy to my bank see
 * two copies of one past-paper question as one question.
 *
 * A shared stimulus ("Questions 8 and 9 refer to…") travels with its questions: once, in
 * front of the first of them, with `span` = how many of them came along, so the printed
 * range counts exactly those.
 */

export type Stimulus = Extract<LayoutElement, { kind: 'stimulus' }>;

/** The stimulus with fresh ids (it and every block, row and cell) and the span given. */
export function stimulusCopy(stimulus: Stimulus, span: number): Stimulus {
  const copy = structuredClone(stimulus);
  copy.id = newId();
  for (const { owner } of blockIdOwners(copy.blocks)) owner.id = newId();
  return { ...copy, span: Math.max(1, span) };
}

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
 * stimulus drawn together behind the first of them, in the order picked.
 */
export function planCopies(items: readonly PastPaperItem[], skipRoots: ReadonlySet<string> = new Set()): PlannedCopies {
  const seen = new Set<string>();
  const unique: PastPaperItem[] = [];
  let repeats = 0;
  for (const item of items) {
    const root = rootIdOf(item.question);
    if (seen.has(root) || skipRoots.has(root)) {
      if (seen.has(root)) repeats += 1;
      continue;
    }
    seen.add(root);
    unique.push(item);
  }
  const ordered: PastPaperItem[] = [];
  const placed = new Set<PastPaperItem>();
  for (const item of unique) {
    if (placed.has(item)) continue;
    // A stimulus's questions print in the paper's order, whatever order they were picked in.
    const group = item.stimulus
      ? unique
          .filter((other) => other.stimulus?.id === item.stimulus!.id && other.topicId === item.topicId)
          .sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
      : [item];
    for (const member of group) {
      placed.add(member);
      ordered.push(member);
    }
  }
  const leads: (Stimulus | undefined)[] = [];
  ordered.forEach((item, index) => {
    const before = ordered[index - 1];
    const starts = item.stimulus && !(before?.stimulus?.id === item.stimulus.id && before.topicId === item.topicId);
    if (!starts || !item.stimulus) return void leads.push(undefined);
    let span = 1;
    while (ordered[index + span]?.stimulus?.id === item.stimulus.id && ordered[index + span].topicId === item.topicId) span += 1;
    leads.push(stimulusCopy(item.stimulus, span));
  });
  return {
    questions: ordered.map((item) => item.question),
    leads,
    fromDocIds: ordered.map((item) => item.docId),
    repeats,
  };
}
