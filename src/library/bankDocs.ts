import { createWorksheet } from '@/model/factories';
import { copyQuestion, freshIds, rootIdOf } from '@/model/lineage';
import { bi } from '@/model/text';
import type { Question, Worksheet } from '@/model/types';
import { worksheetStore, type WorksheetStore } from '@/storage';
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
 * "Answer ALL questions." line, which belong to a paper. Existing banks are not touched.
 */
export function createBank(): Worksheet {
  const { instructions: _paperOnly, ...base } = createWorksheet();
  void _paperOnly;
  return { ...base, kind: 'bank', title: bi(BANK_NAME.en, BANK_NAME.zh), questions: [], layout: [], flow: [] };
}

/**
 * Append copies of `questions` to a bank, or to a new one when `bankId` is omitted.
 * Copies get fresh ids and a lineage naming `fromDocId`. Resolves to the bank saved.
 */
export async function copyToBank(
  questions: Question[],
  fromDocId: string,
  bankId?: string,
  io: BankIO = {},
): Promise<Worksheet> {
  const store = io.store ?? worksheetStore;
  if (bankId !== undefined && bankId === openId(io)) throw new Error('That bank is open; close it first.');
  let bank: Worksheet;
  if (bankId === undefined) {
    bank = createBank();
  } else {
    const loaded = await store.load(bankId);
    if (!loaded || loaded.kind !== 'bank') throw new Error('That is not a question bank.');
    bank = loaded;
  }
  const copies = questions.map((q) => copyQuestion(q, fromDocId));
  const next: Worksheet = {
    ...bank,
    questions: [...bank.questions, ...copies],
    flow: [...bank.flow, ...copies.map((q) => ({ type: 'question' as const, id: q.id }))],
    updatedAt: new Date().toISOString(),
  };
  await store.save(next);
  return next;
}

/**
 * Whether the bank holds a version of this question, and none of them says what it says
 * now. Copies have fresh ids, so the match is by `rootId`, not id. False when the bank has
 * no version of it at all (nothing to update) or already holds this exact content.
 */
export function bankCopyDiffers(question: Question, bankDoc: Worksheet): boolean {
  const versions = versionsOf(bankDoc, rootIdOf(question));
  if (versions.length === 0) return false;
  const key = contentKey(question);
  return versions.every((v) => contentKey(v) !== key);
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
