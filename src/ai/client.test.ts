import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDialectCache, createClient, testConnection } from './client';
import { fakeFetch, instantDeps, replyOf, type Reply } from './fakeFetch';
import { ITEMS_SCHEMA } from './schema';
import { isAiError, type AiErrorInfo, type CompletionRequest, type ProviderConfig } from './types';

const KEY = 'AIzaFAKEKEYFORTESTSONLY0123456789abcd';

const gemini: ProviderConfig = {
  provider: 'gemini',
  apiKey: KEY,
  model: 'gemini-3.5-flash-lite',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
};

const request = (signal = new AbortController().signal): CompletionRequest => ({
  system: 'S',
  turns: [{ role: 'user', content: '{"items":[{"key":"t1","text":"Price level"}]}' }],
  schema: ITEMS_SCHEMA,
  maxOutputTokens: 1000,
  signal,
});

const geminiOk = (text: string): Reply => ({
  status: 200,
  body: { candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] },
});
const ITEMS = '{"items":[{"key":"t1","text":"物價水平"}]}';

async function failure(promise: Promise<unknown>): Promise<AiErrorInfo> {
  try {
    await promise;
  } catch (error) {
    if (isAiError(error)) return error.info;
    throw error;
  }
  throw new Error('expected a failure');
}

beforeEach(() => {
  clearDialectCache();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('createClient().complete', () => {
  it('returns the text with its dialect, model and time', async () => {
    const { fetch } = fakeFetch([geminiOk(ITEMS)]);
    const result = await createClient(gemini, instantDeps(fetch).deps).complete(request());
    expect(result).toMatchObject({ text: ITEMS, finish: 'stop', dialect: 'gemini-jsonSchema', model: 'gemini-3.5-flash-lite' });
    expect(result.ms).toBeGreaterThan(0);
  });

  it('steps down the ladder on a schema rejection and caches the working rung per provider|model|baseUrl', async () => {
    const first = fakeFetch([replyOf('gemini-400-unknown-field'), geminiOk(ITEMS)]);
    const a = await createClient(gemini, instantDeps(first.fetch).deps).complete(request());
    expect(a.dialect).toBe('gemini-responseFormat');
    expect(first.calls[1].json?.generationConfig).toHaveProperty('responseFormat');

    const again = fakeFetch([geminiOk(ITEMS)]);
    expect((await createClient(gemini, instantDeps(again.fetch).deps).complete(request())).dialect).toBe('gemini-responseFormat');

    const other = fakeFetch([geminiOk(ITEMS)]);
    const otherModel = { ...gemini, model: 'gemini-3.8-flash' };
    expect((await createClient(otherModel, instantDeps(other.fetch).deps).complete(request())).dialect).toBe('gemini-jsonSchema');
  });

  it('walks the OpenAI ladder json_schema → json_object on a recorded rejection', async () => {
    const config: ProviderConfig = { provider: 'openai', apiKey: 'sk-proj-fake', model: 'gpt-6-luna', baseUrl: 'https://api.openai.com/v1' };
    const ok: Reply = { status: 200, body: { choices: [{ message: { content: ITEMS }, finish_reason: 'stop' }] } };
    const { fetch, calls } = fakeFetch([replyOf('openai-400-json-schema'), ok]);
    const result = await createClient(config, instantDeps(fetch).deps).complete(request());
    expect(result.dialect).toBe('openai-jsonObject');
    expect(calls[1].json?.response_format).toEqual({ type: 'json_object' });
  });

  it('never steps past the last rung: the rejection is then an error', async () => {
    const config: ProviderConfig = { provider: 'deepseek', apiKey: 'sk-fake', model: 'deepseek-flash', baseUrl: 'https://api.deepseek.com' };
    const rejection = replyOf('openai-400-json-schema');
    const { fetch, calls } = fakeFetch([rejection, rejection]);
    expect((await failure(createClient(config, instantDeps(fetch).deps).complete(request()))).kind).toBe('badRequest');
    expect(calls).toHaveLength(2);
  });

  it('steps down once, uncached, when the reply is unreadable', async () => {
    const { fetch, calls } = fakeFetch([geminiOk(''), geminiOk(ITEMS)]);
    const result = await createClient(gemini, instantDeps(fetch).deps).complete(request());
    expect(result.dialect).toBe('gemini-responseFormat');
    expect(calls).toHaveLength(2);
    const next = fakeFetch([geminiOk('garbage'), geminiOk('still garbage')]);
    const again = await createClient(gemini, instantDeps(next.fetch).deps).complete(request());
    expect(again).toMatchObject({ dialect: 'gemini-responseFormat', text: 'still garbage' });
  });

  it('does not step down on a truncated reply; the run bisects it', async () => {
    const truncated: Reply = { status: 200, body: { candidates: [{ content: { parts: [{ text: '{"items":[' }] }, finishReason: 'MAX_TOKENS' }] } };
    const { fetch, calls } = fakeFetch([truncated]);
    expect((await createClient(gemini, instantDeps(fetch).deps).complete(request())).finish).toBe('length');
    expect(calls).toHaveLength(1);
  });

  it('throws the mapped error: region is fatal, with Try again before the Hong Kong switch', async () => {
    const { fetch } = fakeFetch([replyOf('gemini-400-region')]);
    const info = await failure(createClient(gemini, instantDeps(fetch).deps).complete(request()));
    expect(info).toMatchObject({ kind: 'region', fatal: true, actions: ['retry', 'switchProvider', 'openSettings'] });
  });

  it('names the model it could not find', async () => {
    const { fetch } = fakeFetch([replyOf('gemini-404-model')]);
    const info = await failure(createClient({ ...gemini, model: 'gemini-9-flash' }, instantDeps(fetch).deps).complete(request()));
    expect(info.kind).toBe('model');
    expect(info.message).toContain('“gemini-9-flash”');
  });

  it('drops "use the fallback model" when that is already the model', async () => {
    const replies: Reply[] = [{ status: 429, headers: { 'retry-after': '60' } }];
    const lite = await failure(createClient(gemini, instantDeps(fakeFetch(replies).fetch).deps).complete(request()));
    expect(lite.actions).not.toContain('useFallbackModel');
    const flash = { ...gemini, model: 'gemini-3.8-flash' };
    const other = await failure(createClient(flash, instantDeps(fakeFetch(replies).fetch).deps).complete(request()));
    expect(other.actions).toContain('useFallbackModel');
  });

  it('names the host it could not reach, and reads an OpenAI TypeError as networkOrKey', async () => {
    const offline = [new TypeError('Failed to fetch'), new TypeError('Failed to fetch')];
    const ollama: ProviderConfig = { provider: 'ollama', apiKey: null, model: 'qwen3', baseUrl: 'http://localhost:11434/v1' };
    const info = await failure(createClient(ollama, instantDeps(fakeFetch(offline).fetch).deps).complete(request()));
    expect(info.kind).toBe('network');
    expect(info.message).toContain('localhost:11434');
    expect(info.message).toContain('OLLAMA_ORIGINS');
    const openai: ProviderConfig = { provider: 'openai', apiKey: 'sk-proj-fake', model: 'gpt-6-luna', baseUrl: 'https://api.openai.com/v1' };
    const hidden = await failure(createClient(openai, instantDeps(fakeFetch([...offline]).fetch).deps).complete(request()));
    expect(hidden.kind).toBe('networkOrKey');
  });

  it('sends nothing without a key, to an unsafe base URL, or for a malformed model id', async () => {
    const cases: Array<[ProviderConfig, string]> = [
      [{ ...gemini, apiKey: null }, 'notConfigured'],
      [{ provider: 'custom', apiKey: 'k', model: 'm', baseUrl: 'http://example.com/v1' }, 'notConfigured'],
      [{ provider: 'custom', apiKey: 'k', model: 'm', baseUrl: 'https://user:pw@example.com/v1' }, 'notConfigured'],
      [{ provider: 'custom', apiKey: 'k', model: 'm', baseUrl: 'not a url' }, 'notConfigured'],
      [{ provider: 'qwen', apiKey: 'sk-fake', model: 'qwen-plus', baseUrl: 'https://{WorkspaceId}.cn-hongkong.maas.aliyuncs.com/compatible-mode/v1' }, 'notConfigured'],
      [{ ...gemini, model: '../../evil?key=' }, 'model'],
      [{ ...gemini, model: KEY }, 'model'],
      [{ ...gemini, model: `models/${KEY}` }, 'model'],
      [{ provider: 'deepseek', apiKey: 'sk-other', model: 'sk-0123456789abcdef0123', baseUrl: '' }, 'model'],
    ];
    for (const [config, kind] of cases) {
      const { fetch, calls } = fakeFetch([]);
      const info = await failure(createClient(config, instantDeps(fetch).deps).complete(request()));
      expect(info.kind).toBe(kind);
      expect(info.message).not.toContain(KEY);
      expect(info.message).not.toContain('sk-0123');
      expect(calls).toHaveLength(0);
    }
  });

  it('allows http on this computer only', async () => {
    const ok: Reply = { status: 200, body: { choices: [{ message: { content: ITEMS }, finish_reason: 'stop' }] } };
    for (const baseUrl of ['http://localhost:11434/v1', 'http://127.0.0.1:8080/v1', 'http://[::1]:8080/v1']) {
      const { fetch } = fakeFetch([ok]);
      const config: ProviderConfig = { provider: 'ollama', apiKey: null, model: 'qwen3', baseUrl };
      expect((await createClient(config, instantDeps(fetch).deps).complete(request())).text).toBe(ITEMS);
    }
  });

  it('fills an empty base URL and model from the preset', async () => {
    const { fetch, calls } = fakeFetch([geminiOk(ITEMS)]);
    await createClient({ ...gemini, baseUrl: '', model: '' }, instantDeps(fetch).deps).complete(request());
    expect(calls[0].url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
  });

  it('never lets the key reach the console or the error', async () => {
    const echo: Reply = { status: 400, body: { error: { message: `Bad key ${KEY} here` } } };
    const { fetch } = fakeFetch([echo]);
    const warn = vi.mocked(console.warn);
    const info = await failure(createClient(gemini, instantDeps(fetch).deps).complete(request()));
    expect(JSON.stringify(info)).not.toContain(KEY);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(KEY);
    expect(warn.mock.calls).toEqual([['AI request failed', { kind: 'badRequest', status: 400 }]]);
  });

  it('is cancelled when the signal aborts, with nothing fetched after', async () => {
    const controller = new AbortController();
    const { fetch, calls } = fakeFetch(['hang', geminiOk(ITEMS)]);
    const pending = failure(createClient(gemini, instantDeps(fetch).deps).complete(request(controller.signal)));
    controller.abort();
    expect((await pending).kind).toBe('cancelled');
    expect(calls).toHaveLength(1);
  });

  it('keeps the real clock and sleep when deps name them as undefined', async () => {
    vi.useFakeTimers();
    try {
      const limited: Reply = { status: 429, body: {}, headers: { 'retry-after': '2' } };
      const { fetch, calls } = fakeFetch([limited, geminiOk(ITEMS)]);
      const pending = createClient(gemini, { fetch, sleep: undefined, now: undefined }).complete(request());
      await vi.advanceTimersByTimeAsync(1_999);
      expect(calls).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      expect((await pending).text).toBe(ITEMS);
      expect(calls).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('createClient().listModels', () => {
  it('lists models, and [] on any failure', async () => {
    const list: Reply = { status: 200, body: { models: [{ name: 'models/gemini-x', supportedGenerationMethods: ['generateContent'] }] } };
    const signal = new AbortController().signal;
    expect(await createClient(gemini, instantDeps(fakeFetch([list]).fetch).deps).listModels(signal)).toEqual([{ id: 'gemini-x' }]);
    expect(await createClient(gemini, instantDeps(fakeFetch([replyOf('gemini-400-bad-key')]).fetch).deps).listModels(signal)).toEqual([]);
    const offline = fakeFetch([new TypeError('x'), new TypeError('x')]);
    expect(await createClient(gemini, instantDeps(offline.fetch).deps).listModels(signal)).toEqual([]);
    const keyless = fakeFetch([]);
    expect(await createClient({ ...gemini, apiKey: null }, instantDeps(keyless.fetch).deps).listModels(signal)).toEqual([]);
    expect(keyless.calls).toHaveLength(0);
  });
});

describe('testConnection', () => {
  it('sends one real item with the literal pin, and reports that the glossary was followed', async () => {
    const { fetch, calls } = fakeFetch([geminiOk(ITEMS)]);
    const result = await testConnection(gemini, new AbortController().signal, instantDeps(fetch).deps);
    expect(result).toMatchObject({ ok: true, model: 'gemini-3.5-flash-lite', sample: '物價水平', followedGlossary: true });
    expect(calls).toHaveLength(1);
    const body = JSON.stringify(calls[0].json);
    expect(body).toContain('price level → 物價水平');
    expect(body).toContain('Price level');
    expect(calls[0].json?.generationConfig).toHaveProperty('responseJsonSchema');
  });

  it('counts any other reply as connected, without the glossary', async () => {
    const { fetch } = fakeFetch([geminiOk('{"items":[{"key":"t1","text":"價格水平"}]}')]);
    const result = await testConnection(gemini, new AbortController().signal, instantDeps(fetch).deps);
    expect(result).toMatchObject({ ok: true, sample: '價格水平', followedGlossary: false });
  });

  it('caches the rung it found for the real run', async () => {
    const probe = fakeFetch([replyOf('gemini-400-unknown-field'), geminiOk(ITEMS)]);
    await testConnection(gemini, new AbortController().signal, instantDeps(probe.fetch).deps);
    const run = fakeFetch([geminiOk(ITEMS)]);
    expect((await createClient(gemini, instantDeps(run.fetch).deps).complete(request())).dialect).toBe('gemini-responseFormat');
  });

  it('returns the mapped error instead of throwing', async () => {
    const { fetch } = fakeFetch([replyOf('gemini-400-bad-key')]);
    const result = await testConnection(gemini, new AbortController().signal, instantDeps(fetch).deps);
    expect(result).toMatchObject({ ok: false, error: { kind: 'badKey', provider: 'gemini' } });
  });

  it('gives up after the 30 s probe timeout, not the 120 s run timeout (listModels too)', async () => {
    vi.useFakeTimers();
    try {
      const probe = fakeFetch(['hang']);
      let settled = false;
      const pending = testConnection(gemini, new AbortController().signal, instantDeps(probe.fetch).deps).finally(() => (settled = true));
      await vi.advanceTimersByTimeAsync(29_999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await pending).toMatchObject({ ok: false, error: { kind: 'timeout' } });

      const list = fakeFetch(['hang']);
      const models = createClient(gemini, instantDeps(list.fetch).deps).listModels(new AbortController().signal);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(await models).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});
