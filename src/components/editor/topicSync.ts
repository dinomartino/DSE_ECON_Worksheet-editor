import { resolveMessages } from '@/i18n/catalogue';
import { uiLanguage } from '@/i18n/language';
import { sharedState, stateOfRow } from '@/library/sharedTags';
import {
  changeEdit,
  matchEdit,
  otherCopyWrites,
  retagQuestion,
  rootOf,
  swapTags,
  SWAP_STALE,
  writeTags,
  type StateEdit,
  type TagChange,
  type TagEdit,
  type WriteReport,
} from '@/library/tagWrites';
import type { BankRow } from '@/library/types';
import { bankRowsNow } from '@/library/useBank';
import { derivedTags, stateFor, tagStateOf, type TagState } from '@/model/tagSlots';
import { stringTags } from '@/model/topics';
import type { Question, Worksheet } from '@/model/types';
import { worksheetStore, type WorksheetStore } from '@/storage';
import { useAppDialogs } from '@/store/appDialogs';
import { useWorksheetStore } from '@/store/worksheetStore';
import { TOPIC_SYNC_MESSAGES } from './topicSync.messages';

/**
 * The editor's Topic row, one truth per question (C6): the open copy changes through the
 * store (one ⌘Z, autosaved as ever), then every other indexed copy of the same question
 * (`rootOf`) is written through storage, one save per document, all under the open copy's
 * `tagsAt`. The open document is never written here; a document from a newer build is
 * reported, not written (its older stamp loses). ⌘Z on that step steps the other copies
 * back too, and ⇧⌘Z forward again (`followHistory`): each only while it still holds what
 * the step left, so a copy tagged since keeps its newer tags.
 *
 * The edit itself travels, not a before/after diff: `atSlot` finds part (b) in each copy
 * by its key, so a reordered copy gets the change on the right part.
 *
 * Known risk, not solved here: another tab holding one of those documents open saves its
 * own copy over this write on its next autosave (the same as any two-tab edit).
 */

/** A synced edit's undo step: the store snapshots either side of it and what it wrote elsewhere. */
interface SyncedStep {
  before: Worksheet;
  after: Worksheet;
  deps: TopicSyncDeps;
  changes: TagChange[];
  /** The other copies hold `after`'s tags (false once undone). */
  applied: boolean;
}

/** Keyed by the snapshot the edit committed: undo leaves it for `before`, redo returns to it. */
const steps = new WeakMap<Worksheet, SyncedStep>();
let following = false;

/**
 * Watches the store's history once: ⌘Z from a synced step's snapshot to the one before it
 * undoes its other-copy writes, ⇧⌘Z back redoes them. Both queue behind the edit's own
 * write, so an undo pressed before the write lands still finds what it wrote.
 */
function followHistory() {
  if (following) return;
  following = true;
  useWorksheetStore.subscribe((state, prev) => {
    if (state.worksheet === prev.worksheet) return;
    const undone = steps.get(prev.worksheet);
    if (undone && undone.before === state.worksheet && undone.applied) return void enqueue(() => stepCopies(undone, 'undo'));
    const redone = steps.get(state.worksheet);
    if (redone && redone.before === prev.worksheet && !redone.applied) void enqueue(() => stepCopies(redone, 'redo'));
  });
}

async function stepCopies(step: SyncedStep, direction: 'undo' | 'redo'): Promise<WriteReport> {
  step.applied = direction === 'redo';
  if (step.changes.length === 0) return { saved: [], failed: [] };
  const report = await swapTags(step.deps.store, step.changes, direction, (docId) => docId === useWorksheetStore.getState().worksheet.id);
  const rows = await step.deps.rows().catch(() => []);
  const message = copiesMessage(report, rows, direction);
  if (message) step.deps.notify(message);
  return report;
}

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

function enqueue<T>(run: () => Promise<T>): Promise<T> {
  const queued = queue.then(run, run);
  queue = queued.catch(() => undefined);
  return queued;
}

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
  const step: SyncedStep = { before: editor.worksheet, after: committed.worksheet, deps, changes: [], applied: true };
  steps.set(committed.worksheet, step);
  followHistory();
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
    const report = await writeTags(deps.store, based, edit, (docId) => docId === useWorksheetStore.getState().worksheet.id, now, (change) =>
      step.changes.push(change),
    );
    const message = copiesMessage(report, rows);
    if (message) deps.notify(message);
    return report;
  };
  return enqueue(run);
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

/**
 * "Also updated in 2 other worksheets." ("Also undone in…" for an undo), then any document
 * left as it was, by title.
 */
export function copiesMessage(
  report: WriteReport,
  rows: readonly Pick<BankRow, 'docId' | 'docTitle'>[],
  direction: 'edit' | 'undo' | 'redo' = 'edit',
): string | undefined {
  const m = resolveMessages(TOPIC_SYNC_MESSAGES, uiLanguage());
  const saved = report.saved.length;
  const title = (docId: string) => rows.find((row) => row.docId === docId)?.docTitle || m.untitled;
  const parts = [
    ...(saved > 0 ? [direction === 'undo' ? m.alsoUndone(saved) : m.alsoUpdated(saved)] : []),
    ...report.failed.map((f) => (f.reason === SWAP_STALE ? m.keepsNewer(title(f.docId)) : m.keepsOld(title(f.docId), f.reason))),
  ];
  return parts.length > 0 ? parts.join(' ') : undefined;
}
