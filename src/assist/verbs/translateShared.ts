import type { ApplyReport, TextSlot, TranslationWrite } from '@/model/textSlots';
import { collectTexts } from '@/model/textWalk';
import type { Worksheet } from '@/model/types';
import { useWorksheetStore } from '@/store/worksheetStore';

/**
 * What the editor's translate and Check terms verbs share on top of the pure rules
 * (`src/assist/fillRules.ts`, re-exported here): the slot cache, and the one-commit apply
 * with an Undo that belongs to its commit. Only this half touches the editor's store.
 */

export {
  CHANGED_WHILE_TRANSLATING,
  DOCUMENT_CHANGED,
  NOTHING_TO_FILL,
  STOPPED_NOTHING,
  depsError,
  fillCount,
  fillOptions,
  fillSummary,
  needsLook,
  rowNotes,
  sideName,
  textsIn,
  usable,
  whereOf,
  type NoteTone,
  type RowNote,
} from '../fillRules';

const slotCache = new WeakMap<Worksheet, TextSlot[]>();

/** The walker's slots, once per worksheet object (the menu asks every verb on open). */
export function slotsOf(ws: Worksheet): TextSlot[] {
  let slots = slotCache.get(ws);
  if (!slots) slotCache.set(ws, (slots = collectTexts(ws)));
  return slots;
}

/** One `applyTranslations` call: one commit, one ⌘Z. */
export function applyWrites(writes: readonly TranslationWrite[], worksheetId: string): ApplyReport {
  return useWorksheetStore.getState().applyTranslations(writes, { worksheetId });
}

/** Undoes the commit just made, only while it is still the latest: any later edit or ⌘Z
 *  retires it rather than undoing something unrelated. */
export function commitUndo(): { run(): void; live(): boolean } {
  const committed = useWorksheetStore.getState().worksheet;
  const live = () => useWorksheetStore.getState().worksheet === committed;
  return {
    live,
    run: () => {
      if (live()) useWorksheetStore.getState().undo();
    },
  };
}
