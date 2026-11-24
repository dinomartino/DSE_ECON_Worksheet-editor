import type { CompletionRequest, CompletionResult, OutputDialect, TokenUsage } from '../types';
import { isRecord, modelExtra, parseImage, systemFor, trimBase, withBody, type Adapter, type StreamPiece } from './adapter';

/**
 * OpenAI-compatible `chat/completions`: DeepSeek, Qwen, OpenRouter, OpenAI, custom and
 * Ollama. Provider quirks are preset data (`extraBody`, `extraHeaders`, `maxTokensParam`),
 * never branches here. No `temperature`.
 */

/** The last user turn's text, followed by its pictures as `image_url` parts when it has any. */
function withImages(text: string, images: CompletionRequest['images']): string | Record<string, unknown>[] {
  const parts = (images ?? []).flatMap((image) => (parseImage(image.dataUrl) ? [{ type: 'image_url', image_url: { url: image.dataUrl } }] : []));
  return parts.length ? [{ type: 'text', text }, ...parts] : text;
}

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

/**
 * `usage` in the OpenAI shape (k-0537). `prompt_tokens` includes the cached part on every
 * provider; the cached count is `prompt_tokens_details.cached_tokens` on OpenAI, Qwen
 * (compatible mode) and OpenRouter, and `prompt_cache_hit_tokens` on DeepSeek. Ollama reports none.
 */
export function compatUsage(usage: Record<string, unknown>): TokenUsage {
  const n = (x: unknown) => (typeof x === 'number' ? x : undefined);
  const out = isRecord(usage.completion_tokens_details) ? usage.completion_tokens_details : {};
  const prompt = isRecord(usage.prompt_tokens_details) ? usage.prompt_tokens_details : {};
  const result: TokenUsage = { input: n(usage.prompt_tokens), output: n(usage.completion_tokens), thinking: n(out.reasoning_tokens) };
  const cached = n(prompt.cached_tokens) ?? n(usage.prompt_cache_hit_tokens);
  return cached === undefined ? result : { ...result, cached };
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
        { role: 'system', content: systemFor(req.system, dialect === 'openai-jsonSchema', req.shapeHint) },
        ...req.turns.map((t, i) => ({ role: t.role, content: i === req.turns.length - 1 && t.role === 'user' ? withImages(t.content, req.images) : t.content })),
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
    const refused = typeof message.refusal === 'string' && message.refusal.length > 0;
    return {
      text,
      finish: refused ? 'safety' : finishOf(choice.finish_reason),
      usage: compatUsage(isRecord(body.usage) ? body.usage : {}),
    };
  },

  buildStream(preset, config, req, dialect) {
    return withBody(openaiCompatAdapter.build(preset, config, req, dialect), { stream: true, stream_options: { include_usage: true } });
  },

  streamPiece(event) {
    if (!isRecord(event)) return null;
    if (isRecord(event.error)) return { error: typeof event.error.message === 'string' ? event.error.message : 'error' };
    const piece: StreamPiece = {};
    const usage = isRecord(event.usage) ? event.usage : null;
    if (usage) piece.usage = compatUsage(usage);
    const choice = Array.isArray(event.choices) && isRecord(event.choices[0]) ? event.choices[0] : null;
    if (choice) {
      const delta = isRecord(choice.delta) ? choice.delta : {};
      if (typeof delta.content === 'string' && delta.content) piece.text = delta.content;
      if (typeof delta.refusal === 'string' && delta.refusal) piece.finish = 'safety';
      else if (typeof choice.finish_reason === 'string') piece.finish = finishOf(choice.finish_reason);
    }
    return piece.text || piece.finish || piece.usage ? piece : null;
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
