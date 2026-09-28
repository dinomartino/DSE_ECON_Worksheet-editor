import type { CompletionRequest, JsonSchema, ProviderPreset } from '@/ai/types';
import type { Glossary } from '@/glossary/types';
import type { Side } from '@/model/textSlots';
import { SYSTEM_ANSWERS } from './promptText';
import type { AnswerChunk, AnswerPlan, AnswerTarget, ContextLine } from './types';

/** Stamped into reports; bump with any rendered-prompt change (a test pins the sha). */
export const PROMPT_VERSION = 'e1.1';

/**
 * The reply shape. Flat and every field required (no optional fields, unions or length
 * constraints), so it fits Anthropic, OpenAI strict mode and Gemini's subset alike.
 */
export const ANSWERS_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          answerEn: { type: 'string' },
          answerZh: { type: 'string' },
          points: {
            type: 'array',
            items: {
              type: 'object',
              properties: { en: { type: 'string' }, zh: { type: 'string' }, marks: { type: 'integer' } },
              required: ['en', 'zh', 'marks'],
              additionalProperties: false,
            },
          },
          rationales: {
            type: 'array',
            items: {
              type: 'object',
              properties: { option: { type: 'string' }, en: { type: 'string' }, zh: { type: 'string' } },
              required: ['option', 'en', 'zh'],
              additionalProperties: false,
            },
          },
        },
        required: ['key', 'answerEn', 'answerZh', 'points', 'rationales'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
} as const;

/** For the rungs that don't enforce the schema (`CompletionRequest.shapeHint`). */
export const ANSWERS_SHAPE_HINT =
  'Reply with one JSON object only, exactly in this shape: {"items":[{"key":"a1","answerEn":"…","answerZh":"…","points":[{"en":"…","zh":"…","marks":1}],"rationales":[{"option":"A","en":"…","zh":"…"}]}]}';

export function systemPrompt(): string {
  return SYSTEM_ANSWERS;
}

/** English is always asked for: the glossary check reads the Chinese against it. */
export const askedSides = (sides: readonly Side[]): Side[] => (sides.includes('zh') ? ['en', 'zh'] : ['en']);

type PayloadItem =
  | { key: string; type: 'written'; label: string; marks?: number; write: string[]; answer?: { en: string; zh: string } }
  | { key: string; type: 'choice'; options: string[]; correct: string; write: string[] };

export interface AnswersPayload {
  languages: Side[];
  glossary: string[];
  questions: Array<{ question: string; text: ContextLine[]; items: PayloadItem[] }>;
}

const plainOf = (runs: ReadonlyArray<{ text: string }> | undefined) => (runs ?? []).map((r) => r.text).join('').trim();

function itemFor(target: AnswerTarget): PayloadItem {
  const { leaf, needs } = target;
  if (leaf.shape === 'written' && needs.shape === 'written') {
    const write = [...(needs.answer ? ['answer'] : []), ...(needs.scheme ? ['scheme'] : [])];
    const answer = needs.answer ? undefined : { en: plainOf(leaf.answer?.en), zh: plainOf(leaf.answer?.zh) };
    return {
      key: target.key, type: 'written', label: leaf.label, write,
      ...(leaf.marks !== undefined ? { marks: leaf.marks } : {}),
      ...(answer ? { answer } : {}),
    };
  }
  if (leaf.shape === 'choice' && needs.shape === 'choice') {
    const letters = leaf.options.filter((o) => !o.blank).map((o) => o.letter);
    const write = leaf.options.filter((o) => needs.options.includes(o.id)).map((o) => o.letter);
    return { key: target.key, type: 'choice', options: letters, correct: leaf.options[leaf.answerIndex].letter, write };
  }
  throw new Error('answer target shape mismatch');
}

export function buildPayload(plan: AnswerPlan, keys: readonly string[], glossary: Glossary | null, preset: ProviderPreset): AnswersPayload {
  const questions: AnswersPayload['questions'] = [];
  for (const key of keys) {
    const target = plan.targets.get(key)!;
    let group = questions.find((q) => q.question === plan.contexts.get(target.questionId)!.where);
    if (!group) {
      const context = plan.contexts.get(target.questionId)!;
      group = { question: context.where, text: context.lines, items: [] };
      questions.push(group);
    }
    group.items.push(itemFor(target));
  }
  const languages = askedSides(plan.sides);
  const english = questions.flatMap((q) => q.text.map((line) => line.en).filter(Boolean));
  const pins = languages.includes('zh') ? glossary?.pin(english, 'toZh', { denyHints: preset.denyHintsInPrompt }) ?? [] : [];
  return { languages, glossary: pins.map((p) => p.line), questions };
}

/** min(cap, 2048 + 900 a mark (×1.6 bilingual) + a thinking allowance). */
export function maxOutputTokens(plan: AnswerPlan, keys: readonly string[], preset: ProviderPreset): number {
  const weight = plan.sides.includes('zh') ? 1.6 : 1;
  const marks = keys.reduce((n, key) => {
    const leaf = plan.targets.get(key)!.leaf;
    return n + (leaf.shape === 'written' ? Math.max(2, leaf.marks ?? 2) : 3);
  }, 0);
  const thinking = preset.family === 'gemini' ? 4096 : 0;
  return Math.min(preset.outputCap, 2048 + Math.ceil(marks * 900 * weight) + thinking);
}

export function buildRequest(
  plan: AnswerPlan,
  chunk: Pick<AnswerChunk, 'targetKeys'>,
  glossary: Glossary | null,
  preset: ProviderPreset,
  signal: AbortSignal,
): CompletionRequest {
  const payload = buildPayload(plan, chunk.targetKeys, glossary, preset);
  return {
    system: systemPrompt(),
    turns: [{ role: 'user', content: JSON.stringify(payload) }],
    schema: ANSWERS_SCHEMA,
    shapeHint: ANSWERS_SHAPE_HINT,
    maxOutputTokens: maxOutputTokens(plan, chunk.targetKeys, preset),
    signal,
  };
}
