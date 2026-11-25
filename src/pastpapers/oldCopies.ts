import { contentKey } from '@/library/contentKey';
import { feedsBank } from '@/library/leavingBank';
import { pastPaperOriginOf, withPastPaperOrigin } from '@/library/pastPaperCopies';
import { rootIdOf } from '@/model/lineage';
import { isNewerThanBuild } from '@/model/migrations';
import { computeNumbering } from '@/model/numbering';
import type { Question, Worksheet } from '@/model/types';
import { worksheetTitle } from '@/storage/document';
import type { WorksheetStore } from '@/storage/types';
import { sourceOf, type Manifest } from './pack';

/**
 * Past-paper copies made before k-0559 (user u-rkoi): a paper copy taken from the Past paper
 * bank by an earlier build carries no record of where it came from, so the 題庫 still shows
 * it. Spotting one takes the bank itself: a paper question with a source tag whose `rootId`
 * names a bank question (copies keep the bank's `rootId`) and which says exactly what that
 * question says now (`contentKey`). One that differs is the teacher's edit, or the bank was
 * corrected since: either way it is left in the 題庫. Nothing is ever deleted: the clean-up
 * only records the origin on the copy (`withPastPaperOrigin`), the same record a copy made
 * now gets, so the paper prints as before and an edit brings the question back.
 *
 * Bank documents are never touched: a question there was put there on purpose.
 */

/** One unchanged past-paper copy found in a paper. */
export interface OldCopy {
  docId: string;
  docTitle: string;
  questionId: string;
  /** Its printed number in the paper, when it has one. */
  number?: number;
  /** The bank's source tag, `DSE2024/P1/Q38`. */
  tag: string;
  /** `contentKey` of the copy when found: the clean-up skips it if it has changed since. */
  key: string;
}

export interface OldCopyScan {
  /** Unchanged copies, by paper (most recently saved first), then in paper order. */
  copies: OldCopy[];
  /** Copies the teacher has changed (or the bank corrected since): they stay in the 題庫. */
  changed: number;
  /** Questions with a source tag the bank no longer holds: left as they are. */
  notInBank: number;
}

/** A paper's questions that may be a past-paper copy made before k-0559: a source tag, a `rootId`, no recorded origin. */
export function oldCopyCandidates(doc: Worksheet): Question[] {
  if (doc.kind !== undefined || !feedsBank(doc)) return [];
  return doc.questions.filter(
    (question) => !pastPaperOriginOf(question) && sourceOf(question).tag !== '' && rootIdOf(question) !== question.id,
  );
}

/** The bank topics to read for these questions: by the list's search index, else every topic. */
export function topicsFor(questions: readonly Question[], manifest: Pick<Manifest, 'topics' | 'search'>): string[] {
  if (!manifest.search) return manifest.topics.map((topic) => topic.id);
  const tags = new Set(questions.map((question) => sourceOf(question).tag));
  return [...new Set(manifest.search.filter((row) => tags.has(row.source.tag)).map((row) => row.topicId))];
}

/**
 * Of `docs`, the unchanged past-paper copies made before k-0559, judged against `bank`
 * (bank questions by `rootId`).
 */
export function findOldCopies(docs: readonly Worksheet[], bank: ReadonlyMap<string, Question>): OldCopyScan {
  const scan: OldCopyScan = { copies: [], changed: 0, notInBank: 0 };
  for (const doc of docs) {
    const candidates = oldCopyCandidates(doc);
    if (candidates.length === 0) continue;
    const numbers = computeNumbering(doc).byQuestionId;
    for (const question of candidates) {
      const original = bank.get(rootIdOf(question));
      if (!original) {
        scan.notInBank += 1;
        continue;
      }
      const key = contentKey(question);
      if (key !== contentKey(original)) {
        scan.changed += 1;
        continue;
      }
      const number = numbers.get(question.id)?.number;
      scan.copies.push({
        docId: doc.id,
        docTitle: worksheetTitle(doc),
        questionId: question.id,
        ...(number !== undefined ? { number } : {}),
        tag: sourceOf(original).tag || sourceOf(question).tag,
        key,
      });
    }
  }
  return scan;
}

/**
 * `doc` with each of `copies` (of this doc) recorded as a past-paper copy, when it still says
 * what it said when found. The same object when nothing changes.
 */
export function recordOldCopies(doc: Worksheet, copies: readonly OldCopy[]): Worksheet {
  const mine = new Map(copies.filter((copy) => copy.docId === doc.id).map((copy) => [copy.questionId, copy]));
  let changed = false;
  const questions = doc.questions.map((question) => {
    const copy = mine.get(question.id);
    if (!copy || pastPaperOriginOf(question) || contentKey(question) !== copy.key) return question;
    changed = true;
    return withPastPaperOrigin(question, copy.tag);
  });
  return changed ? { ...doc, questions } : doc;
}

/** One millisecond later than `at`: the bank index sees the save, the start screen keeps its order. */
export function nudged(at: string): string {
  const time = Date.parse(at);
  return Number.isNaN(time) ? new Date().toISOString() : new Date(time + 1).toISOString();
}

export interface CleanUpResult {
  /** Copies now out of the 題庫. */
  recorded: number;
  /** Copies changed since they were found, or in a paper that can no longer be written. */
  skipped: number;
}

/**
 * Take `copies` out of the 題庫: one load and save per paper, nothing else in it changed. A
 * paper gone, hidden, a bank or a newer build's is skipped. `open` is the editor's open
 * document: it gets the same record in memory (`adopt`, every undo step too), so its next
 * autosave keeps it.
 */
export async function cleanUpOldCopies(
  copies: readonly OldCopy[],
  store: Pick<WorksheetStore, 'load' | 'save'>,
  open?: { id: string; adopt: (recipe: (doc: Worksheet) => Worksheet) => void },
): Promise<CleanUpResult> {
  const result: CleanUpResult = { recorded: 0, skipped: 0 };
  const byDoc = new Map<string, OldCopy[]>();
  for (const copy of copies) byDoc.set(copy.docId, [...(byDoc.get(copy.docId) ?? []), copy]);
  for (const [docId, list] of byDoc) {
    const doc = await store.load(docId).catch(() => undefined);
    if (!doc || doc.kind !== undefined || doc.bankHidden || isNewerThanBuild(doc)) {
      result.skipped += list.length;
      continue;
    }
    const next = recordOldCopies(doc, list);
    const recorded = next.questions.filter((question, index) => question !== doc.questions[index]).length;
    if (recorded > 0) {
      try {
        await store.save({ ...next, updatedAt: nudged(doc.updatedAt) });
      } catch {
        result.skipped += list.length;
        continue;
      }
    }
    if (open?.id === docId) open.adopt((current) => recordOldCopies(current, list));
    result.recorded += recorded;
    result.skipped += list.length - recorded;
  }
  return result;
}

/**
 * Every saved paper (never a bank, hidden or newer-build one), most recently saved first.
 * One that cannot be read is passed over.
 */
export async function savedPapers(store: Pick<WorksheetStore, 'list' | 'load'>): Promise<Worksheet[]> {
  const summaries = (await store.list())
    .filter((summary) => summary.kind !== 'bank')
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  const papers: Worksheet[] = [];
  for (const summary of summaries) {
    const doc = await store.load(summary.id).catch(() => undefined);
    if (doc && doc.kind === undefined && feedsBank(doc)) papers.push(doc);
  }
  return papers;
}

export type ScanOutcome =
  | { ok: true; scan: OldCopyScan; papers: number }
  | { ok: false; reason: 'bankOff' | 'bankUnavailable' };

/** What the scan needs of the Past paper bank (`usePastPaperBank`'s state). */
export interface BankReader {
  manifest(): Promise<Pick<Manifest, 'topics' | 'search'> | 'off' | undefined>;
  /** A topic's questions, or undefined when it cannot be read. */
  topic(id: string): Promise<readonly Question[] | undefined>;
}

/**
 * Find the unchanged past-paper copies made before k-0559 in every saved paper. Reads only the
 * bank topics those papers' source tags name. A bank that is off, or cannot be read at all,
 * answers why; a topic that cannot be read leaves its questions counted as not in the bank.
 */
export async function scanOldCopies(store: Pick<WorksheetStore, 'list' | 'load'>, bank: BankReader): Promise<ScanOutcome> {
  const papers = await savedPapers(store);
  const candidates = papers.flatMap(oldCopyCandidates);
  if (candidates.length === 0) return { ok: true, scan: { copies: [], changed: 0, notInBank: 0 }, papers: papers.length };
  const manifest = await bank.manifest();
  if (manifest === 'off') return { ok: false, reason: 'bankOff' };
  if (!manifest) return { ok: false, reason: 'bankUnavailable' };
  const byRoot = new Map<string, Question>();
  let read = 0;
  for (const id of topicsFor(candidates, manifest)) {
    const questions = await bank.topic(id);
    if (!questions) continue;
    read += 1;
    for (const question of questions) byRoot.set(rootIdOf(question), question);
  }
  if (read === 0) return { ok: false, reason: 'bankUnavailable' };
  return { ok: true, scan: findOldCopies(papers, byRoot), papers: papers.length };
}
