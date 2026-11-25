import { beforeEach, describe, expect, it } from 'vitest';
import { clearDialectCache, createClient, testConnection } from './client';
import { fakeFetch, instantDeps, type Reply } from './fakeFetch';
import { clearLightRefusals, GEMINI_LIGHT_MODEL, onLightFallback } from './lightJobs';
import { ITEMS_SCHEMA } from './schema';
import { isAiError, type AiFeature, type CompletionRequest, type ProviderConfig } from './types';

/** Own Gemini key, "Use the cheaper Gemini Flash-Lite for simple jobs" (u-zso2). */

const KEY = 'AIzaFAKEKEYFORTESTSONLY0123456789abcd';
const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const MAIN = 'gemini-4-hydrogen';
const off: ProviderConfig = { provider: 'gemini', apiKey: KEY, model: MAIN, baseUrl: BASE };
const on: ProviderConfig = { ...off, lightModel: GEMINI_LIGHT_MODEL };

const ITEMS = '{"items":[{"key":"t1","text":"物價水平"}]}';
const okReply = (): Reply => ({ status: 200, body: { candidates: [{ content: { parts: [{ text: ITEMS }] }, finishReason: 'STOP' }] } });
const sseReply = (): Reply => ({
  status: 200,
  body: `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: ITEMS }] }, finishReason: 'STOP' }] })}\n\n` as unknown as object,
  headers: { 'content-type': 'text/event-stream' },
});
const notFound: Reply = { status: 404, body: { error: { code: 404, status: 'NOT_FOUND', message: `models/${GEMINI_LIGHT_MODEL} is not found for API version v1beta` } } };
const denied: Reply = { status: 403, body: { error: { code: 403, status: 'PERMISSION_DENIED', message: 'Permission denied on resource model (or it may not exist).' } } };

const request = (feature?: AiFeature, signal = new AbortController().signal): CompletionRequest => ({
  system: 'S',
  turns: [{ role: 'user', content: '{"items":[{"key":"t1","text":"Price level"}]}' }],
  schema: ITEMS_SCHEMA,
  maxOutputTokens: 1000,
  signal,
  requestKey: 'k',
  ...(feature ? { feature } : {}),
});

const modelOf = (url: string) => /\/models\/([^:]+):/.exec(url)?.[1];
const thinkingOf = (json: Record<string, unknown> | null) =>
  ((json?.generationConfig as Record<string, unknown>)?.thinkingConfig as Record<string, unknown> | undefined)?.thinkingLevel;

const FEATURES: AiFeature[] = [
  'translate', 'test', 'importCheck', 'studio', 'studio.pick', 'studio.write', 'studio.solve', 'studio.quality', 'studio.diagram',
  'answers', 'quality', 'polish', 'coverage', 'generate', 'assist', 'other',
];

beforeEach(() => {
  clearDialectCache();
  clearLightRefusals();
});

async function sent(config: ProviderConfig, feature?: AiFeature) {
  const { fetch, calls } = fakeFetch([okReply()]);
  await createClient(config, instantDeps(fetch).deps).complete(request(feature));
  return calls[0];
}

describe('the switch off', () => {
  it('sends every job exactly as before: same URL, headers and body', async () => {
    for (const feature of [...FEATURES, undefined]) {
      clearDialectCache();
      const a = await sent(off, feature);
      clearDialectCache();
      const b = await sent({ ...off, lightModel: undefined }, feature);
      expect(modelOf(a.url), String(feature)).toBe(MAIN);
      expect({ url: b.url, headers: b.headers, body: b.init.body }).toEqual({ url: a.url, headers: a.headers, body: a.init.body });
    }
  });
});

describe('the switch on', () => {
  it('moves only translate and test to Flash-Lite at minimal thinking; every other job keeps the chosen model', async () => {
    for (const feature of FEATURES) {
      clearDialectCache();
      const call = await sent(on, feature);
      const light = feature === 'translate' || feature === 'test';
      expect(modelOf(call.url), feature).toBe(light ? GEMINI_LIGHT_MODEL : MAIN);
      expect(thinkingOf(call.json), feature).toBe(light ? 'minimal' : 'low');
      if (!light) {
        clearDialectCache();
        const before = await sent(off, feature);
        expect(call.init.body, feature).toBe(before.init.body);
      }
    }
    clearDialectCache();
    expect(modelOf((await sent(on, undefined)).url)).toBe(MAIN);
  });

  it('reports the model a job ran on, and the light request is otherwise the same request', async () => {
    const { fetch, calls } = fakeFetch([okReply(), okReply()]);
    const client = createClient(on, instantDeps(fetch).deps);
    expect((await client.complete(request('translate'))).model).toBe(GEMINI_LIGHT_MODEL);
    expect((await client.complete(request('studio.pick'))).model).toBe(MAIN);
    const [light, main] = calls.map((c) => c.json!);
    expect({ ...light, generationConfig: undefined }).toEqual({ ...main, generationConfig: undefined });
  });

  it('streams a light job to Flash-Lite too', async () => {
    const { fetch, calls } = fakeFetch([sseReply()]);
    const res = await createClient(on, instantDeps(fetch).deps).stream!(request('translate'), () => undefined);
    expect(modelOf(calls[0].url)).toBe(GEMINI_LIGHT_MODEL);
    expect(res.model).toBe(GEMINI_LIGHT_MODEL);
  });

  it('runs the Settings test on Flash-Lite', async () => {
    const { fetch, calls } = fakeFetch([okReply()]);
    const result = await testConnection(on, new AbortController().signal, instantDeps(fetch).deps);
    expect(result).toMatchObject({ ok: true, model: GEMINI_LIGHT_MODEL });
    expect(modelOf(calls[0].url)).toBe(GEMINI_LIGHT_MODEL);
  });

  it('changes nothing for any other provider, nor the Mentor credits path', async () => {
    const others: ProviderConfig[] = [
      { provider: 'anthropic', apiKey: 'sk-ant-test-0123456789abcdefghij', model: 'claude-x', baseUrl: 'https://api.anthropic.com/v1' },
      { provider: 'openai', apiKey: 'sk-test-0123456789abcdefghij', model: 'gpt-x', baseUrl: 'https://api.openai.com/v1' },
      { provider: 'deepseek', apiKey: 'sk-test-0123456789abcdefghij', model: 'deepseek-flash', baseUrl: 'https://api.deepseek.com' },
      { provider: 'openrouter', apiKey: 'sk-or-test-0123456789abcdefghij', model: 'google/gemini-4-hydrogen', baseUrl: 'https://openrouter.ai/api/v1' },
      { provider: 'ollama', apiKey: null, model: 'qwen3:8b', baseUrl: 'http://localhost:11434/v1' },
    ];
    for (const config of others) {
      const bodies: Array<BodyInit | null | undefined> = [];
      for (const c of [config, { ...config, lightModel: GEMINI_LIGHT_MODEL }]) {
        clearDialectCache();
        const okBody = config.provider === 'anthropic'
          ? { content: [{ type: 'text', text: ITEMS }], stop_reason: 'end_turn' }
          : { choices: [{ message: { content: ITEMS }, finish_reason: 'stop' }] };
        const { fetch, calls } = fakeFetch([{ status: 200, body: okBody }]);
        await createClient(c, instantDeps(fetch).deps).complete(request('translate'));
        expect(calls[0].init.body, config.provider).not.toContain(GEMINI_LIGHT_MODEL);
        bodies.push(calls[0].init.body);
      }
      expect(bodies[1], config.provider).toBe(bodies[0]);
    }
  });
});

describe('when Google refuses Flash-Lite', () => {
  it.each([['404', notFound], ['403 on the model', denied]])('%s: the call runs again on the chosen model, says so once, and the run skips the light model after', async (_name, refusal) => {
    const told: string[] = [];
    const stop = onLightFallback((m) => told.push(m));
    const { fetch, calls } = fakeFetch([refusal, okReply(), okReply()]);
    const client = createClient(on, instantDeps(fetch).deps);
    const res = await client.complete(request('translate'));
    expect(res).toMatchObject({ model: MAIN, text: ITEMS });
    expect(calls.map((c) => modelOf(c.url))).toEqual([GEMINI_LIGHT_MODEL, MAIN]);
    expect(told).toEqual([GEMINI_LIGHT_MODEL]);
    // The next light job goes straight to the chosen model: no second refusal, no second notice.
    await client.complete(request('test'));
    expect(calls.map((c) => modelOf(c.url))).toEqual([GEMINI_LIGHT_MODEL, MAIN, MAIN]);
    expect(told).toHaveLength(1);
    stop();
  });

  it('falls back on a stream too', async () => {
    const { fetch, calls } = fakeFetch([notFound, sseReply()]);
    const res = await createClient(on, instantDeps(fetch).deps).stream!(request('translate'), () => undefined);
    expect(res.model).toBe(MAIN);
    expect(calls.map((c) => modelOf(c.url))).toEqual([GEMINI_LIGHT_MODEL, MAIN]);
  });

  it('does not retry another failure (a bad key, quota) on the chosen model', async () => {
    const badKey: Reply = { status: 400, body: { error: { code: 400, status: 'INVALID_ARGUMENT', message: 'API key not valid. Please pass a valid API key.', details: [{ reason: 'API_KEY_INVALID' }] } } };
    const told: string[] = [];
    const stop = onLightFallback((m) => told.push(m));
    const { fetch, calls } = fakeFetch([badKey]);
    const error = await createClient(on, instantDeps(fetch).deps).complete(request('translate')).catch((e: unknown) => e);
    expect(isAiError(error) && error.info.kind).toBe('badKey');
    expect(calls).toHaveLength(1);
    expect(told).toEqual([]);
    stop();
  });

  it('a refused chosen model is the ordinary model error (nothing to fall back to)', async () => {
    const { fetch, calls } = fakeFetch([notFound]);
    const error = await createClient(on, instantDeps(fetch).deps).complete(request('studio.pick')).catch((e: unknown) => e);
    expect(isAiError(error) && error.info.kind).toBe('model');
    expect(calls).toHaveLength(1);
  });
});
