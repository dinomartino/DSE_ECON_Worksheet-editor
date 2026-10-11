import { isNewerThanBuild } from '@/model/migrations';
import type { Question, Worksheet } from '@/model/types';
import type { WorksheetStore } from '@/storage/types';
import { contentKey } from './contentKey';
import type { BankRow } from './types';

/**
 * What the 題庫 loses when a paper goes to Trash: its questions that no other document
 * keeps (§ docs/design/question-library.md). A question is kept elsewhere when another
 * live, indexed document holds one saying exactly the same (`contentKey`, any root): an
 * edited version elsewhere does not keep this paper's words, so this one still counts.
 */

/** A document whose questions the 題庫 shows and this build reads: a paper or a bank, not hidden, not a newer build's. */
export function feedsBank(doc: Worksheet): boolean {
  const kind = doc.kind as unknown;
  return (kind === undefined || kind === 'bank') && !doc.bankHidden && !isNewerThanBuild(doc);
}

/**
 * The questions of `paper` no document in `others` says the same as, in paper order, one
 * per content (two identical questions in the paper are one kept). Only `others` that
 * `feedsBank` count; the paper itself is never one of its own holders.
 */
export function questionsOnlyIn(paper: Worksheet, others: Iterable<Worksheet>): Question[] {
  const held = new Set<string>();
  for (const doc of others) {
    if (doc.id === paper.id || !feedsBank(doc)) continue;
    for (const question of doc.questions) held.add(contentKey(question));
  }
  const leaving: Question[] = [];
  for (const question of paper.questions) {
    const key = contentKey(question);
    if (held.has(key)) continue;
    held.add(key);
    leaving.push(question);
  }
  return leaving;
}

/**
 * The questions moving `paperId` to Trash would take out of the 題庫; none for a bank, a
 * hidden or newer-build document, or one that cannot be read. Holders are read from the
 * store (listed, so never a trashed one). `rows` (the bank index) narrows that to the
 * documents it says hold one of the paper's questions; each is still loaded and checked,
 * so a stale row can only make a question count, never hide one.
 */
export async function questionsLeavingBank(
  paperId: string,
  store: Pick<WorksheetStore, 'list' | 'load'>,
  rows?: readonly BankRow[],
): Promise<Question[]> {
  const paper = await store.load(paperId).catch(() => undefined);
  if (!paper || paper.kind !== undefined || !feedsBank(paper) || paper.questions.length === 0) return [];
  const live = new Set((await store.list()).map((summary) => summary.id));
  let candidates = [...live];
  if (rows) {
    const keys = new Set(paper.questions.map(contentKey));
    candidates = [...new Set(rows.filter((row) => keys.has(row.contentKey)).map((row) => row.docId))].filter((id) => live.has(id));
  }
  const others: Worksheet[] = [];
  for (const id of candidates) {
    if (id === paperId) continue;
    const doc = await store.load(id).catch(() => undefined);
    if (doc) others.push(doc);
  }
  return questionsOnlyIn(paper, others);
}
