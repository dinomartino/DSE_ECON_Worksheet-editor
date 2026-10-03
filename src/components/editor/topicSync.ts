import { sharedState, stateOfRow } from '@/library/sharedTags';
import {
  changeEdit,
  matchEdit,
  otherCopyWrites,
  retagQuestion,
  rootOf,
  writeTags,
  type StateEdit,
  type TagEdit,
  type WriteReport,
} from '@/library/tagWrites';
import type { BankRow } from '@/library/types';
import { bankRowsNow } from '@/library/useBank';
import { derivedTags, stateFor, tagStateOf, type TagState } from '@/model/tagSlots';
import { stringTags } from '@/model/topics';
import type { Question } from '@/model/types';
import { worksheetStore, type WorksheetStore } from '@/storage';
import { useAppDialogs } from '@/store/appDialogs';
import { useWorksheetStore } from '@/store/worksheetStore';

/**
 * The editor's Topic row, one truth per question (C6): the open copy changes through the
 * store (one ⌘Z, autosaved as ever), then every other indexed copy of the same question
 * (`rootOf`) is written through storage, one save per document, all under the open copy's
 * `tagsAt`. The open document is never written here; a document from a newer build is
 * reported, not written (its older stamp loses). ⌘Z undoes the open copy only, and since
 * the other copies now hold the newest change, the Topic row keeps showing it.
 *
 * The edit itself travels, not a before/after diff: `atSlot` finds part (b) in each copy
 * by its key, so a reordered copy gets the change on the right part.
 *
 * Known risk, not solved here: another tab holding one of those documents open saves its
 * own copy over this write on its next autosave (the same as any two-tab edit).
 */

export interface TopicSyncDeps {
  store: Pick<WorksheetStore, 'list' | 'load' | 'save'>;
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

/** A store patch that turns `question` into `next`: every changed key, and removed keys as undefined. */
function replacement(question: Question, next: Question): Partial<Question> {
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(question)) if (!(key in next)) patch[key] = undefined;
  for (const [key, value] of Object.entries(next)) if ((question as unknown as Record<string, unknown>)[key] !== value) patch[key] = value;
  return patch as Partial<Question>;
}

/**
 * Apply a tag edit to a question in the open document, then to the other documents
 * holding a copy of it. `shown` is the tag state the Topic row showed (`useShownTagState`,
 * the shared state): the edit is read against it, so a stale open copy adopts the shared
 * state as it is edited. A plain `TagEdit` means the whole question (`wholeQuestion`).
 * Resolves with what was written elsewhere (`undefined` when nothing needed to be, e.g.
 * no other copy, or a read-only document).
 */
export function setQuestionTags(
  questionId: string,
  edit: TagEdit | StateEdit,
  deps: TopicSyncDeps = topicSyncDeps(),
  shown?: TagState,
): Promise<WriteReport | undefined> {
  const editor = useWorksheetStore.getState();
  const question = editor.worksheet.questions.find((q) => q.id === questionId);
  if (!question) return Promise.resolve(undefined);
  const now = new Date().toISOString();
  // Stamped only on a real change: an edit that changes nothing leaves the store untouched.
  const next = retagQuestion(question, edit, now, shown);
  if (next === question) return Promise.resolve(undefined);
  editor.updateQuestion(questionId, replacement(question, next));
  const committed = useWorksheetStore.getState();
  // Read-only: the store did not move, so neither do the copies.
  if (committed.worksheet === editor.worksheet) return Promise.resolve(undefined);

  const openDocId = committed.worksheet.id;
  const run = async (): Promise<WriteReport | undefined> => {
    const rows = await deps.rows();
    const writes = otherCopyWrites(rows, question, openDocId);
    if (writes.length === 0) return undefined;
    // The state as it stood before the edit (the Topic row may have shown the copy's own
    // tags before the bank loaded): the edit applies to it, mapped onto each copy.
    const root = rootOf(question);
    const stood = sharedState([
      ...rows.filter((row) => row.rootId === root && row.docId !== openDocId).map((row) => ({ state: stateOfRow(row), tagsAt: row.tagsAt })),
      { state: tagStateOf(question), tagsAt: question.tagsAt },
    ]);
    const based = writes.map((write) => ({ ...write, shared: stateFor(write.shared ?? { tags: [], slots: [] }, stood.state) }));
    // Whatever is open by the time a document's turn comes is left alone too.
    const report = await writeTags(deps.store, based, edit, (docId) => docId === useWorksheetStore.getState().worksheet.id, now);
    const message = copiesMessage(report, rows);
    if (message) deps.notify(message);
    return report;
  };
  const queued = queue.then(run, run);
  queue = queued.catch(() => undefined);
  return queued;
}

/**
 * The Topic row as one list (kept until the per-part row lands): the question's tags set
 * to `tags`, read against `shown` (the list the row showed, `useShownTags`). Without parts
 * the change travels as `matchEdit(shown, tags)`, as it always did; on a question tagged
 * per part as `changeEdit` over the whole question, so every part gets an added topic and
 * loses a removed one, and free tags stay on the question.
 */
export function setQuestionTopics(
  questionId: string,
  tags: string[] | undefined,
  deps: TopicSyncDeps = topicSyncDeps(),
  shown?: readonly string[],
): Promise<WriteReport | undefined> {
  const question = useWorksheetStore.getState().worksheet.questions.find((q) => q.id === questionId);
  if (!question) return Promise.resolve(undefined);
  const state = tagStateOf(question);
  const before = shown ? stringTags(shown) : derivedTags(state);
  const after = stringTags(tags ?? []);
  // Without parts the row's list is the question's whole state; with them, the row showed a
  // derived list, so the edit reads the question's own state and carries only the change
  // (an added topic to every part, a removed one off every part).
  if (state.slots.length > 0) return setQuestionTags(questionId, changeEdit(before, after), deps);
  const base = shown ? { tags: before, slots: [] } : undefined;
  return setQuestionTags(questionId, matchEdit(before, after), deps, base);
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
