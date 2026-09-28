import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { presetFor } from '@/ai/providers';
import type { AiClient } from '@/ai/types';
import { editTargetKey } from '@/model/edits';
import { findingsReply, qualityWorksheet } from '@/quality/testKit';
import { useWorksheetStore } from '@/store/worksheetStore';
import { scriptedClient } from '@/translate/testKit';
import { openAi } from '../menuStore';
import { verbById } from '../registry';
import { resetAiRunForTest, useAiRun } from '../runStore';
import type { VerbContext } from '../types';
import './index';

const fake: { client: AiClient | null; ok: boolean } = { client: null, ok: true };

vi.mock('@/translate/deps', () => ({
  createRunDeps: async () =>
    fake.ok
      ? { ok: true, deps: { client: fake.client, preset: { ...presetFor('openai'), concurrency: 1 }, model: 'fake', glossary: null } }
      : { ok: false, provider: 'openai', reason: 'noKey' },
}));

const ctxFor = (scope: VerbContext['scope']): VerbContext => ({
  worksheet: useWorksheetStore.getState().worksheet,
  mode: { language: 'bilingual', version: 'teacher' },
  scope,
  scopeLabel: 'x',
});

describe('check.quality', () => {
  beforeEach(() => {
    resetAiRunForTest();
    fake.ok = true;
    useWorksheetStore.getState().replaceWorksheet(qualityWorksheet());
  });
  afterEach(() => resetAiRunForTest());

  it('is offered in the check group with a question count, and hidden with no questions in scope', () => {
    const verb = verbById('check.quality')!;
    expect(verb).toMatchObject({ group: 'check', needsKey: true });
    expect(verb.label(ctxFor({ kind: 'paper' }))).toBe('Check question quality');
    // The blank Q4 is not counted.
    expect(verb.available(ctxFor({ kind: 'paper' }))).toEqual({ count: 3, unit: 'questions' });
    expect(verb.available(ctxFor({ kind: 'questions', ids: ['Q4'] }))).toMatchObject({ disabledReason: expect.any(String) });
    expect(verb.available(ctxFor({ kind: 'questions', ids: [] }))).toBeNull();
    expect(verb.sendsLine!(ctxFor({ kind: 'questions', ids: ['Q1'] }), 'Google Gemini')).toBe(
      'Sends 1 question to Google Gemini with your key. Changes nothing.',
    );
  });

  it('runs through useAiRun to findings with page targets, and writes nothing', async () => {
    fake.client = scriptedClient([findingsReply([
      { key: 'q1.C', issue: 'wrongKey', severity: 'fix', text: 'C looks right, but check B.', suggestion: 'Replace B with “Entrepreneurship”.' },
      { key: 'q3', issue: 'ambiguous', text: 'The stem does not say which good.' },
    ])]);
    const before = useWorksheetStore.getState().worksheet;
    openAi({ scope: { kind: 'paper' }, scopeLabel: 'Whole paper' });
    await useAiRun.getState().startVerb('check.quality');
    const phase = useAiRun.getState().phase;
    expect(phase.kind).toBe('review');
    if (phase.kind !== 'review' || phase.outcome.kind !== 'findings') throw new Error('expected findings');
    expect(phase.outcome.summary).toBe('4 findings in 3 questions');
    expect(phase.outcome.applyAll).toBeUndefined();
    expect(phase.outcome.items.map((i) => [i.where, i.tone])).toEqual([
      ['Question 1 · Option C', 'finding'],
      ['Question 2 · Option C', 'finding'],
      ['Question 3', 'finding'],
      ['Question 3 (b)', 'finding'],
    ]);
    const [wrongKey, , whole, scheme] = phase.outcome.items;
    expect(wrongKey.targetKey).toBe(editTargetKey({ kind: 'mcqOption', questionId: 'Q1', optionId: 'Q1o2' }));
    expect(wrongKey.notes).toEqual(['C looks right, but check B.', 'Suggested: Replace B with “Entrepreneurship”.']);
    expect(whole).toMatchObject({ questionId: 'Q3' });
    expect(whole.targetKey).toBeUndefined();
    expect(scheme.targetKey).toMatch(/^blockText:/);
    expect(useWorksheetStore.getState().worksheet).toBe(before);
  });

  it('says so when nothing is found', async () => {
    fake.client = scriptedClient([findingsReply([])]);
    openAi({ scope: { kind: 'questions', ids: ['Q1'] }, scopeLabel: 'Question 1' });
    await useAiRun.getState().startVerb('check.quality');
    expect(useAiRun.getState().phase).toMatchObject({
      kind: 'review', outcome: { kind: 'nothing', summary: 'No problems found in 1 question' },
    });
  });

  it('an unconfigured provider is an error, before any request', async () => {
    fake.ok = false;
    openAi({ scope: { kind: 'paper' }, scopeLabel: 'Whole paper' });
    await useAiRun.getState().startVerb('check.quality');
    expect(useAiRun.getState().phase).toMatchObject({ kind: 'error', error: { kind: 'notConfigured' } });
  });
});
