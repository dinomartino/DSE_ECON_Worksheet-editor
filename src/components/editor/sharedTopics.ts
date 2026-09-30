'use client';

import { adoptTags, sharedState, stateOfRow, type SharedState, type StateCopy } from '@/library/sharedTags';
import type { BankRow } from '@/library/types';
import { useBank } from '@/library/useBank';
import { rootIdOf } from '@/model/lineage';
import { derivedTags, stateFor, tagStateOf, type TagState } from '@/model/tagSlots';
import type { Question, Worksheet } from '@/model/types';
import { useWorksheetStore } from '@/store/worksheetStore';

/**
 * The topics the editor shows for a question: its shared state (`sharedState`, newest tag
 * change wins), read from the other documents' bank rows and the open document's live
 * copies. Display only: a stale copy is shown the newest state but its tags are never
 * changed for being viewed, so opening a document leaves it clean (the one save on open,
 * `EditorHost`'s, writes it as loaded); it adopts the state on its next tag write
 * (`setQuestionTags`).
 */

type OpenDoc = Pick<Worksheet, 'id' | 'questions'>;

let cache: { rows: readonly BankRow[]; doc: OpenDoc; questions: readonly Question[]; out: Map<string, SharedState> } | undefined;

/** Each root in the open document with a copy elsewhere → its shared state. Cached on its inputs. */
export function openSharedTags(rows: readonly BankRow[], doc: OpenDoc): Map<string, SharedState> {
  if (cache && cache.rows === rows && cache.doc.id === doc.id && cache.questions === doc.questions) return cache.out;
  const live = new Map<string, StateCopy[]>();
  for (const question of doc.questions) {
    const root = rootIdOf(question);
    live.set(root, [...(live.get(root) ?? []), { state: tagStateOf(question), tagsAt: question.tagsAt }]);
  }
  // Published rows already hold their root's shared state; the open document's own rows
  // are its saved state, so its live copies stand in for them.
  const elsewhere = new Map<string, StateCopy>();
  for (const row of rows) {
    if (row.docId !== doc.id && live.has(row.rootId) && !elsewhere.has(row.rootId)) {
      elsewhere.set(row.rootId, { state: stateOfRow(row), tagsAt: row.tagsAt });
    }
  }
  const out = new Map<string, SharedState>();
  for (const [root, copies] of live) {
    const other = elsewhere.get(root);
    if (other || copies.length > 1) out.set(root, sharedState(other ? [other, ...copies] : copies));
  }
  cache = { rows, doc, questions: doc.questions, out };
  return out;
}

/** `question`'s tag state as the editor shows it: its own, made the shared state when it has one. */
export function shownTagState(question: Question, shared: ReadonlyMap<string, SharedState>): TagState {
  const own = tagStateOf(question);
  const set = shared.get(rootIdOf(question));
  return set ? stateFor(own, set.state) : own;
}

/**
 * `question`'s tags as one list, as the editor shows them: without parts, its own made
 * the shared set (the same array when it already holds it); with parts, the derived list.
 */
export function shownTags(question: Question, shared: ReadonlyMap<string, SharedState>): string[] | undefined {
  const state = shownTagState(question, shared);
  if (state.slots.length > 0) return derivedTags(state);
  return shared.has(rootIdOf(question)) ? adoptTags(question.tags, state.tags) : question.tags;
}

/** `shownTagState` for a question of the open document; its own state until the bank has rows. */
export function useShownTagState(question: Question | undefined): TagState | undefined {
  const { rows } = useBank();
  const worksheet = useWorksheetStore((s) => s.worksheet);
  return question ? shownTagState(question, openSharedTags(rows, worksheet)) : undefined;
}

/** `shownTags` for a question of the open document; its own tags until the bank has rows. */
export function useShownTags(question: Question | undefined): string[] | undefined {
  const { rows } = useBank();
  const worksheet = useWorksheetStore((s) => s.worksheet);
  return question ? shownTags(question, openSharedTags(rows, worksheet)) : undefined;
}
