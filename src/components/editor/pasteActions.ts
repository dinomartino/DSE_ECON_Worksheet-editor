'use client';

import { create } from 'zustand';
import { imageBlockFromFile } from '@/export/imageImport';
import { pastedQuestions, type ClipboardText } from '@/import/pasteRuns';
import type { ImportBatch } from '@/import';
import { applyEditTarget, questionBlockLists, targetLayoutElementId, targetQuestionId, textOfTarget } from '@/model/edits';
import { isBiTextEmpty } from '@/model/text';
import { questionTexts } from '@/model/textWalk';
import type { Question, RichText, Worksheet } from '@/model/types';
import type { EditTarget } from '@/render/ir';
import { useWorksheetStore } from '@/store/worksheetStore';

/**
 * What a paste on the page does beyond typing (k-0201, `docs/design/paste-import.md` § 14):
 *
 *  - a paste that reads as questions offers "Make these into questions" (`PasteOfferBar`):
 *    the import engine builds them, the pasted text is taken back, and they land after the
 *    question it went into, in one undo step;
 *  - a pasted picture is inserted: below the text it was pasted into, else into the selected
 *    question (`insertBlockAtAnchor`).
 */

export interface PasteOffer {
  batch: ImportBatch;
  worksheetId: string;
  /** The questions right after the paste (no text open): a change to them withdraws the offer. */
  questions: Worksheet['questions'];
  /**
   * The text the paste typed into, its words before and right after; absent when no text was
   * open. Typing on in it withdraws the offer, as Word's Paste Options button goes.
   */
  pastedInto?: { target: EditTarget; side: 'en' | 'zh'; before: RichText; after?: RichText };
}

export const usePasteOffer = create<{ offer?: PasteOffer }>(() => ({}));

export function clearPasteOffer(): void {
  usePasteOffer.setState({ offer: undefined });
}

/** After a paste: offer to make it into questions when it reads as some. */
export function offerPastedQuestions(clip: ClipboardText, pastedInto?: PasteOffer['pastedInto']): void {
  const { worksheet, readOnly } = useWorksheetStore.getState();
  const batch = readOnly ? undefined : pastedQuestions(clip);
  const into = pastedInto && { ...pastedInto, after: textOfTarget(worksheet, pastedInto.target)?.[pastedInto.side] };
  usePasteOffer.setState({
    offer: batch ? { batch, worksheetId: worksheet.id, questions: worksheet.questions, pastedInto: into } : undefined,
  });
}

/** Has the page moved on since the paste (typed on in that text; other questions changed)? */
export function isPasteOfferStale(offer: PasteOffer, worksheet: Worksheet): boolean {
  if (worksheet.id !== offer.worksheetId) return true;
  if (!offer.pastedInto) return worksheet.questions !== offer.questions;
  const now = textOfTarget(worksheet, offer.pastedInto.target)?.[offer.pastedInto.side];
  return JSON.stringify(now ?? []) !== JSON.stringify(offer.pastedInto.after ?? []);
}

/** Nothing typed in it, and nothing but paragraphs: the question the teacher pasted into. */
export function isBlankQuestion(question: Question): boolean {
  return (
    questionTexts(question).every((slot) => isBiTextEmpty(slot.text)) &&
    questionBlockLists(question).every((list) => list.every((block) => block.kind === 'paragraph'))
  );
}

/** "Make these into questions": one commit, so one undo brings the pasted text back. */
export function acceptPasteOffer(offer: PasteOffer): void {
  const store = useWorksheetStore.getState();
  const current = store.worksheet;
  let afterId: string | undefined;
  let prepare: ((draft: Worksheet) => Worksheet) | undefined;
  let finish: ((draft: Worksheet) => Worksheet) | undefined;
  if (offer.pastedInto) {
    const { target, side, before } = offer.pastedInto;
    prepare = (draft) => {
      const text = textOfTarget(draft, target);
      return text ? applyEditTarget(draft, target, { ...text, [side]: before }) : draft;
    };
    const questionId = targetQuestionId(current, target);
    afterId = questionId ?? targetLayoutElementId(current, target);
    // A question that held only the paste (a new, empty one) gives its place to them.
    if (questionId) {
      finish = (draft) => {
        const host = draft.questions.find((question) => question.id === questionId);
        if (!host || !isBlankQuestion(host)) return draft;
        return {
          ...draft,
          questions: draft.questions.filter((question) => question.id !== questionId),
          flow: draft.flow.filter((entry) => entry.id !== questionId),
        };
      };
    }
  }
  const report = store.insertQuestionBatch(offer.batch.builds, {
    worksheetId: offer.worksheetId,
    lead: offer.batch.lead,
    afterId,
    prepare,
    finish,
  });
  clearPasteOffer();
  if (report.ok) store.select(report.questionIds[0]);
}

/** The first picture on the clipboard, when it carries one. */
export function clipboardPicture(data: DataTransfer | null): File | undefined {
  if (!data) return undefined;
  for (const file of Array.from(data.files ?? [])) if (file.type.startsWith('image/')) return file;
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return undefined;
}

/** A pasted picture: below the text it was pasted into (its block), else at the anchor. */
export async function pastePicture(file: File, target?: EditTarget): Promise<void> {
  const store = useWorksheetStore.getState();
  if (store.readOnly) return;
  const block = await imageBlockFromFile(file);
  const blockId = target && 'blockId' in target ? target.blockId : undefined;
  if (blockId) {
    store.insertBlockAfter(blockId, block);
    return;
  }
  const questionId = target ? targetQuestionId(store.worksheet, target) : undefined;
  store.insertBlockAtAnchor(block, questionId);
}
