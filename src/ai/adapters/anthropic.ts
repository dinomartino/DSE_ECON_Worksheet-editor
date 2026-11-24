import type { CompletionRequest, CompletionResult, TokenUsage } from '../types';
import { isRecord, modelExtra, parseImage, systemFor, trimBase, withBody, type Adapter, type StreamPiece } from './adapter';

/**
 * Anthropic Messages. The preset's `anthropic-dangerous-direct-browser-access` header is what
 * makes its errors readable from a browser; structured output is GA `output_config`.
 *
 * Prompt caching (k-0537): Anthropic discounts a repeated prefix only when the request marks it
 * with `cache_control`, so the system prompt (every feature's fixed instructions: the diagram
 * rules, the translate rules, the studio writer…) goes as one text block marked `ephemeral`
 * (5 minutes). A prefix under the model's minimum is simply not cached, never an error. Reads cost
 * a tenth of input; the first write costs 1.25×, repaid by the second call within five minutes.
 */

/** `usage`: `input_tokens` excludes the cache reads and writes, so the prompt is their sum. */
export function anthropicUsage(usage: Record<string, unknown>): TokenUsage {
  const n = (x: unknown) => (typeof x === 'number' ? x : undefined);
  const fresh = n(usage.input_tokens);
  const cached = n(usage.cache_read_input_tokens);
  const cacheWrite = n(usage.cache_creation_input_tokens);
  const result: TokenUsage = {};
  if (fresh !== undefined || cached !== undefined || cacheWrite !== undefined) result.input = (fresh ?? 0) + (cached ?? 0) + (cacheWrite ?? 0);
  if (n(usage.output_tokens) !== undefined) result.output = n(usage.output_tokens);
  if (cached !== undefined) result.cached = cached;
  if (cacheWrite !== undefined) result.cacheWrite = cacheWrite;
  return result;
}

function finishOf(reason: unknown): CompletionResult['finish'] {
  if (reason === 'end_turn' || reason === 'stop_sequence') return 'stop';
  if (reason === 'max_tokens') return 'length';
  return reason === 'refusal' ? 'safety' : 'other';
}

/** The last user turn's text, preceded by its pictures when it has any. */
function withImages(text: string, images: CompletionRequest['images']): string | Record<string, unknown>[] {
  const blocks = (images ?? []).flatMap((image) => {
    const parsed = parseImage(image.dataUrl);
    return parsed ? [{ type: 'image', source: { type: 'base64', media_type: parsed.mime, data: parsed.data } }] : [];
  });
  return blocks.length ? [...blocks, { type: 'text', text }] : text;
}

export const anthropicAdapter: Adapter = {
  rungs: () => ['anthropic-jsonSchema', 'prompt'],

  build(preset, config, req, dialect) {
    const enforced = dialect === 'anthropic-jsonSchema';
    const body: Record<string, unknown> = {
      model: config.model,
      max_tokens: req.maxOutputTokens,
      system: [{ type: 'text', text: systemFor(req.system, enforced, req.shapeHint), cache_control: { type: 'ephemeral' } }],
      messages: req.turns.map((t, i) => ({ role: t.role, content: i === req.turns.length - 1 && t.role === 'user' ? withImages(t.content, req.images) : t.content })),
      ...preset.extraBody,
      ...modelExtra(preset, config.model),
    };
    if (enforced) body.output_config = { format: { type: 'json_schema', schema: req.schema } };
    return {
      url: `${trimBase(config.baseUrl)}/messages`,
      headers: { 'content-type': 'application/json', 'x-api-key': config.apiKey ?? '', ...preset.extraHeaders },
      body: JSON.stringify(body),
    };
  },

  extract(body) {
    if (!isRecord(body) || !Array.isArray(body.content)) return null;
    const text = body.content
      .filter((c): c is Record<string, unknown> => isRecord(c) && c.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text as string)
      .join('');
    return { text, finish: finishOf(body.stop_reason), usage: anthropicUsage(isRecord(body.usage) ? body.usage : {}) };
  },

  buildStream(preset, config, req, dialect) {
    return withBody(anthropicAdapter.build(preset, config, req, dialect), { stream: true });
  },

  streamPiece(event) {
    if (!isRecord(event)) return null;
    if (event.type === 'error') return { error: isRecord(event.error) && typeof event.error.message === 'string' ? event.error.message : 'error' };
    if (event.type === 'message_start' && isRecord(event.message) && isRecord(event.message.usage)) {
      // The start's output count is a placeholder; the real one comes with `message_delta`.
      const usage = anthropicUsage(event.message.usage);
      delete usage.output;
      return usage.input === undefined ? null : { usage };
    }
    if (event.type === 'content_block_delta' && isRecord(event.delta) && event.delta.type === 'text_delta' && typeof event.delta.text === 'string') return { text: event.delta.text };
    if (event.type === 'message_delta') {
      const piece: StreamPiece = {};
      if (isRecord(event.delta) && typeof event.delta.stop_reason === 'string') piece.finish = finishOf(event.delta.stop_reason);
      if (isRecord(event.usage) && typeof event.usage.output_tokens === 'number') piece.usage = { output: event.usage.output_tokens };
      return piece;
    }
    return null;
  },

  models(preset, config) {
    return {
      url: `${trimBase(config.baseUrl)}/models?limit=1000`,
      headers: { 'x-api-key': config.apiKey ?? '', ...preset.extraHeaders },
    };
  },

  parseModels(body) {
    if (!isRecord(body) || !Array.isArray(body.data)) return [];
    return body.data.flatMap((m) => {
      if (!isRecord(m) || typeof m.id !== 'string') return [];
      return [typeof m.display_name === 'string' ? { id: m.id, label: m.display_name } : { id: m.id }];
    });
  },
};
