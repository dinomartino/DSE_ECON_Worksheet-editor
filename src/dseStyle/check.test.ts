import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { styleItemOf, type BankQuestion } from './bank';
import { checkDseStyle, optionNumber, STYLE_FINDING_IDS, type StyleItem, type StyleFindingId } from './check';

const ids = (item: StyleItem, sides: ('en' | 'zh')[] = ['en', 'zh']) => checkDseStyle(item, sides).map((f) => f.id);
const bi = (en: string, zh = '') => ({ en, zh });
const item = (stem: [string, string], options: [string, string][], statements: [string, string][] = []): StyleItem => ({
  stem: bi(...stem),
  options: options.map(([en, zh]) => bi(en, zh)),
  statements: statements.map(([en, zh]) => bi(en, zh)),
});

/** A clean HKDSE-shaped question: nothing to report. */
const CLEAN = item(
  ['Suppose the government imposes a per-unit tax on Good X.\nWhich of the following is most likely to happen?', '假設政府向物品 X 徵收從量稅。\n下列哪項最可能出現？'],
  [
    ['The price of Good X rises.', '物品 X 的價格上升。'],
    ['The price of Good X falls.', '物品 X 的價格下降。'],
    ['The output of Good X rises.', '物品 X 的產量上升。'],
    ['The output of Good X remains unchanged.', '物品 X 的產量不變。'],
  ],
);

const COMBO_OK: [string, string][] = [
  ['(1) and (2) only', '只有 (1)、(2)'],
  ['(1) and (3) only', '只有 (1)、(3)'],
  ['(2) and (3) only', '只有 (2)、(3)'],
  ['(1), (2) and (3)', '(1)、(2) 及 (3)'],
];
const STATEMENTS: [string, string][] = [
  ['Its price rises.', '其價格上升。'],
  ['Its output falls.', '其產量下降。'],
  ['Its revenue falls.', '其收益下降。'],
];
const comboItem = (options: [string, string][], statements = STATEMENTS) =>
  item(['Which of the following statements are correct?', '下列哪些陳述是正確的？'], options, statements);

describe('checkDseStyle: rules', () => {
  it('passes a question in the house style', () => {
    expect(ids(CLEAN)).toEqual([]);
    expect(ids(comboItem(COMBO_OK))).toEqual([]);
  });

  it('wants an asking negative in capitals, not a "not" in the set-up', () => {
    const lower = { ...CLEAN, stem: bi('Which of the following is not a function of money?') };
    expect(ids(lower, ['en'])).toEqual(['style.negativeCase']);
    expect(ids({ ...CLEAN, stem: bi('Which of the following is **NOT** a function of money?') }, ['en'])).toEqual([]);
    expect(ids({ ...CLEAN, stem: bi('Banks do not hold excess reserves. Which of the following is correct?') }, ['en'])).toEqual([]);
  });

  it('wants a question mark on a question, not on a blank', () => {
    expect(ids({ ...CLEAN, stem: bi('Which of the following is most likely to happen.', '下列哪項最可能出現。') })).toEqual(['style.questionMark']);
    expect(checkDseStyle({ ...CLEAN, stem: bi('', '下列哪項最可能出現') }, ['zh'])[0]).toEqual({ id: 'style.questionMark', params: { side: 'zh' } });
    expect(ids({ ...CLEAN, stem: bi('The price will ________.', '價格會 ________。') })).toEqual([]);
  });

  it('reads combination options: form, "only", order', () => {
    expect(ids(comboItem([['1 and 2', '1、2'], ...COMBO_OK.slice(1)]))).toEqual([]); // not a set at all: shape's business
    expect(ids(comboItem([['(1) & (2) only', '只有 (1) 和 (2)'], ...COMBO_OK.slice(1)]))).toContain('style.comboForm');
    expect(ids(comboItem([['(2) and (1) only', '只有 (2)、(1)'], ...COMBO_OK.slice(1)]))).toContain('style.comboForm');
    // 「及」 between two statements: the pre-profile studio form and the Sample Paper's, not the papers' (k-0548 A/B).
    expect(ids(comboItem(COMBO_OK.map(([en, zh]) => [en, zh.replace(/只有 \((\d)\)、\((\d)\)/, '只有(\$1)及(\$2)')]) as [string, string][]), ['zh'])).toEqual(['style.comboForm']);
    expect(ids(comboItem(COMBO_OK), ['zh'])).toEqual([]);
    expect(ids(comboItem([['(1) and (2)', '(1)、(2)'], ...COMBO_OK.slice(1)]))).toEqual(['style.comboOnly']);
    expect(ids(comboItem([...COMBO_OK.slice(0, 3), ['(1), (2) and (3) only', '只有 (1)、(2)、(3)']]))).toEqual(['style.comboOnly']);
    expect(ids(comboItem([COMBO_OK[3], ...COMBO_OK.slice(0, 3)]))).toEqual(['style.comboOrder']);
    // Size order and plain number order both pass.
    const bySize: [string, string][] = [['(1) only', '只有 (1)'], ['(3) only', '只有 (3)'], ['(1) and (2) only', '只有 (1)、(2)'], ['(2) and (3) only', '只有 (2)、(3)']];
    expect(ids(comboItem(bySize))).toEqual([]);
    const four: [string, string][] = [['(1) and (3) only', '只有 (1)、(3)'], ['(1) and (4) only', '只有 (1)、(4)'], ['(2) and (3) only', '只有 (2)、(3)'], ['(2) and (4) only', '只有 (2)、(4)']];
    expect(ids(comboItem(four, [...STATEMENTS, ['Its cost rises.', '其成本上升。']]))).toEqual([]);
  });

  it('wants numeric options ascending and thousands spaced', () => {
    const nums = (xs: string[]) => item(['What is the price?', '價格是多少？'], xs.map((x) => [x, x] as [string, string]));
    expect(ids(nums(['$350', '$400', '$450', '$500']))).toEqual([]);
    expect(ids(nums(['-70', '-10', '+10', '+70']))).toEqual([]);
    expect(ids(nums(['$1 500 million', '$1 700 million', '$1 800 million', '$2 300 million']))).toEqual([]);
    expect(ids(nums(['$400', '$350', '$450', '$500']))).toEqual(['style.numberOrder']);
    expect(ids(nums(['$1,500', '$1,700', '$1,800', '$2,300']))).toEqual(['style.thousandsComma']);
    expect(optionNumber('−10')).toBe(-10);
    expect(optionNumber('1 500 百萬元')).toBe(1500);
    expect(optionNumber('a rise of 10%')).toBeNull();
  });

  it('wants options and statements to end alike', () => {
    const mixed = item(['Which of the following is correct?', '下列哪項正確？'], [
      ['Its price rises.', '其價格上升。'], ['its output falls', '其產量下降'], ['Its cost rises.', '其成本上升。'], ['Its revenue falls.', '其收益下降。'],
    ]);
    expect(ids(mixed)).toEqual(['style.optionStops']);
    expect(ids(comboItem(COMBO_OK, [['Its price rises.', '其價格上升。'], ['its output falls', '其產量下降'], ['Its revenue falls.', '其收益下降。']]))).toEqual(['style.statementStops']);
  });

  it('wants two-blank options all as "X ... Y"', () => {
    const blank = (opts: string[]) =>
      item(['Income will ________ and the price level will ________.', '收入會 ______，而物價水平會 ______。'], opts.map((o) => [o, o.replace('...', '……')] as [string, string]));
    expect(ids(blank(['increase ... rise', 'increase ... fall', 'decrease ... rise', 'decrease ... fall']))).toEqual([]);
    expect(ids(blank(['increase ... rise', 'increase, fall', 'decrease ... rise', 'decrease ... fall']))).toEqual(['style.blankSeparator']);
  });

  it('reads 中文 punctuation and characters', () => {
    expect(ids({ ...CLEAN, stem: bi('', '假設政府向物品 X 徵收從量稅,下列哪項最可能出現？') }, ['zh'])).toEqual(['style.zhPunctuation']);
    expect(ids({ ...CLEAN, stem: bi('', '下列哪項最可能出現?') }, ['zh'])).toEqual(['style.zhPunctuation']);
  });

  it('money in 百萬元／億元 has no "$" in 中文 (style.zhMoney)', () => {
    const money = (zh: string) => item(['What is the GNI of Country A?', zh], [['$1 760 million', '1 760 百萬元'], ['$1 820 million', '1 820 百萬元'], ['$2 040 million', '2 040 百萬元'], ['$2 160 million', '2 160 百萬元']]);
    expect(ids(money('甲國的本地居民總收入是多少？'), ['zh'])).toEqual([]);
    expect(ids(money('若政府開支增加 $30 億元，甲國的本地居民總收入是多少？'), ['zh'])).toEqual(['style.zhMoney']);
    expect(ids(money('若政府開支增加$1 500百萬元，甲國的本地居民總收入是多少？'), ['zh'])).toEqual(['style.zhMoney']);
    // 「$230 億」 (no 元) is on the papers.
    expect(ids(money('若政府開支增加 $230 億，甲國的本地居民總收入是多少？'), ['zh'])).toEqual([]);
    expect(ids({ ...CLEAN, stem: bi('', '下列哪项最可能出现？') }, ['zh'])).toEqual(['style.zhSimplified']);
    // Statement numbers and Latin text stay half-width.
    expect(ids(comboItem(COMBO_OK), ['zh'])).toEqual([]);
    expect(ids({ ...CLEAN, stem: bi('', '香港 2020 年的 GDP (以港元計算) 上升。下列哪項最可能出現？') }, ['zh'])).toEqual([]);
  });

  it('reads register: contractions, filler, spelling, long sentences', () => {
    const en = (stem: string) => ids({ ...CLEAN, stem: bi(stem) }, ['en']);
    expect(en("The firm doesn't change its price. Which of the following is correct?")).toEqual(['style.contraction']);
    expect(en("Hong Kong's exports rise. Which of the following is correct?")).toEqual([]);
    expect(en('Imagine a firm in a competitive market. Which of the following is correct?')).toEqual(['style.filler']);
    expect(en('Ceteris paribus, which of the following is correct?')).toEqual(['style.filler']);
    expect(en('The labor market is tight. Which of the following is correct?')).toEqual(['style.spelling']);
    expect(en(`${'The market '.repeat(24)}is tight. Which of the following is correct?`)).toEqual(['style.longSentence']);
    expect(ids({ ...CLEAN, stem: bi('', '在其他條件不變下，下列哪項最可能出現？') }, ['zh'])).toEqual(['style.filler']);
  });

  it('reads only the sides asked for, each finding once', () => {
    const both = { ...CLEAN, stem: bi('Which of the following is correct.', '下列哪項正確。') };
    expect(checkDseStyle(both, ['en']).map((f) => f.id)).toEqual(['style.questionMark']);
    expect(checkDseStyle(both, ['en', 'zh']).filter((f) => f.id === 'style.questionMark')).toHaveLength(1);
  });

  it('reports in a fixed order', () => {
    const many = ids({ ...CLEAN, stem: bi("Which of the following isn't correct.") }, ['en']);
    expect(many).toEqual(STYLE_FINDING_IDS.filter((id) => many.includes(id)));
  });
});

/**
 * The proof the rules are the house style: every HKDSE Paper 1 question in the past-paper
 * bank (DSE, Practice and Sample Papers; no CE or AL) passes nearly every rule. Point
 * DSE_BANK_DIR at a checkout's `topics/` (github.com/dinomartino/dse-econ-question-bank);
 * skipped without it, so CI needs no network.
 */
const BANK = process.env.DSE_BANK_DIR;
describe.skipIf(!BANK || !existsSync(BANK))('checkDseStyle on the HKDSE past papers', () => {
  it('passes nearly every real question', () => {
    const seen = new Set<string>();
    const hits = new Map<StyleFindingId, string[]>();
    let total = 0;
    let clean = 0;
    for (const file of readdirSync(BANK as string).filter((f) => f.endsWith('.json'))) {
      const doc = JSON.parse(readFileSync(path.join(BANK as string, file), 'utf8')) as { questions: (BankQuestion & { tags?: string[]; lineage?: { rootId?: string } })[] };
      for (const q of doc.questions) {
        const source = q.tags?.find((t) => t.includes('/')) ?? '';
        if (!/^DSE(?:PP|SP)?\d*\/P1\//.test(source)) continue;
        const root = q.lineage?.rootId ?? source;
        if (seen.has(root)) continue;
        seen.add(root);
        total += 1;
        const found = checkDseStyle(styleItemOf(q), ['en', 'zh']);
        if (!found.length) clean += 1;
        for (const f of found) hits.set(f.id, [...(hits.get(f.id) ?? []), `${source}${f.params?.side ? `:${f.params.side}` : ''}${f.params?.example ? ` "${f.params.example}"` : ''}`]);
      }
    }
    const report = [...hits].map(([id, where]) => `${id}: ${where.length} — ${where.slice(0, 6).join(', ')}`);
    console.log(`DSE style check: ${clean} of ${total} questions clean\n${report.join('\n')}`);
    expect(total).toBeGreaterThan(700);
    expect(clean / total).toBeGreaterThan(0.95);
    for (const [, where] of hits) expect(where.length / total).toBeLessThan(0.02);
  });
});

/**
 * What the check catches on drafts the AI wrote before the profile: point DSE_STYLE_DRAFTS at
 * JSON files (comma-separated) holding drafts `{ stem, statements?, options }` (an array, or an
 * object of them, e.g. a studio before/after dump). Prints each draft's findings.
 */
const DRAFTS = process.env.DSE_STYLE_DRAFTS;
describe.skipIf(!DRAFTS)('checkDseStyle on recorded drafts', () => {
  it('lists what each draft would be told', () => {
    type Draft = { stem?: { en?: string; zh?: string }; statements?: { en?: string; zh?: string }[]; options?: { en?: string; zh?: string }[] };
    const lines: string[] = [];
    let total = 0;
    let flagged = 0;
    const counts = new Map<string, number>();
    for (const file of (DRAFTS as string).split(',')) {
      const data = JSON.parse(readFileSync(file, 'utf8')) as Draft[] | Record<string, Draft>;
      const entries = Array.isArray(data) ? data.map((d, i) => [String(i + 1), d] as const) : Object.entries(data);
      for (const [name, d] of entries) {
        if (!d?.stem || !d.options) continue;
        const sides = (['en', 'zh'] as const).filter((s) => d.stem?.[s]?.trim());
        const found = checkDseStyle({ stem: d.stem, statements: d.statements ?? [], options: d.options }, sides);
        total += 1;
        if (found.length) flagged += 1;
        for (const f of found) counts.set(f.id, (counts.get(f.id) ?? 0) + 1);
        lines.push(`${path.basename(file)} ${name}: ${found.map((f) => f.id + (f.params?.example ? ` "${f.params.example}"` : '')).join(', ') || 'clean'}`);
      }
    }
    console.log(`Recorded drafts: ${flagged} of ${total} flagged\n${[...counts].map(([id, n]) => `${id}: ${n}`).join('\n')}\n${lines.join('\n')}`);
    expect(total).toBeGreaterThan(0);
  });
});

describe('the profile block', () => {
  it('is one fixed text, opened by its marker, and the credit estimate counts it', async () => {
    const { DSE_STYLE_PROFILE, DSE_STYLE_MARKER } = await import('./profile');
    const { textTokens, STYLE_BLOCK_TOKENS } = await import('@/ai/credits');
    expect(DSE_STYLE_PROFILE.startsWith(DSE_STYLE_MARKER)).toBe(true);
    expect(textTokens(DSE_STYLE_PROFILE)).toBeLessThanOrEqual(STYLE_BLOCK_TOKENS);
    // No private bank names, no per-run values: the same bytes on every call.
    expect(DSE_STYLE_PROFILE).not.toMatch(/\bkp\b|KP_ECON|\$\{|undefined/i);
  });

  it('is in the studio write prompt, so write, redo and rewrite all carry it', async () => {
    const { DSE_STYLE_PROFILE } = await import('./profile');
    const { STUDIO_SYSTEM_PROMPT, WRITE_TASK_MARKER } = await import('@/questionStudio/prompt');
    expect(STUDIO_SYSTEM_PROMPT.startsWith(WRITE_TASK_MARKER)).toBe(true);
    expect(STUDIO_SYSTEM_PROMPT).toContain(DSE_STYLE_PROFILE);
    expect(STUDIO_SYSTEM_PROMPT.trimEnd().endsWith('Return JSON only.')).toBe(true);
  });
});
