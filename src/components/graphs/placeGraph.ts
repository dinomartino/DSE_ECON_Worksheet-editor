import { revealOnPage } from '@/components/bank/page/bankReturn';
import { graphBlockCopy, type SavedGraph } from '@/model/graph';
import { computeNumbering } from '@/model/numbering';
import type { Worksheet } from '@/model/types';
import { worksheetStore } from '@/storage';
import { useWorksheetStore } from '@/store/worksheetStore';

/** A new question takes the type of the document's last question (a structured one when empty). */
export function newQuestionTypeFor(worksheet: Worksheet): string {
  return computeNumbering(worksheet).questions.at(-1)?.question.type ?? 'structured';
}

/**
 * "Use in a worksheet…": a copy of the graph appended to a question's stem in the document
 * just opened, or to a new question where an unanchored one lands. Through the store (one
 * commit, so ⌘Z takes it out), then written at once by value: autosave waits 1.2 s. The
 * block is selected on the page and scrolled to. Call straight after the open. Undefined,
 * adding nothing, when the document is read-only.
 */
export function placeGraphInOpenDocument(
  graph: SavedGraph,
  questionId?: string,
): { blockId: string; questionId: string } | undefined {
  const store = useWorksheetStore.getState();
  if (store.readOnly) return undefined;
  const block = graphBlockCopy(graph, store.mode.language);
  const target = questionId ? store.worksheet.questions.find((question) => question.id === questionId) : undefined;
  let placedIn: string;
  if (target) {
    store.updateQuestion(target.id, { blocks: [...target.blocks, block] });
    placedIn = target.id;
  } else {
    const report = store.insertQuestionBatch(
      [{ typeId: newQuestionTypeFor(store.worksheet), fill: (fresh) => ({ ...fresh, blocks: [...fresh.blocks, block] }) }],
      { worksheetId: store.worksheet.id },
    );
    if (!report.ok) return undefined;
    placedIn = report.questionIds[0];
  }
  const placed = useWorksheetStore.getState();
  placed.select(placedIn);
  placed.requestBlockSelection(block.id);
  void worksheetStore.save(placed.worksheet).catch(() => undefined);
  if (typeof document !== 'undefined') revealOnPage(`#print-root [data-figure-block="${CSS.escape(block.id)}"]`);
  return { blockId: block.id, questionId: placedIn };
}
