/**
 * Corrections and policy layered over the verbatim EDB data. The JSON is evidence and never
 * edited; every exception lives here, keyed by the glossary's own English key.
 */
import type { GlossarySense, PreferredOverrides } from './types';

/**
 * The only exception to "rank 1 is preferred" (user decision, 2026-09-28): the import
 * family pins, prompts, prefers and suggests 進口, which HKEAA papers and the app's seeds
 * write, over the rank-1 入口. 入口 forms still pass the check, as not preferred. The keys
 * are every entry with a 進口 rank below an 入口 rank-1 (`overrides.test.ts` re-derives them).
 */
export const PREFERRED_OVERRIDES: PreferredOverrides = {
  import: '進口',
  'import quota': '進口配額',
  'import restriction': '進口限制',
  'import substitution': '進口替代',
  'invisible import': '無形進口',
  'visible import': '有形進口',
};

/** Values no general rule parses right (glossary research §1). */
export const ZH_OVERRIDES: Readonly<Record<string, GlossarySense[]>> = {
  // 企業 (管制) 俘虜；企業 (管制) 傀儡 — an optional infix, not a qualifier.
  'industry capture': [{ ranks: [['企業管制俘虜', '企業俘虜'], ['企業管制傀儡', '企業傀儡']] }],
  // The full-width brackets are part of the registered names.
  'Bank of China (Hong Kong) Limited': [{ ranks: [['中國銀行（香港）有限公司']] }],
  'Standard Chartered Bank (Hong Kong) Limited': [{ ranks: [['渣打銀行（香港）有限公司']] }],
  // 快速支付系統（「轉數快」） — the brand name is an equal alias, without its quotes.
  'Faster Payment System (FPS)': [{ ranks: [['快速支付系統', '轉數快']] }],
};

/** English keys whose shape no rule can read (inverted, slashed, double-bracketed). */
export const EN_OVERRIDES: Readonly<Record<string, readonly string[]>> = {
  'Keynes, J.M.': ['Keynes', 'John Maynard Keynes'],
  'Organization of the Petroleum Exporting Countries, The (OPEC)': [
    'Organization of the Petroleum Exporting Countries',
    'OPEC',
  ],
  'Telecommunications Ordinance, Hong Kong': ['Telecommunications Ordinance'],
  'Hang Seng China Enterprises Index (HSCEI) (Hang Seng H-shares Index)': [
    'Hang Seng China Enterprises Index',
    'HSCEI',
    'Hang Seng H-shares Index',
    'H-shares Index',
  ],
  // COMPAG does not spell its initials, so the abbreviation stands alone.
  'Competition Policy Advisory Group (COMPAG)': ['Competition Policy Advisory Group', 'COMPAG'],
  // The bracketed "(Hong Kong)" would break a token run; the short name is what text says.
  'Bank of China (Hong Kong) Limited': ['Bank of China'],
  'Standard Chartered Bank (Hong Kong) Limited': ['Standard Chartered Bank'],
  'optimum / optimal firm': ['optimum firm', 'optimal firm'],
  'optimum / optimal input': ['optimum input', 'optimal input'],
  'optimum / optimal scale': ['optimum scale', 'optimal scale'],
  'tie-in-sales': ['tie-in sales'],
};

/** Extra English forms teachers and the app's own templates write. */
export const EN_ALIASES: Readonly<Record<string, readonly string[]>> = {
  'line of perfect equality': ['line of equality'],
  // The glossary has no micro "total expenditure" (P × Q); HK writes the same 總開支 / 總支出.
  'aggregate expenditure': ['total expenditure'],
};

/** Applied to every rendering we show, pin or insert; matching folds these anyway. */
export const DISPLAY_OVERRIDES: Readonly<Record<string, string>> = {
  // household → 住户 uses U+6237, as the PDF does; HK text writes 戶 (U+6236).
  住户: '住戶',
};

/** Senses the prompt pins: sense (1) of the GDP family is Hong Kong usage (本地…). */
export const PIN_SENSES: Readonly<Record<string, readonly number[]>> = {
  'Gross Domestic Product (GDP)': [0],
  'Gross Domestic Income (GDI)': [0],
  'Gross National Income (GNI)': [0],
  'Gross National Product (GNP)': [0],
};

/**
 * Everyday words that are also glossary keys (glossary research §2): pinned only "if used in
 * its economic sense", never pinned ZH→EN, and checked as info only. Everything else is
 * core — supply, demand, tax and elasticity included, which is what catches 供給.
 */
export const GENERIC_TIER: ReadonlySet<string> = new Set([
  // The curated list: polysemous words that were false positives on real papers.
  'advance', 'aggregate', 'assertion', 'bad', 'good', 'choice', 'development', 'share',
  'stock', 'flow', 'yield', 'interest', 'trust', 'credit', 'discount', 'exchange', 'premium',
  'rates', 'wants', 'desires', 'model', 'index', 'peak', 'trough', 'plant', 'value',
  'service', 'transfer', 'capital', 'boom', 'recovery', 'depression', 'positive', 'firm',
  'bond', 'coupon', 'deposit', 'equity', 'clearance', 'commission', 'complement',
  'consolidation', 'constraint', 'implication', 'integration', 'liability', 'mobility',
  'necessity', 'reserve', 'risk', 'surplus', 'theory', 'weighting', 'divergence',
  'discrimination',
  // Noisy in the prototype on everyday English.
  'price', 'benefit', 'market', 'growth', 'cost', 'money', 'bank', 'land', 'output', 'input',
  'company', 'economy', 'economics',
]);

/**
 * Single-token keys matched only as written: the plural-only keys (rates → 差餉, not rate),
 * and `good`, whose plural "goods" is a different, everyday word.
 */
export const EXACT_KEYS: ReadonlySet<string> = new Set(['rates', 'wants', 'desires', 'savings', 'good']);
