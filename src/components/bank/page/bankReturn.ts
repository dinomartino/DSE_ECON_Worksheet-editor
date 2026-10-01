import { create } from 'zustand';
import { useWorksheetStore } from '@/store/worksheetStore';
import type { BankFilters } from './bankPage';
import type { BankLevel } from './bankScreen';

/**
 * Where the bank was when a question was opened in its worksheet, so the editor's
 * "← Back to Question bank" can put the teacher back at the same level, filters and
 * question. Session state (memory only). Present exactly while the editor was reached this
 * way: any other open, or leaving Home, clears it.
 */
export interface BankReturn {
  level: BankLevel;
  filters: BankFilters;
  /** The focused question on the review page (`rowKey`). */
  focusKey?: string;
  /** The question on screen in tag as you go (its group's root id). */
  tagRoot?: string;
}

interface BankReturnStore {
  saved: BankReturn | null;
  set: (value: BankReturn) => void;
  clear: () => void;
}

export const useBankReturn = create<BankReturnStore>((set) => ({
  saved: null,
  set: (saved) => set({ saved }),
  clear: () => set((state) => (state.saved ? { saved: null } : state)),
}));

/** Position of the tag-as-you-go question in its list, or 0 when it is gone. */
export function tagIndexOf(roots: readonly string[], tagRoot: string | undefined): number {
  const at = tagRoot === undefined ? -1 : roots.indexOf(tagRoot);
  return at < 0 ? 0 : at;
}

/**
 * Select the question in the just-opened document. Absent (edited away) leaves the
 * document at its top with nothing selected.
 */
export function selectQuestion(questionId: string): boolean {
  const state = useWorksheetStore.getState();
  if (!state.worksheet.questions.some((question) => question.id === questionId)) return false;
  state.select(questionId);
  return true;
}

/**
 * Scroll the page so the question is centred, once the paginator has placed it: the sheets
 * are measured after mount, so the target moves for a few frames. Waits for its position to
 * hold still, then gives up quietly after `timeoutMs`.
 */
export function revealQuestion(questionId: string, timeoutMs = 4000): () => void {
  return revealOnPage(`#print-root [data-question-id="${CSS.escape(questionId)}"]`, timeoutMs);
}

/** `revealQuestion` for any node on the sheets, by selector. */
export function revealOnPage(selector: string, timeoutMs = 4000): () => void {
  const started = performance.now();
  let last: number | undefined;
  let stable = 0;
  let frame = 0;
  const tick = () => {
    const node = document.querySelector(selector);
    if (node) {
      const top = node.getBoundingClientRect().top;
      stable = last !== undefined && Math.abs(top - last) < 1 ? stable + 1 : 0;
      last = top;
      if (stable >= 8) {
        node.scrollIntoView({ behavior: 'auto', block: 'center' });
        return;
      }
    }
    if (performance.now() - started < timeoutMs) frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}

/** Open the row's document at the question: select it, scroll to it, remember the way back. */
export function afterOpen(questionId: string, back: BankReturn): void {
  useBankReturn.getState().set(back);
  if (selectQuestion(questionId)) revealQuestion(questionId);
}
