import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiError, type AiClient } from '@/ai/types';
import { createParagraphBlock, createStructuredQuestion, createWorksheet } from '@/model/factories';
import { collectTexts, mapWorksheetTexts } from '@/model/textWalk';
import type { TextPath } from '@/model/textSlots';
import type { OutputMode, RichText, Worksheet } from '@/model/types';
import { writeSecret } from '@/platform/secrets';
import { useAppDialogs } from '@/store/appDialogs';
import { useWorksheetStore } from '@/store/worksheetStore';
import { buildAcceptanceWorksheet } from '@/test/fixtures';
import { createRunDeps } from '@/translate/deps';
import { oneSided, referenceClient, reply, payloadOf, scriptedClient } from '@/translate/testKit';
import type { VerbContext, VerbIO } from '../types';
import { translateVerb, type TranslateVerbDeps } from './translate';
import { CHANGED_WHILE_TRANSLATING, fillCount, textsIn } from './translateShared';

/**
 * The fill verbs over the real engine, glossary, Settings and store; only the AiClient is
 * a fake, swapped into the deps `createRunDeps` resolved.
 */

class FakeStorage {
  data = new Map<string, string>();
  getItem = (key: string) => this.data.get(key) ?? null;
  setItem = (key: string, value: string) => void this.data.set(key, value);
  removeItem = (key: string) => void this.data.delete(key);
}

beforeAll(async () => {
  const local = new FakeStorage();
  local.setItem('econgen.settings.ai', JSON.stringify({ v: 1, provider: 'deepseek' }));
  vi.stubGlobal('window', { localStorage: local, sessionStorage: new FakeStorage(), addEventListener: () => {}, removeEventListener: () => {} });
  await writeSecret('ai:deepseek', 'sk-deepseek-12345678', { remember: false });
});
afterAll(() => vi.unstubAllGlobals());

const store = () => useWorksheetStore.getState();
const BILINGUAL: OutputMode = { language: 'bilingual', version: 'student' };

function load(worksheet: Worksheet) {
  useWorksheetStore.setState({ worksheet, past: [], future: [], dirty: false, readOnly: false });
}

function editZh(paths: ReadonlySet<TextPath>, zh: RichText = [{ text: '老師自己寫的。' }]) {
  useWorksheetStore.setState({
    worksheet: mapWorksheetTexts(store().worksheet, (slot) => (paths.has(slot.path) ? { ...slot.text, zh } : slot.text)),
  });
}

function depsWith(client: AiClient, over: Partial<TranslateVerbDeps> = {}): TranslateVerbDeps & { resolved: number } {
  const deps = {
    resolved: 0,
    createRunDeps: async (opts?: { glossary?: boolean }) => {
      deps.resolved += 1;
      const resolved = await createRunDeps(opts);
      return resolved.ok ? { ...resolved, deps: { ...resolved.deps, client } } : resolved;
    },
    includeTeacherText: () => true,
    desktop: () => false,
    ...over,
  };
  return deps;
}

const ctx = (mode: OutputMode = BILINGUAL, scope: VerbContext['scope'] = { kind: 'paper' }): VerbContext => ({
  worksheet: store().worksheet,
  mode,
  scope,
  scopeLabel: 'Whole paper',
});
const io = (controller = new AbortController()): VerbIO & { progress: ReturnType<typeof vi.fn> } => ({
  signal: controller.signal,
  progress: vi.fn(),
});

/** One question, a paragraph per `[en, zh]` pair. */
function paperOf(pairs: Array<[string, string]>): Worksheet {
  const para = ([en, zh]: [string, string]) => ({ ...createParagraphBlock(), text: { en: en ? [{ text: en }] : [], zh: zh ? [{ text: zh }] : [] } });
  return { ...createWorksheet(), questions: [{ ...createStructuredQuestion(), blocks: pairs.map(para) }] };
}

beforeEach(() => useAppDialogs.setState({ notice: null }));

describe('Fill missing 中文 over the real engine and store', () => {
  it('counts texts as Setup did, and sends nothing before the click', () => {
    load(oneSided(buildAcceptanceWorksheet(), 'en'));
    const client = referenceClient(buildAcceptanceWorksheet());
    const deps = depsWith(client);
    const zh = translateVerb('zh', false, deps);
    const availability = zh.available(ctx());
    expect(availability?.count).toBeGreaterThan(0);
    expect(zh.sendsLine?.(ctx(), 'DeepSeek')).toMatch(/^Sends \d+ texts to DeepSeek with your key$/);
    expect(translateVerb('en', false, deps).available(ctx())).toBeNull();
    // Re-translate is never offered for the whole paper, nor where no text has both sides.
    expect(translateVerb('zh', true, deps).available(ctx())).toBeNull();
    const q = store().worksheet.questions[0].id;
    expect(translateVerb('zh', true, deps).available(ctx(BILINGUAL, { kind: 'questions', ids: [q] }))).toBeNull();
    expect(client.requests).toHaveLength(0);
    expect(deps.resolved).toBe(0);
  });

  it('inserts every answer in one commit; Undo all restores the paper and retires on a later edit', async () => {
    load(oneSided(buildAcceptanceWorksheet(), 'en'));
    const before = store().worksheet;
    const client = referenceClient(buildAcceptanceWorksheet());
    const verb = translateVerb('zh', false, depsWith(client));
    const expected = verb.available(ctx())!.count!;
    const run = io();
    const outcome = await verb.run(ctx(), run);
    if (outcome.kind !== 'inserted') throw new Error(outcome.kind);
    expect(store().past).toHaveLength(1);
    expect(outcome.showSide).toBe('zh');
    const filled = outcome.items.filter((i) => i.tone !== 'failed').length;
    expect(filled).toBe(expected);
    expect(outcome.summary).toMatch(new RegExp(`^Filled ${expected} 中文 texts`));
    expect(outcome.items.filter((i) => i.targetKey !== undefined).length).toBeGreaterThan(expected / 2);
    expect(run.progress).toHaveBeenCalledWith(0, expect.any(Number), 'Translating into 中文');

    expect(outcome.undo?.live()).toBe(true);
    outcome.undo!.run();
    expect(store().worksheet).toBe(before);
    expect(outcome.undo?.live()).toBe(false);
  });

  it('a hard failure is never inserted; it comes back as a failed item with the reason', async () => {
    load(paperOf([['Explain why the price rises.', ''], ['Supply falls.', '供應下降。']]));
    // Echoing the source is "untranslated": a fail, on both passes.
    const echo = scriptedClient([(req) => reply(payloadOf(req).groups.flatMap((g) => g.items).map((i) => [i.key, i.text]))]);
    const outcome = await translateVerb('zh', false, depsWith(echo)).run(ctx(), io());
    if (outcome.kind !== 'inserted') throw new Error(outcome.kind);
    expect(store().past).toHaveLength(0);
    expect(outcome.undo).toBeNull();
    expect(outcome.items).toHaveLength(1);
    expect(outcome.items[0]).toMatchObject({ tone: 'failed', source: 'Explain why the price rises.' });
    expect(outcome.items[0].notes[0]).toMatch(/^Couldn't translate this text safely/);
    expect(outcome.summary).toMatch(/couldn't be translated/);
  });

  it('a text edited while translating is skipped by its stale guard and reported', async () => {
    load(oneSided(buildAcceptanceWorksheet(), 'en'));
    const ref = referenceClient(buildAcceptanceWorksheet());
    const [first] = collectTexts(store().worksheet).filter((s) => s.text.zh.length === 0 && s.text.en.length > 0 && !s.unprinted);
    const client: AiClient = { ...ref, complete: async (req) => { editZh(new Set([first.path])); return ref.complete(req); } };
    const outcome = await translateVerb('zh', false, depsWith(client)).run(ctx(), io());
    if (outcome.kind !== 'inserted') throw new Error(outcome.kind);
    expect(store().past).toHaveLength(1);
    const skipped = outcome.items.find((i) => i.id === first.path);
    expect(skipped).toMatchObject({ tone: 'failed', notes: [CHANGED_WHILE_TRANSLATING] });
    expect(outcome.summary).toMatch(/1 changed while translating/);
  });

  it('Stop keeps the finished chunks and inserts them', async () => {
    const pairs = Array.from({ length: 70 }, (_, i): [string, string] => [`Paragraph ${i + 1} explains supply.`, `段落${i + 1}解釋供應。`]);
    load(oneSided(paperOf(pairs), 'en'));
    const ref = referenceClient(paperOf(pairs));
    const controller = new AbortController();
    let calls = 0;
    const client: AiClient = {
      ...ref,
      complete: async (req) => {
        calls += 1;
        if (calls === 1) return ref.complete(req);
        controller.abort();
        throw new AiError({ kind: 'cancelled', provider: 'deepseek', message: 'Stopped.', fatal: false, actions: [] });
      },
    };
    const outcome = await translateVerb('zh', false, depsWith(client)).run(ctx(), io(controller));
    if (outcome.kind !== 'inserted') throw new Error(outcome.kind);
    expect(outcome.summary).toMatch(/^Stopped · Filled \d+ 中文 texts/);
    const filled = outcome.items.filter((i) => i.tone === 'inserted').length;
    expect(filled).toBeGreaterThan(0);
    expect(filled).toBeLessThan(70);
    expect(store().past).toHaveLength(1);
  });

  it('a warning is inserted as a look item whose action takes it back out in one commit', async () => {
    load(paperOf([['Demand for salt is price inelastic.', '']]));
    const reversed = scriptedClient([(req) => reply(payloadOf(req).groups.flatMap((g) => g.items).map((i) => [i.key, '食鹽的需求富價格彈性。']))]);
    const outcome = await translateVerb('zh', false, depsWith(reversed)).run(ctx(), io());
    if (outcome.kind !== 'inserted') throw new Error(outcome.kind);
    const [look] = outcome.items;
    expect(look.tone).toBe('look');
    expect(look.notes.join(' ')).toMatch(/Meaning reversed\?/);
    expect(store().past).toHaveLength(1);
    look.action!.run();
    expect(store().past).toHaveLength(2);
    const slot = collectTexts(store().worksheet).find((s) => s.path === look.id)!;
    if (look.action!.label === 'Remove') expect(slot.text.zh).toEqual([]);
    else expect(slot.text.zh).not.toEqual([{ text: '食鹽的需求富價格彈性。' }]);
  });

  it('only symbol copies in a 中文 edition: written with no request at all', async () => {
    load(paperOf([['Explain market failure.', '解釋市場失效。'], ['$14 000', '']]));
    const client = scriptedClient(['{}']);
    const deps = depsWith(client);
    const zhOnly: OutputMode = { language: 'zh', version: 'student' };
    const verb = translateVerb('zh', false, deps);
    expect(verb.available(ctx(BILINGUAL))).toBeNull();
    expect(verb.available(ctx(zhOnly))?.count).toBe(1);
    const outcome = await verb.run(ctx(zhOnly), io());
    expect(outcome).toMatchObject({ kind: 'inserted', summary: 'Filled 1 中文 text' });
    expect(client.requests).toHaveLength(0);
    expect(deps.resolved).toBe(0);
  });
});

describe('errors', () => {
  it('a run that cannot start is an error outcome with its Settings action', async () => {
    load(paperOf([['Supply falls.', '']]));
    const deps = depsWith(scriptedClient(['{}']), {
      createRunDeps: async () => ({ ok: false, provider: 'gemini', reason: 'noKey' }),
    });
    const outcome = await translateVerb('zh', false, deps).run(ctx(), io());
    expect(outcome).toMatchObject({ kind: 'error', error: { kind: 'notConfigured', fatal: true, actions: ['openSettings'] } });
    expect(store().past).toHaveLength(0);
  });

  it('a fatal provider error before anything finished writes nothing', async () => {
    load(paperOf([['Supply falls.', '']]));
    const region = new AiError({ kind: 'region', provider: 'gemini', message: 'Not available in your region.', fatal: true, actions: ['switchProvider'] });
    const outcome = await translateVerb('zh', false, depsWith(scriptedClient([region]))).run(ctx(), io());
    expect(outcome).toMatchObject({ kind: 'error', error: { kind: 'region' } });
    expect(store().past).toHaveLength(0);
  });
});

describe('the unit', () => {
  it('a deduped job counts every text it prints', () => {
    load(oneSided(paperOf([['Supply falls.', '供應下降。'], ['Supply falls.', '供應下降。']]), 'en'));
    const verb = translateVerb('zh', false, depsWith(scriptedClient(['{}'])));
    const q = store().worksheet.questions[0].id;
    expect(verb.available(ctx(BILINGUAL, { kind: 'questions', ids: [q] }))?.count).toBe(2);
    const plan = { jobs: new Map([['t1', { slots: [{}, {}] }]]), copies: [{}] } as never;
    expect(textsIn(plan)).toBe(2);
    expect(fillCount(plan)).toBe(3);
  });
});
