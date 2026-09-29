import { useWorksheetStore } from '@/store/worksheetStore';
import type { PickedQuestion } from './fromSelection';

/**
 * "Add to <worksheet>": the picks, appended to the document just opened in the editor.
 *
 * Through the store, not by writing the file: copies get fresh ids and lineage, land before
 * any closing line ("END OF PAPER"), autosave writes them, and the teacher sees them. One
 * `insertQuestionCopies` call per run of picks from one source (it takes one `fromDocId`);
 * the runs' history entries are then folded into one, so a single ⌘Z takes them all out.
 * Call it straight after `replaceWorksheet`, while the loaded document has no history of
 * its own. Returns the new ids; none when the document is read-only.
 */
export function addPicksToOpenDocument(picked: readonly PickedQuestion[]): string[] {
  const store = useWorksheetStore.getState();
  if (store.readOnly || picked.length === 0) return [];
  const before = store.past.length;
  const inserted: string[] = [];
  let afterId: string | undefined;
  for (let i = 0; i < picked.length; ) {
    let j = i;
    while (j < picked.length && picked[j].fromDocId === picked[i].fromDocId) j += 1;
    const ids = useWorksheetStore.getState().insertQuestionCopies(
      picked.slice(i, j).map((pick) => pick.question),
      { fromDocId: picked[i].fromDocId, afterId },
    );
    inserted.push(...ids);
    afterId = ids[ids.length - 1] ?? afterId;
    i = j;
  }
  if (inserted.length > 0) {
    useWorksheetStore.setState((state) => ({ past: state.past.slice(0, before + 1) }));
    useWorksheetStore.getState().select(inserted[0]);
  }
  return inserted;
}
