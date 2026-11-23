/** ✦ AI → Check import (k-0494): the open paper against its file, fixes one commit each. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { presetFor } from '@/ai/providers';
import { GEMINI_REGION_MESSAGE } from '@/ai/errors';
import { AiError, type AiClient } from '@/ai/types';
import { analyseLines, buildImport, readPaste } from '@/import';
import { forgetImportsForTest, rememberImport } from '@/importCheck/sources';
import { materializeBatch } from '@/importCheck/run';
import { createWorksheet } from '@/model/factories';
import { plain } from '@/model/text';
import type { McqQuestion, Question, Worksheet } from '@/model/types';
import { useAppDialogs } from '@/store/appDialogs';
import { useWorksheetStore } from '@/store/worksheetStore';
import { scriptedClient } from '@/translate/testKit';
import { isPaused } from '../paused';
import { verbById } from '../registry';
import type { VerbContext, VerbOutcome } from '../types';
import './index';

const fake: { client: AiClient | null; ok: boolean } = { client: null, ok: false };
vi.mock('@/translate/deps', () => ({
  createRunDeps: async () =>
    fake.ok
      ? { ok: true, deps: { client: fake.client, preset: { ...presetFor('openai'), concurrency: 1 }, model: 'fake', glossary: null } }
      : { ok: false, provider: 'openai', reason: 'noKey' },
}));

const PAPER = [
  '1. Which of the following is a feature of a sole proprietorship?',
  'A. unlimited liability',
  'B. separate legal entity',
  'C. shares can be sold to the public',
  'D. many owners',
].join('\n');

function load(): Worksheet {
  const read = readPaste({ plain: PAPER });
  const analysis = analyseLines(read);
  const qs = materializeBatch(buildImport(analysis)).map((q) => structuredClone(q)) as Question[];
  const mc = qs[0] as McqQuestion;
  mc.options = [{ ...mc.options[0], text: { en: [{ text: 'unlimited liability  B. separate legal entity' }], zh: [] } }, mc.options[2], mc.options[3]];
  mc.blocks = [...mc.blocks, { kind: 'paragraph', id: 'junk', text: { en: [{ text: 'Turn over' }], zh: [] } }];
  const ws = { ...createWorksheet(), id: 'W-ic', questions: qs, flow: qs.map((q) => ({ type: 'question' as const, id: q.id })) };
  useWorksheetStore.setState({ worksheet: ws, past: [], future: [], dirty: false, readOnly: false });
  rememberImport(ws.id, { name: 'mock.docx', read, analysis });
  return ws;
}

const ctx = (): VerbContext => ({ worksheet: useWorksheetStore.getState().worksheet, mode: { language: 'en', version: 'student' }, scope: { kind: 'paper' }, scopeLabel: 'Whole paper' });
const io = { signal: new AbortController().signal, progress: () => {} };
const findings = (o: VerbOutcome) => {
  if (o.kind !== 'findings') throw new Error(`not findings: ${o.kind}`);
  return o;
};

beforeEach(() => {
  forgetImportsForTest();
  fake.ok = false;
  useAppDialogs.setState({ notice: null });
});

describe('check.import', () => {
  it('is registered, offered on a paper with questions, and live on develop (not paused)', () => {
    const verb = verbById('check.import')!;
    expect(verb).toMatchObject({ group: 'check', needsKey: false });
    expect(isPaused('check.import')).toBe(false);
    load();
    expect(verb.available(ctx())).toEqual({});
    expect(verb.label(ctx())).toBe('Check import');
    expect(verb.available({ ...ctx(), worksheet: createWorksheet() })).toBeNull();
  });

  it('the rules alone when no AI provider is set up, saying so', async () => {
    load();
    const out = findings(await verbById('check.import')!.run(ctx(), io));
    expect(out.summary).toBe('2 things to check · 2 safe fixes · No AI provider is set up (Settings → AI): only the rules ran');
    expect(out.items.map((i) => i.where)).toEqual(['Question 1 A', 'Question 1']);
    expect(out.items[0].notes[0]).toBe('2 options were read as one');
  });

  it('a card’s fix is one commit, undone by one ⌘Z, and the bar re-reads the paper', async () => {
    load();
    const out = findings(await verbById('check.import')!.run(ctx(), io));
    const before = useWorksheetStore.getState().worksheet;
    expect(out.items[0].action!.run()).toBe(true);
    const after = useWorksheetStore.getState().worksheet;
    expect((after.questions[0] as McqQuestion).options.map((o) => plain(o.text.en))).toEqual(['unlimited liability', 'separate legal entity', 'shares can be sold to the public', 'many owners']);
    expect(useWorksheetStore.getState().past).toHaveLength(1);
    expect(out.refresh!().summary).toMatch(/^1 thing to check · 1 safe fix/);
    useWorksheetStore.getState().undo();
    expect(useWorksheetStore.getState().worksheet).toBe(before);
  });

  it('Apply all safe fixes: one commit for all of them', async () => {
    load();
    const out = findings(await verbById('check.import')!.run(ctx(), io));
    out.applyAll!.run();
    expect(useWorksheetStore.getState().past).toHaveLength(1);
    expect(out.refresh!().summary).toBe('The paper matches the file: nothing to fix · No AI provider is set up (Settings → AI): only the rules ran');
  });

  it('with a provider, the AI’s checked findings join the rules’', async () => {
    load();
    fake.ok = true;
    fake.client = scriptedClient([JSON.stringify({ items: [{ key: 'q1', ref: 'C', issue: 'garbled', text: 'Looks fine but the model says so.', op: 'none', from: '', to: '', marks: 0 }] })]);
    const out = findings(await verbById('check.import')!.run(ctx(), io));
    expect(out.items.map((i) => i.notes[0])).toContain('AI: Looks fine but the model says so.');
    expect(out.items.find((i) => i.notes[0].startsWith('AI:'))!.action).toBeUndefined();
  });

  it('says when the AI found nothing, and why it failed when it did (k-0501)', async () => {
    load();
    fake.ok = true;
    fake.client = scriptedClient([JSON.stringify({ items: [] })]);
    const clean = findings(await verbById('check.import')!.run(ctx(), io));
    expect(clean.summary).toContain('AI checked 1 question: no problems found');
    fake.client = scriptedClient([new AiError({ kind: 'region', provider: 'gemini', message: GEMINI_REGION_MESSAGE, fatal: true, actions: [] })]);
    const failed = findings(await verbById('check.import')!.run(ctx(), io));
    expect(failed.summary).toContain(`AI check failed: ${GEMINI_REGION_MESSAGE}`);
  });
});

describe('check.import and the scope chip', () => {
  it('a selected question is checked alone', async () => {
    const ws = load();
    const out = await verbById('check.import')!.run({ ...ctx(), scope: { kind: 'questions', ids: ['not-this-one'] } }, io);
    expect(out.kind).toBe('nothing');
    const one = findings(await verbById('check.import')!.run({ ...ctx(), scope: { kind: 'questions', ids: [ws.questions[0].id] } }, io));
    expect(one.items).toHaveLength(2);
  });
});
