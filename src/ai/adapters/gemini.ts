import type { CompletionResult, OutputDialect } from '../types';
import { isRecord, modelExtra, systemFor, trimBase, type Adapter } from './adapter';

/**
 * Gemini native `generateContent` (stateless; not the Interactions API, which stores by
 * default). The key goes in `x-goog-api-key`, never `?key=`. No `temperature` (Gemini 3
 * keeps 1.0) and never `thinkingBudget` (with `thinkingLevel` it is a 400).
 */

const SAFETY = new Set(['SAFETY', 'RECITATION', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'IMAGE_SAFETY']);

function finishOf(reason: unknown): CompletionResult['finish'] {
  if (reason === 'STOP') return 'stop';
  if (reason === 'MAX_TOKENS') return 'length';
  return typeof reason === 'string' && SAFETY.has(reason) ? 'safety' : 'other';
}

/** "models/gemini-x" and "gemini-x" name the same model; the id is one path segment. */
const modelPath = (model: string) => encodeURIComponent(model.replace(/^models\//, ''));

function outputConfig(dialect: OutputDialect, schema: unknown): Record<string, unknown> {
  switch (dialect) {
    case 'gemini-jsonSchema':
      return { responseMimeType: 'application/json', responseJsonSchema: schema };
    case 'gemini-responseFormat':
      return { responseFormat: { text: { mimeType: 'APPLICATION_JSON', schema } } };
    case 'gemini-mime':
      return { responseMimeType: 'application/json' };
    default:
      return {};
  }
}

export const geminiAdapter: Adapter = {
  rungs: () => ['gemini-jsonSchema', 'gemini-responseFormat', 'gemini-mime', 'prompt'],

  build(preset, config, req, dialect) {
    const { thinkingLevel } = modelExtra(preset, config.model);
    const generationConfig: Record<string, unknown> = {
      maxOutputTokens: req.maxOutputTokens,
      ...outputConfig(dialect, req.schema),
    };
    if (typeof thinkingLevel === 'string') generationConfig.thinkingConfig = { thinkingLevel };
    const enforced = dialect === 'gemini-jsonSchema' || dialect === 'gemini-responseFormat';
    return {
      url: `${trimBase(config.baseUrl)}/models/${modelPath(config.model)}:generateContent`,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': config.apiKey ?? '', ...preset.extraHeaders },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemFor(req.system, enforced) }] },
        contents: req.turns.map((t) => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [{ text: t.content }] })),
        generationConfig,
      }),
    };
  },

  extract(body) {
    if (!isRecord(body)) return null;
    const usage = isRecord(body.usageMetadata) ? body.usageMetadata : {};
    const usageOut = {
      input: typeof usage.promptTokenCount === 'number' ? usage.promptTokenCount : undefined,
      output: typeof usage.candidatesTokenCount === 'number' ? usage.candidatesTokenCount : undefined,
      thinking: typeof usage.thoughtsTokenCount === 'number' ? usage.thoughtsTokenCount : undefined,
    };
    const candidate = Array.isArray(body.candidates) && isRecord(body.candidates[0]) ? body.candidates[0] : null;
    if (!candidate) {
      const blocked = isRecord(body.promptFeedback) && typeof body.promptFeedback.blockReason === 'string';
      return blocked ? { text: '', finish: 'safety', usage: usageOut } : null;
    }
    const parts = isRecord(candidate.content) && Array.isArray(candidate.content.parts) ? candidate.content.parts : [];
    // Thought summaries are parts too; only the answer counts.
    const text = parts
      .filter((p): p is Record<string, unknown> => isRecord(p) && p.thought !== true && typeof p.text === 'string')
      .map((p) => p.text as string)
      .join('');
    return { text, finish: finishOf(candidate.finishReason), usage: usageOut };
  },

  models(preset, config) {
    return {
      url: `${trimBase(config.baseUrl)}/models?pageSize=1000`,
      headers: { 'x-goog-api-key': config.apiKey ?? '', ...preset.extraHeaders },
    };
  },

  parseModels(body) {
    if (!isRecord(body) || !Array.isArray(body.models)) return [];
    return body.models.flatMap((m) => {
      if (!isRecord(m) || typeof m.name !== 'string') return [];
      const methods = Array.isArray(m.supportedGenerationMethods) ? m.supportedGenerationMethods : [];
      if (!methods.includes('generateContent')) return [];
      const id = m.name.replace(/^models\//, '');
      return [typeof m.displayName === 'string' ? { id, label: m.displayName } : { id }];
    });
  },
};
