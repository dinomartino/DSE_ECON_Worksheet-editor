import { rootIdOf } from '@/model/lineage';
import { isNewerThanBuild } from '@/model/migrations';
import { parsePatternTag } from '@/model/patterns';
import {
  collapseTagState,
  effectiveSlotTags,
  findSlot,
  isTopicalTag,
  normalizeTagState,
  sameTagState,
  stateFor,
  tagStateOf,
  withTagState,
  type SlotRef,
  type SlotState,
  type TagState,
} from '@/model/tagSlots';
import { topicOf } from '@/model/topics';
import type { Question, Worksheet } from '@/model/types';
import { stateOfRow } from './sharedTags';
import type { BankRow, BankSlot } from './types';
import type { WorksheetStore } from '@/storage/types';

/**
 * Topic edits written into the documents that own the questions: one truth per question
 * (C6). An edit applies to the question's shared state (`sharedState`, what the bank and
 * the Topic row show) and every copy it may write adopts the result, under one `tagsAt`
 * stamp, so the change is the newest and wins over any copy it could not reach. Hidden
 * and trashed documents are not in the index and keep their own; a document from a newer
 * build is reported, not written. Either way their older stamp loses.
 *
 * Two writers, each safe for its own reason:
 * - **The bank screen** writes any copy. No editor is mounted there (`EditorHost` renders
 *   the start screen *instead of* `EditorApp`, and leaving the editor awaits
 *   `flushBeforeLeaving`), so no in-memory copy can be saved over the write.
 * - **The editor's Topic row** (`src/components/editor/topicSync.ts`) changes the open
 *   copy through the store (one undo) and writes only the *other* documents here, never
 *   the open one, whose autosave would otherwise race this write.
 *
 * A stale copy adopts the shared state only when a tag write reaches its question (lazy):
 * opening or viewing a document never rewrites it (§ question-library.md, "One tag set").
 *
 * **Edits.** A `TagEdit` changes one list; a `StateEdit` changes a whole tag state (the
 * question's list and every part's, `model/tagSlots.ts`). A plain `TagEdit` given to a
 * write means the whole question (`wholeQuestion`): on a question tagged per part, every
 * part gets it. `atSlot` edits one part, found in each copy by its key.
 */

/** A question's new tags, from its current ones. */
export type TagEdit = (tags: readonly string[]) => string[];

const STATE_EDIT: unique symbol = Symbol('StateEdit');

/** A question's new tag state, from its current one (normalized: `normalizeTagState`). Made by the lifters below. */
export type StateEdit = ((state: TagState) => TagState) & { readonly [STATE_EDIT]: true };

/** A function over whole states, marked as one. */
export const stateEdit = (fn: (state: TagState) => TagState): StateEdit => Object.assign(fn, { [STATE_EDIT]: true as const });

export const isStateEdit = (edit: TagEdit | StateEdit): edit is StateEdit => STATE_EDIT in edit;

/** Any edit as a state edit: a list edit means the whole question. */
export const asStateEdit = (edit: TagEdit | StateEdit): StateEdit => (isStateEdit(edit) ? edit : wholeQuestion(edit));

const withOwnList = (slot: SlotState, own: readonly string[]): SlotState => {
  if (own.length > 0) return { ...slot, own: [...own] };
  const next = { ...slot };
  delete next.own;
  return next;
};

const topical = (tags: readonly string[]) => tags.filter(isTopicalTag);
const free = (tags: readonly string[]) => tags.filter((tag) => !isTopicalTag(tag));

/**
 * The edit on every list the question holds: its own and every part's own list, a list
 * no leaf inherits included. Parts without a list keep inheriting. For edits that only
 * rename or take away (`removeTopics`, `renamePatternEdit`, `removePatternEdit`).
 */
export const everywhere = (edit: TagEdit): StateEdit =>
  stateEdit((state) => ({
    tags: edit(state.tags),
    slots: state.slots.map((slot) => (slot.own ? withOwnList(slot, edit(slot.own)) : slot)),
  }));

/**
 * The edit on the whole question. Without slots: its list, as ever. With slots: free tags
 * stay on the question (the edit's free tags there); every part's list becomes the edit of
 * its topics (so "tag the whole question" tags every part, then parts are refined); a
 * sub-part with its own list has it edited, one without keeps inheriting. What every list
 * edit given to a write means (`asStateEdit`): `addTopics`, `replaceTopics`,
 * `bulkTopicEdit`, `setPatternsEdit`, tag as you go.
 */
export function wholeQuestion(edit: TagEdit): StateEdit {
  return stateEdit((state) => {
    if (state.slots.length === 0) return { tags: edit(state.tags), slots: [] };
    const effective = effectiveSlotTags(state);
    return {
      tags: free(edit(state.tags)),
      slots: state.slots.map((slot) => {
        if (slot.parent === undefined) return withOwnList(slot, topical(edit(effective.get(slot.key) ?? [])));
        return slot.own ? withOwnList(slot, topical(edit(slot.own))) : slot;
      }),
    };
  });
}

/**
 * The edit on one part or sub-part: its topics in (its own, else what it inherits), its own
 * list out (topic codes and 題型 only). Found in each copy by key, else by position in a
 * copy of the same shape (`findSlot`); a copy without it is left as it is.
 */
export function atSlot(ref: SlotRef, edit: TagEdit): StateEdit {
  return stateEdit((state) => {
    const slot = findSlot(state.slots, ref);
    if (!slot) return state;
    const own = topical(edit(effectiveSlotTags(state).get(slot.key) ?? []));
    return { ...state, slots: state.slots.map((entry) => (entry === slot ? withOwnList(entry, own) : entry)) };
  });
}

/** The slot's own list removed: a sub-part takes its part's topics again ("Same as (a)"). */
export function inheritAtSlot(ref: SlotRef): StateEdit {
  return stateEdit((state) => {
    const slot = findSlot(state.slots, ref);
    if (!slot?.own) return state;
    return { ...state, slots: state.slots.map((entry) => (entry === slot ? withOwnList(entry, []) : entry)) };
  });
}

/** The edit on the question's free tags only (topic codes and 題型 are left where they are). */
export function freeTags(edit: TagEdit): StateEdit {
  return stateEdit((state) => ({ ...state, tags: [...topical(state.tags), ...free(edit(free(state.tags)))] }));
}

/** Each edit on the result of the one before. */
export const thenState = (...edits: readonly (TagEdit | StateEdit)[]): StateEdit =>
  stateEdit((state) => edits.reduce((acc, edit) => asStateEdit(edit)(acc), state));

/**
 * Replace the topic codes, keep free tags (in their place, after the codes). A 題型 stays
 * only while its sub-topic does.
 */
export const replaceTopics =
  (codes: readonly string[]): TagEdit =>
  (tags) =>
    unique([
      ...codes,
      ...tags.filter((tag) => {
        if (topicOf(tag)) return false;
        const pattern = parsePatternTag(tag);
        return !pattern || codes.includes(pattern.topic);
      }),
    ]);

/** Add topic codes to whatever is there. */
export const addTopics =
  (codes: readonly string[]): TagEdit =>
  (tags) => unique([...tags, ...codes]);

/** Take topic codes off, with their 題型; keep everything else. */
export const removeTopics =
  (codes: readonly string[]): TagEdit =>
  (tags) =>
    unique(
      tags.filter((tag) => {
        const pattern = parsePatternTag(tag);
        return !codes.includes(tag) && !(pattern && codes.includes(pattern.topic));
      }),
    );

/**
 * Bulk "Set topic": add the ticked topics, take them off, or make them the only ones. On
 * a question tagged per part it applies to every part (`wholeQuestion`, the user's call).
 */
export type BulkTopicMode = 'add' | 'remove' | 'replace';

export function bulkTopicEdit(mode: BulkTopicMode, codes: readonly string[]): TagEdit {
  if (mode === 'remove') return removeTopics(codes);
  if (mode === 'replace') return replaceTopics(codes);
  return addTopics(codes);
}

/** Trimmed, blanks and repeats dropped. A non-string tag is not ours to read: kept as it is. */
function unique(tags: readonly string[]): string[] {
  const kept = tags.map((tag) => (typeof tag === 'string' ? tag.trim() : tag)).filter((tag) => tag !== '');
  return [...new Set(kept)];
}

const sameSet = (a: readonly string[], b: readonly string[]) => new Set(a).size === new Set(b).size && a.every((tag) => b.includes(tag));

/**
 * One copy's topic change, carried to a set: it ends holding every tag the edited copy now
 * holds, minus what the edit took off, plus whatever else it already had. A set already
 * holding that, in any order, is returned as it is.
 */
export function matchEdit(before: readonly string[], after: readonly string[]): TagEdit {
  const removed = new Set(before.filter((tag) => !after.includes(tag)));
  return (tags) => {
    const next = unique([...after, ...tags.filter((tag) => !removed.has(tag))]);
    return sameSet(next, tags) ? [...tags] : next;
  };
}

/**
 * Only the change from `before` to `after`: what was added goes on, what was taken off comes
 * off, anything else a list holds stays. Unlike `matchEdit`, it never copies the rest of
 * `after` in, so applied to every part (`wholeQuestion`) it does not give one part's topics
 * to another.
 */
export function changeEdit(before: readonly string[], after: readonly string[]): TagEdit {
  const removed = new Set(before.filter((tag) => !after.includes(tag)));
  const added = after.filter((tag) => !before.includes(tag));
  return (tags) => unique([...tags.filter((tag) => !removed.has(tag)), ...added]);
}

/** A question's identity across copies, keyed as the index keys it (`BankRow.rootId`). */
export const rootOf = (question: Pick<Question, 'id' | 'lineage'>): string => rootIdOf(question);

/**
 * One question with `edit` applied, stamped `now` when it changed: the same object when it
 * did not. The edit reads the state normalized (`normalizeTagState`: older whole-question
 * topics moved onto the parts), so the first write moves them down in the same save, and
 * writes it collapsed (`collapseTagState`). Nothing else in the question changes.
 *
 * With `shared` (the question's shared state as its bank row or the Topic row showed it),
 * the edit applies to that and the copy adopts the result. It is stamped when its lists
 * change, and also when the edit changed the shared state though this copy already held
 * the result: the stamp is what makes the change outrank a copy the write could not reach.
 */
export function retagQuestion<Q extends Question>(question: Q, edit: TagEdit | StateEdit, now: string, shared?: TagState): Q {
  const own = collapseTagState(normalizeTagState(tagStateOf(question)));
  const before = shared ? collapseTagState(normalizeTagState(stateFor(tagStateOf(question), shared))) : own;
  const after = collapseTagState(asStateEdit(edit)(before));
  const decided = shared !== undefined && !sameTagState(after, before);
  if (!decided && sameTagState(after, own)) return question;
  const { tagsAt: _old, ...rest } = withTagState(question, after);
  void _old;
  // Stamped on removal too: the newest stamp is the question's state (`sharedState`).
  return { ...rest, tagsAt: now } as Q;
}

/**
 * The document with `edit` applied to the listed questions' tags and nothing else: every
 * other question keeps its object, every other field its value. An empty list removes its
 * key rather than storing `[]`. A changed question's `tagsAt` is stamped `now`. Returns the
 * same object when nothing changes; `updatedAt` moves only when something did.
 *
 * With `shared` (question id -> its shared state, what the teacher saw), the edit applies to
 * that state and the question adopts the result (`retagQuestion`).
 */
export function withQuestionTags(
  worksheet: Worksheet,
  questionIds: readonly string[],
  edit: TagEdit | StateEdit,
  now = new Date().toISOString(),
  shared?: ReadonlyMap<string, TagState>,
): Worksheet {
  const targets = new Set(questionIds);
  let changed = false;
  const questions = worksheet.questions.map((question) => {
    if (!targets.has(question.id)) return question;
    const next = retagQuestion(question, edit, now, shared?.get(question.id));
    if (next !== question) changed = true;
    return next;
  });
  return changed ? { ...worksheet, questions, updatedAt: now } : worksheet;
}

export interface TagWrite {
  docId: string;
  questionId: string;
  /** The question's shared state as its bank row shows it (`stateOfRow`): the edit applies to this. */
  shared?: TagState;
}

type WriteRow = Pick<BankRow, 'rootId' | 'docId' | 'questionId'> & {
  tags?: readonly string[];
  slots?: readonly BankSlot[];
  ownTags?: readonly string[];
};

/**
 * One write per copy of each listed question: every row of the index whose `rootId` is
 * one of `rootIds`, in index order, each (document, question) once. A row carrying `tags`
 * (a published row: the shared state) passes its state on as `shared`.
 */
export function copyWrites(rows: readonly WriteRow[], rootIds: Iterable<string>): TagWrite[] {
  const roots = new Set(rootIds);
  const seen = new Set<string>();
  const out: TagWrite[] = [];
  for (const row of rows) {
    const key = `${row.docId}\u0000${row.questionId}`;
    if (!roots.has(row.rootId) || seen.has(key)) continue;
    seen.add(key);
    out.push({
      docId: row.docId,
      questionId: row.questionId,
      ...(row.tags ? { shared: stateOfRow({ tags: row.tags, slots: row.slots, ownTags: row.ownTags }) } : {}),
    });
  }
  return out;
}

/** Every indexed copy of `question` in a document other than `openDocId` (`copyWrites`). */
export function otherCopyWrites(
  rows: readonly WriteRow[],
  question: Pick<Question, 'id' | 'lineage'>,
  openDocId: string,
): TagWrite[] {
  return copyWrites(
    rows.filter((row) => row.docId !== openDocId),
    [rootOf(question)],
  );
}

export interface WriteReport {
  /** Documents saved. */
  saved: string[];
  /** Documents left as they were, and why. */
  failed: { docId: string; reason: string }[];
}

/**
 * Apply `edit` to each listed question (to its `shared` state when the write carries one):
 * one load and one save per owning document, so a bulk "Set topic" over 40 questions in 3
 * papers is 3 writes, every copy under the one stamp `now`. A document from a newer build
 * is never rewritten (the store would refuse; this says why first).
 */
export async function writeTags(
  store: Pick<WorksheetStore, 'load' | 'save'>,
  writes: readonly TagWrite[],
  edit: TagEdit | StateEdit,
  /** Checked just before each document is read: true leaves it alone, unreported. */
  skip: (docId: string) => boolean = () => false,
  now = new Date().toISOString(),
): Promise<WriteReport> {
  const byDoc = new Map<string, string[]>();
  const shared = new Map<string, Map<string, TagState>>();
  for (const write of writes) {
    byDoc.set(write.docId, [...(byDoc.get(write.docId) ?? []), write.questionId]);
    if (!write.shared) continue;
    const bases = shared.get(write.docId) ?? new Map<string, TagState>();
    bases.set(write.questionId, write.shared);
    shared.set(write.docId, bases);
  }
  const report: WriteReport = { saved: [], failed: [] };
  for (const [docId, questionIds] of byDoc) {
    if (skip(docId)) continue;
    try {
      const worksheet = await store.load(docId);
      if (!worksheet) {
        report.failed.push({ docId, reason: 'it is no longer saved here' });
        continue;
      }
      if (isNewerThanBuild(worksheet)) {
        report.failed.push({ docId, reason: 'it was saved by a newer version of the app' });
        continue;
      }
      const next = withQuestionTags(worksheet, questionIds, edit, now, shared.get(docId));
      if (next === worksheet) continue;
      await store.save(next);
      report.saved.push(docId);
    } catch (cause) {
      report.failed.push({ docId, reason: cause instanceof Error ? cause.message : 'it could not be saved' });
    }
  }
  return report;
}
