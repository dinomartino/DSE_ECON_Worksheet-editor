import { rootOf } from '@/library/tagWrites';
import type { Worksheet } from '@/model/types';
import { useWorksheetStore } from '@/store/worksheetStore';
import { commitBankCopies, reviewSummary } from '../bankSession';
import type { PickedQuestion } from './fromSelection';

/**
 * "Already in this paper" is by question, not by copy: a pick is in the paper when the
 * paper holds any copy of the same question (same `lineage.rootId`, an original counting
 * as its own root), edited or not. That covers the question's original, an earlier copy
 * of it, and the paper's own question picked back. The 題庫 tab marks the same rows
 * "In this paper" (`src/library/tabFilters.ts:paperRoots`).
 */

/** Picks are questions: two copies of one question picked are one, the first picked. */
export function uniquePicks(picks: readonly PickedQuestion[]): PickedQuestion[] {
  const seen = new Set<string>();
  return picks.filter((pick) => {
    const root = rootOf(pick.question);
    if (seen.has(root)) return false;
    seen.add(root);
    return true;
  });
}

/** The picks the paper does not hold yet, and those it does (any copy of the same question). */
export function splitAlreadyInPaper(
  paper: Pick<Worksheet, 'questions'>,
  picks: readonly PickedQuestion[],
): { fresh: PickedQuestion[]; skipped: PickedQuestion[] } {
  const held = new Set(paper.questions.map(rootOf));
  const fresh: PickedQuestion[] = [];
  const skipped: PickedQuestion[] = [];
  for (const pick of uniquePicks(picks)) (held.has(rootOf(pick.question)) ? skipped : fresh).push(pick);
  return { fresh, skipped };
}

/** The review bar's line after "Add to": what went in, and what was already there. */
export function addedSummary(added: number, skipped: number): string {
  return skipped === 0 ? reviewSummary(added) : `${reviewSummary(added)}. Skipped ${skipped} already in this paper.`;
}

/** Every pick was already in the paper: nothing is added, and the bank says so. */
export function nothingAddedText(skipped: number, title: string): string {
  return skipped === 1
    ? `That question is already in “${title}”. Nothing was added.`
    : `All ${skipped} questions are already in “${title}”. Nothing was added.`;
}

/**
 * "Add to <worksheet>": the picks, appended to the document just opened in the editor.
 *
 * Through the store, not by writing the file: copies get fresh ids and lineage, land before
 * any closing line ("END OF PAPER"), autosave writes them, and the teacher sees them. A
 * pick the paper already holds is skipped (`splitAlreadyInPaper`). One commit, so one ⌘Z
 * takes them all out, and the 題庫 review starts on them as for the tab's inserts: the
 * copies highlighted, the first one selected (the caller scrolls to it), the bar saying
 * what was skipped. Call it straight after `replaceWorksheet`. None added when read-only.
 */
export function addPicksToOpenDocument(picked: readonly PickedQuestion[]): { inserted: string[]; skipped: number } {
  const store = useWorksheetStore.getState();
  if (store.readOnly || picked.length === 0) return { inserted: [], skipped: 0 };
  const { fresh, skipped } = splitAlreadyInPaper(store.worksheet, picked);
  const { inserted } = commitBankCopies(
    { openId: store.worksheet.id, found: fresh.map((pick) => ({ question: pick.question, docId: pick.fromDocId })), missing: [] },
    { summary: (count) => addedSummary(count, skipped.length) },
  );
  if (inserted.length > 0) useWorksheetStore.getState().select(inserted[0]);
  return { inserted, skipped: skipped.length };
}
