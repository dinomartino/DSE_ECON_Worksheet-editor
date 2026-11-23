import type { CompletionRequest, CompletionResult } from '../types';
import { isRecord, modelExtra, parseImage, systemFor, trimBase, type Adapter } from './adapter';

/**
 * Anthropic Messages. The preset's `anthropic-dangerous-direct-browser-access` header is what
 * makes its errors readable from a browser; structured output is GA `output_config`.
 */

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
      system: systemFor(req.system, enforced, req.shapeHint),
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
    const usage = isRecord(body.usage) ? body.usage : {};
    return {
      text,
      finish: finishOf(body.stop_reason),
      usage: {
        input: typeof usage.input_tokens === 'number' ? usage.input_tokens : undefined,
        output: typeof usage.output_tokens === 'number' ? usage.output_tokens : undefined,
      },
    };
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
