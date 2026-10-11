import { createWorksheet } from '@/model/factories';
import { isNewerThanBuild } from '@/model/migrations';
import { copyQuestion, freshIdsKeepingParts, rootIdOf } from '@/model/lineage';
import { stateFor, tagStateOf, withTagState } from '@/model/tagSlots';
import { bi } from '@/model/text';
import type { Question, Worksheet } from '@/model/types';
import { worksheetStore, type WorksheetStore } from '@/storage';
import { useWorksheetStore } from '@/store/worksheetStore';
import { contentKey } from './contentKey';
import { tagTime } from './sharedTags';

/**
 * Writing to bank documents (§ docs/design/question-library.md, "Copies are independent").
 * A bank is an ordinary saved document with `kind: 'bank'`; these are the only places a
 * paper's questions are written into one. The source document is never touched.
 */

export interface BankIO {
  store?: WorksheetStore;
  /** The document the editor has open; the editor saves it, so it is never written here. */
  openDocId?: string;
}

export const BANK_NAME = { en: 'Question bank', zh: '題庫' };

const openId = (io: BankIO) => io.openDocId ?? useWorksheetStore.getState().worksheet.id;

/** A bank's questions that descend from `rootId`, in document order. */
function versionsOf(bankDoc: Worksheet, rootId: string): Question[] {
  return bankDoc.questions.filter((q) => rootIdOf(q) === rootId);
}

/**
 * A new, empty bank document: its title and nothing else — no Section A/B headings and no
 * "Answer ALL questions." line, which belong to a paper. `name` is its filing name (the
 * teacher's, as a new worksheet's); the printed title stays "Question bank 題庫". Existing
 * banks are not touched.
 */
export function createBank(name?: string): Worksheet {
  const { instructions: _paperOnly, ...base } = createWorksheet();
  void _paperOnly;
  const filing = name?.trim();
  return {
    ...base,
    ...(filing ? { name: filing } : {}),
    kind: 'bank',
    title: bi(BANK_NAME.en, BANK_NAME.zh),
    questions: [],
    layout: [],
    flow: [],
  };
}

/** Where Copy to bank writes: an existing bank's id, or a new bank with this name. */
export type BankTarget = string | { name?: string };

export interface CopyToBankResult {
  /** The bank as saved (or, when nothing was copied, as it already was). */
  bank: Worksheet;
  copied: number;
  /** Questions the bank already held a copy of (any version): never copied twice. */
  already: Question[];
}

/**
 * Append copies of `questions` to a bank, or to a new one (`{ name }`, or omitted). Copies
 * get fresh ids and a lineage naming `fromDocId`. A question the bank already holds, in
 * any version (same `rootId`), is not copied again: it is returned in `already`, and an
 * edited one is brought up to date by `updateBankCopy`, never by a second copy. Nothing
 * to copy saves nothing.
 */
export async function copyToBank(
  questions: Question[],
  fromDocId: string,
  to: BankTarget = {},
  io: BankIO = {},
): Promise<CopyToBankResult> {
  const store = io.store ?? worksheetStore;
  const bank = await bankFor(to, io);
  const held = new Set(bank.questions.map(rootIdOf));
  const fresh: Question[] = [];
  const already: Question[] = [];
  for (const question of questions) {
    const root = rootIdOf(question);
    if (held.has(root)) already.push(question);
    else {
      held.add(root);
      fresh.push(question);
    }
  }
  return appendToBank(bank, fresh.map((q) => copyQuestion(q, fromDocId)), already, store);
}

/** `questions` split by whether the bank (or an earlier one of them) already says what each says (`contentKey`). */
function newByContent(questions: readonly Question[], bank: Worksheet): { fresh: Question[]; already: Question[] } {
  const held = new Set(bank.questions.map(contentKey));
  const fresh: Question[] = [];
  const already: Question[] = [];
  for (const question of questions) {
    const key = contentKey(question);
    if (held.has(key)) already.push(question);
    else {
      held.add(key);
      fresh.push(question);
    }
  }
  return { fresh, already };
}

/** `added` at the end of the bank, in one save; nothing added saves nothing. */
async function appendToBank(bank: Worksheet, added: Question[], already: Question[], store: WorksheetStore): Promise<CopyToBankResult> {
  if (added.length === 0) return { bank, copied: 0, already };
  const next: Worksheet = {
    ...bank,
    questions: [...bank.questions, ...added],
    flow: [...bank.flow, ...added.map((q) => ({ type: 'question' as const, id: q.id }))],
    updatedAt: new Date().toISOString(),
  };
  await store.save(next);
  return { bank: next, copied: added.length, already };
}

/**
 * A paper's questions kept in the bank before the paper goes to Trash (the start screen's
 * delete). Each is copied as `copyToBank` copies (`copyQuestion`: fresh ids, its `rootId`,
 * a lineage naming `fromDocId`; tags, pictures and diagrams travel inside the question),
 * unless the bank already says what it says (`contentKey`, any root): returned in
 * `already`. Unlike `copyToBank`, a question whose root the bank holds in another version
 * is still copied: the bank's version is never replaced, and the two group as one question
 * with two versions, as they did while the paper was live. One save.
 */
export async function keepInBank(questions: Question[], fromDocId: string, to: BankTarget = {}, io: BankIO = {}): Promise<CopyToBankResult> {
  const store = io.store ?? worksheetStore;
  const bank = await bankFor(to, io);
  const { fresh, already } = newByContent(questions, bank);
  return appendToBank(bank, fresh.map((q) => copyQuestion(q, fromDocId)), already, store);
}

/** A bank this build may write into without asking: a bank, not hidden from the 題庫, not a newer build's. */
export function writableBank(doc: Worksheet): boolean {
  return doc.kind === 'bank' && !doc.bankHidden && !isNewerThanBuild(doc);
}

/**
 * The one bank (the teacher never picks or names one): of `banks`, the most recently saved
 * that `writableBank` allows, or none. Ties go to the first given.
 */
export function oneBankOf(banks: readonly Worksheet[]): Worksheet | undefined {
  let best: Worksheet | undefined;
  let bestAt = -Infinity;
  for (const bank of banks) {
    if (!writableBank(bank)) continue;
    const at = Date.parse(bank.updatedAt);
    const when = Number.isNaN(at) ? -Infinity : at;
    if (!best || when > bestAt) {
      best = bank;
      bestAt = when;
    }
  }
  return best;
}

/** The saved banks (never the open document; one that cannot be read is passed over), and every bank's name. */
async function savedBanks(io: BankIO): Promise<{ banks: Worksheet[]; names: string[] }> {
  const store = io.store ?? worksheetStore;
  const open = openId(io);
  const summaries = (await store.list()).filter((summary) => summary.kind === 'bank');
  const banks: Worksheet[] = [];
  for (const summary of summaries) {
    if (summary.id === open) continue;
    const doc = await store.load(summary.id).catch(() => undefined);
    if (doc) banks.push(doc);
  }
  return { banks, names: summaries.map((summary) => summary.title) };
}

/**
 * Where a write goes when the teacher is not asked which bank: `oneBankOf` the saved banks
 * (never the open document), else a new bank named by `nextBankName`, made quietly by the
 * first write that adds something.
 */
export async function oneBank(io: BankIO = {}): Promise<BankTarget> {
  const { banks, names } = await savedBanks(io);
  const bank = oneBankOf(banks);
  return bank ? bank.id : { name: nextBankName(names) };
}

/** New questions (an import) added to the one bank: `addToBank` at `oneBank`. */
export async function addToOneBank(questions: Question[], io: BankIO = {}): Promise<CopyToBankResult> {
  return addToBank(questions, await oneBank(io), io);
}

/**
 * Copy to bank's bank for a question whose root is `rootId`: of `banks`, a writable one
 * already holding a version of that root (the most recent of them), so one root never
 * gets a copy in a second bank; else the one bank (`oneBankOf`), or none.
 */
export function copyBankOf(rootId: string, banks: readonly Worksheet[]): Worksheet | undefined {
  const holding = banks.filter((bank) => bank.questions.some((q) => rootIdOf(q) === rootId));
  return oneBankOf(holding) ?? oneBankOf(banks);
}

/**
 * Where Copy to bank sends `question`: `copyBankOf` the saved banks (`bank`, loaded), else
 * a new bank's name. `openBank`, a bank the editor has open, is weighed too: it holds the
 * question, so when chosen it reads as already there (it is never written here).
 */
export async function copyBankFor(
  question: Question,
  io: BankIO = {},
  openBank?: Worksheet,
): Promise<{ to: BankTarget; bank?: Worksheet }> {
  const { banks, names } = await savedBanks(io);
  const bank = copyBankOf(rootIdOf(question), openBank?.kind === 'bank' ? [...banks, openBank] : banks);
  return bank ? { to: bank.id, bank } : { to: { name: nextBankName(names) } };
}

/** What Copy to bank did: `differs` wrote nothing (the teacher picks Update bank copy or Treat as a new question). */
export type CopyOutcome = { kind: 'copied' | 'already' | 'differs'; bank: Worksheet };

/**
 * Copy to bank, never asking which bank: to `copyBankFor`'s. A bank holding this exact
 * content has it `already`; one holding only another version `differs`; else a copy is
 * added (`copyToBank`), making the bank when there is none. At most one save.
 */
export async function copyToOneBank(
  question: Question,
  fromDocId: string,
  io: BankIO = {},
  openBank?: Worksheet,
): Promise<CopyOutcome> {
  const { to, bank } = await copyBankFor(question, io, openBank);
  const holds = bank ? bankHolds(question, bank) : 'none';
  if (bank && holds !== 'none') return { kind: holds === 'same' ? 'already' : 'differs', bank };
  const done = await copyToBank([question], fromDocId, to, io);
  return { kind: done.copied > 0 ? 'copied' : 'already', bank: done.bank };
}

/** The bank `to` names, loaded, or a new one. Never the open document. */
async function bankFor(to: BankTarget, io: BankIO): Promise<Worksheet> {
  const store = io.store ?? worksheetStore;
  if (typeof to === 'string' && to === openId(io)) throw new Error('That bank is open; close it first.');
  if (typeof to !== 'string') return createBank(to.name);
  const loaded = await store.load(to);
  if (!loaded || loaded.kind !== 'bank') throw new Error('That is not a question bank.');
  return loaded;
}

/**
 * New questions (a paste, `src/import/`) appended to a bank as originals: they come from
 * no document, so they carry no lineage. One that says what a question in the bank (or
 * an earlier one of `questions`) already says, by `contentKey`, is not added: it is
 * returned in `already`. Nothing to add saves nothing. One save.
 */
export async function addToBank(questions: Question[], to: BankTarget = {}, io: BankIO = {}): Promise<CopyToBankResult> {
  const store = io.store ?? worksheetStore;
  const bank = await bankFor(to, io);
  const { fresh, already } = newByContent(questions, bank);
  return appendToBank(bank, fresh, already, store);
}

/** The roots of the questions `addToBank` added (all of `questions` but `already`), in their order. */
export function addedRoots(questions: readonly Question[], already: readonly Question[]): string[] {
  const skipped = new Set(already.map((q) => q.id));
  return questions.filter((q) => !skipped.has(q.id)).map(rootIdOf);
}


/**
 * What a bank holds of this question: no version of it (`none`), one saying exactly what
 * it says now (`same`), or only other versions (`differs`: "Update bank copy" applies).
 * Copies have fresh ids, so the match is by `rootId`, then `contentKey`.
 */
export function bankHolds(question: Question, bankDoc: Worksheet): 'none' | 'same' | 'differs' {
  const versions = versionsOf(bankDoc, rootIdOf(question));
  if (versions.length === 0) return 'none';
  const key = contentKey(question);
  return versions.some((v) => contentKey(v) === key) ? 'same' : 'differs';
}

/**
 * Whether the bank holds a version of this question, and none of them says what it says
 * now. False when the bank has no version of it at all (nothing to update) or already
 * holds this exact content.
 */
export function bankCopyDiffers(question: Question, bankDoc: Worksheet): boolean {
  return bankHolds(question, bankDoc) === 'differs';
}

/**
 * A new bank's suggested name: "Question bank", or the first "Question bank N" no bank
 * has yet, so two banks are never made alike by default.
 */
export function nextBankName(existing: readonly string[]): string {
  const taken = new Set(existing.map((name) => name.trim().toLowerCase()));
  if (!taken.has(BANK_NAME.en.toLowerCase())) return BANK_NAME.en;
  for (let n = 2; ; n += 1) {
    const name = `${BANK_NAME.en} ${n}`;
    if (!taken.has(name.toLowerCase())) return name;
  }
}

/**
 * Replace the bank's version of this question with the current content.
 *
 * The bank question keeps its own `id` and `lineage`, and its place in the bank's flow:
 * other papers' copies group with it by `rootId`, and a new id or lineage would orphan
 * that. Everything else is renewed (`freshIdsKeepingParts`: parts keep their roots), so
 * the bank shares no id with the paper. Tags follow the newest `tagsAt`, as shared tags
 * do: a bank copy tagged after the paper (another tab) keeps its tags and stamp. With
 * several versions in the bank the first is the one updated. One save; nothing else in
 * the bank document changes. Resolves to false when there is nothing to update.
 */
export async function updateBankCopy(
  question: Question,
  bankDocId: string,
  io: BankIO = {},
): Promise<boolean> {
  const store = io.store ?? worksheetStore;
  if (bankDocId === openId(io)) throw new Error('That bank is open; close it first.');
  const bank = await store.load(bankDocId);
  if (!bank || bank.kind !== 'bank') return false;
  const target = versionsOf(bank, rootIdOf(question))[0];
  if (!target) return false;
  let replacement = { ...freshIdsKeepingParts(question), id: target.id } as Question;
  if (target.lineage) replacement.lineage = target.lineage;
  else delete replacement.lineage;
  replacement = withNewerTags(replacement, target);
  await store.save({
    ...bank,
    questions: bank.questions.map((q) => (q === target ? replacement : q)),
    updatedAt: new Date().toISOString(),
  });
  return true;
}

/**
 * `next` with `current`'s tag state and stamp when `current` was tagged later (stamped,
 * and `next` unstamped or stamped earlier); else `next` as it is. Parts pair by key.
 */
function withNewerTags(next: Question, current: Question): Question {
  const theirs = tagTime(current.tagsAt);
  const ours = tagTime(next.tagsAt);
  if (theirs === undefined || (ours !== undefined && ours >= theirs)) return next;
  const tagged = withTagState(next, stateFor(tagStateOf(next), tagStateOf(current)));
  return { ...tagged, tagsAt: current.tagsAt } as Question;
}
