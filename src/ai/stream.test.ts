import { beforeEach, describe, expect, it } from 'vitest';
import { clearDialectCache, createClient } from './client';
import { fakeFetch, instantDeps, type Reply } from './fakeFetch';
import { supportsStreaming } from './providers';
import { presetFor } from './providers';
import { ITEMS_SCHEMA } from './schema';
import { isAiError, type CompletionRequest, type ProviderConfig } from './types';

const sse = (...events: unknown[]) => events.map((e) => `data: ${typeof e === 'string' ? e : JSON.stringify(e)}\n\n`).join('');
const ok = (body: string): Reply => ({ status: 200, body: body as unknown as object, headers: { 'content-type': 'text/event-stream' } });
const req = (): CompletionRequest => ({ system: 'S', turns: [{ role: 'user', content: 'hi' }], schema: ITEMS_SCHEMA, maxOutputTokens: 100, signal: new AbortController().signal });
const cfg = (provider: ProviderConfig['provider'], model: string, baseUrl: string): ProviderConfig => ({ provider, apiKey: 'sk-test-0123456789abcdefghij', model, baseUrl });

beforeEach(() => clearDialectCache());

describe('which providers stream', () => {
  it('hosted ones do; a custom server or Ollama is asked for the whole reply', () => {
    expect(['gemini', 'anthropic', 'openai', 'openrouter', 'deepseek', 'qwen'].every((id) => supportsStreaming(presetFor(id as 'gemini')))).toBe(true);
    expect(supportsStreaming(presetFor('custom'))).toBe(false);
    expect(supportsStreaming(presetFor('ollama'))).toBe(false);
  });
});

describe('client.stream', () => {
  it('gemini: text grows chunk by chunk, finish and usage from the last event, SSE url', async () => {
    const { fetch, calls } = fakeFetch([
      ok(sse({ candidates: [{ content: { parts: [{ text: '{"a":' }] } }] }, { candidates: [{ content: { parts: [{ text: '1}' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 3 } })),
    ]);
    const seen: string[] = [];
    const res = await createClient(cfg('gemini', 'gemini-3.5-flash-lite', 'https://generativelanguage.googleapis.com/v1beta'), instantDeps(fetch).deps).stream!(req(), (t) => seen.push(t));
    expect(seen).toEqual(['{"a":', '{"a":1}']);
    expect(res).toMatchObject({ text: '{"a":1}', finish: 'stop', usage: { input: 5, output: 3 } });
    expect(calls[0].url).toContain(':streamGenerateContent?alt=sse');
    expect(calls[0].headers['x-goog-api-key']).toBeTruthy();
  });
  it('openai-style: delta content, finish_reason, final usage chunk; stream flags in the body', async () => {
    const { fetch, calls } = fakeFetch([
      ok(sse({ choices: [{ delta: { content: 'He' } }] }, { choices: [{ delta: { content: 'llo' }, finish_reason: 'stop' }] }, { choices: [], usage: { prompt_tokens: 7, completion_tokens: 2 } }, '[DONE]')),
    ]);
    const res = await createClient(cfg('openai', 'gpt-x', 'https://api.openai.com/v1'), instantDeps(fetch).deps).stream!(req(), () => undefined);
    expect(res).toMatchObject({ text: 'Hello', finish: 'stop', usage: { input: 7, output: 2 } });
    expect(calls[0].json).toMatchObject({ stream: true, stream_options: { include_usage: true } });
  });
  it('anthropic: text deltas, stop reason and counts', async () => {
    const { fetch, calls } = fakeFetch([
      ok(
        'event: message_start\n' + sse({ type: 'message_start', message: { usage: { input_tokens: 9 } } }) +
          sse({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hi' } }, { type: 'content_block_delta', delta: { type: 'text_delta', text: '!' } }, { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 4 } }),
      ),
    ]);
    const res = await createClient(cfg('anthropic', 'claude-haiku-5-5', 'https://api.anthropic.com/v1'), instantDeps(fetch).deps).stream!(req(), () => undefined);
    expect(res).toMatchObject({ text: 'Hi!', finish: 'stop', usage: { input: 9, output: 4 } });
    expect(calls[0].json).toMatchObject({ stream: true });
  });
  it('a refusing status is the ordinary error; an error event mid-stream throws; a cut-off length is reported', async () => {
    const bad = fakeFetch([{ status: 401, body: { error: { message: 'bad key' } } }]);
    await expect(createClient(cfg('gemini', 'gemini-3.5-flash-lite', 'https://generativelanguage.googleapis.com/v1beta'), instantDeps(bad.fetch).deps).stream!(req(), () => undefined)).rejects.toSatisfy(isAiError);
    const mid = fakeFetch([ok(sse({ choices: [{ delta: { content: 'x' } }] }, { error: { message: 'overloaded' } }))]);
    await expect(createClient(cfg('openai', 'gpt-x', 'https://api.openai.com/v1'), instantDeps(mid.fetch).deps).stream!(req(), () => undefined)).rejects.toSatisfy(isAiError);
    const cut = fakeFetch([ok(sse({ candidates: [{ content: { parts: [{ text: 'abc' }] }, finishReason: 'MAX_TOKENS' }] }))]);
    const res = await createClient(cfg('gemini', 'gemini-3.5-flash-lite', 'https://generativelanguage.googleapis.com/v1beta'), instantDeps(cut.fetch).deps).stream!(req(), () => undefined);
    expect(res.finish).toBe('length');
  });
  it('a schema rejection steps down a rung, as complete does', async () => {
    const { fetch, calls } = fakeFetch([{ status: 400, body: { error: { message: 'Invalid JSON payload received. Unknown name "responseJsonSchema"' } } }, ok(sse({ candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }] }))]);
    const res = await createClient(cfg('gemini', 'gemini-3.5-flash-lite', 'https://generativelanguage.googleapis.com/v1beta'), instantDeps(fetch).deps).stream!(req(), () => undefined);
    expect(res.text).toBe('ok');
    expect(calls).toHaveLength(2);
  });
});
