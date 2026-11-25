import { simplifiedChars } from '@/translate/simplified';

/**
 * The deterministic half of the HKDSE Paper 1 MC house style (k-0548): the rules of
 * `profile.ts` a program can check without an AI call. Each rule holds on (nearly) every
 * HKDSE Paper 1 question in the past-paper bank: `check.test.ts` runs the check over the
 * bank when `DSE_BANK_DIR` points at its `topics/` folder, and the counts are in
 * `Outbox/k-0548/DSE-STYLE.md`. Findings are notes to read, never a block.
 *
 * Input is plain text per side with `**bold**` (a Question studio draft as it is, or an
 * editor question turned into the same shape): no dependency on the studio or the editor.
 */

export type StyleSide = 'en' | 'zh';
export type StyleText = Readonly<Partial<Record<StyleSide, string>>>;

export interface StyleItem {
  /** Set-up and question line; paragraphs split by "\n", table rows written with "|". */
  stem: StyleText;
  /** A combination item's numbered statements, in order; empty otherwise. */
  statements: readonly StyleText[];
  options: readonly StyleText[];
}

export type StyleFindingId =
  | 'style.negativeCase'
  | 'style.comboForm'
  | 'style.comboOnly'
  | 'style.comboOrder'
  | 'style.numberOrder'
  | 'style.thousandsComma'
  | 'style.optionStops'
  | 'style.statementStops'
  | 'style.blankSeparator'
  | 'style.questionMark'
  | 'style.zhPunctuation'
  | 'style.zhSimplified'
  | 'style.zhMoney'
  | 'style.contraction'
  | 'style.filler'
  | 'style.longSentence'
  | 'style.spelling';

/** Every id, in the order findings are reported. */
export const STYLE_FINDING_IDS: readonly StyleFindingId[] = [
  'style.negativeCase', 'style.questionMark', 'style.comboForm', 'style.comboOnly', 'style.comboOrder',
  'style.numberOrder', 'style.thousandsComma', 'style.optionStops', 'style.statementStops', 'style.blankSeparator',
  'style.zhPunctuation', 'style.zhSimplified', 'style.zhMoney', 'style.contraction', 'style.filler', 'style.longSentence', 'style.spelling',
];

export interface StyleFinding {
  id: StyleFindingId;
  params?: Readonly<Record<string, string | number>>;
}

// ---- text helpers ----

const text = (t: StyleText | undefined, side: StyleSide): string => (t?.[side] ?? '').trim();
/** Plain words: bold marks and sub/superscript marks dropped. */
const plainOf = (s: string): string => s.replace(/\*\*/g, '').replace(/[_^]\{([^}]*)\}/g, '$1');
const isTableLine = (line: string): boolean => (line.match(/\|/g)?.length ?? 0) >= 1 && line.split('|').filter((c) => c.trim()).length >= 2;
const BLANK = /_{3,}/;
const BLANKS = /_{3,}/g;

/** The stem's paragraphs that are words (not table rows), raw (bold marks kept). */
function paragraphs(stem: string): string[] {
  return stem.split('\n').map((l) => l.trim()).filter((l) => l && !isTableLine(l));
}

function sentences(paragraph: string, side: StyleSide): string[] {
  const parts = side === 'en' ? paragraph.split(/(?<=[.?!])\s+(?=[A-Z(“"])/) : paragraph.split(/(?<=[。？！])/);
  return parts.map((s) => s.trim()).filter(Boolean);
}

/** The sentence that asks: the last sentence of the last paragraph that is words. */
function askingSentence(stem: string, side: StyleSide): string {
  const last = paragraphs(stem).at(-1) ?? '';
  return sentences(last, side).at(-1) ?? '';
}

const words = (s: string): number => (s.match(/[A-Za-z0-9$%'’.,-]+/g) ?? []).length;
const zhLength = (s: string): number => s.replace(/[\s，。？！：；、（）「」()]/g, '').length;

// ---- rules ----

/** A negative that turns the question round; HKEAA prints it in capitals (and bold). */
const NEGATIVE_EN = /\b(not|least|except|incorrect|inconsistent|cannot|false)\b/gi;

function negativeCase(stem: string): boolean {
  const ask = plainOf(askingSentence(stem, 'en'));
  if (!/^(?:.*?\b)?(?:which|what)\b/i.test(ask)) return false;
  return [...ask.matchAll(NEGATIVE_EN)].some((m) => m[1] !== m[1].toUpperCase());
}

const ASKS_EN = /^(?:in\s+)?(?:which|what|how|who|why|whose)\b/i;
const ASKS_ZH = /哪|甚麼|什麼|多少|何者|為何|為甚麼/;

function questionMark(stem: string, side: StyleSide): boolean {
  const ask = plainOf(askingSentence(stem, side)).trim();
  if (!ask || BLANK.test(ask)) return false;
  // A question word that opens a sentence the options finish ("Which … if she transfers $500 000,") is not a question.
  if (side === 'en') return ASKS_EN.test(ask) && !/[?,:]$/.test(ask);
  // 中文: a question word in the closing clause, ending neither "？" nor in a blank or ":".
  const clause = ask.split(/[，,]/).at(-1) ?? ask;
  return ASKS_ZH.test(clause) && !/[？?：:]$/.test(ask);
}

/** The statement numbers an option names: "(1) and (3) only" → [1, 3]. */
const setOf = (option: string): number[] => [...option.matchAll(/[(（]\s*([1-9])\s*[)）]/g)].map((m) => Number(m[1]));

const COMBO_EN = /^\(\d\)(?:(?:, \(\d\))* and \(\d\))?(?: only)?\.?$/;
const COMBO_ZH = /^(?:只有\s*)?\(\d\)(?:\s*、\s*\(\d\))*(?:\s*及\s*\(\d\))?。?$/;

function comboFindings(item: StyleItem, side: StyleSide): StyleFinding[] {
  const n = item.statements.length;
  if (n < 2) return [];
  const opts = item.options.map((o) => plainOf(text(o, side)).replace(/\s+/g, ' ').trim());
  const sets = opts.map(setOf);
  if (!sets.every((s) => s.length > 0)) return [];
  const out: StyleFinding[] = [];
  const form = side === 'en' ? COMBO_EN : COMBO_ZH;
  const ascending = (s: number[]) => s.every((v, i) => i === 0 || v > s[i - 1]);
  // 中文 joins two statements with 「、」 (「只有 (1)、(2)」: 505 of 515 such options; 「及」 only in the Sample Paper); 「及」 comes before the last of three or more.
  const zhPair = (o: string, set: number[]) => side === 'zh' && set.length === 2 && o.includes('及');
  if (opts.some((o, i) => !form.test(o) || !ascending(sets[i]) || zhPair(o, sets[i]))) out.push({ id: 'style.comboForm', params: { side } });
  const only = side === 'en' ? /\bonly\b/ : /只有/;
  if (opts.some((o, i) => (sets[i].length < n) !== only.test(o))) out.push({ id: 'style.comboOnly', params: { side } });
  const cmp = (a: number[], b: number[]) => {
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
    return a.length - b.length;
  };
  const bySize = (a: number[], b: number[]) => a.length - b.length || cmp(a, b);
  const inOrder = (f: (a: number[], b: number[]) => number) => sets.every((s, i) => i === 0 || f(sets[i - 1], s) < 0);
  if (!inOrder(bySize) && !inOrder(cmp)) out.push({ id: 'style.comboOrder', params: { side } });
  return out;
}

/** An option that is one number (with its sign, $, %, unit), as a value; null when it is words. */
export function optionNumber(option: string): number | null {
  const t = plainOf(option).trim().replace(/[.。]$/, '');
  const m = /^([+\-−]?)\s*(?:HK|US)?\$?\s*([+\-−]?)(\d{1,3}(?:[ ,]\d{3})+|\d+)(\.\d+)?\s*(%|million|billion|units?|百萬元|億元|萬元|元|個單位|單位)?$/.exec(t);
  if (!m) return null;
  const sign = /[-−]/.test(m[1] + m[2]) ? -1 : 1;
  return sign * Number(m[3].replace(/[ ,]/g, '') + (m[4] ?? ''));
}

function numberOrder(item: StyleItem, side: StyleSide): boolean {
  if (item.statements.length >= 2) return false;
  const values = item.options.map((o) => optionNumber(text(o, side)));
  if (values.length < 2 || values.some((v) => v === null)) return false;
  return !values.every((v, i) => i === 0 || (v as number) >= (values[i - 1] as number));
}

/** "10,000": HKEAA writes "10 000". A comma between digits groups of three, not a list "1, 2". */
const THOUSANDS_COMMA = /(?<![\d.])\d{1,3}(?:,\d{3})+(?![\d,])/;

const endsWithStop = (s: string): boolean => /[.。]$/.test(plainOf(s).trim());

function mixedStops(list: readonly StyleText[], side: StyleSide): boolean {
  const ends = list.map((t) => text(t, side)).filter((t) => t && optionNumber(t) === null).map(endsWithStop);
  return ends.length >= 2 && ends.some(Boolean) && ends.some((e) => !e);
}

/** Two blanks: every option reads "X ... Y" (or "X …… Y"), or none does. */
function blankSeparator(item: StyleItem, side: StyleSide): boolean {
  const blanks = plainOf(text(item.stem, side)).match(BLANKS)?.length ?? 0;
  if (blanks !== 2 || item.statements.length >= 2) return false;
  const seps = item.options.map((o) => /\.{2,}|…/.test(text(o, side)));
  return seps.some(Boolean) && seps.some((s) => !s);
}

/** Half-width punctuation in 中文 text: "，" "？" "：" "；" "！" and a closing "。". */
const ZH_HALF = /[㐀-鿿][,?:;!]|[,?:;!](?=[㐀-鿿])|[㐀-鿿]\.(?!\d)(?=\s|$)/;


const CONTRACTION = /\b\w+n['’]t\b|\b(?:it|that|there|what|let)['’]s\b|\b\w+['’](?:re|ll|ve|d)\b/i;

const FILLER_EN: readonly [RegExp, string][] = [
  [/\bfurthermore\b/i, 'furthermore'], [/\bmoreover\b/i, 'moreover'], [/\badditionally\b/i, 'additionally'],
  [/\bnotably\b/i, 'notably'], [/\bit is worth noting\b/i, 'it is worth noting'], [/\bit should be noted\b/i, 'it should be noted'],
  [/\bimagine\b/i, 'imagine'], [/\bscenario\b/i, 'scenario'], [/\bin today['’]s\b/i, "in today's"],
  [/\bceteris paribus\b/i, 'ceteris paribus'], [/\bother things (?:being )?(?:equal|unchanged)\b/i, 'other things being equal'],
];
const FILLER_ZH: readonly [RegExp, string][] = [
  [/此外/, '此外'], [/值得注意/, '值得注意'], [/試想/, '試想'], [/情境/, '情境'], [/情景/, '情景'], [/場景/, '場景'],
  [/其他(?:條件|因素|情況)不變/, '其他條件不變'],
];

const AMERICAN: readonly [RegExp, string][] = [
  [/\blabor\b/i, 'labour'], [/\bbehaviors?\b/i, 'behaviour'], [/\bfavor(?:s|ed|ing|able)?\b/i, 'favour'], [/\bcent(?:er|ers)\b/i, 'centre'],
  [/\bcolors?\b/i, 'colour'], [/\bneighbors?\b/i, 'neighbour'], [/\banalyzed?\b/i, 'analyse'],
];

/** Longest sentence measured in the bank: 42 words, 81 中文 characters. */
const LONG_EN = 45;
const LONG_ZH = 90;

const ZH_MONEY = /\$\s?\d[\d ,.]*\s?(?:百萬|億|萬)元/;

/** Every style finding for one question, for the sides written. */
export function checkDseStyle(item: StyleItem, sides: readonly StyleSide[]): StyleFinding[] {
  const found = new Map<StyleFindingId, StyleFinding>();
  const add = (f: StyleFinding) => {
    if (!found.has(f.id)) found.set(f.id, f);
  };
  for (const side of sides) {
    const stem = text(item.stem, side);
    if (!stem) continue;
    const fields = [stem, ...item.statements.map((s) => text(s, side)), ...item.options.map((o) => text(o, side))].filter(Boolean);
    const all = fields.map(plainOf).join('\n');

    if (side === 'en' && negativeCase(stem)) add({ id: 'style.negativeCase' });
    if (questionMark(stem, side)) add({ id: 'style.questionMark', params: { side } });
    for (const f of comboFindings(item, side)) add(f);
    if (numberOrder(item, side)) add({ id: 'style.numberOrder', params: { side } });
    const comma = THOUSANDS_COMMA.exec(all);
    if (comma) add({ id: 'style.thousandsComma', params: { side, example: comma[0] } });
    if (mixedStops(item.options, side)) add({ id: 'style.optionStops', params: { side } });
    if (mixedStops(item.statements, side)) add({ id: 'style.statementStops', params: { side } });
    if (blankSeparator(item, side)) add({ id: 'style.blankSeparator', params: { side } });

    if (side === 'zh') {
      const half = fields.map(plainOf).find((f) => ZH_HALF.test(f));
      if (half) add({ id: 'style.zhPunctuation', params: { example: ZH_HALF.exec(half)?.[0] ?? '' } });
      // The translator's list: Simplified-only characters, none used in Traditional (src/translate/simplified.ts).
      const simp = simplifiedChars(all);
      if (simp.length) add({ id: 'style.zhSimplified', params: { example: simp.slice(0, 3).join('') } });
      // An amount in 百萬元／億元／萬元 carries no "$" (「400 百萬元」, 58 times on the papers; 「$400 百萬元」 never).
      const money = ZH_MONEY.exec(all);
      if (money) add({ id: 'style.zhMoney', params: { example: money[0].trim() } });
    } else {
      const c = CONTRACTION.exec(all);
      if (c) add({ id: 'style.contraction', params: { example: c[0] } });
      const us = AMERICAN.find(([rx]) => rx.test(all));
      if (us) add({ id: 'style.spelling', params: { example: all.match(us[0])?.[0] ?? '', british: us[1] } });
    }
    const filler = (side === 'en' ? FILLER_EN : FILLER_ZH).find(([rx]) => rx.test(all));
    if (filler) add({ id: 'style.filler', params: { side, example: filler[1] } });

    const longest = Math.max(0, ...paragraphs(stem).flatMap((p) => sentences(plainOf(p), side)).map((s) => (side === 'en' ? words(s) : zhLength(s))));
    if (longest > (side === 'en' ? LONG_EN : LONG_ZH)) add({ id: 'style.longSentence', params: { side, length: longest } });
  }
  return STYLE_FINDING_IDS.flatMap((id) => (found.has(id) ? [found.get(id) as StyleFinding] : []));
}
