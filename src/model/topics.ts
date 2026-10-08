/**
 * The HKDSE Economics topic taxonomy (EDB C&A Guide S4–6, 2025 update): titles only.
 * `Question.tags` stores codes ('C', 'C.ped'); names are looked up here, so renaming a
 * topic never touches a document. Fine codes are frozen slugs — never renumber or remove.
 */

import type { LanguageMode } from './types';

export type TopicLang = 'en' | 'zh';

export interface Topic {
  /** 'C' (coarse) or 'C.ped' (fine). */
  code: string;
  en: string;
  zh: string;
  /** The coarse code a fine topic sits under; absent on a coarse topic. */
  parent?: string;
  /** Fine topics under a coarse one, in guide order; empty on a fine topic. */
  children: Topic[];
}

type Row = [code: string, en: string, zh: string, subs: Array<[slug: string, en: string, zh: string]>];

const DATA: Row[] = [
  ['A', 'Basic Economic Concepts', '基本經濟概念', [
    ['social-science', 'Economics as a social science', '經濟學作為一門社會科學'],
    ['scarcity', 'Scarcity, choice and opportunity cost', '稀少性，選擇和機會成本'],
    ['basic-problems', 'Three basic economic problems', '三個基本經濟問題'],
    ['specialization', 'Specialization and exchange', '專門化及交易'],
    ['circular-flow', 'Circular flow', '經濟活動的循環流程'],
    ['positive-normative', 'Positive and normative statements', '實證性和規範性的陳述'],
  ]],
  ['B', 'Firms and Production', '廠商與生產', [
    ['ownership', 'Ownership of firms', '廠商的所有權'],
    ['production-types', 'Types and stages of production', '生產的種類/階段'],
    ['goods', 'Types of goods and services', '物品和服務的種類'],
    ['division-of-labour', 'Division of labour', '分工'],
    ['factors', 'Factors of production', '生產要素'],
    ['costs', 'Production and costs', '短期和長期生產及生產成本'],
    ['objectives', 'Objectives of firms', '廠商目標'],
  ]],
  ['C', 'Market and Price', '市場與價格', [
    ['law-of-demand', 'Law of demand', '需求定律'],
    ['individual-demand', 'Individual demand', '個別需求'],
    ['market-demand', 'Market demand', '市場需求'],
    ['individual-supply', 'Individual supply', '個別供應'],
    ['market-supply', 'Market supply', '市場供應'],
    ['equilibrium', 'Demand, supply and price', '需求、供應和價格的相互作用'],
    ['surplus', 'Consumer and producer surplus', '消費者盈餘及生產者盈餘'],
    ['price-functions', 'Functions of prices', '價格的功能'],
    ['ped', 'Price elasticity of demand', '需求價格彈性'],
    ['pes', 'Price elasticity of supply', '供應價格彈性'],
    ['intervention', 'Market intervention', '市場干預'],
  ]],
  ['D', 'Competition and Market Structure', '競爭與市場結構', [
    ['structure', 'Perfect and imperfect competition', '完全競爭和不完全競爭'],
  ]],
  ['E', 'Efficiency, Equity and the Role of Government', '效率、公平和政府的角色', [
    ['efficiency', 'Efficiency', '效率'],
    ['equity', 'Equity', '公平'],
    ['policy', 'Policy concerns', '政策的考慮'],
  ]],
  ['F', 'Measurement of Economic Performance', '經濟表現的量度', [
    ['national-income', 'National income', '國民收入'],
    ['price-level', 'General price level', '一般物價水平'],
    ['unemployment', 'Unemployment and underemployment rates', '失業率及就業不足率'],
    ['hk-trends', 'Recent Hong Kong trends', '香港近期趨勢'],
  ]],
  ['G', 'National Income Determination and Price Level', '國民收入決定及價格水平', [
    ['ad', 'Aggregate demand', '總需求'],
    ['as', 'Aggregate supply', '總供應'],
    ['equilibrium', 'Determination of output and price level', '產出和價格水平的決定'],
  ]],
  ['H', 'Money and Banking', '貨幣與銀行', [
    ['money', 'Money', '貨幣'],
    ['banks', 'Banks', '銀行的功能和服務'],
    ['money-supply', 'Money supply', '貨幣供應'],
    ['money-demand', 'Money demand', '貨幣需求'],
    ['interest', 'Interest-rate determination', '貨幣市場中利率的決定'],
    ['financial-centre', 'Hong Kong as a financial centre', '香港作為金融中心'],
  ]],
  ['I', 'Macroeconomic Problems and Policies', '宏觀經濟問題和政策', [
    ['cycles', 'Business cycles', '經濟周期'],
    ['inflation', 'Inflation and deflation', '通貨膨脹和通貨緊縮'],
    ['unemployment', 'Unemployment', '失業'],
    ['fiscal', 'Fiscal policy', '財政政策'],
    ['monetary', 'Monetary policy', '貨幣政策'],
  ]],
  ['J', 'International Trade and Finance', '國際貿易和金融', [
    ['trade', 'Free trade and trade barriers', '自由貿易及貿易障礙'],
    ['bop', 'Balance of payments', '國際收支平衡表'],
    ['exchange-rate', 'Exchange rate', '匯率'],
  ]],
  ['EL1', 'Monopoly Pricing, Anti-competitive Behaviours and Competition Policy', '壟斷定價、反競爭行為及競爭政策', [
    ['pricing', 'Monopoly pricing', '壟斷定價'],
    ['competition-policy', 'Anti-competitive behaviours and competition policy', '反競爭行為及競爭政策'],
  ]],
  ['EL2', 'Extension of Trade Theory, Economic Growth and Development', '貿易理論之延伸、經濟增長及發展', [
    ['trade-theory', 'Extension of trade theory', '貿易理論之延伸'],
    ['growth', 'Economic growth and development', '經濟增長及發展'],
  ]],
];

/**
 * **The tag grammar** (§ docs/design/question-library.md, Tag grammar). Reserved now so no
 * teacher's tag can be read as something a later build means by it:
 *  - a **topic code** is a coarse code (one capital letter, or `EL` and a number: `C`,
 *    `EL1`) or a coarse code, a dot and a lower-case slug (`C.ped`). Anything in this shape
 *    is a topic code, known here or not, and never a free tag. Narrow on purpose, so
 *    "MCQ", "S5" or "DSE2023" stay free tags; a later build's coarse topic must fit it;
 *  - a **題型** is a sub-topic code, `::`, a name (`C.ped::Calculate PED`; `model/patterns.ts`);
 *  - a tag starting with `SYSTEM_TAG_SIGIL` is a **system tag**, kept for later builds;
 *  - anything else is a **free tag**.
 */
export const TOPIC_CODE_PATTERN = /^(?:[A-Z]|EL[0-9]+)(?:\.[a-z0-9-]+)?$/;

/** Starts a system tag (`@…`): none exist yet; a later build's are kept, never typed. */
export const SYSTEM_TAG_SIGIL = '@';

/** A tag in the reserved system namespace. */
export function isSystemTag(tag: unknown): boolean {
  return typeof tag === 'string' && tag.startsWith(SYSTEM_TAG_SIGIL);
}

/** A string in the topic-code grammar, whether or not this build knows the code. */
export function isTopicCode(tag: unknown): boolean {
  return typeof tag === 'string' && TOPIC_CODE_PATTERN.test(tag);
}

/** A sub-topic code by grammar (`C.ped`, or a later build's `C.new`). */
export function isSubTopicCode(tag: unknown): tag is string {
  return typeof tag === 'string' && isTopicCode(tag) && tag.includes('.');
}

/** The coarse topics in guide order, each with its fine `children`. */
export const TOPICS: readonly Topic[] = DATA.map(([code, en, zh, subs]) => ({
  code,
  en,
  zh,
  children: subs.map(([slug, subEn, subZh]) => ({
    code: `${code}.${slug}`,
    en: subEn,
    zh: subZh,
    parent: code,
    children: [],
  })),
}));

const BY_CODE = new Map<string, Topic>(
  TOPICS.flatMap((topic) => [[topic.code, topic] as const, ...topic.children.map((c) => [c.code, c] as const)]),
);

/** The topic a code names, coarse or fine; undefined for a free-text tag. */
export function topicOf(code: string): Topic | undefined {
  return BY_CODE.get(code);
}

/**
 * 'C.ped' → 'C', by grammar: a later build's 'C.new' → 'C' too. A coarse code or a free
 * tag → undefined.
 */
export function parentCode(code: string): string | undefined {
  return isSubTopicCode(code) ? code.slice(0, code.indexOf('.')) : undefined;
}

/**
 * The known topic a tag falls under: its own, or for a sub-topic this build does not know
 * ('C.new'), its coarse topic. Undefined for a free tag or an unknown coarse code.
 */
export function rollupTopic(tag: string): Topic | undefined {
  return topicOf(tag) ?? topicOf(parentCode(tag) ?? '');
}

/**
 * Whether a question's tags fall under `code`: the code itself, or (for a coarse code) any
 * of its fine codes, known or not. Free-text tags never match a code.
 */
export function matchesTopic(tags: readonly string[] | undefined, code: string): boolean {
  if (!tags || !topicOf(code)) return false;
  return tags.some((tag) => tag === code || parentCode(tag) === code);
}

/**
 * A question's tags as this build reads them: strings only. Anything else (a newer build's
 * shape, a hand-edited file) stays in the document untouched and is never read.
 */
export function stringTags(tags: unknown): string[] {
  return Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === 'string') : [];
}

/** The topic's name in one language; a free-text tag is returned as itself. */
export function topicLabel(code: string, lang: TopicLang): string {
  const topic = topicOf(code);
  return topic ? topic[lang] : code;
}

/** Which names a label shows: one language, or both ("Law of demand 需求定律"). */
export type TopicNames = TopicLang | 'both';

/**
 * **Topic names are paper words**: they follow the language the questions are shown in,
 * never the interface. Both languages show both where there is `room`, else English, the
 * side a bilingual paper leads with.
 */
export function topicNamesFor(language: LanguageMode, room: 'tight' | 'wide' = 'tight'): TopicNames {
  if (language !== 'bilingual') return language;
  return room === 'wide' ? 'both' : 'en';
}

/**
 * **How a topic reads on screen**, everywhere: its name, never its slug ("Law of demand",
 * or with `both`, "Law of demand 需求定律"). A code this build does not list (a later
 * syllabus's `C.new`, or `K`) and a free tag read as stored (§ the tag grammar).
 */
export function topicDisplay(code: string, names: TopicNames = 'en'): string {
  const topic = topicOf(code);
  if (!topic) return code;
  return names === 'both' ? `${topic.en} ${topic.zh}` : topic[names];
}

/**
 * The name with its coarse letter first, where the topic is not otherwise clear: "C · Law
 * of demand", "C · Market and Price". Also the full form for a tooltip behind a cut-off
 * name. An unknown code or a free tag reads as stored.
 */
export function topicHeading(code: string, names: TopicNames = 'en'): string {
  const topic = topicOf(code);
  if (!topic) return code;
  return `${topic.parent ?? topic.code} · ${topicDisplay(code, names)}`;
}
