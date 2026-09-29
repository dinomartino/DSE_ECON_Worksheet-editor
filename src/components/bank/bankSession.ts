import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { withRowTags } from '@/library/sharedTags';
import type { BankRow } from '@/library/types';
import type { Question } from '@/model/types';
import { worksheetStore, type WorksheetStore } from '@/storage';
import { useWorksheetStore } from '@/store/worksheetStore';

/**
 * The editor side of the 題庫 tab: the request that opens it (the add rail, the empty
 * page), and the review of what was just inserted (the page highlight + the review bar).
 */

export interface BankReview {
  /** The open document the copies went into; another document ends the review. */
  worksheetId: string;
  questionIds: string[];
  index: number;
  summary: string;
  /** Reverts every insert of this review, only while the latest is still the latest edit. */
  undo: { run(): void; live(): boolean };
  /** Insert commits the review spans: consecutive inserts extend it (see `insertFromBank`). */
  commits: number;
  /** Where the teacher was inserting before the review's first insert. */
  anchorBefore?: string;
}

export interface BankSessionState {
  /** A counter, not a flag: every request opens the tab, even when it is already open. */
  openRequest: number;
  openBank(): void;
  review: BankReview | null;
  walk(step: 1 | -1): void;
  goTo(index: number): void;
  dismiss(): void;
  undo(): void;
}

export const useBankSession: UseBoundStore<StoreApi<BankSessionState>> = create<BankSessionState>((set, get) => ({
  openRequest: 0,
  openBank: () => set((state) => ({ openRequest: state.openRequest + 1 })),
  review: null,
  walk: (step) => {
    const review = get().review;
    if (!review || review.questionIds.length === 0) return;
    const count = review.questionIds.length;
    set({ review: { ...review, index: (review.index + step + count) % count } });
  },
  goTo: (index) => {
    const review = get().review;
    if (review && index >= 0 && index < review.questionIds.length) set({ review: { ...review, index } });
  },
  dismiss: () => set({ review: null }),
  undo: () => {
    const review = get().review;
    if (review?.undo.live()) review.undo.run();
    set({ review: null });
  },
}));

/** The review bar's line: how many copies the review holds. */
export const reviewSummary = (n: number) => `${n} question${n === 1 ? '' : 's'} added from 題庫`;

export interface InsertReport {
  /** Ids of the copies now in the paper, in order. */
  inserted: string[];
  /** Rows whose question was not found in its document (edited or deleted since the scan). */
  missing: BankRow[];
  /** Nothing was written: read-only, or the open document changed while loading. */
  refused?: 'readOnly' | 'otherDocument';
}

/**
 * Copies of `rows`' questions into the open paper after the insert anchor: each source
 * document is loaded read-only (never saved), then **one** `insertQuestionCopies` call —
 * one commit, one ⌘Z — and the review starts on the copies.
 *
 * An insert straight after another (no edit between, the review still open) extends that
 * review rather than replacing it: ‹ › walks every copy, and Undo takes them all out.
 */
export async function insertFromBank(
  rows: readonly BankRow[],
  summary: (count: number) => string = reviewSummary,
  source: Pick<WorksheetStore, 'load'> = worksheetStore,
): Promise<InsertReport> {
  const openId = useWorksheetStore.getState().worksheet.id;
  if (useWorksheetStore.getState().readOnly) return { inserted: [], missing: [], refused: 'readOnly' };

  const docs = new Map<string, Promise<Map<string, Question> | undefined>>();
  const questionsOf = (docId: string) => {
    let pending = docs.get(docId);
    if (!pending) {
      pending = source
        .load(docId)
        .then((doc) => (doc ? new Map(doc.questions.map((q) => [q.id, q])) : undefined))
        .catch(() => undefined);
      docs.set(docId, pending);
    }
    return pending;
  };

  const found: Array<{ question: Question; docId: string }> = [];
  const missing: BankRow[] = [];
  for (const row of rows) {
    const question = (await questionsOf(row.docId))?.get(row.questionId);
    // The copy starts with every topic the bank shows for the question (`withRowTags`).
    if (question) found.push({ question: withRowTags(question, row), docId: row.docId });
    else missing.push(row);
  }

  const store = useWorksheetStore.getState();
  if (store.worksheet.id !== openId) return { inserted: [], missing, refused: 'otherDocument' };
  if (store.readOnly) return { inserted: [], missing, refused: 'readOnly' };
  if (!found.length) return { inserted: [], missing };

  // Read before the commit: `live()` compares against the document as it is right now.
  const previous = useBankSession.getState().review;
  const extend = previous !== null && previous.worksheetId === store.worksheet.id && previous.undo.live();
  const anchorBefore = extend ? previous.anchorBefore : store.insertAnchorId;
  const inserted = store.insertQuestionCopies(
    found.map((entry) => entry.question),
    { fromDocId: found.map((entry) => entry.docId) },
  );
  if (!inserted.length) return { inserted, missing };
  const committed = useWorksheetStore.getState().worksheet;
  const live = () => useWorksheetStore.getState().worksheet === committed;
  const commits = extend ? previous.commits + 1 : 1;
  const questionIds = extend ? [...previous.questionIds, ...inserted] : inserted;
  useBankSession.setState({
    review: {
      worksheetId: committed.id,
      questionIds,
      index: extend ? previous.questionIds.length : 0,
      summary: summary(questionIds.length),
      commits,
      ...(anchorBefore ? { anchorBefore } : {}),
      undo: {
        live,
        run: () => {
          if (!live()) return;
          const editor = useWorksheetStore.getState();
          // Each insert was its own commit with nothing between them (`extend` checked).
          for (let i = 0; i < commits; i++) editor.undo();
          // Back to where the teacher was inserting, not to the end.
          const after = useWorksheetStore.getState().worksheet;
          if (anchorBefore && [...after.questions, ...after.layout].some((item) => item.id === anchorBefore)) {
            editor.setInsertAnchor(anchorBefore);
          }
        },
      },
    },
  });
  return { inserted, missing };
}
