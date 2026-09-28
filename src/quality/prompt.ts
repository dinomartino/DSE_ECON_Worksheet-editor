import type { CompletionRequest, JsonSchema, ProviderPreset } from '@/ai/types';
import type { QualityAnchor } from '@/registry/types';
import { anchorText } from './collect';
import { SYSTEM_QUALITY } from './promptText';
import { MODEL_ISSUES, type ModelIssue, type QualitySeverity, type QualityQuestion } from './types';

/** Bump with any change to the rendered request (words, payload shape, schema). */
export const PROMPT_VERSION = 'e4.1';

/**
 * Items-shaped, so a provider on a rung without schema enforcement (which is told the
 * plain `{items:[{key,text}]}` shape) still answers something `parseFindings` reads.
 */
export const FINDINGS_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          issue: { type: 'string', enum: [...MODEL_ISSUES] },
          severity: { type: 'string', enum: ['fix', 'look'] },
          text: { type: 'string' },
          suggestion: { type: 'string' },
        },
        required: ['key', 'issue', 'severity', 'text', 'suggestion'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
} as const;

/** Request-local keys: "q1", and "q1.A" / "q1.(b)(ii)" for an entry. Never an app id. */
export const questionKey = (index: number) => `q${index + 1}`;
export const anchorKey = (qKey: string, anchor: QualityAnchor) => `${qKey}.${anchor.ref.replace(/\s+/g, '')}`;

export interface PayloadEntry {
  key: string;
  role: QualityAnchor['role'];
  en?: string;
  zh?: string;
  marks?: number;
  marksTotal?: true;
  keyed?: true;
}

/** `keys[i]` is `questions[i]`'s run-wide key. */
export function buildPayload(questions: QualityQuestion[], keys: string[]) {
  return {
    questions: questions.map((question, index) => ({
      key: keys[index],
      format: question.format,
      entries: question.anchors.map((anchor): PayloadEntry => {
        const en = anchorText(anchor, 'en');
        const zh = anchorText(anchor, 'zh');
        return {
          key: anchorKey(keys[index], anchor),
          role: anchor.role,
          ...(en ? { en } : {}),
          ...(zh ? { zh } : {}),
          ...(anchor.marks !== undefined ? { marks: anchor.marks } : {}),
          ...(anchor.marksTotal ? { marksTotal: true as const } : {}),
          ...(anchor.keyed ? { keyed: true as const } : {}),
        };
      }),
    })),
  };
}

/** Characters a question sends: the chunking budget. */
export const questionChars = (question: QualityQuestion): number =>
  question.anchors.reduce((n, anchor) => n + anchorText(anchor, 'en').length + anchorText(anchor, 'zh').length, 0);

export function buildRequest(
  questions: QualityQuestion[],
  keys: string[],
  preset: ProviderPreset,
  signal: AbortSignal,
): CompletionRequest {
  const thinking = preset.family === 'gemini' ? 4096 : 0;
  return {
    system: SYSTEM_QUALITY,
    turns: [{ role: 'user', content: JSON.stringify(buildPayload(questions, keys)) }],
    schema: FINDINGS_SCHEMA,
    maxOutputTokens: Math.min(preset.outputCap, 1024 + 500 * questions.length + thinking),
    signal,
  };
}

export interface RawFinding {
  key: string;
  issue: ModelIssue;
  severity: QualitySeverity;
  text: string;
  suggestion: string;
}

const ISSUES: ReadonlySet<string> = new Set(MODEL_ISSUES);

/**
 * The reply's findings, or null when it is not an `{items: [...]}` object. An item
 * without a string key and text is dropped; an unknown issue reads 'other', an unknown
 * severity 'look'.
 */
export function parseFindings(text: string): RawFinding[] | null {
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
  const out: RawFinding[] = [];
  for (const item of items) {
    if (typeof item !== 'object' || item === null) continue;
    const { key, issue, severity, text: words, suggestion } = item as Record<string, unknown>;
    if (typeof key !== 'string' || typeof words !== 'string' || !words.trim()) continue;
    out.push({
      key,
      issue: typeof issue === 'string' && ISSUES.has(issue) ? (issue as ModelIssue) : 'other',
      severity: severity === 'fix' ? 'fix' : 'look',
      text: words.trim(),
      suggestion: typeof suggestion === 'string' ? suggestion.trim() : '',
    });
  }
  return out;
}
