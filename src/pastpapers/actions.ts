import { commitBankCopies } from '@/components/bank/bankSession';
import { copyToBank, oneBank, type BankTarget } from '@/library/bankDocs';
import { rootIdOf } from '@/model/lineage';
import { createWorksheetFrom } from '@/model/newWorksheet';
import type { Worksheet } from '@/model/types';
import { useWorksheetStore } from '@/store/worksheetStore';
import type { WorksheetStore } from '@/storage';
import { planCopies } from './copy';
import type { PastPaperItem } from './pack';

/**
 * The three ways out of the Past paper bank (k-0443): into the open paper, into a new
 * paper, into the teacher's own question bank. Each writes copies only; the bank's topic
 * documents are never saved anywhere.
 */

export interface InsertOutcome {
  inserted: string[];
  /** Picks the paper already held (any copy of the same question). */
  skipped: number;
  refused?: 'readOnly';
}

/**
 * Copies of `items` into the open paper after the insert anchor (or, with none, each into
 * its type's section): one commit, one ⌘Z, the 題庫 review bar on them. A shared stimulus
 * goes in front of its questions (`planCopies`).
 */
export function insertIntoOpen(items: readonly PastPaperItem[], summary: (added: number, skipped: number) => string): InsertOutcome {
  const store = useWorksheetStore.getState();
  if (store.readOnly) return { inserted: [], skipped: 0, refused: 'readOnly' };
  const held = new Set(store.worksheet.questions.map(rootIdOf));
  const skipped = new Set(items.map((item) => rootIdOf(item.question)).filter((root) => held.has(root))).size;
  const plan = planCopies(items, held);
  if (plan.questions.length === 0) return { inserted: [], skipped };
  const { inserted } = commitBankCopies(
    {
      openId: store.worksheet.id,
      found: plan.questions.map((question, index) => ({ question, docId: plan.fromDocIds[index] })),
      missing: [],
    },
    { summary: (count) => summary(count, skipped), leads: plan.leads },
  );
  if (inserted[0]) useWorksheetStore.getState().select(inserted[0]);
  return { inserted, skipped };
}

/** The empty paper "New worksheet / Paper 1 from these" opens, before the picks go in. */
export function emptyPaperFor(kind: 'classroom' | 'paper1', name: string): Worksheet {
  return kind === 'paper1'
    ? createWorksheetFrom({ documentType: 'paper1', seedSample: false, name })
    : createWorksheetFrom({ documentType: 'classroom', sections: false, seedSample: false, name });
}

export interface BankCopyOutcome {
  copied: number;
  /** Already in the teacher's bank (any version of the same question). */
  already: number;
  /** Copied questions whose shared stimulus stays behind (a bank holds questions only). */
  withoutStimulus: number;
}

/**
 * Copy to my question bank: into the teacher's one bank (`oneBank`, made when there is
 * none), each question once, never twice (`copyToBank` by `rootId`). One save per topic.
 */
export async function copyIntoMyBank(items: readonly PastPaperItem[], io: { store?: WorksheetStore } = {}): Promise<BankCopyOutcome> {
  const plan = planCopies(items);
  const byDoc = new Map<string, number[]>();
  plan.fromDocIds.forEach((docId, index) => byDoc.set(docId, [...(byDoc.get(docId) ?? []), index]));
  let to: BankTarget = await oneBank(io);
  let copied = 0;
  let already = 0;
  const alreadyRoots = new Set<string>();
  for (const [docId, indexes] of byDoc) {
    const result = await copyToBank(indexes.map((i) => plan.questions[i]), docId, to, io);
    copied += result.copied;
    already += result.already.length;
    for (const question of result.already) alreadyRoots.add(rootIdOf(question));
    // A bank made by the first write is the one the next writes go to (one that saved nothing was never made).
    if (result.copied > 0) to = result.bank.id;
  }
  const withoutStimulus = items.filter((item) => item.stimulus && !alreadyRoots.has(rootIdOf(item.question))).length;
  return { copied, already, withoutStimulus: Math.min(withoutStimulus, copied) };
}
