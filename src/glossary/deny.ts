/**
 * Known wrong or non-HK renderings of glossary terms, fixed deterministically. Data only;
 * every row cites where the form was seen. A row fires only when its entry is in the
 * English source, so HK's normal 需求缺乏彈性 for "demand is inelastic" is never flagged.
 *
 * Invariants (`deny.test.ts`): every `fix` is a variant of its entry; no form is a variant
 * of its own entry; a form that is another entry's variant must be `reversal`; an entry
 * sharing a rendering with a row's entry shares the row (or is exempted there).
 */
export interface DenyRow {
  /** The glossary key, verbatim. */
  en: string;
  forms: string[];
  /** Replacement; defaults to the entry's preferred rendering. */
  fix?: string;
  /** The form means the opposite: never fixed, reported as a conflict with `means`. */
  reversal?: boolean;
  /** The term a reversal form actually denotes. */
  means?: string;
  /** `wrong` is fixed and pre-ticked; `variant` is an accepted variant, never rewritten unasked. */
  kind: 'wrong' | 'variant';
  evidence: string;
}

export const DENY: readonly DenyRow[] = [
  { en: 'price level', forms: ['價格水平'], kind: 'wrong', evidence: 'app seed; HKEAA Sample P2' },
  { en: 'total revenue', forms: ['總收益'], kind: 'wrong', evidence: 'app seed; HKEAA MS' },
  { en: 'elastic demand', forms: ['富彈性需求', '富有彈性需求'], kind: 'wrong', evidence: 'app seed' },
  {
    en: 'elastic demand',
    forms: ['缺乏彈性'],
    reversal: true,
    means: 'inelastic demand',
    kind: 'wrong',
    evidence: 'app seed',
  },
  { en: 'inelastic demand', forms: ['缺乏彈性需求'], kind: 'wrong', evidence: 'app seed; src/test/markSchemeFixture.ts' },
  { en: 'unitary elastic demand', forms: ['需求彈性等於一'], kind: 'wrong', evidence: 'app seed' },
  { en: 'production-possibility curve', forms: ['生產可能性曲線'], kind: 'wrong', evidence: 'app seed; HKEAA 2025' },
  // Same rendering as the curve; PPF and "production possibility frontier" match this key.
  { en: 'production-possibility frontier', forms: ['生產可能性曲線'], kind: 'wrong', evidence: 'app seed; HKEAA 2025' },
  { en: 'Lorenz curve', forms: ['洛倫茲曲線'], kind: 'wrong', evidence: 'app seed' },
  { en: 'line of perfect equality', forms: ['絕對平均線'], kind: 'wrong', evidence: 'app seed' },
  { en: 'full employment', forms: ['全民就業'], kind: 'wrong', evidence: 'app seed' },
  // An equal variant, not the first: HKEAA writes 貿易比率.
  { en: 'terms of trade', forms: ['貿易條件'], fix: '貿易比率', kind: 'wrong', evidence: 'app seed' },
  { en: 'kinked supply curve', forms: ['有拗折的供應曲線', '拗折供應曲線'], kind: 'wrong', evidence: 'app seed' },
  { en: 'taxable income', forms: ['應課稅入息'], kind: 'wrong', evidence: 'app seed' },
  { en: 'overproduction', forms: ['生產過多'], kind: 'wrong', evidence: 'app seed' },
  { en: 'total social surplus', forms: ['總盈餘'], kind: 'wrong', evidence: 'app seed' },
  { en: 'recovery', forms: ['復元'], kind: 'wrong', evidence: 'app seed' },
  { en: 'consumer surplus', forms: ['消費者剩餘'], kind: 'wrong', evidence: 'mainland usage' },
  { en: 'producer surplus', forms: ['生產者剩餘'], kind: 'wrong', evidence: 'mainland usage' },
  { en: 'public good', forms: ['公共物品', '公共財'], kind: 'wrong', evidence: 'src/test/fixtures.ts; TW/mainland' },
  { en: 'market failure', forms: ['市場失靈'], kind: 'wrong', evidence: 'mainland' },
  // The longest matching form wins: 總供給 and 貨幣供給 are fixed whole, never via 供給.
  { en: 'supply', forms: ['供給'], kind: 'wrong', evidence: 'scripts/demo/content.mjs; TW/mainland' },
  { en: 'aggregate supply', forms: ['總供給'], kind: 'wrong', evidence: 'TW/mainland' },
  { en: 'money supply', forms: ['貨幣供給'], kind: 'wrong', evidence: 'TW/mainland' },
  { en: 'positive statement', forms: ['實證陳述'], kind: 'wrong', evidence: 'scripts/demo/content.mjs' },
  { en: 'normative statement', forms: ['規範陳述'], kind: 'wrong', evidence: 'scripts/demo/content.mjs' },
  { en: 'externality', forms: ['外部性'], kind: 'wrong', evidence: 'mainland' },
  { en: 'monopoly', forms: ['獨佔'], kind: 'wrong', evidence: 'Taiwan' },
  { en: 'comparative advantage', forms: ['比較利益'], kind: 'wrong', evidence: 'Taiwan' },
  { en: 'real Gross Domestic Product (GDP)', forms: ['實際本地生產總值'], kind: 'wrong', evidence: 'common slip' },
  // The frozen v1 corpus writes 稅項歸宿: a checker fixture, never rewritten unasked.
  {
    en: 'tax incidence',
    forms: ['稅項歸宿', '稅收歸宿', '稅負歸宿'],
    kind: 'variant',
    evidence: 'src/test/corpus/v1-published.json',
  },
];
