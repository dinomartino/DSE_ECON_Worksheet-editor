import { isNewerThanBuild } from '@/model/migrations';
import { topicOf } from '@/model/topics';
import type { Question, Worksheet } from '@/model/types';
import type { BankRow } from './types';
import type { WorksheetStore } from '@/storage/types';

/**
 * Topic edits written into the documents that own the questions: one truth per question
 * (C6), so every copy it may write ends with the same topics. Hidden and trashed documents
 * are not in the index and keep their own; a document from a newer build is reported, not
 * written.
 *
 * Two writers, each safe for its own reason:
 * - **The bank screen** writes any copy. No editor is mounted there (`EditorHost` renders
 *   the start screen *instead of* `EditorApp`, and leaving the editor awaits
 *   `flushBeforeLeaving`), so no in-memory copy can be saved over the write.
 * - **The editor's Topic row** (`src/components/editor/topicSync.ts`) changes the open
 *   copy through the store (one undo) and writes only the *other* documents here, never
 *   the open one, whose autosave would otherwise race this write.
 */

/** A question's new tags, from its current ones. */
export type TagEdit = (tags: readonly string[]) => string[];

/** Replace the topic codes, keep free tags (in their place, after the codes). */
export const replaceTopics =
  (codes: readonly string[]): TagEdit =>
  (tags) => unique([...codes, ...tags.filter((tag) => !topicOf(tag))]);

/** Add topic codes to whatever is there. */
export const addTopics =
  (codes: readonly string[]): TagEdit =>
  (tags) => unique([...tags, ...codes]);

/** Take topic codes off, keep everything else. */
export const removeTopics =
  (codes: readonly string[]): TagEdit =>
  (tags) => unique(tags.filter((tag) => !codes.includes(tag)));

/** Bulk "Set topic": add the ticked topics, take them off, or make them the only ones. */
export type BulkTopicMode = 'add' | 'remove' | 'replace';

export function bulkTopicEdit(mode: BulkTopicMode, codes: readonly string[]): TagEdit {
  if (mode === 'remove') return removeTopics(codes);
  if (mode === 'replace') return replaceTopics(codes);
  return addTopics(codes);
}

function unique(tags: readonly string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
}

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((tag, i) => tag === b[i]);
const sameSet = (a: readonly string[], b: readonly string[]) => new Set(a).size === new Set(b).size && a.every((tag) => b.includes(tag));

/**
 * One copy's topic change, carried to another copy: it ends holding every tag the edited
 * copy now holds, minus what the edit took off, plus whatever else it already had. A copy
 * already holding that set, in any order, is left as it is.
 */
export function matchEdit(before: readonly string[], after: readonly string[]): TagEdit {
  const removed = new Set(before.filter((tag) => !after.includes(tag)));
  return (tags) => {
    const next = unique([...after, ...tags.filter((tag) => !removed.has(tag))]);
    return sameSet(next, tags) ? [...tags] : next;
  };
}

/** A question's identity across copies, keyed as the index keys it (`BankRow.rootId`). */
export const rootOf = (question: Pick<Question, 'id' | 'lineage'>): string => question.lineage?.rootId ?? question.id;

/**
 * The document with `edit` applied to the listed questions' `tags` and nothing else:
 * every other question keeps its object, every other field its value. An empty result
 * removes the key rather than storing `[]`. Returns the same object when nothing changes;
 * `updatedAt` moves only when something did.
 */
export function withQuestionTags(
  worksheet: Worksheet,
  questionIds: readonly string[],
  edit: TagEdit,
  now = new Date().toISOString(),
): Worksheet {
  const targets = new Set(questionIds);
  let changed = false;
  const questions = worksheet.questions.map((question) => {
    if (!targets.has(question.id)) return question;
    const before = question.tags ?? [];
    const after = edit(before);
    if (sameList(before, after)) return question;
    changed = true;
    const { tags: _old, ...rest } = question;
    void _old;
    return (after.length > 0 ? { ...rest, tags: after } : rest) as typeof question;
  });
  return changed ? { ...worksheet, questions, updatedAt: now } : worksheet;
}

export interface TagWrite {
  docId: string;
  questionId: string;
}

/**
 * One write per copy of each listed question: every row of the index whose `rootId` is
 * one of `rootIds`, in index order, each (document, question) once.
 */
export function copyWrites(rows: readonly Pick<BankRow, 'rootId' | 'docId' | 'questionId'>[], rootIds: Iterable<string>): TagWrite[] {
  const roots = new Set(rootIds);
  const seen = new Set<string>();
  const out: TagWrite[] = [];
  for (const row of rows) {
    const key = `${row.docId}\u0000${row.questionId}`;
    if (!roots.has(row.rootId) || seen.has(key)) continue;
    seen.add(key);
    out.push({ docId: row.docId, questionId: row.questionId });
  }
  return out;
}

/** Every indexed copy of `question` in a document other than `openDocId` (`copyWrites`). */
export function otherCopyWrites(
  rows: readonly Pick<BankRow, 'rootId' | 'docId' | 'questionId'>[],
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
 * Apply `edit` to each listed question: one load and one save per owning document, so a
 * bulk "Set topic" over 40 questions in 3 papers is 3 writes. A document from a newer
 * build is never rewritten (the store would refuse; this says why first).
 */
export async function writeTags(
  store: Pick<WorksheetStore, 'load' | 'save'>,
  writes: readonly TagWrite[],
  edit: TagEdit,
  /** Checked just before each document is read: true leaves it alone, unreported. */
  skip: (docId: string) => boolean = () => false,
): Promise<WriteReport> {
  const byDoc = new Map<string, string[]>();
  for (const write of writes) byDoc.set(write.docId, [...(byDoc.get(write.docId) ?? []), write.questionId]);
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
      const next = withQuestionTags(worksheet, questionIds, edit);
      if (next === worksheet) continue;
      await store.save(next);
      report.saved.push(docId);
    } catch (cause) {
      report.failed.push({ docId, reason: cause instanceof Error ? cause.message : 'it could not be saved' });
    }
  }
  return report;
}
