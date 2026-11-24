import { normalizeRuns } from '@/model/text';
import { sameRuns, type TextPath } from '@/model/textSlots';
import { mapWorksheetTexts } from '@/model/textWalk';
import type { BiText, Worksheet } from '@/model/types';

/**
 * Accepted rewordings in one pass (k-0549): both sides of a text at once, each guarded
 * against the text having changed since it was read (an edit, or the same change accepted
 * already). Identity-preserving: nothing to write returns the input worksheet.
 */

export interface PolishEdit {
  path: TextPath;
  before: BiText;
  after: BiText;
}


export function applyPolishEdits(ws: Worksheet, edits: readonly PolishEdit[]): { worksheet: Worksheet; applied: number } {
  const byPath = new Map(edits.map((edit) => [edit.path, edit]));
  let applied = 0;
  const worksheet = mapWorksheetTexts(ws, (slot) => {
    const edit = byPath.get(slot.path);
    if (!edit) return slot.text;
    if (!sameRuns(slot.text.en, edit.before.en) || !sameRuns(slot.text.zh, edit.before.zh)) return slot.text;
    applied += 1;
    return { ...slot.text, en: normalizeRuns(edit.after.en.map((r) => ({ ...r }))), zh: normalizeRuns(edit.after.zh.map((r) => ({ ...r }))) };
  });
  return { worksheet, applied };
}
