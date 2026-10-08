/**
 * Scoring an analysis against an expected outline (test support). The batch is built and
 * materialised through the registry, so the score covers the builder too.
 */
import { getQuestionType } from '@/registry';
import type { BiText, ContentBlock, LayoutElement, McqQuestion, Question, StructuredQuestion } from '@/model/types';
import { buildImport, type Analysis, type ImportBatch } from '..';
import type { ExpectedFixture, ExpectedQuestion } from './expected';

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
const side = (t: BiText | undefined) => squash([...(t?.en ?? []), ...(t?.zh ?? [])].map((r) => r.text).join(''));

export const blocksText = (blocks: readonly ContentBlock[] | undefined): string =>
  squash(
    (blocks ?? [])
      .map((b) =>
        b.kind === 'paragraph'
          ? side(b.text)
          : b.kind === 'table'
            ? b.rows.map((r) => r.cells.map((c) => side(c.text)).join(' ')).join(' ')
            : b.kind === 'source'
              ? `${side(b.label)} ${blocksText(b.blocks)}`
              : '',
      )
      .join(' '),
  );

/** Each build filled into its type's fresh question, as the store does. */
export function materialise(batch: ImportBatch): Question[] {
  return batch.builds.map((b) => {
    const fresh = getQuestionType(b.typeId)!.create();
    return { ...b.fill(fresh), id: fresh.id } as Question;
  });
}

export interface Score {
  expected: number;
  got: number;
  /** Expected questions found, in order, over max(expected, got). */
  split: number;
  /** Share of per-question checks (type, options, statements, parts, marks, answers) that pass. */
  detail: number;
  failures: string[];
}

type Check = (ok: boolean, what: string) => void;

export function scoreAnalysis(analysis: Analysis, fx: Pick<ExpectedFixture, 'kind' | 'questions' | 'lead'>): Score {
  const batch = buildImport(analysis);
  const got = materialise(batch);
  const failures: string[] = [];
  let checks = 0;
  let passed = 0;
  const check: Check = (ok, what) => {
    checks++;
    if (ok) passed++;
    else failures.push(what);
  };
  check(analysis.kind === fx.kind, `kind ${analysis.kind}`);
  const lead = batch.lead as Extract<LayoutElement, { kind: 'stimulus' }> | undefined;
  if (fx.lead) check(!!lead && blocksText(lead.blocks).startsWith(fx.lead), 'lead');
  else check(!lead, 'unexpected lead');

  let matched = 0;
  let at = 0;
  fx.questions.forEach((e, k) => {
    const j = got.findIndex((q, idx) => idx >= at && blocksText(q.blocks).startsWith(squash(e.stem)));
    if (j < 0) {
      failures.push(`Q${k + 1} not found`);
      return;
    }
    matched++;
    at = j + 1;
    compare(got[j], e, `Q${k + 1}`, check);
  });
  const denom = Math.max(fx.questions.length, got.length);
  return { expected: fx.questions.length, got: got.length, split: denom === 0 ? 1 : matched / denom, detail: checks ? passed / checks : 1, failures };
}

function compare(q: Question, e: ExpectedQuestion, tag: string, check: Check) {
  check(q.type === (e.kind === 'mc' ? 'mcq' : 'structured'), `${tag} type ${q.type}`);
  if (e.side) {
    const first = q.blocks[0];
    const text = first?.kind === 'paragraph' ? first.text : { en: [], zh: [] };
    check((text.zh.length ? 'zh' : 'en') === e.side, `${tag} side`);
  }
  if (q.type === 'mcq') {
    const m = q as McqQuestion;
    const options = e.options ?? [];
    check(m.options.length === options.length, `${tag} ${m.options.length} options`);
    options.forEach((o, k) => check(side(m.options[k]?.text).startsWith(o), `${tag} option ${k + 1}`));
    check((m.statements?.length ?? 0) === (e.statements ?? 0), `${tag} ${m.statements?.length ?? 0} statements`);
    if (e.answer !== undefined) check(m.answerIndex === e.answer, `${tag} answer ${m.answerIndex}`);
    return;
  }
  const s = q as StructuredQuestion;
  const parts = e.parts ?? [];
  check(s.parts.length === parts.length, `${tag} ${s.parts.length} parts`);
  if (!parts.length) {
    check(s.marks === e.marks, `${tag} marks ${s.marks}`);
    if (e.answerSpace !== undefined) check(s.answerSpace === e.answerSpace, `${tag} space ${s.answerSpace}`);
  }
  parts.forEach((p, k) => {
    const part = s.parts[k];
    if (!part) return;
    const ptag = `${tag}(${String.fromCharCode(97 + k)})`;
    check(blocksText(part.blocks).startsWith(squash(p.text)), `${ptag} text`);
    check(part.marks === p.marks, `${ptag} marks ${part.marks}`);
    if (p.before) check(blocksText(part.blocksBefore).startsWith(p.before), `${ptag} before`);
    if (p.answerSpace !== undefined) check(part.answerSpace === p.answerSpace, `${ptag} space ${part.answerSpace}`);
    const subs = p.subParts ?? [];
    check((part.subParts?.length ?? 0) === subs.length, `${ptag} ${part.subParts?.length ?? 0} sub-parts`);
    subs.forEach((sp, j) => {
      const sub = part.subParts?.[j];
      if (!sub) return;
      check(blocksText(sub.blocks).startsWith(squash(sp.text)), `${ptag}(${j + 1}) text`);
      check(sub.marks === sp.marks, `${ptag}(${j + 1}) marks ${sub.marks}`);
      if (sp.answerSpace !== undefined) check(sub.answerSpace === sp.answerSpace, `${ptag}(${j + 1}) space ${sub.answerSpace}`);
    });
  });
}
