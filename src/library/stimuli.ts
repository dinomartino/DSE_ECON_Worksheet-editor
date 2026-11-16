import { newId } from '@/model/factories';
import { blockIdOwners, rootIdOf } from '@/model/lineage';
import type { LayoutElement, Question, Worksheet } from '@/model/types';

/**
 * Shared stimuli travelling with their questions when questions are copied out of a document
 * (k-0443, k-0444): the Past paper bank's Add and Insert, Copy to my question bank, and the
 * 題庫's own Insert. A question that shares a passage is not answerable without it, so the
 * passage goes along, once, in front of the copies it serves, with `span` = how many of them
 * came along, so its printed range ("Questions 5 and 6") counts exactly those.
 */

export type Stimulus = Extract<LayoutElement, { kind: 'stimulus' }>;

/** As the page reads it (`render/worksheet.ts`): absent `span` serves two questions. */
const DEFAULT_SPAN = 2;

/**
 * Which stimulus serves each question of a document: the next `span` questions after it in
 * the flow, stopping at the next stimulus; the same reading the page's printed range uses.
 */
export function stimuliServing(doc: Pick<Worksheet, 'flow' | 'layout'>): Map<string, Stimulus> {
  const layout = new Map((doc.layout ?? []).map((element) => [element.id, element]));
  const served = new Map<string, Stimulus>();
  let open: { element: Stimulus; left: number } | undefined;
  for (const item of doc.flow ?? []) {
    if (item.type === 'layout') {
      const element = layout.get(item.id);
      if (element?.kind === 'stimulus') open = { element, left: Math.max(1, element.span ?? DEFAULT_SPAN) };
      continue;
    }
    if (item.type !== 'question') continue;
    if (open && open.left > 0) {
      served.set(item.id, open.element);
      open.left -= 1;
    }
  }
  return served;
}

/** The stimulus with fresh ids (it and every block, row and cell) and the span given. */
export function stimulusCopy(stimulus: Stimulus, span: number): Stimulus {
  const copy = structuredClone(stimulus);
  copy.id = newId();
  for (const { owner } of blockIdOwners(copy.blocks)) owner.id = newId();
  return { ...copy, span: Math.max(1, span) };
}

/** A question about to be copied, with where it came from and the stimulus serving it there. */
export interface CopyEntry {
  question: Question;
  docId: string;
  stimulus?: Stimulus;
  /** Its place among the stimulus's questions in the source (a paper number, a flow index). */
  order?: number;
}

export interface PlannedStimulusCopies<E extends CopyEntry> {
  /** In print order: one per question (`rootId`), a stimulus's questions together. */
  entries: E[];
  /** Per entry: the stimulus copy to print right before it. */
  leads: (Stimulus | undefined)[];
  /** Entries dropped as a second copy of one question. */
  repeats: number;
}

const sameStimulus = (a: CopyEntry | undefined, b: CopyEntry) =>
  a?.stimulus !== undefined && a.stimulus.id === b.stimulus?.id && a.docId === b.docId;

/**
 * The copies in the order they print: each question once (by `rootId`, and none of
 * `skipRoots`), those sharing a stimulus drawn together behind the first of them in their
 * source order, everything else in the order given; and one stimulus copy per group.
 */
export function planStimulusCopies<E extends CopyEntry>(
  entries: readonly E[],
  skipRoots: ReadonlySet<string> = new Set(),
  /** Keep a second copy of one question (the 題庫's Insert copies every row it is given). */
  { keepRepeats = false }: { keepRepeats?: boolean } = {},
): PlannedStimulusCopies<E> {
  const seen = new Set<string>();
  const unique: E[] = [];
  let repeats = 0;
  for (const entry of entries) {
    const root = rootIdOf(entry.question);
    if (seen.has(root) && !keepRepeats) {
      repeats += 1;
      continue;
    }
    if (skipRoots.has(root)) continue;
    seen.add(root);
    unique.push(entry);
  }
  const ordered: E[] = [];
  const placed = new Set<E>();
  for (const entry of unique) {
    if (placed.has(entry)) continue;
    const group = entry.stimulus
      ? unique.filter((other) => sameStimulus(entry, other)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      : [entry];
    for (const member of group) {
      placed.add(member);
      ordered.push(member);
    }
  }
  const leads: (Stimulus | undefined)[] = ordered.map((entry, index) => {
    if (!entry.stimulus || sameStimulus(ordered[index - 1], entry)) return undefined;
    let span = 1;
    while (ordered[index + span] && sameStimulus(entry, ordered[index + span])) span += 1;
    return stimulusCopy(entry.stimulus, span);
  });
  return { entries: ordered, leads, repeats };
}
