import { rootIdOf } from '@/model/lineage';
import { isNewerThanBuild } from '@/model/migrations';
import { parsePatternTag } from '@/model/patterns';
import { topicOf } from '@/model/topics';
import type { Question, Worksheet } from '@/model/types';
import { adoptTags } from './sharedTags';
import type { BankRow } from './types';
import type { WorksheetStore } from '@/storage/types';

/**
 * Topic edits written into the documents that own the questions: one truth per question
 * (C6). An edit applies to the question's shared set (`sharedTags`, the set the bank and
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
 * A stale copy adopts the shared set only when a tag write reaches its question (lazy):
 * opening or viewing a document never rewrites it (§ question-library.md, "One tag set").
 */

/** A question's new tags, from its current ones. */
export type TagEdit = (tags: readonly string[]) => string[];

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

/** Bulk "Set topic": add the ticked topics, take them off, or make them the only ones. */
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

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((tag, i) => tag === b[i]);
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

/** A question's identity across copies, keyed as the index keys it (`BankRow.rootId`). */
export const rootOf = (question: Pick<Question, 'id' | 'lineage'>): string => rootIdOf(question);

/**
 * The document with `edit` applied to the listed questions' `tags` and nothing else:
 * every other question keeps its object, every other field its value. An empty result
 * removes the key rather than storing `[]`. A changed question's `tagsAt` is stamped `now`.
 * Returns the same object when nothing changes; `updatedAt` moves only when something did.
 *
 * With `shared` (question id -> its shared set, what the teacher saw), the edit applies to
 * that set and the question adopts the result (`adoptTags`). It is stamped when its tags
 * change, and also when the edit changed the shared set though this copy already held the
 * result: the stamp is what makes the change outrank a copy the write could not reach.
 */
export function withQuestionTags(
  worksheet: Worksheet,
  questionIds: readonly string[],
  edit: TagEdit,
  now = new Date().toISOString(),
  shared?: ReadonlyMap<string, readonly string[]>,
): Worksheet {
  const targets = new Set(questionIds);
  let changed = false;
  const questions = worksheet.questions.map((question) => {
    if (!targets.has(question.id)) return question;
    const before = question.tags ?? [];
    const base = shared?.get(question.id);
    let after: readonly string[];
    let decided = false;
    if (base) {
      const next = edit(base);
      after = adoptTags(before, next) ?? [];
      decided = !sameSet(next, base);
    } else {
      after = edit(before);
    }
    if (sameList(before, after) && !decided) return question;
    changed = true;
    const { tags: _old, ...rest } = question;
    void _old;
    // Stamped on removal too: the newest stamp is the question's set (`sharedTags`).
    const stamped = { ...rest, tagsAt: now };
    return (after.length > 0 ? { ...stamped, tags: [...after] } : stamped) as typeof question;
  });
  return changed ? { ...worksheet, questions, updatedAt: now } : worksheet;
}

export interface TagWrite {
  docId: string;
  questionId: string;
  /** The question's shared set as its bank row shows it: the edit applies to this. */
  shared?: readonly string[];
}

type WriteRow = Pick<BankRow, 'rootId' | 'docId' | 'questionId'> & { tags?: readonly string[] };

/**
 * One write per copy of each listed question: every row of the index whose `rootId` is
 * one of `rootIds`, in index order, each (document, question) once. A row carrying `tags`
 * (a published row: the shared set) passes it on as `shared`.
 */
export function copyWrites(rows: readonly WriteRow[], rootIds: Iterable<string>): TagWrite[] {
  const roots = new Set(rootIds);
  const seen = new Set<string>();
  const out: TagWrite[] = [];
  for (const row of rows) {
    const key = `${row.docId}\u0000${row.questionId}`;
    if (!roots.has(row.rootId) || seen.has(key)) continue;
    seen.add(key);
    out.push({ docId: row.docId, questionId: row.questionId, ...(row.tags ? { shared: row.tags } : {}) });
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
 * Apply `edit` to each listed question (to its `shared` set when the write carries one):
 * one load and one save per owning document, so a bulk "Set topic" over 40 questions in 3
 * papers is 3 writes, every copy under the one stamp `now`. A document from a newer build
 * is never rewritten (the store would refuse; this says why first).
 */
export async function writeTags(
  store: Pick<WorksheetStore, 'load' | 'save'>,
  writes: readonly TagWrite[],
  edit: TagEdit,
  /** Checked just before each document is read: true leaves it alone, unreported. */
  skip: (docId: string) => boolean = () => false,
  now = new Date().toISOString(),
): Promise<WriteReport> {
  const byDoc = new Map<string, string[]>();
  const shared = new Map<string, Map<string, readonly string[]>>();
  for (const write of writes) {
    byDoc.set(write.docId, [...(byDoc.get(write.docId) ?? []), write.questionId]);
    if (!write.shared) continue;
    const bases = shared.get(write.docId) ?? new Map<string, readonly string[]>();
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
