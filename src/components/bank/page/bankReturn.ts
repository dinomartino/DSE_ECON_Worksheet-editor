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
  /** Roots tag as you go lists first, in this order: the questions an import just added. */
  tagFirst?: string[];
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

/**
 * The "Add to" target kept while a paper is open only to look (the bank's "open in
 * worksheet"), so looking never moves it, and the one the "Adding to" picker chose. Any
 * other open forgets it (`EditorHost`); Home does not. Session state (memory only).
 */
export interface KeptTarget {
  /** The picker's choice (a document id, or `new:` and a type); absent when there was none. */
  targetId?: string;
  /** The document open when it was kept (the paper opened to look, or the one open when picked). */
  lookedAt: string;
}

interface KeptTargetStore {
  kept: KeptTarget | null;
  keep: (value: KeptTarget) => void;
  forget: () => void;
}

export const useKeptTarget = create<KeptTargetStore>((set) => ({
  kept: null,
  keep: (kept) => set({ kept }),
  forget: () => set((state) => (state.kept ? { kept: null } : state)),
}));

/** Position of the tag-as-you-go question in its list, or 0 when it is gone. */
export function tagIndexOf(roots: readonly string[], tagRoot: string | undefined): number {
  const at = tagRoot === undefined ? -1 : roots.indexOf(tagRoot);
  return at < 0 ? 0 : at;
}

/**
 * Where tag as you go lands: on `tagRoot` once the list holds it. A question just saved
 * may not be indexed yet, so while it is missing this waits (`undefined`) until the index
 * has caught up, then starts at the top.
 */
export function tagLanding(roots: readonly string[], tagRoot: string, caughtUp: boolean): number | undefined {
  const at = roots.indexOf(tagRoot);
  if (at >= 0) return at;
  return caughtUp ? 0 : undefined;
}

/** `groups` with the roots in `first` ahead of the rest, in `first`'s order; the rest keep theirs. */
export function firstThese<T extends { rootId: string }>(groups: readonly T[], first: readonly string[] | undefined): readonly T[] {
  if (!first || first.length === 0) return groups;
  const rank = new Map(first.map((root, k) => [root, k]));
  const lead = groups.filter((group) => rank.has(group.rootId)).sort((a, b) => (rank.get(a.rootId) ?? 0) - (rank.get(b.rootId) ?? 0));
  return lead.length === 0 ? groups : [...lead, ...groups.filter((group) => !rank.has(group.rootId))];
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
