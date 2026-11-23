import { plain } from '@/model/text';
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
/** Every text of the paper (or of these questions), both languages, for a credit estimate (k-0519). */
export function paperText(ws: Worksheet, questionIds?: ReadonlySet<string>): string {
  return slotsOf(ws)
    .filter((slot) => !questionIds || (slot.questionId !== undefined && questionIds.has(slot.questionId)))
    .map((slot) => `${plain(slot.text.en)}\n${plain(slot.text.zh)}`)
    .join('\n');
}

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
