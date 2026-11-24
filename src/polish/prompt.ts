import type { CompletionRequest, JsonSchema, ProviderPreset } from '@/ai/types';
import { DSE_STYLE_PROFILE, styleItemOf, type BankQuestion } from '@/dseStyle';
import { isRichTextEmpty } from '@/model/text';
import type { Side } from '@/model/textSlots';
import { encodeRuns, type WireCodec } from '@/translate/wire';
import type { PolishQuestion } from './types';

/**
 * The wording-enhancement request (k-0549): `DSE_STYLE_PROFILE` first, byte for byte the
 * block the Question studio sends (one fixed prefix a provider's prompt cache can reuse),
 * then this task's rules. Texts travel in the translate engine's wire format (`<b>`,
 * `<sub>`, `<blank/>` …), so a teacher's bold, subscripts and blanks come back as they were.
 */

/** Bump with any change to the rendered request (words, payload shape, schema). */
export const POLISH_PROMPT_VERSION = 'p1';

/** Opens the task's rules: tests and the mock server find the request by it. */
export const POLISH_MARKER = 'Task: question-polish.';

export const POLISH_RULES = [
  `${POLISH_MARKER} A teacher wrote these HKDSE Economics Paper 1 multiple-choice questions. Improve their wording, grammar and sentence structure towards the house style above. Do not write new questions.`,
  'Rules:',
  '1. Change only how things are said: wording, grammar, sentence length and order, the question line and its punctuation, parallel options. Leave a text that is already in the house style as it is.',
  '2. Keep the economics: the same concept, situation, assumptions and conclusion. The correct answer stays the same option: return "answer" exactly as given.',
  '3. Keep every number, amount, percentage, year and unit (only the thousands separator may change: 10 000, never 10,000).',
  '4. Keep the statements and the options in their order, one for one. Never add, drop, merge, split or move one, and never turn options into a different set.',
  '5. Keep the economics terms and, in 中文, the EDB terms as written; never swap a term for a synonym.',
  '6. Work only in the languages a text has ("en" English, "zh" Hong Kong Traditional Chinese). Never fill a missing language. Where a text has both, keep the two saying the same thing.',
  '7. Keep the inline tags: <b> bold (the house style\'s **NOT** is <b>NOT</b> here), <i>, <u>, <sub>, <sup>, <s1>…<s9>, <blank/> for a blank line to fill, <br/>. Keep each tag around the same words.',
  '8. Never write the question number, option letters ("A.", "(A)") or statement numbers ("(1)"): the paper prints them.',
  '9. "table" lines are context only (a table in the question, cells split by "|"): never return them.',
  '10. Return only the texts you changed. For each, give "id", the whole new text in every language it has ("" for a language it does not have), and "why": one short reason in English and in 中文 (e.g. "Question line as a direct question." / 「改為直接問句。」). A question needing no change has an empty "fields" list.',
].join('\n');

export const SYSTEM_POLISH = `${DSE_STYLE_PROFILE}\n\n${POLISH_RULES}`;

export const POLISH_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          q: { type: 'string' },
          answer: { type: 'string' },
          fields: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                en: { type: 'string' },
                zh: { type: 'string' },
                why: {
                  type: 'object',
                  properties: { en: { type: 'string' }, zh: { type: 'string' } },
                  required: ['en', 'zh'],
                  additionalProperties: false,
                },
              },
              required: ['id', 'en', 'zh', 'why'],
              additionalProperties: false,
            },
          },
        },
        required: ['q', 'answer', 'fields'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
} as const;

const SHAPE_HINT =
  'Reply with JSON only: {"items":[{"q":"q1","answer":"C","fields":[{"id":"q1.stem1","en":"…","zh":"…","why":{"en":"…","zh":"…"}}]}]}';

/** Each sent text's codec, by `"<field key>|<side>"`: the reply is decoded against it. */
export type Codecs = Map<string, WireCodec>;
export const codecKey = (fieldKey: string, side: Side) => `${fieldKey}|${side}`;

const tableLines = (question: PolishQuestion, side: Side): string[] =>
  (styleItemOf(question.question as unknown as BankQuestion).stem[side] ?? '').split('\n').filter((line) => line.includes(' | '));

export function buildPayload(questions: readonly PolishQuestion[], codecs: Codecs) {
  return {
    questions: questions.map((q) => {
      const table = Object.fromEntries(q.sides.map((side) => [side, tableLines(q, side)]).filter(([, lines]) => lines.length));
      return {
        q: q.key,
        answer: q.answer,
        languages: q.sides,
        fields: q.fields.map((field) => {
          const entry: Record<string, string> = { id: field.key, role: field.kind };
          for (const side of q.sides) {
            if (isRichTextEmpty(field.text[side])) continue;
            const { wire, codec } = encodeRuns(field.text[side]);
            if (!wire.trim()) continue;
            codecs.set(codecKey(field.key, side), codec);
            entry[side] = wire;
          }
          return entry;
        }),
        ...(Object.keys(table).length ? { table } : {}),
      };
    }),
  };
}

/** Characters a question sends: the chunking budget. */
export const questionChars = (q: PolishQuestion): number =>
  q.fields.reduce((n, f) => n + JSON.stringify(f.text).length / 3, 0);

export function buildRequest(questions: readonly PolishQuestion[], preset: ProviderPreset, signal: AbortSignal): { request: CompletionRequest; codecs: Codecs } {
  const codecs: Codecs = new Map();
  const payload = buildPayload(questions, codecs);
  const thinking = preset.family === 'gemini' ? 2048 : 0;
  const sendChars = JSON.stringify(payload).length;
  return {
    codecs,
    request: {
      system: SYSTEM_POLISH,
      turns: [{ role: 'user', content: JSON.stringify(payload) }],
      schema: POLISH_SCHEMA,
      shapeHint: SHAPE_HINT,
      // Every text could come back rewritten, both languages, plus a reason each.
      maxOutputTokens: Math.min(preset.outputCap, 1024 + thinking + Math.ceil(sendChars * 1.2) + 200 * questions.length),
      feature: 'polish',
      signal,
    },
  };
}

export interface RawPolishField {
  id: string;
  en: string;
  zh: string;
  why: { en: string; zh: string };
}
export interface RawPolishItem {
  q: string;
  answer: string;
  fields: RawPolishField[];
}

const str = (x: unknown): string => (typeof x === 'string' ? x : '');

/** The reply's items, or null when it is not an `{items: [...]}` object. Malformed entries are dropped. */
export function parsePolishReply(text: string): RawPolishItem[] | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const items = (parsed as { items?: unknown })?.items;
  if (!Array.isArray(items)) return null;
  const out: RawPolishItem[] = [];
  for (const item of items) {
    if (typeof item !== 'object' || item === null) continue;
    const { q, answer, fields } = item as Record<string, unknown>;
    if (typeof q !== 'string') continue;
    const list: RawPolishField[] = [];
    for (const f of Array.isArray(fields) ? fields : []) {
      if (typeof f !== 'object' || f === null) continue;
      const field = f as Record<string, unknown>;
      if (typeof field.id !== 'string') continue;
      const why = typeof field.why === 'object' && field.why !== null ? (field.why as Record<string, unknown>) : { en: field.why };
      list.push({ id: field.id.trim(), en: str(field.en), zh: str(field.zh), why: { en: str(why.en).trim().slice(0, 240), zh: str(why.zh).trim().slice(0, 240) } });
    }
    out.push({ q: q.trim(), answer: str(answer).trim().toUpperCase(), fields: list });
  }
  return out;
}
