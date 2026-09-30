'use client';

import { adoptTags, sharedTags, type SharedTags, type TagCopy } from '@/library/sharedTags';
import type { BankRow } from '@/library/types';
import { useBank } from '@/library/useBank';
import { rootIdOf } from '@/model/lineage';
import { stringTags } from '@/model/topics';
import type { Question, Worksheet } from '@/model/types';
import { useWorksheetStore } from '@/store/worksheetStore';

/**
 * The topics the editor shows for a question: its shared set (`sharedTags`, newest tag
 * change wins), read from the other documents' bank rows and the open document's live
 * copies. Display only: a stale copy is shown the newest set but never rewritten for being
 * viewed, so opening a document leaves it clean; it adopts the set on its next tag write
 * (`setQuestionTopics`).
 */

type OpenDoc = Pick<Worksheet, 'id' | 'questions'>;

let cache: { rows: readonly BankRow[]; doc: OpenDoc; questions: readonly Question[]; out: Map<string, SharedTags> } | undefined;

/** Each root in the open document with a copy elsewhere → its shared set. Cached on its inputs. */
export function openSharedTags(rows: readonly BankRow[], doc: OpenDoc): Map<string, SharedTags> {
  if (cache && cache.rows === rows && cache.doc.id === doc.id && cache.questions === doc.questions) return cache.out;
  const live = new Map<string, TagCopy[]>();
  for (const question of doc.questions) {
    const root = rootIdOf(question);
    live.set(root, [...(live.get(root) ?? []), { tags: stringTags(question.tags), tagsAt: question.tagsAt }]);
  }
  // Published rows already hold their root's shared set; the open document's own rows are
  // its saved state, so its live copies stand in for them.
  const elsewhere = new Map<string, TagCopy>();
  for (const row of rows) if (row.docId !== doc.id && live.has(row.rootId) && !elsewhere.has(row.rootId)) elsewhere.set(row.rootId, row);
  const out = new Map<string, SharedTags>();
  for (const [root, copies] of live) {
    const other = elsewhere.get(root);
    if (other || copies.length > 1) out.set(root, sharedTags(other ? [other, ...copies] : copies));
  }
  cache = { rows, doc, questions: doc.questions, out };
  return out;
}

/** `question`'s tags as the editor shows them: its own, made the shared set when it has one. */
export function shownTags(question: Question, shared: ReadonlyMap<string, SharedTags>): string[] | undefined {
  const set = shared.get(rootIdOf(question));
  return set ? adoptTags(question.tags, set.tags) : question.tags;
}

/** `shownTags` for a question of the open document; its own tags until the bank has rows. */
export function useShownTags(question: Question | undefined): string[] | undefined {
  const { rows } = useBank();
  const worksheet = useWorksheetStore((s) => s.worksheet);
  return question ? shownTags(question, openSharedTags(rows, worksheet)) : undefined;
}
