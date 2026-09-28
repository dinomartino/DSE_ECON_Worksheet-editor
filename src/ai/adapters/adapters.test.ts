import { describe, expect, it } from 'vitest';
import { PRESETS } from '../providers';
import { ITEMS_SCHEMA, JSON_SHAPE_HINT } from '../schema';
import type { CompletionRequest, ProviderConfig, ProviderId } from '../types';
import { anthropicAdapter } from './anthropic';
import { geminiAdapter } from './gemini';
import { openaiCompatAdapter } from './openaiCompat';

const KEY = 'test-key-not-real';

const req: CompletionRequest = {
  system: 'SYSTEM',
  turns: [
    { role: 'user', content: 'shot' },
    { role: 'assistant', content: 'answer' },
    { role: 'user', content: 'payload' },
  ],
  schema: ITEMS_SCHEMA,
  maxOutputTokens: 2000,
  signal: new AbortController().signal,
};

function config(provider: ProviderId, model = PRESETS[provider].models[0]?.id ?? 'm'): ProviderConfig {
  return { provider, apiKey: KEY, model, baseUrl: PRESETS[provider].baseUrl || 'https://llm.example.test/v1' };
}

const built = (provider: ProviderId, dialect: Parameters<typeof geminiAdapter.build>[3], model?: string) => {
  const adapter = provider === 'gemini' ? geminiAdapter : provider === 'anthropic' ? anthropicAdapter : openaiCompatAdapter;
  const wire = adapter.build(PRESETS[provider], config(provider, model), req, dialect);
  return { ...wire, json: JSON.parse(wire.body ?? '{}') as Record<string, unknown> };
};

describe('gemini', () => {
  it('sends the key in x-goog-api-key, never in the URL', () => {
    const wire = built('gemini', 'gemini-jsonSchema');
    expect(wire.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
    expect(wire.url).not.toContain('key=');
    expect(wire.headers['x-goog-api-key']).toBe(KEY);
  });

  it('asks for responseJsonSchema with minimal thinking and no temperature or budget', () => {
    const { json } = built('gemini', 'gemini-jsonSchema');
    expect(json).toEqual({
      systemInstruction: { parts: [{ text: 'SYSTEM' }] },
      contents: [
        { role: 'user', parts: [{ text: 'shot' }] },
        { role: 'model', parts: [{ text: 'answer' }] },
        { role: 'user', parts: [{ text: 'payload' }] },
      ],
      generationConfig: {
        maxOutputTokens: 2000,
        responseMimeType: 'application/json',
        responseJsonSchema: ITEMS_SCHEMA,
        thinkingConfig: { thinkingLevel: 'minimal' },
      },
    });
    expect(JSON.stringify(json)).not.toMatch(/temperature|thinkingBudget/);
  });

  it('uses the thinking level of each model, and none for a typed id', () => {
    const flash = built('gemini', 'gemini-jsonSchema', 'gemini-3.8-flash').json;
    expect((flash.generationConfig as Record<string, unknown>).thinkingConfig).toEqual({ thinkingLevel: 'low' });
    const typed = built('gemini', 'gemini-jsonSchema', 'gemini-flash-latest').json;
    expect((typed.generationConfig as Record<string, unknown>).thinkingConfig).toBeUndefined();
  });

  it('steps down responseFormat → mime → prompt, adding the JSON hint once the schema is gone', () => {
    const format = built('gemini', 'gemini-responseFormat').json.generationConfig as Record<string, unknown>;
    expect(format.responseFormat).toEqual({ text: { mimeType: 'APPLICATION_JSON', schema: ITEMS_SCHEMA } });
    const mime = built('gemini', 'gemini-mime').json;
    expect(mime.generationConfig).toMatchObject({ responseMimeType: 'application/json' });
    expect(JSON.stringify(mime.systemInstruction)).toContain('Reply with one JSON object only');
    const prompt = built('gemini', 'prompt').json.generationConfig as Record<string, unknown>;
    expect(prompt.responseMimeType).toBeUndefined();
    expect(geminiAdapter.rungs(PRESETS.gemini)).toEqual(['gemini-jsonSchema', 'gemini-responseFormat', 'gemini-mime', 'prompt']);
  });

  it('extracts the answer, skipping thought parts, and maps finishReason', () => {
    const body = {
      candidates: [{ content: { parts: [{ text: 'thinking…', thought: true }, { text: '{"items":' }, { text: '[]}' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, thoughtsTokenCount: 2 },
    };
    expect(geminiAdapter.extract(body)).toEqual({ text: '{"items":[]}', finish: 'stop', usage: { input: 10, output: 5, thinking: 2 } });
    const finish = (reason: string) => geminiAdapter.extract({ candidates: [{ content: { parts: [] }, finishReason: reason }] })?.finish;
    expect(finish('MAX_TOKENS')).toBe('length');
    expect(finish('SAFETY')).toBe('safety');
    expect(finish('RECITATION')).toBe('safety');
    expect(finish('PROHIBITED_CONTENT')).toBe('safety');
    expect(finish('OTHER')).toBe('other');
  });

  it('reads a blocked prompt as safety, and anything else as unreadable', () => {
    expect(geminiAdapter.extract({ promptFeedback: { blockReason: 'SAFETY' } })?.finish).toBe('safety');
    expect(geminiAdapter.extract({ nothing: true })).toBeNull();
  });

  it('lists only models that generate content', () => {
    const body = {
      models: [
        { name: 'models/gemini-3.5-flash-lite', displayName: 'Gemini 3.5 Flash-Lite', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/embedding-001', supportedGenerationMethods: ['embedContent'] },
      ],
    };
    expect(geminiAdapter.parseModels(body)).toEqual([{ id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite' }]);
    expect(geminiAdapter.models(PRESETS.gemini, config('gemini')).url).not.toContain('key=');
  });
});

describe('openai-compatible', () => {
  it('DeepSeek: thinking disabled, json_object, the JSON hint in system, max_tokens', () => {
    const wire = built('deepseek', 'openai-jsonObject');
    expect(wire.url).toBe('https://api.deepseek.com/chat/completions');
    expect(wire.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(wire.json).toEqual({
      model: 'deepseek-flash',
      messages: [
        { role: 'system', content: `SYSTEM\n\n${JSON_SHAPE_HINT}` },
        { role: 'user', content: 'shot' },
        { role: 'assistant', content: 'answer' },
        { role: 'user', content: 'payload' },
      ],
      max_tokens: 2000,
      thinking: { type: 'disabled' },
      response_format: { type: 'json_object' },
    });
    expect(openaiCompatAdapter.rungs(PRESETS.deepseek)).toEqual(['openai-jsonObject', 'prompt']);
  });

  it('Qwen: enable_thinking false and a strict json_schema', () => {
    const { json } = built('qwen', 'openai-jsonSchema');
    expect(json.enable_thinking).toBe(false);
    expect(json.response_format).toEqual({ type: 'json_schema', json_schema: { name: 'translations', strict: true, schema: ITEMS_SCHEMA } });
    expect((json.messages as Array<{ content: string }>)[0].content).toBe('SYSTEM');
    expect(openaiCompatAdapter.rungs(PRESETS.qwen)).toEqual(['openai-jsonSchema', 'openai-jsonObject', 'prompt']);
  });

  it('OpenRouter: require_parameters, data_collection deny, and its two headers', () => {
    const wire = built('openrouter', 'openai-jsonSchema');
    expect(wire.json.provider).toEqual({ require_parameters: true, data_collection: 'deny' });
    expect(wire.headers['X-Title']).toBe('Econ Worksheet');
    expect(wire.headers['HTTP-Referer']).toMatch(/^https:\/\//);
  });

  it('OpenAI: max_completion_tokens and never temperature', () => {
    const { json } = built('openai', 'openai-jsonSchema');
    expect(json.max_completion_tokens).toBe(2000);
    expect(json.max_tokens).toBeUndefined();
    for (const id of ['deepseek', 'qwen', 'openrouter', 'openai', 'custom', 'ollama'] as const) {
      expect(JSON.stringify(built(id, 'openai-jsonSchema').json), id).not.toContain('temperature');
    }
  });

  it('Ollama without a key sends no Authorization header; the prompt rung sends no response_format', () => {
    const wire = openaiCompatAdapter.build(PRESETS.ollama, { provider: 'ollama', apiKey: null, model: 'qwen3', baseUrl: 'http://localhost:11434/v1/' }, req, 'prompt');
    expect(wire.url).toBe('http://localhost:11434/v1/chat/completions');
    expect(wire.headers.authorization).toBeUndefined();
    expect(JSON.parse(wire.body ?? '{}').response_format).toBeUndefined();
  });

  it('extracts content, usage and finish_reason; a refusal or content_filter is safety', () => {
    const body = {
      choices: [{ message: { content: '{"items":[]}' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 9, completion_tokens: 4, completion_tokens_details: { reasoning_tokens: 1 } },
    };
    expect(openaiCompatAdapter.extract(body)).toEqual({ text: '{"items":[]}', finish: 'stop', usage: { input: 9, output: 4, thinking: 1 } });
    const finish = (choice: Record<string, unknown>) => openaiCompatAdapter.extract({ choices: [choice] })?.finish;
    expect(finish({ message: { content: 'x' }, finish_reason: 'length' })).toBe('length');
    expect(finish({ message: { content: '' }, finish_reason: 'content_filter' })).toBe('safety');
    expect(finish({ message: { content: null, refusal: 'I cannot' }, finish_reason: 'stop' })).toBe('safety');
    // DeepSeek's documented empty content reaches the schema guard as ''.
    expect(openaiCompatAdapter.extract({ choices: [{ message: { content: '' }, finish_reason: 'stop' }] })?.text).toBe('');
    expect(openaiCompatAdapter.extract({ error: {} })).toBeNull();
  });

  it('lists models from data[].id', () => {
    expect(openaiCompatAdapter.parseModels({ data: [{ id: 'a' }, { id: 'b', name: 'B' }, { nope: 1 }] })).toEqual([{ id: 'a' }, { id: 'b', label: 'B' }]);
  });
});

describe('anthropic', () => {
  it('sends x-api-key, the browser header and output_config', () => {
    const wire = built('anthropic', 'anthropic-jsonSchema');
    expect(wire.url).toBe('https://api.anthropic.com/v1/messages');
    expect(wire.headers).toMatchObject({
      'x-api-key': KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    });
    expect(wire.json).toEqual({
      model: 'claude-sonnet-5',
      max_tokens: 2000,
      system: 'SYSTEM',
      messages: [
        { role: 'user', content: 'shot' },
        { role: 'assistant', content: 'answer' },
        { role: 'user', content: 'payload' },
      ],
      output_config: { format: { type: 'json_schema', schema: ITEMS_SCHEMA } },
    });
  });

  it('drops output_config on the prompt rung and adds the hint', () => {
    const { json } = built('anthropic', 'prompt');
    expect(json.output_config).toBeUndefined();
    expect(json.system).toBe(`SYSTEM\n\n${JSON_SHAPE_HINT}`);
  });

  it('extracts text blocks and maps stop_reason', () => {
    const body = { content: [{ type: 'text', text: '{"items":[]}' }], stop_reason: 'end_turn', usage: { input_tokens: 3, output_tokens: 2 } };
    expect(anthropicAdapter.extract(body)).toEqual({ text: '{"items":[]}', finish: 'stop', usage: { input: 3, output: 2 } });
    expect(anthropicAdapter.extract({ content: [], stop_reason: 'max_tokens' })?.finish).toBe('length');
    expect(anthropicAdapter.extract({ content: [], stop_reason: 'refusal' })?.finish).toBe('safety');
  });
});

describe('a caller-owned schema', () => {
  it("carries the caller's shape hint on every unenforced rung, never the items hint", () => {
    const own = { ...req, shapeHint: 'OWN HINT' };
    const bodies = [
      openaiCompatAdapter.build(PRESETS.deepseek, config('deepseek'), own, 'openai-jsonObject').body ?? '',
      anthropicAdapter.build(PRESETS.anthropic, config('anthropic'), own, 'prompt').body ?? '',
      geminiAdapter.build(PRESETS.gemini, config('gemini'), own, 'prompt').body ?? '',
    ];
    for (const body of bodies) {
      expect(body).toContain('SYSTEM\\n\\nOWN HINT');
      expect(body).not.toContain(JSON.stringify(JSON_SHAPE_HINT).slice(1, -1));
    }
  });
});
