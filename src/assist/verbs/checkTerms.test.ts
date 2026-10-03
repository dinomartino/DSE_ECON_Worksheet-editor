import { beforeEach, describe, expect, it } from 'vitest';
import { createParagraphBlock, createStructuredQuestion, createWorksheet } from '@/model/factories';
import { migrate } from '@/model/migrations';
import { collectTexts, mapWorksheetTexts } from '@/model/textWalk';
import type { Worksheet } from '@/model/types';
import { useAppDialogs } from '@/store/appDialogs';
import { useWorksheetStore } from '@/store/worksheetStore';
import { readCorpus } from '@/translate/testKit';
import { registerVerb, resetVerbsForTest } from '../registry';
import { resetAiRunForTest, useAiRun } from '../runStore';
import type { VerbContext, VerbOutcome } from '../types';
import { checkTermsVerb } from './checkTerms';

/** Check terms over the real glossary and store: findings, one fix, Replace N. */

const store = () => useWorksheetStore.getState();
const load = (worksheet: Worksheet) => useWorksheetStore.setState({ worksheet, past: [], future: [], dirty: false, readOnly: false });
const ctx = (): VerbContext => ({ worksheet: store().worksheet, mode: { language: 'bilingual', version: 'student' }, scope: { kind: 'paper' }, scopeLabel: 'Whole paper' });
const io = { signal: new AbortController().signal, progress: () => {} };
const zhOf = () => new Map(collectTexts(store().worksheet).map((slot) => [slot.path, slot.text.zh]));

function paperOf(pairs: Array<[string, string]>): Worksheet {
  const para = ([en, zh]: [string, string]) => ({ ...createParagraphBlock(), text: { en: [{ text: en }], zh: [{ text: zh }] } });
  return { ...createWorksheet(), questions: [{ ...createStructuredQuestion(), blocks: pairs.map(para) }] };
}

async function check(worksheet: Worksheet): Promise<Extract<VerbOutcome, { kind: 'findings' }>> {
  load(worksheet);
  const outcome = await checkTermsVerb().run(ctx(), io);
  if (outcome.kind !== 'findings') throw new Error(outcome.kind);
  return outcome;
}

/** One entry's old form twice, and one it cannot fix (a space inside it) beside a fixable one. */
const priceLevelPaper = () => paperOf([
  ['The price level rises and the price level falls.', '價格水平上升，價格水平下降。'],
  ['The price level rises; total revenue falls.', '價格 水平上升；總收益下降。'],
]);

beforeEach(() => useAppDialogs.setState({ notice: null }));

describe('Check terms', () => {
  it('is keyless, offered only where text has both sides, and says when everything matches', async () => {
    const verb = checkTermsVerb();
    expect(verb.needsKey).toBe(false);
    load(paperOf([['Explain market failure.', '']]));
    const question = { ...ctx(), scope: { kind: 'questions' as const, ids: [store().worksheet.questions[0].id] } };
    expect(verb.available(question)).toBeNull();
    load(paperOf([['Explain market failure.', '解釋市場失效。']]));
    expect(verb.available(ctx())).toEqual({});
    // market failure, and a term in the default instructions.
    expect(await verb.run(ctx(), io)).toEqual({ kind: 'nothing', summary: '2 terms match the EDB glossary' });
    const only = () => ({ ...ctx(), scope: { kind: 'questions' as const, ids: [store().worksheet.questions[0].id] } });
    expect(await verb.run(only(), io)).toEqual({ kind: 'nothing', summary: '1 term matches the EDB glossary' });
    load(paperOf([['Explain it.', '解釋。']]));
    expect(await verb.run(only(), io)).toEqual({ kind: 'nothing', summary: 'No EDB glossary terms found' });
  });

  it('counts the terms that already match beside the findings', async () => {
    const outcome = await check(paperOf([
      ['Explain market failure.', '解釋市場失靈。'],
      ['Explain the opportunity cost.', '解釋機會成本。'],
    ]));
    // opportunity cost, and a term in the default instructions.
    expect(outcome.summary).toBe('1 to fix · 2 match');
  });

  it("a card's fix updates the bar at once: summary, chips and Replace N re-read the paper", async () => {
    resetVerbsForTest();
    resetAiRunForTest();
    registerVerb(checkTermsVerb());
    load(priceLevelPaper());
    useWorksheetStore.getState().setMode({ language: 'bilingual', version: 'student' });
    await useAiRun.getState().startVerb('check.terms');
    const before = useAiRun.getState().phase;
    if (before.kind !== 'review' || before.outcome.kind !== 'findings') throw new Error(before.kind);
    expect(before.outcome.applyAll?.label).toBe('Replace 3');
    const index = before.outcome.items.findIndex((i) => i.action?.label === 'Replace with 總收入');
    useAiRun.getState().act(index);
    const after = useAiRun.getState().phase;
    if (after.kind !== 'review' || after.outcome.kind !== 'findings') throw new Error(after.kind);
    expect(after.runId).toBe(before.runId);
    expect(after.outcome.items[index].resolved).toBe(true);
    expect(after.outcome.applyAll?.label).toBe('Replace 2');
    expect(after.outcome.summary).not.toBe(before.outcome.summary);
    // Replace N now reads the fixed text: the rest of that row is not skipped as stale.
    after.outcome.applyAll!.run();
    expect(useAppDialogs.getState().notice?.message).toBe('Replaced 2 terms');
    useAiRun.getState().act(index);
    expect(store().past).toHaveLength(2);
    resetAiRunForTest();
  });

  it("a card's fix that finds its text changed stays open", async () => {
    resetVerbsForTest();
    resetAiRunForTest();
    registerVerb(checkTermsVerb());
    load(priceLevelPaper());
    await useAiRun.getState().startVerb('check.terms');
    const phase = useAiRun.getState().phase;
    if (phase.kind !== 'review' || phase.outcome.kind !== 'findings') throw new Error(phase.kind);
    const index = phase.outcome.items.findIndex((i) => i.action);
    useWorksheetStore.setState({
      worksheet: mapWorksheetTexts(store().worksheet, (slot) => ({ ...slot.text, zh: [{ text: '老師自己寫的。' }] })),
    });
    useAiRun.getState().act(index);
    expect(useAiRun.getState().phase).toBe(phase);
    expect(useAppDialogs.getState().notice?.message).toMatch(/^Nothing replaced/);
    resetAiRunForTest();
  });

  it('Replace N applies the safe fixes in one commit, flashes an Undo that restores the paper', async () => {
    const outcome = await check(priceLevelPaper());
    const before = JSON.stringify(store().worksheet);
    expect(outcome.items).toHaveLength(4);
    expect(outcome.items.every((i) => i.tone === 'finding' && i.notes.length > 0)).toBe(true);
    expect(outcome.items.filter((i) => !i.action)).toHaveLength(1);
    expect(outcome.applyAll?.label).toBe('Replace 3');
    outcome.applyAll!.run();
    expect(store().past).toHaveLength(1);
    const notice = useAppDialogs.getState().notice!;
    expect(notice.message).toBe('Replaced 3 terms');
    const paths = [...new Set(outcome.items.map((i) => i.id.split('#')[0]))];
    expect(paths.map((p) => zhOf().get(p))).toEqual([[{ text: '物價水平上升，物價水平下降。' }], [{ text: '價格 水平上升；總收入下降。' }]]);
    notice.action!.run();
    expect(JSON.stringify(store().worksheet)).toBe(before);
  });

  it('Replace N takes wrong forms only; a textbook variant and a lower rank are one click each', async () => {
    const outcome = await check(paperOf([
      ['Explain market failure.', '解釋市場失靈。'],
      ['The tax incidence falls on buyers.', '稅項歸宿落在買方。'],
      ['Explain the deadweight loss.', '解釋無謂損失。'],
    ]));
    expect(outcome.summary).toBe('1 to fix · 1 textbook variant · 1 acceptable but not the first choice · 1 match');
    expect(outcome.applyAll?.label).toBe('Replace 1');
    outcome.applyAll!.run();
    const [wrong, variant, lower] = outcome.items;
    expect(zhOf().get(wrong.id.split('#')[0])).toEqual([{ text: '解釋市場失效。' }]);
    expect(variant.notes.at(-1)).toMatch(/^A textbook form; EDB lists .+ first\.$/);
    expect(lower.action?.label).toMatch(/^Replace with /);
    variant.action!.run();
    expect(store().past).toHaveLength(2);
    expect(zhOf().get(variant.id.split('#')[0])).not.toEqual([{ text: '稅項歸宿落在買方。' }]);
  });

  it('a text edited since the check is not replaced: no commit, and it says so', async () => {
    const outcome = await check(priceLevelPaper());
    useWorksheetStore.setState({
      worksheet: mapWorksheetTexts(store().worksheet, (slot) => ({ ...slot.text, zh: [{ text: '老師自己寫的。' }] })),
    });
    outcome.applyAll!.run();
    expect(store().past).toHaveLength(0);
    expect(useAppDialogs.getState().notice?.message).toMatch(/^Nothing replaced/);
  });

  it('on the v1 corpus, a finding fix lands at the path the check read', async () => {
    const outcome = await check({ ...migrate(structuredClone(readCorpus())), id: 'corpus' });
    const item = outcome.items.find((i) => i.action?.label === 'Replace with 稅收承擔')!;
    expect(item.targetKey).toBeDefined();
    item.action!.run();
    expect(store().past).toHaveLength(1);
    expect(JSON.stringify(zhOf().get(item.id.split('#')[0]))).toContain('稅收承擔');
  });
});
