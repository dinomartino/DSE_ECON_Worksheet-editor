import type { CompletionResult, OutputDialect } from '../types';
import { isRecord, modelExtra, systemFor, trimBase, type Adapter } from './adapter';

/**
 * OpenAI-compatible `chat/completions`: DeepSeek, Qwen, OpenRouter, OpenAI, custom and
 * Ollama. Provider quirks are preset data (`extraBody`, `extraHeaders`, `maxTokensParam`),
 * never branches here. No `temperature`.
 */

function finishOf(reason: unknown): CompletionResult['finish'] {
  if (reason === 'stop') return 'stop';
  if (reason === 'length') return 'length';
  return reason === 'content_filter' ? 'safety' : 'other';
}

function responseFormat(dialect: OutputDialect, schema: unknown): Record<string, unknown> | undefined {
  if (dialect === 'openai-jsonSchema') {
    return { type: 'json_schema', json_schema: { name: 'translations', strict: true, schema } };
  }
  return dialect === 'openai-jsonObject' ? { type: 'json_object' } : undefined;
}

function authHeaders(apiKey: string | null): Record<string, string> {
  return apiKey ? { authorization: `Bearer ${apiKey}` } : {};
}

/** `content` is a string, or (some servers) an array of text parts. */
function contentText(content: unknown): string | null {
  if (typeof content === 'string') return content;
  if (content === null) return '';
  if (!Array.isArray(content)) return null;
  return content.map((part) => (isRecord(part) && typeof part.text === 'string' ? part.text : '')).join('');
}

export const openaiCompatAdapter: Adapter = {
  rungs: (preset) =>
    preset.structured === 'json_object'
      ? ['openai-jsonObject', 'prompt']
      : ['openai-jsonSchema', 'openai-jsonObject', 'prompt'],

  build(preset, config, req, dialect) {
    const format = responseFormat(dialect, req.schema);
    const body: Record<string, unknown> = {
      model: config.model,
      messages: [
        { role: 'system', content: systemFor(req.system, dialect === 'openai-jsonSchema') },
        ...req.turns.map((t) => ({ role: t.role, content: t.content })),
      ],
      [preset.maxTokensParam ?? 'max_tokens']: req.maxOutputTokens,
      ...preset.extraBody,
      ...modelExtra(preset, config.model),
    };
    if (format) body.response_format = format;
    return {
      url: `${trimBase(config.baseUrl)}/chat/completions`,
      headers: { 'content-type': 'application/json', ...authHeaders(config.apiKey), ...preset.extraHeaders },
      body: JSON.stringify(body),
    };
  },

  extract(body) {
    if (!isRecord(body) || !Array.isArray(body.choices) || !isRecord(body.choices[0])) return null;
    const choice = body.choices[0];
    const message = isRecord(choice.message) ? choice.message : {};
    const text = contentText(message.content ?? null);
    if (text === null) return null;
    const usage = isRecord(body.usage) ? body.usage : {};
    const details = isRecord(usage.completion_tokens_details) ? usage.completion_tokens_details : {};
    const refused = typeof message.refusal === 'string' && message.refusal.length > 0;
    return {
      text,
      finish: refused ? 'safety' : finishOf(choice.finish_reason),
      usage: {
        input: typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : undefined,
        output: typeof usage.completion_tokens === 'number' ? usage.completion_tokens : undefined,
        thinking: typeof details.reasoning_tokens === 'number' ? details.reasoning_tokens : undefined,
      },
    };
  },

  models(preset, config) {
    return { url: `${trimBase(config.baseUrl)}/models`, headers: { ...authHeaders(config.apiKey), ...preset.extraHeaders } };
  },

  parseModels(body) {
    if (!isRecord(body) || !Array.isArray(body.data)) return [];
    return body.data.flatMap((m) => {
      if (!isRecord(m) || typeof m.id !== 'string') return [];
      return [typeof m.name === 'string' ? { id: m.id, label: m.name } : { id: m.id }];
    });
  },
};
