import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { presetFor } from '@/ai/providers';
import type { AiClient } from '@/ai/types';
import { plain } from '@/model/text';
import { collectTexts } from '@/model/textWalk';
import { paperOf, polishPayload, polishReplyOf } from '@/polish/testKit';
import { useAppDialogs } from '@/store/appDialogs';
import { useWorksheetStore } from '@/store/worksheetStore';
import { scriptedClient } from '@/translate/testKit';
import { verbById } from '../registry';
import { resetAiRunForTest, useAiRun } from '../runStore';
import type { VerbContext } from '../types';
import './index';

/** Improve wording (k-0549) through the run store and the real document store, the AI mocked. */

const fake: { client: AiClient | null } = { client: null };
vi.mock('@/translate/deps', () => ({
  createRunDeps: async () => ({ ok: true, deps: { client: fake.client, preset: { ...presetFor('openai'), concurrency: 1 }, model: 'fake', glossary: null } }),
}));

const store = () => useWorksheetStore.getState();
const ctx = (scope: VerbContext['scope'] = { kind: 'paper' }): VerbContext => ({
  worksheet: store().worksheet,
  mode: { language: 'bilingual', version: 'student' },
  scope,
  scopeLabel: 'Whole paper',
});
const texts = () => new Map(collectTexts(store().worksheet).map((s) => [s.path, s.text]));

const Q = {
  stem: ['Suppose the price of Good X rises. Which one of the following will not happen?', '假設物品 X 的價格上升, 下面哪一個不會出現?'] as [string, string],
  options: [
    ['Its quantity demanded falls.', '其需求量下降。'],
    ['Its demand falls.', '其需求下降。'],
    ['Its supply rises by 10%.', '其供應上升 10%。'],
    ['Its total revenue may rise.', '其總收入可能上升。'],
  ] as Array<[string, string]>,
  answer: 1,
};

/** Rewords the stem (both languages) and option A; option C's number moves (refused). */
const reply = () =>
  scriptedClient([
    (req) =>
      polishReplyOf(polishPayload(req).questions.map((q) => ({
        q: q.q,
        answer: q.answer,
        fields: [
          { id: `${q.q}.stem1`, en: 'Suppose the price of Good X rises. Which of the following will <b>NOT</b> happen?', zh: '假設物品 X 的價格上升，下列哪項<b>不會</b>出現？', why: { en: 'Negative in bold capitals.', zh: '否定字用粗體。' } },
          { id: `${q.q}.A`, en: 'Its quantity demanded will fall.', zh: '其需求量會下降。' },
          { id: `${q.q}.C`, en: 'Its supply rises by 20%.', zh: '其供應上升 20%。' },
        ],
      }))),
  ]);

async function run() {
  await useAiRun.getState().startVerb('check.wording');
  const phase = useAiRun.getState().phase;
  if (phase.kind !== 'review' || phase.outcome.kind !== 'findings') throw new Error(JSON.stringify(phase));
  return phase.outcome;
}

describe('check.wording (Improve wording)', () => {
  beforeEach(() => {
    resetAiRunForTest();
    useAppDialogs.setState({ notice: null });
    store().replaceWorksheet(paperOf(Q, Q));
    fake.client = reply();
  });
  afterEach(() => resetAiRunForTest());

  it('is offered next to Check terms for MC questions, with what it sends and an estimate', () => {
    const verb = verbById('check.wording')!;
    expect(verb).toMatchObject({ group: 'check', needsKey: true, order: 1 });
    expect(verbById('check.terms')!.order).toBeLessThan(verb.order);
    expect(verb.label(ctx())).toBe('Improve wording (HKDSE style)');
    expect(verb.available(ctx())).toEqual({ count: 2, unit: 'questions' });
    // The essay is not an MC question: not offered.
    expect(verb.available(ctx({ kind: 'questions', ids: [store().worksheet.questions[2].id] }))).toBeNull();
    expect(verb.sendsLine!(ctx(), 'Google Gemini')).toBe('Sends 2 MC questions to Google Gemini with your key. Nothing changes until you accept.');
    expect(verb.estimate!(ctx())).toMatchObject({ feature: 'polish' });
  });

  it('writes nothing by itself: a card per changed text with the diff and the reason; a moved number is shown, not offered', async () => {
    const before = store().worksheet;
    const outcome = await run();
    expect(store().worksheet).toBe(before);
    expect(outcome.summary).toMatch(/^6 suggested changes in 2 questions · HKDSE style notes \d+ → \d+$/);
    expect(outcome.applyAll?.label).toBe('Accept all (4)');
    expect(outcome.dismissLabel).toBe('Discard');
    const [stem, a, c] = outcome.items;
    expect(stem).toMatchObject({ tone: 'finding', kicker: 'Suggested wording', where: 'Question 1', notes: ['Negative in bold capitals.'] });
    expect(stem.targetKey).toBeTruthy();
    expect(stem.diff?.map((d) => d.side)).toEqual(['en', 'zh']);
    expect(stem.diff?.[1].after).toBe('假設物品 X 的價格上升，下列哪項不會出現？');
    expect(stem.action?.label).toBe('Accept');
    expect(a.where).toBe('Question 1 · Option A');
    expect(c).toMatchObject({ tone: 'failed', kicker: 'Not offered' });
    expect(c.action).toBeUndefined();
    expect(c.notes.at(-1)).toBe('A number changed (−10% +20%), so this change is not offered.');
  });

  it('Accept writes one text in one commit; the bar counts what is left', async () => {
    const outcome = await run();
    const path = collectTexts(store().worksheet).find((s) => s.kind === 'stem')!.path;
    const past = store().past.length;
    useAiRun.getState().act(0);
    expect(store().past.length).toBe(past + 1);
    expect(plain(texts().get(path)!.en)).toBe('Suppose the price of Good X rises. Which of the following will NOT happen?');
    expect(texts().get(path)!.en.find((r) => r.bold)?.text).toBe('NOT');
    const now = useAiRun.getState().phase;
    if (now.kind !== 'review' || now.outcome.kind !== 'findings') throw new Error(now.kind);
    expect(now.outcome.summary).toBe('3 suggestions left');
    expect(now.outcome.applyAll?.label).toBe('Accept all (3)');
    expect(now.outcome.dismissLabel).toBe('Discard the rest');
    expect(now.outcome.items[0].resolved).toBe(true);
    void outcome;
  });

  it('Accept all is one commit with one Undo, and skips a text the teacher edited meanwhile', async () => {
    const outcome = await run();
    const original = store().worksheet;
    // The teacher edits question 2's option A before accepting.
    const optionA2 = collectTexts(original).filter((s) => s.kind === 'option')[4];
    store().applyTranslations([{ path: optionA2.path, side: 'en', sourceSnapshot: optionA2.text.zh, targetSnapshot: optionA2.text.en, next: [{ text: 'Hand edit.' }] }], { worksheetId: original.id });
    const edited = store().worksheet;
    const past = store().past.length;
    outcome.applyAll!.run();
    expect(store().past.length).toBe(past + 1);
    expect(useAppDialogs.getState().notice?.message).toBe('Accepted 3 changes');
    expect(plain(texts().get(optionA2.path)!.en)).toBe('Hand edit.');
    useAppDialogs.getState().notice?.action?.run();
    expect(store().worksheet).toBe(edited);
  });

  it('says so when nothing needs changing', async () => {
    fake.client = scriptedClient([(req) => polishReplyOf(polishPayload(req).questions.map((q) => ({ q: q.q, answer: q.answer, fields: [] })))]);
    await useAiRun.getState().startVerb('check.wording');
    const phase = useAiRun.getState().phase;
    expect(phase.kind === 'review' && phase.outcome).toEqual({ kind: 'nothing', summary: 'No wording changes suggested for 2 questions' });
  });
});
