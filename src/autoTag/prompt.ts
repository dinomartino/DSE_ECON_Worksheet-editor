import { TAG_CHUNK } from '@/ai/credits';
import type { CompletionRequest, JsonSchema, ProviderPreset } from '@/ai/types';
import { cleanPatternName, samePatternName } from '@/model/patterns';
import { TOPICS, topicOf } from '@/model/topics';
import { lookupCode, SYLLABUS } from '@/syllabus';
import type { TagConfidence, TagPartSuggestion, TagQuestion, TagSuggestion } from './types';

/**
 * The AI tagging request (k-0560). The topic list is the bank's own tree (`TOPICS`: parts
 * A–J, EL1, EL2 and their topics), each topic followed by the 2025 guide's points it covers
 * (`SYLLABUS`, the coverage check's data), so the model files a question by what it tests.
 * Replies are checked against the tree: a code the bank does not know is dropped, never
 * shown (`cleanSuggestion`).
 */

/** Bump with any change to the rendered request (words, payload shape, schema). */
export const TAG_PROMPT_VERSION = 'k0560.3';

/** Opens the system prompt: tests and the mock provider find the request by it. */
export const TAG_MARKER = 'HKDSE Economics question-bank tagger';

/** Up to this many questions in one request (`ai/credits.ts` prices it). */
export { TAG_CHUNK };
/** And at most about this many characters of question text. */
export const TAG_CHUNK_CHARS = 9000;

/** Flat, every field required (the client's ladder needs it); items-shaped like the other verbs. */
export const TAG_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          main: { type: 'string' },
          also: { type: 'string' },
          pattern: { type: 'string' },
          conf: { type: 'string', enum: ['high', 'medium', 'low'] },
          why: { type: 'string' },
        },
        required: ['key', 'main', 'also', 'pattern', 'conf', 'why'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
} as const;

const SHAPE_HINT = 'Reply with only {"items":[{"key":"q1","main":"C.ped","also":"","pattern":"","conf":"high","why":"…"}]}.';

/**
 * What questions filed under a topic are often about, where the guide's points are too short
 * to say (the guide's own detail; the past-paper bank files questions this way). Words for
 * the model only: never shown.
 */
const ALSO: Readonly<Record<string, string>> = {
  'A.scarcity': 'free goods and economic goods, opportunity cost',
  'A.basic-problems': 'economic systems (market, planned, mixed), how goods are allocated',
  'B.production-types': 'primary, secondary and tertiary production',
  'B.factors': 'labour supply, labour productivity, labour mobility, wage payment methods (time rate, piece rate), land, capital, entrepreneurship',
  'B.costs': 'fixed and variable costs, average and marginal cost, economies of scale, horizontal, vertical, lateral and conglomerate integration',
  'B.objectives': 'the profit-maximizing output from price and marginal cost schedules',
  'C.equilibrium': 'shortage, surplus and queuing at a price away from equilibrium',
  'C.surplus': 'marginal benefit, total benefit, willingness to pay',
  'F.price-level': 'CPI and GDP deflator calculations, real and nominal values',
  'F.unemployment': 'calculating unemployment and underemployment rates and the labour force',
  'H.banks': "banks' balance sheets and liquidity, the HKMA",
  'H.money-supply': 'M1, M2, M3, deposit creation and contraction, the monetary base',
  'I.fiscal': 'the government budget, principles of taxation, direct and indirect taxes, progressive, proportional and regressive taxes',
  'J.bop': 'visible and invisible trade, current account balance',
};

/**
 * "# C Market and Price" then one line per topic: "C.ped  Price elasticity of demand: arc
 * elasticity; determinants; …" (the guide's points, where they say more than the name).
 */
export function topicList(): string {
  const lines: string[] = [];
  for (const part of TOPICS) {
    const elective = part.code.startsWith('EL') ? ' (elective part)' : '';
    lines.push(`# ${part.code} ${part.en}${elective}`);
    for (const topic of part.children) {
      const keyPoint = lookupCode(topic.code)?.keyPoint;
      const points = (keyPoint?.points ?? []).map((p) => p.en).filter((en) => en !== keyPoint?.en && en !== topic.en);
      const also = ALSO[topic.code] ? ` (also: ${ALSO[topic.code]})` : '';
      lines.push(`${topic.code}  ${topic.en}${points.length ? `: ${points.join('; ')}` : ''}${also}`);
    }
  }
  return lines.join('\n');
}

export function systemTag(whyLanguage: 'en' | 'zh'): string {
  const language = whyLanguage === 'zh' ? 'Traditional Chinese as used in Hong Kong' : 'plain English';
  return `You are an ${TAG_MARKER}. A teacher keeps a bank of their own Hong Kong secondary (HKDSE) Economics questions and wants each one filed under the syllabus topic it TESTS: what a student must know or do to answer it, not words that merely appear in the text.

INPUT is a JSON object. "questions" lists questions, each with a "key", a "format", its printed "entries" in order (role: stem; leadIn = data printed before a part; statement; option; part, with its "label" such as "(b)(ii)") with their words in "text", and the "keyed": true option of a multiple-choice question. <b>…</b> is bold, <u>…</u> underlined; [Diagram …] and [Picture …] describe figures; "| a | b |" is a table row. A question may also carry "patterns": the teacher's own names for kinds of question, listed under a topic code. A question may carry "parts": the labels of its parts to file one by one.

LIST holds the topics. "# C Market and Price" heads a part; each line under it is a topic code, its name and the points it covers.

OUTPUT only a JSON object {"items":[…]} with exactly one item per question, or, for a question with "parts", exactly one item per listed part and none for the question itself:
- "key": the question's key, exactly as given; for a part, the question's key followed by the part's label, e.g. "q3(b)(ii)".
- "main": the ONE topic code from LIST the question mostly tests, e.g. "C.ped". Use a part's code alone (e.g. "G") only when the question fits that part but no topic line in it.
- "also": at most two more codes from LIST the question also needs to be answered, comma-separated; "" when none (most questions need none).
- "pattern": when the question carries "patterns" under its "main" code, the one name from that list that describes it, copied exactly; "" when none fits or there are none.
- "conf": "high" when the question cannot be answered without the main topic; "medium" when it fits but another could; "low" for a guess.
- "why": one short sentence in ${language} saying what the question asks the student to do.
For a part, file what THAT part asks; the stem, the data and earlier parts are only its context, so two parts of one question often test different topics.
Use only codes from LIST. Questions from an older syllabus go to the closest topic.

LIST
${topicList()}`;
}

/** The items a question gets back: one per part, else one. */
export const questionItems = (q: TagQuestion): number => Math.max(1, q.parts?.length ?? 0);

/** The words a question sends, in characters: the chunking budget. */
export const questionChars = (q: TagQuestion): number => q.entries.reduce((n, e) => n + e.text.length + (e.label?.length ?? 0), 0);

export function buildPayload(questions: readonly TagQuestion[]) {
  return {
    questions: questions.map((q) => ({
      key: q.key,
      format: q.format,
      entries: q.entries.map((e) => ({ role: e.role, ...(e.label ? { label: e.label } : {}), text: e.text, ...(e.keyed ? { keyed: true as const } : {}) })),
      ...(q.patterns && Object.keys(q.patterns).length > 0 ? { patterns: q.patterns } : {}),
      ...(q.parts && q.parts.length > 0 ? { parts: q.parts.map((part) => part.label) } : {}),
    })),
  };
}

export function buildRequest(questions: readonly TagQuestion[], whyLanguage: 'en' | 'zh', preset: ProviderPreset, signal: AbortSignal): CompletionRequest {
  const thinking = preset.family === 'gemini' ? 2048 : 0;
  return {
    system: systemTag(whyLanguage),
    turns: [{ role: 'user', content: JSON.stringify(buildPayload(questions)) }],
    schema: TAG_SCHEMA,
    shapeHint: SHAPE_HINT,
    maxOutputTokens: Math.min(preset.outputCap, 600 + 160 * questions.reduce((n, q) => n + questionItems(q), 0) + thinking),
    feature: 'tag',
    signal,
  };
}

export interface RawTag {
  key: string;
  main: string;
  also: string;
  pattern: string;
  conf: TagConfidence;
  why: string;
}

/** The reply's items, or null when it is not an `{items: [...]}` object. An item without a string key is dropped. */
export function parseTagReply(text: string): RawTag[] | null {
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
  const out: RawTag[] = [];
  const str = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  for (const item of items) {
    if (typeof item !== 'object' || item === null) continue;
    const { key, main, also, pattern, conf, why } = item as Record<string, unknown>;
    if (typeof key !== 'string') continue;
    out.push({
      key: key.trim(),
      main: str(main),
      also: Array.isArray(also) ? also.filter((a): a is string => typeof a === 'string').join(',') : str(also),
      pattern: str(pattern),
      conf: conf === 'high' || conf === 'medium' ? conf : 'low',
      why: str(why),
    });
  }
  return out;
}

/**
 * A code the bank knows, from what the model wrote: "C.ped", "C.ped#arc" (a guide point:
 * its topic), " c.PED " (case), or undefined.
 */
export function knownCode(raw: string): string | undefined {
  const bare = raw.trim().replace(/#.*$/, '');
  if (!bare) return undefined;
  const at = bare.indexOf('.');
  const code = at < 0 ? bare.toUpperCase() : `${bare.slice(0, at).toUpperCase()}.${bare.slice(at + 1).toLowerCase()}`;
  return topicOf(code) ? code : undefined;
}

/** At most this many topics in one suggestion. */
export const MAX_TOPICS = 3;

/** The codes and 題型 of one item, checked: undefined when no code is usable. */
function cleanCodes(raw: RawTag, question: TagQuestion): Pick<TagSuggestion, 'topics' | 'pattern'> | undefined {
  const codes: string[] = [];
  for (const piece of [raw.main, ...raw.also.split(/[,;，、\s]+/)]) {
    const code = knownCode(piece);
    if (code && !codes.includes(code)) codes.push(code);
  }
  // "C" beside "C.ped" says nothing more.
  const topics = codes.filter((code) => topicOf(code)?.parent !== undefined || !codes.some((other) => topicOf(other)?.parent === code)).slice(0, MAX_TOPICS);
  if (topics.length === 0) return undefined;
  const main = topics[0];
  const name = cleanPatternName(raw.pattern);
  const stored = name ? question.patterns?.[main]?.find((p) => samePatternName(p, name)) : undefined;
  return { topics, ...(stored ? { pattern: { topic: main, name: stored } } : {}) };
}

/**
 * The model's item as a suggestion the bank can save: main first, then the others, only known
 * codes, no repeats, no part beside one of its own topics. A 題型 only when it is one of the
 * teacher's names under the main topic. Undefined when no code is usable.
 */
export function cleanSuggestion(raw: RawTag, question: TagQuestion): TagSuggestion | undefined {
  const codes = cleanCodes(raw, question);
  if (!codes) return undefined;
  return { rootId: question.rootId, ...codes, conf: raw.conf, why: raw.why };
}

/** How sure the least sure part is. */
const LEAST: Record<TagConfidence, number> = { high: 2, medium: 1, low: 0 };

/** An item key as compared: case and spaces, and a ":" or "." between question and part, ignored. */
export const itemKey = (key: string): string => key.toLowerCase().replace(/[\s:.]+/g, '');

/**
 * One question's suggestion from the reply's items (`find` by `itemKey`). A question with parts
 * takes one item per part ("q3(b)(ii)"), checked like a whole question's; `complete` says
 * every part has one. Undefined when nothing usable came back.
 */
export function suggestionOf(question: TagQuestion, find: (key: string) => RawTag | undefined): { suggestion?: TagSuggestion; complete: boolean } {
  if (!question.parts || question.parts.length === 0) {
    const raw = find(itemKey(question.key));
    const suggestion = raw ? cleanSuggestion(raw, question) : undefined;
    return { ...(suggestion ? { suggestion } : {}), complete: Boolean(suggestion) };
  }
  const parts: TagPartSuggestion[] = [];
  for (const part of question.parts) {
    const raw = find(itemKey(`${question.key}${part.label}`));
    const codes = raw ? cleanCodes(raw, question) : undefined;
    if (raw && codes) parts.push({ label: part.label, slot: part.slot, ...codes, conf: raw.conf, why: raw.why });
  }
  if (parts.length === 0) return { complete: false };
  const conf = parts.reduce<TagConfidence>((least, part) => (LEAST[part.conf] < LEAST[least] ? part.conf : least), 'high');
  return {
    suggestion: { rootId: question.rootId, topics: [...new Set(parts.flatMap((part) => part.topics))], conf, why: '', parts },
    complete: parts.length === question.parts.length,
  };
}

/** Every key point in the guide is a topic in the bank's tree (the list leans on it). */
export const guideTopicsInTree = (): boolean => SYLLABUS.topics.every((t) => t.keyPoints.every((k) => topicOf(k.code)?.parent === t.code));
