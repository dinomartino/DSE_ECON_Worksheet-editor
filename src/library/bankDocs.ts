import { createWorksheet } from '@/model/factories';
import { copyQuestion, freshIds, rootIdOf } from '@/model/lineage';
import { bi } from '@/model/text';
import type { Question, Worksheet } from '@/model/types';
import { worksheetStore, type WorksheetStore, type WorksheetSummary } from '@/storage';
import { useWorksheetStore } from '@/store/worksheetStore';
import { contentKey } from './contentKey';

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
  if (typeof to === 'string' && to === openId(io)) throw new Error('That bank is open; close it first.');
  let bank: Worksheet;
  if (typeof to !== 'string') {
    bank = createBank(to.name);
  } else {
    const loaded = await store.load(to);
    if (!loaded || loaded.kind !== 'bank') throw new Error('That is not a question bank.');
    bank = loaded;
  }
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
  if (fresh.length === 0) return { bank, copied: 0, already };
  const copies = fresh.map((q) => copyQuestion(q, fromDocId));
  const next: Worksheet = {
    ...bank,
    questions: [...bank.questions, ...copies],
    flow: [...bank.flow, ...copies.map((q) => ({ type: 'question' as const, id: q.id }))],
    updatedAt: new Date().toISOString(),
  };
  await store.save(next);
  return { bank: next, copied: copies.length, already };
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

export interface BankChoice {
  id: string;
  name: string;
  /** "12 questions"; a name two banks share also gets the date it was last saved. */
  detail: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "29 Sep 2026", the same in every browser (ICU's en-GB says "Sept" in some). */
const day = (when: number) => {
  const date = new Date(when);
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
};

/** The banks a picker lists, by name, with enough beside each to tell two alike apart. */
export function bankChoices(banks: readonly Pick<WorksheetSummary, 'id' | 'title' | 'updatedAt' | 'questionCount'>[]): BankChoice[] {
  const named = new Map<string, number>();
  for (const bank of banks) named.set(bank.title.trim().toLowerCase(), (named.get(bank.title.trim().toLowerCase()) ?? 0) + 1);
  return banks.map((bank) => {
    const count = bank.questionCount;
    const parts = count === undefined ? [] : [`${count} ${count === 1 ? 'question' : 'questions'}`];
    const when = Date.parse(bank.updatedAt);
    if ((named.get(bank.title.trim().toLowerCase()) ?? 0) > 1 && !Number.isNaN(when)) parts.push(`saved ${day(when)}`);
    return { id: bank.id, name: bank.title, detail: parts.join(' · ') };
  });
}

/**
 * Replace the bank's version of this question with the current content.
 *
 * The bank question keeps its own `id` and `lineage`, and its place in the bank's flow:
 * other papers' copies group with it by `rootId`, and a new id or lineage would orphan
 * that. Everything else is `freshIds`-renewed, so the bank shares no id with the paper.
 * With several versions in the bank the first is the one updated. One save; nothing else
 * in the bank document changes. Resolves to false when there is nothing to update.
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
  const replacement = { ...freshIds(question), id: target.id } as Question;
  if (target.lineage) replacement.lineage = target.lineage;
  else delete replacement.lineage;
  await store.save({
    ...bank,
    questions: bank.questions.map((q) => (q === target ? replacement : q)),
    updatedAt: new Date().toISOString(),
  });
  return true;
}
