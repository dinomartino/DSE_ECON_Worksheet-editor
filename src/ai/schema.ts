import type { JsonSchema } from './types';

/**
 * The one flat response shape every provider is asked for. No optional fields, unions,
 * `minItems` or length constraints, so it fits Anthropic's limits, OpenAI strict mode and
 * Gemini's subset. Keys are not an enum: completeness is checked client-side.
 */
export const ITEMS_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { key: { type: 'string' }, text: { type: 'string' } },
        required: ['key', 'text'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
} as const;

/** Appended to `system` on the json_object and prompt rungs (DeepSeek and Qwen need the word JSON). */
export const JSON_SHAPE_HINT =
  'Reply with one JSON object only, exactly in this shape: {"items":[{"key":"t1","text":"…"}]}';

/**
 * The model's reply as items, or null. Takes the first `{` to the last `}` (so a ```json
 * fence falls away), parses, and guards `{items: Array<{key: string; text: string}>}`; extra
 * fields are ignored.
 */
export function parseItemsPayload(text: string): Array<{ key: string; text: string }> | null {
  // Slicing to the outermost braces drops a ```json fence without touching the texts.
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const items = (parsed as { items?: unknown }).items;
  if (!Array.isArray(items)) return null;
  const out: Array<{ key: string; text: string }> = [];
  for (const item of items) {
    if (typeof item !== 'object' || item === null) return null;
    const { key, text: value } = item as { key?: unknown; text?: unknown };
    if (typeof key !== 'string' || typeof value !== 'string') return null;
    out.push({ key, text: value });
  }
  return out;
}
