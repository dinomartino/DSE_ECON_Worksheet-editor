import { isNewerThanBuild } from '@/model/migrations';
import type { BankRow } from '@/library/types';
import { topicOf } from '@/model/topics';
import type { Worksheet } from '@/model/types';
import type { WorksheetStore } from '@/storage/types';

/**
 * Topic edits from the bank page, written into the documents that own the questions.
 *
 * Safe on the start screen because no editor is mounted there: `EditorHost` renders the
 * start screen *instead of* `EditorApp`, and leaving the editor awaits
 * `flushBeforeLeaving`, so no in-memory copy of any document is waiting to be saved over
 * this write. Opening a document afterwards loads it from storage again.
 *
 * Every edit from the bank goes to every copy of the question (`copyWrites`), so all the
 * copies it may write end with the same topics. Hidden and trashed documents are not in
 * the index and keep their own; a document from a newer build is reported, not written.
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
): Promise<WriteReport> {
  const byDoc = new Map<string, string[]>();
  for (const write of writes) byDoc.set(write.docId, [...(byDoc.get(write.docId) ?? []), write.questionId]);
  const report: WriteReport = { saved: [], failed: [] };
  for (const [docId, questionIds] of byDoc) {
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
