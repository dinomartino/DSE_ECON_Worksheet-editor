import type { CompletionRequest, JsonSchema, ProviderPreset } from '@/ai/types';
import type { Glossary } from '@/glossary/types';
import type { Side } from '@/model/textSlots';
import type { GenerateInput, Recipe } from './types';

/**
 * The request for "Questions from a source": one flat schema (no optional fields or
 * unions, so it fits OpenAI strict mode, Anthropic and Gemini), a static system prompt
 * and one JSON payload. `SOURCE_TASK_MARKER` opens the system prompt; the mock server
 * answers on it.
 */

export const SOURCE_TASK_MARKER = 'Task: questions-from-source.';

const BI: JsonSchema = {
  type: 'object',
  properties: { en: { type: 'string' }, zh: { type: 'string' } },
  required: ['en', 'zh'],
  additionalProperties: false,
};

const POINT: JsonSchema = {
  type: 'object',
  properties: { text: BI, marks: { type: 'integer' } },
  required: ['text', 'marks'],
  additionalProperties: false,
};

const PART: JsonSchema = {
  type: 'object',
  properties: { stem: BI, marks: { type: 'integer' }, answer: BI, points: { type: 'array', items: POINT } },
  required: ['stem', 'marks', 'answer', 'points'],
  additionalProperties: false,
};

export const SOURCE_QUESTIONS_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string' },
          stem: BI,
          statements: { type: 'array', items: BI },
          options: { type: 'array', items: BI },
          answer: { type: 'integer' },
          explanation: BI,
          parts: { type: 'array', items: PART },
        },
        required: ['kind', 'stem', 'statements', 'options', 'answer', 'explanation', 'parts'],
        additionalProperties: false,
      },
    },
  },
  required: ['questions'],
  additionalProperties: false,
};

/** For rungs that don't enforce the schema (json_object, prompt). */
export const SOURCE_SHAPE_HINT =
  'Reply with one JSON object only, exactly in this shape: {"questions":[{"kind":"mcq","stem":{"en":"…","zh":"…"},' +
  '"statements":[],"options":[{"en":"…","zh":"…"}],"answer":0,"explanation":{"en":"…","zh":"…"},"parts":[]},' +
  '{"kind":"structured","stem":{"en":"…","zh":"…"},"statements":[],"options":[],"answer":0,"explanation":{"en":"","zh":""},' +
  '"parts":[{"stem":{"en":"…","zh":"…"},"marks":2,"answer":{"en":"…","zh":"…"},"points":[{"text":{"en":"…","zh":"…"},"marks":1}]}]}]}';

export const SOURCE_SYSTEM_PROMPT = [
  SOURCE_TASK_MARKER,
  'You write HKDSE Economics questions for Hong Kong secondary-school teachers, grounded ONLY in the source the teacher pastes.',
  'Rules:',
  '1. Use only the facts, figures and names in the source. Never invent data, dates or numbers: every number in a stem or statement must appear in the source.',
  '2. Make exactly what "make" asks for, in that order: the MCQs first, then the structured question.',
  '3. An MCQ ("kind":"mcq") has one stem, exactly four options and one key: "answer" is the index 0–3 of the correct option. No two options alike, no "all of the above", no letters (A., B.) before options and no number before the stem. "parts" is [].',
  '4. A combination item (HKEAA style) puts two to four statements in "statements", without "(1)" labels (the paper adds them). Its stem asks which statements are correct; its four options are combinations written exactly like "(1) and (2) only", "(1) and (3) only", "(2) and (3) only", "(1), (2) and (3)" — in Chinese "只有(1)及(2)", "(1)、(2)及(3)".',
  '5. A structured question ("kind":"structured") has a short lead-in stem and its parts (a), (b), (c)… in "parts", without the letters. Each part has integer "marks"; the question totals the marks asked for. Use HKDSE command words (State, Identify, Describe, Explain, With reference to the source, Calculate, Discuss) and write a number word the student must meet in bold capitals: **ONE**, **TWO**. "statements" and "options" are [] and "answer" is 0.',
  '6. Every part has a model "answer" and marking "points" whose marks add up to the part\'s marks. Every MCQ has a one- or two-sentence "explanation" of why the key is right.',
  '7. Write every text in the languages listed in "languages"; a language not listed is "". Chinese is Traditional Chinese as in Hong Kong DSE papers, using the EDB Economics glossary terms in "glossary" exactly.',
  '8. Pitch at HKDSE (S4–S6): test understanding and application of economics to the source, not recall of its wording.',
  'Return JSON only.',
].join('\n');

const PAPER_NAME: Record<Recipe['paper'], string> = {
  paper1: 'HKDSE Economics Paper 1 (multiple choice)',
  lqMock: 'HKDSE Economics Paper 2 (Question-Answer Book)',
  lqWorksheet: 'long-question worksheet (Paper 2 style)',
  classroom: 'classroom worksheet',
};

export function buildPayload(input: GenerateInput, glossary: Glossary | null, sourceSide: Side, denyHints: boolean): Record<string, unknown> {
  const { recipe } = input;
  const make: Record<string, unknown> = {};
  if (recipe.mcq) make.mcq = { count: recipe.mcq, combinationItemsAtLeast: recipe.combination };
  if (recipe.structured) make.structured = { count: recipe.structured, totalMarks: `${recipe.marks.min}–${recipe.marks.max}` };
  // Pins only when the model writes the language the source isn't in.
  const other: Side = sourceSide === 'en' ? 'zh' : 'en';
  const pins = glossary && input.sides.includes(other)
    ? glossary.pin([input.source], sourceSide === 'en' ? 'toZh' : 'toEn', { denyHints })
    : [];
  return {
    task: 'questions-from-source',
    paper: PAPER_NAME[recipe.paper],
    make,
    languages: input.sides.map((side) => (side === 'en' ? 'en' : 'zh')),
    glossary: pins.map((pin) => pin.line),
    source: input.source,
  };
}

/** Output room: roughly 3 000 tokens per language, plus a thinking allowance, under the cap. */
export function maxOutputTokens(sides: number, preset: ProviderPreset): number {
  const thinking = preset.family === 'gemini' ? 4096 : 0;
  return Math.min(preset.outputCap, 2048 + 3000 * Math.max(1, sides) + thinking);
}

export function buildSourceRequest(
  input: GenerateInput,
  glossary: Glossary | null,
  sourceSide: Side,
  preset: ProviderPreset,
  signal: AbortSignal,
): CompletionRequest {
  return {
    system: SOURCE_SYSTEM_PROMPT,
    turns: [{ role: 'user', content: JSON.stringify(buildPayload(input, glossary, sourceSide, preset.denyHintsInPrompt)) }],
    schema: SOURCE_QUESTIONS_SCHEMA,
    shapeHint: SOURCE_SHAPE_HINT,
    maxOutputTokens: maxOutputTokens(input.sides.length, preset),
    signal,
  };
}
