import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { presetFor } from '@/ai/providers';
import { SOURCE_EN, mcqReply, replyText } from '@/generate/fixtures';
import { createWorksheetFrom } from '@/model/newWorksheet';
import { useWorksheetStore } from '@/store/worksheetStore';
import { scriptedClient } from '@/translate/testKit';
import { openAi, useAiMenu } from '../menuStore';
import { registerVerb, resetVerbsForTest, verbById } from '../registry';
import { resetAiRunForTest, useAiRun } from '../runStore';
import type { VerbContext } from '../types';
import { makeFromSourceVerb } from './fromSource';

const preset = presetFor('gemini');
const store = () => useWorksheetStore.getState();

function register(replies: Parameters<typeof scriptedClient>[0]) {
  const client = scriptedClient(replies);
  registerVerb(makeFromSourceVerb(async () => ({ ok: true, deps: { client, preset, glossary: null } })));
  return client;
}

describe('create.fromSource', () => {
  beforeEach(() => {
    resetVerbsForTest();
    resetAiRunForTest();
    useAiMenu.getState().close();
    store().replaceWorksheet(createWorksheetFrom({ documentType: 'paper1' }));
    store().setMode({ language: 'en', version: 'student' });
  });
  afterEach(() => resetAiRunForTest());

  it('declares its menu entry: create group, a pasted-source input, needs a key', () => {
    register([]);
    const verb = verbById('create.fromSource')!;
    const ctx: VerbContext = { worksheet: store().worksheet, mode: store().mode, scope: { kind: 'paper' }, scopeLabel: 'Whole paper' };
    expect(verb).toMatchObject({ group: 'create', needsKey: true, input: { kind: 'text', label: 'Paste a source', minChars: 80 } });
    expect(verb.label(ctx)).toBe('Questions from a source…');
    expect(verb.available(ctx)).toEqual({});
    expect(verb.sendsLine?.(ctx, 'Google Gemini')).toBe('Sends your source to Google Gemini with your key; adds 4 MCQs');
  });

  it('inserts the passing items directly, reports the failed one, and undoes as one', async () => {
    const bad = { ...mcqReply('en'), answer: 7 };
    const client = register([replyText([mcqReply('en', { combination: true }), mcqReply('en'), bad, mcqReply('en')])]);
    const before = store().worksheet;
    openAi({ scope: { kind: 'paper' }, scopeLabel: 'Whole paper' });
    await useAiRun.getState().startVerb('create.fromSource', SOURCE_EN);
    expect(client.requests).toHaveLength(1);

    const phase = useAiRun.getState().phase;
    if (phase.kind !== 'review' || phase.outcome.kind !== 'inserted') throw new Error(`unexpected ${phase.kind}`);
    const { outcome } = phase;
    expect(outcome.summary).toBe('Added 3 questions from your source; 1 failed the checks.');
    expect(outcome.items.map((i) => [i.tone, i.where])).toEqual([
      ['inserted', 'Question 2'],
      ['inserted', 'Question 3'],
      ['inserted', 'Question 4'],
      ['failed', 'MCQ 3'],
    ]);
    expect(outcome.items[3].notes).toEqual(['Its answer is not one of A–D', 'Not added']);
    expect(store().worksheet.questions).toHaveLength(4);
    // Keys and explanations are teacher-only: the view switches to show them.
    expect(store().mode.version).toBe('teacher');

    expect(outcome.undo?.live()).toBe(true);
    useAiRun.getState().undoAll();
    expect(store().worksheet).toBe(before);
    expect(useAiRun.getState().phase.kind).toBe('idle');
  });

  it("its Undo retires once another edit lands, never undoing someone else's commit", async () => {
    register([replyText([mcqReply('en', { combination: true })])]);
    await useAiRun.getState().startVerb('create.fromSource', SOURCE_EN);
    const phase = useAiRun.getState().phase;
    if (phase.kind !== 'review' || phase.outcome.kind !== 'inserted') throw new Error('expected inserted');
    store().updateWorksheet({ examGapLines: 4 });
    const after = store().worksheet;
    expect(phase.outcome.undo?.live()).toBe(false);
    phase.outcome.undo?.run();
    expect(store().worksheet).toBe(after);
  });

  it('a bilingual paper with an English source notes that the source stays as pasted', async () => {
    store().setMode({ language: 'bilingual' });
    register([replyText([mcqReply('both', { combination: true }), mcqReply('both'), mcqReply('both'), mcqReply('both')])]);
    await useAiRun.getState().startVerb('create.fromSource', SOURCE_EN);
    const phase = useAiRun.getState().phase;
    if (phase.kind !== 'review' || phase.outcome.kind !== 'inserted') throw new Error('expected inserted');
    const batch = phase.outcome.items.find((i) => i.id === 'fromSource:batch');
    expect(batch).toMatchObject({ tone: 'look', where: 'From your source' });
    expect(batch?.notes).toEqual(['The source is kept as pasted (English); Fill missing translates it.']);
  });

  it('adds nothing when every item fails, or the source is too short', async () => {
    const client = register([replyText([{ ...mcqReply('en'), options: [] }])]);
    const before = store().worksheet;
    await useAiRun.getState().startVerb('create.fromSource', SOURCE_EN);
    expect(useAiRun.getState().phase).toMatchObject({ kind: 'review', outcome: { kind: 'findings', items: [{ tone: 'failed' }] } });
    expect(store().worksheet).toBe(before);

    useAiRun.getState().dismiss();
    await useAiRun.getState().startVerb('create.fromSource', 'Too short.');
    expect(useAiRun.getState().phase).toMatchObject({ kind: 'review', outcome: { kind: 'nothing' } });
    expect(client.requests).toHaveLength(1);
  });

  it('without a provider it asks for setup instead of sending', async () => {
    registerVerb(makeFromSourceVerb(async () => ({ ok: false, provider: 'gemini' })));
    await useAiRun.getState().startVerb('create.fromSource', SOURCE_EN);
    expect(useAiRun.getState().phase).toMatchObject({ kind: 'error', error: { kind: 'notConfigured' } });
  });

  it('Stop adds nothing', async () => {
    register([
      (req) =>
        new Promise<string>((_, reject) => {
          req.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }) as unknown as string,
    ]);
    const before = store().worksheet;
    const running = useAiRun.getState().startVerb('create.fromSource', SOURCE_EN);
    await new Promise((resolve) => setTimeout(resolve, 0));
    useAiRun.getState().stop();
    await running;
    expect(useAiRun.getState().phase).toMatchObject({ kind: 'review', outcome: { kind: 'nothing', summary: 'Stopped. Nothing was added.' } });
    expect(store().worksheet).toBe(before);
  });
});
