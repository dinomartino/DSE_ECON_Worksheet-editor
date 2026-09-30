import { matchEdit, otherCopyWrites, writeTags, type WriteReport } from '@/library/tagWrites';
import type { BankRow } from '@/library/types';
import { bankRowsNow } from '@/library/useBank';
import { worksheetStore, type WorksheetStore } from '@/storage';
import { useAppDialogs } from '@/store/appDialogs';
import { useWorksheetStore } from '@/store/worksheetStore';

/**
 * The editor's Topic row, one truth per question (C6): the open copy changes through the
 * store (one ⌘Z, autosaved as ever), then every other indexed copy of the same question
 * (`rootOf`) is written through storage, one save per document. The open document is
 * never written here; a document from a newer build is reported, not written. ⌘Z undoes
 * the open copy only.
 *
 * Known risk, not solved here: another tab holding one of those documents open saves its
 * own copy over this write on its next autosave (the same as any two-tab edit).
 */

export interface TopicSyncDeps {
  store: Pick<WorksheetStore, 'load' | 'save'>;
  /** The bank index's rows (`bankRowsNow`). */
  rows: () => Promise<readonly BankRow[]>;
  /** A quiet status line: the Topic row shows it under the topics (the toolbar flash would sit under a docked format bar). */
  notify: (message: string) => void;
}

export const topicSyncDeps = (): TopicSyncDeps => ({
  store: worksheetStore,
  rows: bankRowsNow,
  notify: (message) => useAppDialogs.getState().notify(message),
});

/** One write at a time: a quick second edit never loads a document before the first save lands. */
let queue: Promise<unknown> = Promise.resolve();

/**
 * Set a question's topics in the open document, then in the other documents holding a
 * copy of it. Resolves with what was written elsewhere (`undefined` when nothing needed to
 * be, e.g. no other copy, or a read-only document).
 */
export function setQuestionTopics(
  questionId: string,
  tags: string[] | undefined,
  deps: TopicSyncDeps = topicSyncDeps(),
): Promise<WriteReport | undefined> {
  const editor = useWorksheetStore.getState();
  const question = editor.worksheet.questions.find((q) => q.id === questionId);
  if (!question) return Promise.resolve(undefined);
  // `tagsAt` only when the tags really change: the same tags leave the store untouched.
  const same = JSON.stringify(question.tags ?? []) === JSON.stringify(tags ?? []);
  if (!same) editor.updateQuestion(questionId, { tags, tagsAt: new Date().toISOString() });
  const committed = useWorksheetStore.getState();
  // Read-only, or the same tags: the store did not move, so neither do the copies.
  if (committed.worksheet === editor.worksheet) return Promise.resolve(undefined);

  const openDocId = committed.worksheet.id;
  const before = question.tags ?? [];
  const after = tags ?? [];
  const run = async (): Promise<WriteReport | undefined> => {
    const rows = await deps.rows();
    const writes = otherCopyWrites(rows, question, openDocId);
    if (writes.length === 0) return undefined;
    // Whatever is open by the time a document's turn comes is left alone too.
    const report = await writeTags(deps.store, writes, matchEdit(before, after), (docId) => docId === useWorksheetStore.getState().worksheet.id);
    const message = copiesMessage(report, rows);
    if (message) deps.notify(message);
    return report;
  };
  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
}

/** "Also updated in 2 other worksheets.", then any document left as it was, by title. */
export function copiesMessage(report: WriteReport, rows: readonly Pick<BankRow, 'docId' | 'docTitle'>[]): string | undefined {
  const saved = report.saved.length;
  const title = (docId: string) => rows.find((row) => row.docId === docId)?.docTitle || 'A worksheet';
  const parts = [
    ...(saved > 0 ? [`Also updated in ${saved} other ${saved === 1 ? 'worksheet' : 'worksheets'}.`] : []),
    ...report.failed.map((f) => `“${title(f.docId)}” keeps its old topics: ${f.reason}.`),
  ];
  return parts.length > 0 ? parts.join(' ') : undefined;
}
