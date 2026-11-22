import { analyseLines, buildImport, type Analysis, type ImportBatch, type ReadPaste } from '@/import';
import { resolveFlow } from '@/model/flow';
import type { Question, Worksheet } from '@/model/types';
import { listQuestionTypes } from '@/registry';
import type { QuestionBuild } from '@/store/worksheetStore';
import { loose } from './address';
import { KINDS, deterministicFindings, questionText } from './checks';
import { applyOps, type CheckOp } from './ops';
import type { CheckInput, ImportFinding } from './types';

/**
 * The import check's two doors (k-0494): the import review, before Save (the questions are
 * the batch's, fixes become pins or edits of the batch), and an open paper (✦ AI → Check
 * import: the questions are the paper's, fixes are one commit each). Both compare with the
 * file as read; neither writes anything by itself.
 */

/** The question `insertQuestionBatch` would make from a build (its type's `create()`, filled). */
export function materializeBuild(build: QuestionBuild): Question | undefined {
  const definition = listQuestionTypes().find((type) => type.id === build.typeId);
  if (!definition) return undefined;
  const fresh = definition.create();
  return { ...build.fill(fresh), id: fresh.id } as Question;
}

export const materializeBatch = (batch: ImportBatch): Question[] => batch.builds.map(materializeBuild).filter((q): q is Question => q !== undefined);

/**
 * The batch with the teacher's accepted check fixes in it, or the batch itself when there
 * are none. Each fixed build carries a `key` so the review's preview cache sees the change.
 */
export function batchWithFixes(batch: ImportBatch, ops: readonly CheckOp[]): { batch: ImportBatch; stale: number } {
  if (!ops.length) return { batch, stale: 0 };
  const questions = batch.builds.map(materializeBuild);
  if (questions.some((q) => !q)) return { batch, stale: ops.length };
  const { questions: fixed, stale } = applyOps(questions as Question[], ops);
  const tag = `fix:${hash(JSON.stringify(ops))}`;
  const builds: QuestionBuild[] = fixed.map((q, k) => {
    if (q === questions[k]) return batch.builds[k];
    return { typeId: q.type, fill: (fresh: Question) => ({ ...q, id: fresh.id }), key: tag };
  });
  return { batch: { ...batch, builds }, stale };
}

/** A short stable digest (FNV-1a), for the preview cache's keys. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

/** The import review's check: the batch as it stands (fixes applied) against the file. */
export function checkReview(
  analysis: Analysis,
  batch: ImportBatch,
  fixed: ImportBatch,
  options: { maxWidthPx: number; settled?: ReadonlySet<number> },
): ImportFinding[] {
  return sortFindings(deterministicFindings(reviewInput(analysis, batch, fixed, options)));
}

/** What the review's check compares (the AI half takes it too). */
export function reviewInput(
  analysis: Analysis,
  batch: ImportBatch,
  fixed: ImportBatch,
  options: { maxWidthPx: number; settled?: ReadonlySet<number> },
): CheckInput {
  const fresh = materializeBatch(batch);
  const paper = materializeBatch(fixed);
  const input: CheckInput = {
    analysis,
    fresh,
    paper,
    refs: paper.map((_q, k) => k),
    map: paper.map((_q, k) => k),
    mode: 'review',
    maxWidthPx: options.maxWidthPx,
    elsewhere: fixed.lead ? JSON.stringify(fixed.lead) : '',
    ...(options.settled ? { settled: options.settled } : {}),
  };
  return input;
}

/** What an open paper's check needs from its import: the file as read, solved as it was. */
export interface ImportSource {
  name: string;
  read: ReadPaste;
  /** The review's solve (the teacher's pins in it); absent = solved again with none. */
  analysis?: Analysis;
}

/** The open paper's questions, in print order. */
export function paperQuestions(worksheet: Worksheet): Question[] {
  const byId = new Map(worksheet.questions.map((q) => [q.id, q]));
  const order = resolveFlow(worksheet).flatMap((item) => (item.type === 'question' && byId.has(item.id) ? [byId.get(item.id)!] : []));
  return order.length === worksheet.questions.length ? order : worksheet.questions;
}

/**
 * Each paper question's outline question: in order, by how alike their words are. A
 * question the teacher added has none; a question deleted since leaves its outline one out.
 */
export function alignQuestions(paper: readonly Question[], fresh: readonly Question[]): Array<number | undefined> {
  const sig = (q: Question) => loose(questionText(q)).slice(0, 160);
  const a = paper.map(sig);
  const b = fresh.map(sig);
  const like = (x: string, y: string) => {
    if (!x || !y) return 0;
    const n = Math.min(x.length, y.length, 60);
    let same = 0;
    for (let i = 0; i < n; i++) if (x[i] === y[i]) same++;
    const head = same / Math.max(1, n);
    return head >= 0.6 ? head : y.includes(x.slice(0, 30)) || x.includes(y.slice(0, 30)) ? 0.6 : head;
  };
  const out: Array<number | undefined> = [];
  let next = 0;
  for (const text of a) {
    let best: number | undefined;
    let score = 0.55;
    for (let k = next; k < Math.min(b.length, next + 8); k++) {
      const s = like(text, b[k]);
      if (s > score) {
        score = s;
        best = k;
      }
    }
    out.push(best);
    if (best !== undefined) next = best + 1;
  }
  return out;
}

/** The open paper's check: its questions against the file it was imported from. */
export function checkPaper(worksheet: Worksheet, source: ImportSource, options: { maxWidthPx: number }): { findings: ImportFinding[]; input: CheckInput } {
  const analysis = source.analysis ?? analyseLines(source.read);
  const batch = buildImport(analysis);
  const fresh = materializeBatch(batch);
  const paper = paperQuestions(worksheet);
  const layoutText = JSON.stringify(worksheet.layout ?? []);
  const input: CheckInput = {
    analysis,
    fresh,
    paper,
    refs: paper.map((q) => q.id),
    map: alignQuestions(paper, fresh),
    mode: 'paper',
    maxWidthPx: options.maxWidthPx,
    elsewhere: layoutText,
  };
  return { findings: sortFindings(deterministicFindings(input)), input };
}

/** Paper order, then the most serious kind first within a question. */
export function sortFindings(findings: ImportFinding[]): ImportFinding[] {
  return [...findings].sort((a, b) => a.q - b.q || KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind));
}

/** The fixes "Apply all safe fixes" applies, in order. */
export const safeFixes = (findings: readonly ImportFinding[]) => findings.filter((f) => f.safe && f.fix);

/**
 * An op on an open paper as a store recipe: the paper's questions in print order, the op
 * applied, each question put back by id. Returns the draft itself when the op no longer
 * applies, so nothing is committed.
 */
export function paperRecipe(ops: readonly CheckOp[]): (draft: Worksheet) => Worksheet {
  return (draft) => {
    const questions = paperQuestions(draft);
    const { questions: next, applied } = applyOps(questions, ops);
    if (!applied) return draft;
    const byId = new Map(next.map((q) => [q.id, q]));
    return { ...draft, questions: draft.questions.map((q) => byId.get(q.id) ?? q) };
  };
}
