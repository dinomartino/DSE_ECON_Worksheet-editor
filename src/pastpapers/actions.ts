import { commitBankCopies } from '@/components/bank/bankSession';
import { copyToBank, oneBank, type BankTarget } from '@/library/bankDocs';
import { rootIdOf } from '@/model/lineage';
import { createWorksheetFrom } from '@/model/newWorksheet';
import type { Worksheet } from '@/model/types';
import { hasQuestionSources, printsQuestionSources } from '@/render/questionSource';
import { useWorksheetStore } from '@/store/worksheetStore';
import { worksheetStore, type WorksheetStore } from '@/storage';
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
 * Whether "Show source (year + question no.)" decides this paper's switch
 * (`Worksheet.showQuestionSources`): only while the paper has no question with a source yet.
 * After that the paper's own switch rules (Setup → Page, or the box beside the bank in the
 * editor), so adding more questions never flips what a paper already prints.
 */
export const sourceChoiceDecides = (worksheet: Pick<Worksheet, 'questions'>) => !hasQuestionSources(worksheet);

/**
 * Copies of `items` into the open paper after the insert anchor (or, with none, each into
 * its type's section): one commit, one ⌘Z, the 題庫 review bar on them. A shared stimulus
 * goes in front of its questions (`planCopies`). With `showSources`, a paper getting its
 * first sourced questions prints their sources, in the same commit (`sourceChoiceDecides`).
 */
export function insertIntoOpen(
  items: readonly PastPaperItem[],
  summary: (added: number, skipped: number) => string,
  { showSources = false }: { showSources?: boolean } = {},
): InsertOutcome {
  const store = useWorksheetStore.getState();
  if (store.readOnly) return { inserted: [], skipped: 0, refused: 'readOnly' };
  const held = new Set(store.worksheet.questions.map(rootIdOf));
  const skipped = new Set(items.map((item) => rootIdOf(item.question)).filter((root) => held.has(root))).size;
  const plan = planCopies(items, held);
  if (plan.questions.length === 0) return { inserted: [], skipped };
  const turnOn = showSources && sourceChoiceDecides(store.worksheet) && !printsQuestionSources(store.worksheet);
  const { inserted } = commitBankCopies(
    {
      openId: store.worksheet.id,
      found: plan.questions.map((question, index) => ({ question, docId: plan.fromDocIds[index] })),
      missing: [],
    },
    { summary: (count) => summary(count, skipped), leads: plan.leads, ...(turnOn ? { patch: { showQuestionSources: true } } : {}) },
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
  /** Shared passages kept in the bank in front of the copies they serve. */
  stimuli: number;
}

/**
 * Copy to my question bank: into the teacher's one bank (`oneBank`, made when there is
 * none), each question once, never twice (`copyToBank` by `rootId`). A shared passage goes
 * in front of the copies it serves, with the span they fill, so inserting them from the
 * 題庫 brings it along (`library/stimuli.ts`). One save per topic.
 */
export async function copyIntoMyBank(items: readonly PastPaperItem[], io: { store?: WorksheetStore } = {}): Promise<BankCopyOutcome> {
  let to: BankTarget = await oneBank(io);
  // What the bank already holds is left out before planning, so a passage's span counts only the copies made.
  const existing = typeof to === 'string' ? await (io.store ?? worksheetStore).load(to).catch(() => undefined) : undefined;
  const held = new Set(existing?.questions.map(rootIdOf) ?? []);
  const alreadyCount = new Set(items.map((item) => rootIdOf(item.question)).filter((root) => held.has(root))).size;
  const plan = planCopies(items, held);
  const byDoc = new Map<string, number[]>();
  plan.fromDocIds.forEach((docId, index) => byDoc.set(docId, [...(byDoc.get(docId) ?? []), index]));
  let copied = 0;
  let already = alreadyCount;
  let stimuli = 0;
  for (const [docId, indexes] of byDoc) {
    const leads = indexes.map((i) => plan.leads[i]);
    const result = await copyToBank(indexes.map((i) => plan.questions[i]), docId, to, io, leads);
    copied += result.copied;
    already += result.already.length;
    if (result.copied > 0) stimuli += leads.filter((lead, k) => lead && !result.already.includes(plan.questions[indexes[k]])).length;
    // A bank made by the first write is the one the next writes go to (one that saved nothing was never made).
    if (result.copied > 0) to = result.bank.id;
  }
  return { copied, already, stimuli };
}
