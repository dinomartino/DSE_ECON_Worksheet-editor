import { addToOneBank, type BankIO } from '@/library/bankDocs';
import type { LanguageMode, Question } from '@/model/types';
import { listQuestionTypes } from '@/registry';
import { useWorksheetStore, type QuestionBatchReport, type QuestionBuild } from '@/store/worksheetStore';
import { worksheetTitle } from '@/storage';
import { lookupCode } from '@/syllabus';
import { studioBuilds } from './insert';
import type { SheetDraft } from './session';

/**
 * Where picked drafts go (the studio's tray): into a paper (new, or one of the teacher's)
 * through `insertQuestionBatch`, one commit and one ⌘Z, or into their own question bank.
 * Both write originals: no lineage, no source line, tagged with the key point each draft
 * was written for. Nothing is written until the teacher presses a tray button.
 */

/** The ticked drafts still on the sheet, in the order ticked (a warned one too: the teacher chose it). */
export function pickedEntries(entries: readonly SheetDraft[], picked: readonly string[]): SheetDraft[] {
  const byId = new Map(entries.map((e) => [e.draft.id, e]));
  return picked.flatMap((id) => {
    const entry = byId.get(id);
    return entry ? [entry] : [];
  });
}

/** One build per entry, each tagged with its own key point. */
export function buildsOf(items: readonly SheetDraft[]): QuestionBuild[] {
  const keyPointOf = new Map(items.map((e) => [e.draft.id, e.request.keyPoint]));
  return studioBuilds(items.map((e) => e.draft), (draft) => keyPointOf.get(draft.id) ?? '');
}

/** The question a build makes (its type's `create()`, filled), as the store would insert it. */
export function materialize(build: QuestionBuild): Question | undefined {
  const definition = listQuestionTypes().find((type) => type.id === build.typeId);
  if (!definition) return undefined;
  const fresh = definition.create();
  return { ...build.fill(fresh), id: fresh.id } as Question;
}

/**
 * The language a new paper opens in: what its drafts were written in (both sides when
 * they differ, so nothing prints blank).
 */
export function languageOf(items: readonly SheetDraft[]): LanguageMode {
  const sides = new Set(items.map((e) => e.request.sides.join('+')));
  if (sides.size !== 1) return 'bilingual';
  const only = [...sides][0];
  return only === 'en' ? 'en' : only === 'zh' ? 'zh' : 'bilingual';
}

/** A new paper's name: the key point's name when every draft tests the same one, else none. */
export function paperName(items: readonly SheetDraft[], language: LanguageMode): string {
  const codes = new Set(items.map((e) => e.request.keyPoint));
  if (codes.size !== 1) return '';
  const keyPoint = lookupCode([...codes][0])?.keyPoint;
  if (!keyPoint) return '';
  return language === 'zh' ? keyPoint.zh : language === 'en' ? keyPoint.en : `${keyPoint.en} ${keyPoint.zh}`;
}

export type InsertResult = { ok: true; ids: string[] } | { ok: false; reason: Extract<QuestionBatchReport, { ok: false }>['refused'] };

/** The builds into the paper open in the store, after its insert anchor; the first is selected. */
export function insertIntoOpenPaper(builds: readonly QuestionBuild[]): InsertResult {
  const store = useWorksheetStore.getState();
  if (store.readOnly) return { ok: false, reason: 'readOnly' };
  if (builds.length === 0) return { ok: false, reason: 'nothing' };
  const report = store.insertQuestionBatch(builds, { worksheetId: store.worksheet.id });
  if (!report.ok) return { ok: false, reason: report.refused };
  const first = report.questionIds[0];
  if (first) useWorksheetStore.getState().select(first);
  return { ok: true, ids: report.questionIds };
}

export interface KeptResult {
  copied: number;
  /** Already in the bank word for word. */
  already: number;
  bankName: string;
}

/** The builds into the teacher's one question bank (made quietly when there is none); duplicates skipped. */
export async function keepInMyBank(builds: readonly QuestionBuild[], io: BankIO = {}): Promise<KeptResult> {
  const questions = builds.flatMap((build) => materialize(build) ?? []);
  const { bank, copied, already } = await addToOneBank(questions, { openDocId: '', ...io });
  return { copied, already: already.length, bankName: worksheetTitle(bank) };
}
