import type { CompletionRequest, JsonSchema, ProviderPreset } from '@/ai/types';
import { anchorEmpty, anchorText } from '@/quality/collect';
import type { Side } from '@/model/textSlots';
import { systemCoverage } from './promptText';
import type { Band, Confidence, CoverageQuestion } from './types';

/** Bump with any change to the rendered request (words, payload shape, schema). */
export const PROMPT_VERSION = 'k0317.1';

/** Flat, every field required (the client's ladder needs it); items-shaped like the other verbs. */
export const COVERAGE_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          code: { type: 'string' },
          weight: { type: 'string', enum: ['main', 'also'] },
          band: { type: 'string', enum: ['know', 'apply', 'evaluate'] },
          conf: { type: 'string', enum: ['high', 'medium', 'low'] },
          why: { type: 'string' },
          outside: { type: 'string' },
        },
        required: ['key', 'code', 'weight', 'band', 'conf', 'why', 'outside'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
} as const;

const SHAPE_HINT =
  'Reply with only {"items":[{"key":"q1","code":"C.ped#arc","weight":"main","band":"apply","conf":"high","why":"…","outside":""}]}.';

/**
 * The side a paper is mostly written in: one language is sent, the other only where an
 * entry has nothing on the lead side (design § 10.2: halves the tokens).
 */
export function leadSide(questions: CoverageQuestion[]): Side {
  let en = 0;
  let zh = 0;
  for (const { question } of questions) {
    for (const anchor of question.anchors) {
      en += anchorText(anchor, 'en').length;
      zh += anchorText(anchor, 'zh').length;
    }
  }
  return zh > en ? 'zh' : 'en';
}

export function buildPayload(questions: CoverageQuestion[], side: Side) {
  const other: Side = side === 'en' ? 'zh' : 'en';
  return {
    questions: questions.map(({ question, key, units }) => ({
      key,
      format: question.format,
      entries: question.anchors
        .filter((anchor) => !anchorEmpty(anchor))
        .map((anchor) => ({
          role: anchor.role,
          ...(anchor.label ? { label: anchor.label } : {}),
          text: anchorText(anchor, side) || anchorText(anchor, other),
          ...(anchor.keyed ? { keyed: true as const } : {}),
        })),
      units: units.map((unit) => ({ key: unit.key, label: unit.label || 'whole question', marks: unit.marks })),
    })),
  };
}

/** Characters a question sends: the chunking budget. */
export const coverageChars = (q: CoverageQuestion): number =>
  q.question.anchors.reduce((n, anchor) => n + Math.max(anchorText(anchor, 'en').length, anchorText(anchor, 'zh').length), 0);

export function buildRequest(
  questions: CoverageQuestion[],
  side: Side,
  whyLanguage: 'en' | 'zh',
  preset: ProviderPreset,
  signal: AbortSignal,
): CompletionRequest {
  const units = questions.reduce((n, q) => n + q.units.length, 0);
  const thinking = preset.family === 'gemini' ? 4096 : 0;
  return {
    system: systemCoverage(whyLanguage),
    turns: [{ role: 'user', content: JSON.stringify(buildPayload(questions, side)) }],
    schema: COVERAGE_SCHEMA,
    shapeHint: SHAPE_HINT,
    maxOutputTokens: Math.min(preset.outputCap, 1024 + 300 * units + thinking),
    signal,
  };
}

export interface RawPick {
  key: string;
  code: string;
  weight: 'main' | 'also';
  band: Band;
  conf: Confidence;
  why: string;
  outside: string;
}

/**
 * The reply's items, or null when it is not an `{items: [...]}` object. An item without a
 * string key and code is dropped; an unknown weight reads 'also', band 'apply', conf 'low'.
 */
export function parsePicks(text: string): RawPick[] | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const items = (parsed as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return null;
  const out: RawPick[] = [];
  for (const item of items) {
    if (typeof item !== 'object' || item === null) continue;
    const { key, code, weight, band, conf, why, outside } = item as Record<string, unknown>;
    if (typeof key !== 'string' || typeof code !== 'string') continue;
    out.push({
      key,
      code: code.trim(),
      weight: weight === 'main' ? 'main' : 'also',
      band: band === 'know' || band === 'evaluate' ? band : 'apply',
      conf: conf === 'high' || conf === 'medium' ? conf : 'low',
      why: typeof why === 'string' ? why.trim() : '',
      outside: typeof outside === 'string' ? outside.trim() : '',
    });
  }
  return out;
}
