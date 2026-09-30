import { isNewerThanBuild } from '@/model/migrations';
import { sameRuns, type TextSlot, type TranslationWrite } from '@/model/textSlots';
import { collectTexts } from '@/model/textWalk';
import { applyTranslationBatch } from '@/model/translationApply';
import type { Question, Worksheet } from '@/model/types';
import type { WorksheetStore } from '@/storage/types';
import { contentKey, IGNORED, stableJson } from './contentKey';
import type { BankRow } from './types';

/**
 * Text writes made on one copy of a question, carried to every copy that says the same
 * thing (the question bank's ✦ Fill and Check terms). A question lives in several
 * documents; copies with one `contentKey` are one version of it, and a write that reaches
 * only some of them would split that version in two. So the write goes to every copy that
 * still says what the shown copy said before the change, and leaves alone any copy whose
 * content already differs (an edited version), so the bank still shows one question.
 *
 * Never written: a document in Trash (saving would bring it back), one hidden from the
 * bank (the bank does not reach into it, as topic edits do not), and one from a newer
 * build (read-only here). Each is skipped and reported.
 *
 * The bank screen writes documents only while no editor is mounted
 * (`src/library/tagWrites.ts`); each document is loaded, checked and saved in one step, so
 * a copy that changed since the bank read it is skipped, never overwritten.
 */

/** One question in one saved document. */
export interface CopyRef {
  docId: string;
  questionId: string;
}

const refKey = (ref: CopyRef) => `${ref.docId}\u0000${ref.questionId}`;

/**
 * Every indexed copy saying what `shown` says: the same question (`rootId`) and the same
 * version (`contentKey`), each (document, question) once, `shown` first. Hidden and
 * trashed documents are not indexed, so they are never listed.
 */
export function identicalCopies(
  rows: readonly Pick<BankRow, 'docId' | 'questionId' | 'rootId' | 'contentKey'>[],
  shown: Pick<BankRow, 'docId' | 'questionId' | 'rootId' | 'contentKey'>,
): CopyRef[] {
  const seen = new Set<string>([refKey(shown)]);
  const out: CopyRef[] = [{ docId: shown.docId, questionId: shown.questionId }];
  for (const row of rows) {
    if (row.rootId !== shown.rootId || row.contentKey !== shown.contentKey || seen.has(refKey(row))) continue;
    seen.add(refKey(row));
    out.push({ docId: row.docId, questionId: row.questionId });
  }
  return out;
}

const slotCache = new WeakMap<Worksheet, TextSlot[]>();

/** One question's slots as its document's walk reads them (paths and all), in print order. */
export function questionSlots(worksheet: Worksheet, questionId: string): TextSlot[] {
  let slots = slotCache.get(worksheet);
  if (!slots) slotCache.set(worksheet, (slots = collectTexts(worksheet)));
  return slots.filter((slot) => slot.questionId === questionId);
}

/**
 * `writes`, made against `from`'s slots, re-aimed at `to`: a copy saying the same thing
 * walks to the same texts in the same order, so the i-th slot of one is the i-th of the
 * other (their paths differ, since a copy has fresh ids). Null when the two no longer line
 * up, text for text: then the copy is not the same version, and is left alone.
 */
export function writesForCopy(from: readonly TextSlot[], to: readonly TextSlot[], writes: readonly TranslationWrite[]): TranslationWrite[] | null {
  if (from.length !== to.length) return null;
  for (let i = 0; i < from.length; i += 1) {
    const a = from[i];
    const b = to[i];
    if (a.kind !== b.kind || !sameRuns(a.text.en, b.text.en) || !sameRuns(a.text.zh, b.text.zh)) return null;
  }
  const at = new Map(from.map((slot, i) => [slot.path, i]));
  const out: TranslationWrite[] = [];
  for (const write of writes) {
    const i = at.get(write.path);
    if (i === undefined) return null;
    out.push({ ...write, path: to[i].path });
  }
  return out;
}

/** A copy written, as it was and as the write left it: Undo all puts `before` back. */
export interface CopyRecord extends CopyRef {
  before: Question;
  after: Question;
}

export interface CopySkip {
  docId: string;
  questionId?: string;
  reason: string;
}

export const SKIP_REASON = {
  gone: 'it is no longer saved here',
  trash: 'it is in Trash',
  hidden: 'it is hidden from the question bank',
  newer: 'it was saved by a newer version of the app',
  changed: 'it changed since the bank read it',
  unsaved: 'it could not be saved',
} as const;

type Store = Pick<WorksheetStore, 'list' | 'load' | 'save'>;

export interface CopyWriteResult {
  written: CopyRecord[];
  skipped: CopySkip[];
  /** Each document saved, as saved. */
  saved: Map<string, Worksheet>;
}

interface Doc {
  docId: string;
  refs: CopyRef[];
}

function byDocument(refs: readonly CopyRef[]): Doc[] {
  const docs = new Map<string, Doc>();
  for (const ref of refs) {
    const doc = docs.get(ref.docId) ?? { docId: ref.docId, refs: [] };
    if (!doc.refs.some((r) => r.questionId === ref.questionId)) doc.refs.push(ref);
    docs.set(ref.docId, doc);
  }
  return [...docs.values()];
}

/** The document, if the bank may write it; else why not. */
async function writable(store: Store, docId: string, live: ReadonlySet<string>): Promise<Worksheet | CopySkip> {
  if (!live.has(docId)) {
    const there = await store.load(docId).catch(() => undefined);
    return { docId, reason: there ? SKIP_REASON.trash : SKIP_REASON.gone };
  }
  const worksheet = await store.load(docId);
  if (!worksheet) return { docId, reason: SKIP_REASON.gone };
  if (isNewerThanBuild(worksheet)) return { docId, reason: SKIP_REASON.newer };
  if (worksheet.bankHidden) return { docId, reason: SKIP_REASON.hidden };
  return worksheet;
}

const liveIds = async (store: Store) => new Set((await store.list()).map((summary) => summary.id));

/** `worksheet` with `question` in place of the question of that id. */
const withQuestion = (worksheet: Worksheet, question: Question): Worksheet => ({
  ...worksheet,
  questions: worksheet.questions.map((q) => (q.id === question.id ? question : q)),
});

/**
 * Write `writes` (made against `sourceSlots`, the shown copy's slots when it said
 * `expectedKey`) into every copy in `copies` that still says `expectedKey`: one load and
 * one save per document. A copy changed since, or whose texts no longer line up, is
 * skipped; so is any text write the stale guard refuses, and then that whole copy is left
 * as it was, so a copy is written completely or not at all.
 */
export async function writeIntoCopies(
  store: Store,
  input: { sourceSlots: readonly TextSlot[]; writes: readonly TranslationWrite[]; copies: readonly CopyRef[]; expectedKey: string },
  now = new Date().toISOString(),
): Promise<CopyWriteResult> {
  const result: CopyWriteResult = { written: [], skipped: [], saved: new Map() };
  if (input.writes.length === 0) return result;
  const live = await liveIds(store);
  for (const { docId, refs } of byDocument(input.copies)) {
    try {
      const loaded = await writable(store, docId, live);
      if (!('id' in loaded)) {
        result.skipped.push(...refs.map((ref) => ({ ...loaded, questionId: ref.questionId })));
        continue;
      }
      let worksheet = loaded;
      const records: CopyRecord[] = [];
      for (const ref of refs) {
        const before = worksheet.questions.find((q) => q.id === ref.questionId);
        if (!before) {
          result.skipped.push({ ...ref, reason: SKIP_REASON.gone });
          continue;
        }
        const mapped = contentKey(before) === input.expectedKey ? writesForCopy(input.sourceSlots, questionSlots(worksheet, ref.questionId), input.writes) : null;
        if (!mapped) {
          result.skipped.push({ ...ref, reason: SKIP_REASON.changed });
          continue;
        }
        const { worksheet: next, report } = applyTranslationBatch(worksheet, mapped);
        const after = next.questions.find((q) => q.id === ref.questionId);
        if (report.skipped.length > 0 || !after) {
          result.skipped.push({ ...ref, reason: SKIP_REASON.changed });
          continue;
        }
        if (after === before) continue;
        worksheet = next;
        records.push({ ...ref, before, after });
      }
      if (records.length === 0) continue;
      const saved = { ...worksheet, updatedAt: now };
      await store.save(saved);
      result.saved.set(docId, saved);
      result.written.push(...records);
    } catch {
      result.skipped.push(...refs.map((ref) => ({ ...ref, reason: SKIP_REASON.unsaved })));
    }
  }
  return result;
}

/** What a question says and where its ids are, ignoring the metadata a topic edit moves. */
const sameContent = (a: Question, b: Question): boolean => {
  const strip = (q: Question) => {
    const copy = { ...q } as Record<string, unknown>;
    for (const key of IGNORED) delete copy[key];
    return stableJson(copy);
  };
  return strip(a) === strip(b);
};

/** `before`'s content under `current`'s metadata (tags, stamp, lineage), which the write never touched. */
function restored(before: Question, current: Question): Question {
  const out = { ...before } as Record<string, unknown>;
  const now = current as unknown as Record<string, unknown>;
  for (const key of IGNORED) {
    if (key in now) out[key] = now[key];
    else delete out[key];
  }
  return out as unknown as Question;
}

export interface RestoreResult {
  restored: CopyRef[];
  skipped: CopySkip[];
  saved: Map<string, Worksheet>;
}

/**
 * Undo all: each copy back to `before`, only where it still says exactly what the write
 * left (`after`); a copy edited since is skipped and reported. Tags and their stamp stay as
 * they are now: a topic edit made meanwhile is not undone. One save per document.
 */
export async function restoreCopies(store: Store, records: readonly CopyRecord[], now = new Date().toISOString()): Promise<RestoreResult> {
  const result: RestoreResult = { restored: [], skipped: [], saved: new Map() };
  if (records.length === 0) return result;
  const live = await liveIds(store);
  const docs = new Map<string, CopyRecord[]>();
  for (const record of records) docs.set(record.docId, [...(docs.get(record.docId) ?? []), record]);
  for (const [docId, list] of docs) {
    try {
      const loaded = await writable(store, docId, live);
      if (!('id' in loaded)) {
        result.skipped.push(...list.map((r) => ({ ...loaded, questionId: r.questionId })));
        continue;
      }
      let worksheet = loaded;
      const done: CopyRef[] = [];
      // Newest first: a copy written twice (two fixes) steps back through both.
      for (const record of [...list].reverse()) {
        const current = worksheet.questions.find((q) => q.id === record.questionId);
        if (!current || !sameContent(current, record.after)) {
          result.skipped.push({ docId, questionId: record.questionId, reason: current ? SKIP_REASON.changed : SKIP_REASON.gone });
          continue;
        }
        worksheet = withQuestion(worksheet, restored(record.before, current));
        if (!done.some((ref) => ref.questionId === record.questionId)) done.push({ docId, questionId: record.questionId });
      }
      if (done.length === 0) continue;
      const saved = { ...worksheet, updatedAt: now };
      await store.save(saved);
      result.saved.set(docId, saved);
      result.restored.push(...done);
    } catch {
      result.skipped.push(...list.map((r) => ({ docId, questionId: r.questionId, reason: SKIP_REASON.unsaved })));
    }
  }
  return result;
}
