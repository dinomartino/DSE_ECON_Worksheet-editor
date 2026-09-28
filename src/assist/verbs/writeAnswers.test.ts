import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { presetFor } from '@/ai/providers';
import type { CompletionRequest } from '@/ai/types';
import { answersPaper, cannedReply } from '@/answers/testKit';
import { schemeMax } from '@/model/markScheme';
import { plain } from '@/model/text';
import type { StructuredQuestion } from '@/model/types';
import { useWorksheetStore } from '@/store/worksheetStore';
import { scriptedClient } from '@/translate/testKit';
import { openAi, useAiMenu } from '../menuStore';
import { registerVerb, verbById } from '../registry';
import { resetAiRunForTest, useAiRun } from '../runStore';
import { makeWriteAnswersVerb } from './writeAnswers';

const store = () => useWorksheetStore.getState();
const q1 = () => store().worksheet.questions.find((q) => q.id === 'Q1') as StructuredQuestion;

function install(reply: (req: CompletionRequest) => string) {
  const client = scriptedClient([reply]);
  registerVerb(makeWriteAnswersVerb(async () => ({ ok: true, deps: { client, preset: { ...presetFor('gemini'), concurrency: 1 }, model: 'fake', glossary: null } })));
  return client;
}

describe('write.answers through useAiRun', () => {
  beforeEach(() => {
    resetAiRunForTest();
    useAiMenu.getState().close();
    store().replaceWorksheet(answersPaper().ws);
    store().setMode({ language: 'en', version: 'student' });
  });
  afterEach(() => resetAiRunForTest());

  it('is offered with a count of parts, and hidden when nothing is fillable', () => {
    install(cannedReply);
    const verb = verbById('write.answers')!;
    const ctx = { worksheet: store().worksheet, mode: store().mode, scope: { kind: 'paper' as const }, scopeLabel: 'Whole paper' };
    expect(verb.available(ctx)).toEqual({ count: 4, unit: 'parts' });
    expect(verb.sendsLine?.(ctx, 'Google Gemini')).toBe('Sends 4 parts to Google Gemini with your key');
    expect(verb.available({ ...ctx, scope: { kind: 'questions', ids: ['nope'] } })).toBeNull();
  });

  it('inserts in one commit, shows the teacher version, reviews each part and undoes exactly that commit', async () => {
    install(cannedReply);
    const before = store().worksheet;
    const history = store().past.length;
    openAi({ scope: { kind: 'paper' }, scopeLabel: 'Whole paper' });
    await useAiRun.getState().startVerb('write.answers');

    const phase = useAiRun.getState().phase;
    expect(phase.kind).toBe('review');
    if (phase.kind !== 'review' || phase.outcome.kind !== 'inserted') throw new Error('not inserted');
    expect(phase.outcome.summary).toBe('Wrote 4 answers');
    expect(phase.outcome.items.map((i) => [i.tone, i.where, i.targetKey !== undefined])).toEqual([
      ['inserted', 'Question 1 (a)', true],
      ['inserted', 'Question 1 (b)(i)', true],
      // A scheme alone has no page text to point at: the question is the address.
      ['inserted', 'Question 1 (b)(ii)', false],
      ['inserted', 'Question 2', true],
    ]);
    expect(store().past.length).toBe(history + 1);
    expect(store().mode.version).toBe('teacher');
    expect(plain(q1().parts[0].answer!.en)).toBe('Answer (a)');
    expect(schemeMax(q1().parts[1].subParts![0].scheme!)).toBe(2);

    useAiRun.getState().undoAll();
    expect(store().worksheet).toBe(before);
  });

  it('reports a scheme that does not add up as look, and inserts the answer alone', async () => {
    install((req) => cannedReply(req, (item) => (item.key === 'a1' ? { ...item, points: item.points.slice(1) } : item)));
    await useAiRun.getState().startVerb('write.answers');
    const phase = useAiRun.getState().phase;
    if (phase.kind !== 'review' || phase.outcome.kind !== 'inserted') throw new Error('not inserted');
    expect(phase.outcome.items[0]).toMatchObject({ tone: 'look', notes: ["Mark scheme didn't add up to 4 marks — not inserted"] });
    expect(q1().parts[0].answer).toBeDefined();
    expect(q1().parts[0].scheme).toBeUndefined();
  });

  it('an unreadable reply inserts nothing and reports failed items', async () => {
    install(() => 'no json at all');
    const before = store().worksheet;
    await useAiRun.getState().startVerb('write.answers');
    const phase = useAiRun.getState().phase;
    expect(phase).toMatchObject({ kind: 'review', outcome: { kind: 'findings', summary: 'Nothing inserted' } });
    if (phase.kind === 'review' && phase.outcome.kind === 'findings') {
      expect(phase.outcome.items.every((i) => i.tone === 'failed')).toBe(true);
    }
    expect(store().worksheet).toBe(before);
  });

  it('the store refuses another document or a read-only one', () => {
    const write = { key: 'a1', questionId: 'Q1', leafKey: 'part:PA', stamp: q1().parts[0], fill: { shape: 'written' as const, answer: { en: [{ text: 'x' }], zh: [] } } };
    expect(store().applyAnswerFills([write], { worksheetId: 'other' }).refused).toBe('otherDocument');
    useWorksheetStore.setState({ readOnly: true });
    expect(store().applyAnswerFills([write], { worksheetId: 'WS' }).refused).toBe('readOnly');
    useWorksheetStore.setState({ readOnly: false });
    expect(store().applyAnswerFills([write], { worksheetId: 'WS' }).applied).toEqual(['a1']);
  });

  it('the undo retires once a later edit lands', async () => {
    install(cannedReply);
    await useAiRun.getState().startVerb('write.answers');
    const phase = useAiRun.getState().phase;
    if (phase.kind !== 'review' || phase.outcome.kind !== 'inserted') throw new Error('not inserted');
    store().updateWorksheet({ name: 'Edited after' });
    expect(phase.outcome.undo?.live()).toBe(false);
  });
});
