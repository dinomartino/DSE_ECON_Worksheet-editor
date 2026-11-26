import { TAG_CHUNK } from '@/ai/credits';
import type { CompletionRequest, JsonSchema, ProviderPreset } from '@/ai/types';
import { cleanPatternName, samePatternName } from '@/model/patterns';
import { mcqCandidates, VIEW_SECTIONS, viewCodesOf, viewSectionOf, viewTopicOf } from '@/model/mcqView';
import { mcqTag, mcqTagKey, mcqTopic } from '@/model/topicSchemes';
import { isSubTopicCode, topicOf, TOPICS } from '@/model/topics';
import { lookupCode, SYLLABUS } from '@/syllabus';
import type { TagConfidence, TagPartSuggestion, TagQuestion, TagSuggestion } from './types';

/**
 * The AI tagging request (k-0560; k-0569: the teacher's MCQ topics). The topic list is the
 * bank's own: DSEcon Mentor's sections A–J and their 72 MCQ topics (`model/mcqView.ts`), each
 * line a topic's key, its name and what it covers (the 2025 guide's points where the topic is
 * the only one for its EDB code, else a short note), then the EDB electives, which no MCQ
 * topic covers. The model answers with keys; replies are read back as view codes
 * (`@mcq:<key>`, a section letter, an elective code) and anything else is dropped, never
 * shown (`cleanSuggestion`). The bank writes them through the MCQ view, so the EDB codes a
 * topic stands for go on with it.
 */

/** Bump with any change to the rendered request (words, payload shape, schema). */
export const TAG_PROMPT_VERSION = 'k0569.1';

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

const SHAPE_HINT = 'Reply with only {"items":[{"key":"q1","main":"elasticity","also":"","pattern":"","conf":"high","why":"…"}]}.';

/**
 * What an MCQ topic covers, where its name alone is short and the guide's points are shared
 * with its neighbours (several MCQ topics under one EDB code). Words for the model only:
 * never shown.
 */
const COVERS: Readonly<Record<string, string>> = {
  scarcity: 'scarcity and choice, why choices must be made',
  'economic-free-goods': 'free goods versus economic goods',
  'opportunity-cost': 'the opportunity cost of a choice, its calculation',
  interest: 'interest as the reward for capital, interest and time preference',
  'types-of-economy': 'market, planned and mixed economies; how each allocates resources',
  'three-basic-economic-problems': 'what, how and for whom to produce',
  'private-property-rights': 'private property rights: the rights to use, earn income from and transfer',
  'ownership-of-firms': 'sole proprietorship, partnership, private and public limited companies, public enterprises',
  'shares-bonds': 'shares and bonds, shareholders and bondholders, dividends and interest',
  'types-of-production': 'primary, secondary and tertiary production; stages of production',
  'private-public-goods': 'rivalry and excludability, private goods and public goods',
  'consumer-producer-goods': 'consumer goods versus producer (capital) goods',
  'types-of-goods': 'goods and services, other classifications of goods',
  'factors-of-production': 'land, labour, capital and entrepreneurship and their rewards',
  'labour-supply': 'the labour force and the factors affecting labour supply',
  'labour-productivity': 'output per worker or per hour and what raises it',
  'labour-mobility': 'occupational and geographical mobility of labour',
  'wage-payment-methods': 'time rate, piece rate, commission and other ways of paying workers',
  'law-of-diminishing-marginal-returns': 'marginal and average product, diminishing marginal returns in the short run',
  'economies-diseconomies-of-scale': 'internal and external economies and diseconomies of scale',
  'production-short-run-long-run': 'fixed and variable inputs and costs, average and marginal cost, short run versus long run',
  'types-of-expansion': 'horizontal, vertical, lateral and conglomerate integration; internal growth',
  'profit-maximization': 'the profit-maximizing output from price, revenue and cost schedules',
  'basic-supply-demand': 'demand and supply, their determinants and shifts, individual and market demand and supply, the equilibrium price and quantity',
  'shortage-surplus': 'shortage, surplus and queuing at a price away from equilibrium',
  'consumer-producer-surplus': 'marginal benefit, willingness to pay, consumer and producer surplus',
  'price-ceiling': 'a legal maximum price, its shortage and non-price allocation',
  'price-floor': 'a legal minimum price (e.g. a minimum wage), its surplus',
  quota: 'a quantity restriction on output or sales',
  'per-unit-tax': 'a specific tax per unit: who bears it, tax revenue, effects on price and quantity',
  'per-unit-subsidy': 'a specific subsidy per unit: who benefits, its cost, effects on price and quantity',
  efficiency: 'allocative and productive efficiency, deadweight loss',
  externalities: 'external costs and benefits, market failure and ways to correct it',
  gdp: 'GDP by the expenditure, income and production approaches; value added',
  'gnp-gni': 'GNI (GNP) and net factor income from abroad',
  'real-nominal-gdp': 'real and nominal GDP, the GDP deflator and price indices, per capita GDP',
  'problems-of-barter': 'double coincidence of wants and the other problems of barter',
  'function-of-money': 'medium of exchange, store of value, unit of account, standard of deferred payment',
  'properties-of-good-money': 'what makes good money: acceptability, durability, divisibility, portability',
  'banking-system': "banks' functions and balance sheets, the three-tier system",
  'function-of-hkma': 'the Hong Kong Monetary Authority and its roles',
  liquidity: 'the liquidity of assets, liquidity ratios',
  'm1-m2-m3': 'the definitions of M1, M2 and M3',
  'deposit-creation-contraction': 'deposit creation and contraction, the required reserve ratio, the banking multiplier',
  'monetary-base': 'the monetary base and its parts',
  'fiscal-monetary-policies': 'expansionary and contractionary fiscal and monetary policy, the government budget',
  'inflation-deflation': 'the causes and effects of inflation and deflation, the CPI',
  'nominal-real-interest-rate': 'nominal versus real interest rates',
  'quantity-theory-of-money': 'the equation of exchange MV = PY',
  'principles-of-taxation': 'principles of taxation: equity, certainty, convenience, economy',
  'progressive-regressive-proportional-tax': 'progressive, proportional and regressive taxes',
  tax: 'direct and indirect taxes, tax revenue',
  'tax-base-tax-net-effects-of-tax-changes': 'the tax base, the tax net and the effects of changing a tax',
  'in-trade-calculation': 'calculating comparative advantage, terms of trade and gains from trade',
  'in-trade-concept': 'absolute and comparative advantage, specialization and gains from trade as ideas',
  'trade-barriers': 'tariffs, quotas, subsidies and other trade barriers',
  'balance-of-payment': 'the current, capital and financial accounts; visible and invisible trade',
  'exchange-rate': 'exchange rate determination, appreciation and depreciation',
  'linked-exchange-rate': "Hong Kong's Linked Exchange Rate System",
};

/** The guide's points for an EDB code, where they say more than the names. */
function guidePoints(code: string, ...names: string[]): string[] {
  const keyPoint = lookupCode(code)?.keyPoint;
  return (keyPoint?.points ?? []).map((p) => p.en).filter((en) => en !== keyPoint?.en && !names.includes(en));
}

/**
 * "# C Market and Price" then one line per MCQ topic: "per-unit-tax  Per-unit Tax: a
 * specific tax per unit: …". A topic that is the only one for its EDB code also carries the
 * guide's points. Then the electives ("# EL1 …", EDB codes), which no MCQ topic covers.
 */
export function topicList(): string {
  const lines: string[] = [];
  for (const section of VIEW_SECTIONS) {
    const elective = section.code.startsWith('EL');
    lines.push(`# ${section.code} ${section.en}${elective ? ' (elective part)' : ''}`);
    if (elective) {
      for (const topic of TOPICS.find((t) => t.code === section.code)?.children ?? []) {
        const points = guidePoints(topic.code, topic.en);
        lines.push(`${topic.code}  ${topic.en}${points.length ? `: ${points.join('; ')}` : ''}`);
      }
      continue;
    }
    for (const node of section.children) {
      const topic = mcqTopic(node.key!)!;
      const own = topic.edb.filter((code) => isSubTopicCode(code) && mcqCandidates(code).length === 1);
      const points = own.flatMap((code) => guidePoints(code, topic.en, topicOf(code)?.en ?? ''));
      const covers = [COVERS[topic.key], ...points].filter(Boolean);
      lines.push(`${topic.key}  ${topic.en}${covers.length ? `: ${covers.join('; ')}` : ''}`);
    }
  }
  return lines.join('\n');
}

export function systemTag(whyLanguage: 'en' | 'zh'): string {
  const language = whyLanguage === 'zh' ? 'Traditional Chinese as used in Hong Kong' : 'plain English';
  return `You are an ${TAG_MARKER}. A teacher keeps a bank of their own Hong Kong secondary (HKDSE) Economics questions and wants each one filed under the syllabus topic it TESTS: what a student must know or do to answer it, not words that merely appear in the text.

INPUT is a JSON object. "questions" lists questions, each with a "key", a "format", its printed "entries" in order (role: stem; leadIn = data printed before a part; statement; option; part, with its "label" such as "(b)(ii)") with their words in "text", and the "keyed": true option of a multiple-choice question. <b>…</b> is bold, <u>…</u> underlined; [Diagram …] and [Picture …] describe figures; "| a | b |" is a table row. A question may also carry "patterns": the teacher's own names for kinds of question, listed under a topic code. A question may carry "parts": the labels of its parts to file one by one.

LIST holds the topics. "# C Market and Price" heads a part; each line under it is a topic code, its name and what it covers.

OUTPUT only a JSON object {"items":[…]} with exactly one item per question, or, for a question with "parts", exactly one item per listed part and none for the question itself:
- "key": the question's key, exactly as given; for a part, the question's key followed by the part's label, e.g. "q3(b)(ii)".
- "main": the ONE topic code from LIST the question mostly tests, e.g. "per-unit-tax". Use a part's code alone (e.g. "B") only when the question fits that part but no topic line in it.
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

/** The LIST codes a 題型's EDB sub-topic falls under: its MCQ topics' keys, else (an elective) itself. */
export function listCodesOf(code: string): string[] {
  const keys = mcqCandidates(code);
  return keys.length > 0 ? keys : [code];
}

/** A view code as LIST writes it: `@mcq:quota` → `quota`; a section or elective code as itself. */
export const listCode = (view: string): string => mcqTagKey(view) ?? view;

/**
 * The teacher's 題型 (kept under EDB sub-topics, k-0569) as LIST codes: a name under
 * 'C.intervention' is offered under each of its MCQ topics.
 */
export function listPatterns(patterns: Readonly<Record<string, readonly string[]>> | undefined): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [code, names] of Object.entries(patterns ?? {})) {
    for (const key of listCodesOf(code)) out[key] = [...new Set([...(out[key] ?? []), ...names])];
  }
  return out;
}

/** The teacher's 題型 a reply named under its main topic (a view code), as stored: under its EDB sub-topic. */
export function storedPattern(question: Pick<TagQuestion, 'patterns'>, main: string, raw: string): { topic: string; name: string } | undefined {
  const name = cleanPatternName(raw);
  if (!name) return undefined;
  for (const [code, names] of Object.entries(question.patterns ?? {})) {
    if (!listCodesOf(code).includes(listCode(main))) continue;
    const stored = names.find((p) => samePatternName(p, name));
    if (stored) return { topic: code, name: stored };
  }
  return undefined;
}

export function buildPayload(questions: readonly TagQuestion[]) {
  return {
    questions: questions.map((q) => ({
      key: q.key,
      format: q.format,
      entries: q.entries.map((e) => ({ role: e.role, ...(e.label ? { label: e.label } : {}), text: e.text, ...(e.keyed ? { keyed: true as const } : {}) })),
      ...(q.patterns && Object.keys(q.patterns).length > 0 ? { patterns: listPatterns(q.patterns) } : {}),
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
 * The view code (`model/mcqView.ts`) of what the model wrote: an MCQ key ("per-unit-tax",
 * "@mcq:per-unit-tax", any case) → `@mcq:per-unit-tax`; a section or elective code ("C",
 * "EL1.pricing", " el1.PRICING ") as itself; an EDB code from an older habit ("C.ped",
 * "C.ped#arc") → the one view code it reads as; else undefined.
 */
export function knownCode(raw: string): string | undefined {
  const bare = raw.trim().replace(/#.*$/, '').replace(/^@mcq:/i, '');
  if (!bare) return undefined;
  if (mcqTopic(bare.toLowerCase())) return mcqTag(bare.toLowerCase());
  const at = bare.indexOf('.');
  const code = at < 0 ? bare.toUpperCase() : `${bare.slice(0, at).toUpperCase()}.${bare.slice(at + 1).toLowerCase()}`;
  if (!topicOf(code)) return undefined;
  const view = viewCodesOf([code]);
  return view.length === 1 ? view[0] : undefined;
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
  // A section ("C") beside a topic in it says nothing more.
  const topics = codes
    .filter((code) => viewTopicOf(code)?.kind !== 'section' || !codes.some((other) => other !== code && viewSectionOf(other) === code))
    .slice(0, MAX_TOPICS);
  if (topics.length === 0) return undefined;
  const pattern = storedPattern(question, topics[0], raw.pattern);
  return { topics, ...(pattern ? { pattern } : {}) };
}

/**
 * The model's item as a suggestion the bank can save: main first, then the others, only view
 * codes, no repeats, no section beside one of its own topics. A 題型 only when it is one of
 * the teacher's names under the main topic (kept under its EDB sub-topic). Undefined when no
 * code is usable.
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
