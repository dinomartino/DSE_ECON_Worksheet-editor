/**
 * DSEcon Mentor's MCQ topics (k-0569): the list the site's MCQ section, /class and the
 * by-topic past papers use. **Generated** by `scripts/sync-mcq-topics.mjs` from Mentor's
 * `src/lib/mcq-syllabus.ts` and `src/lib/question-bank/topics.ts`; do not edit by hand.
 * Keys are frozen on Mentor's side (never renamed, only added); names may change.
 * `edb` = the EDB C&A codes (`model/topics.ts`) each topic stands for.
 */

export interface McqTopicRow {
  key: string;
  en: string;
  zh: string;
  edb: readonly string[];
}

export interface McqSectionRow {
  /** 'A'…'J'. */
  key: string;
  en: string;
  zh: string;
  topics: readonly McqTopicRow[];
}

export const MCQ_SECTION_ROWS: readonly McqSectionRow[] = [
  {
    key: 'A',
    en: 'Basic Economic Concepts',
    zh: '基本經濟概念',
    topics: [
      { key: 'positive-normative-statements', en: 'Positive & Normative statements', zh: '實證性和規範性的陳述', edb: ['A.positive-normative'] },
      { key: 'scarcity', en: 'Scarcity', zh: '稀少性', edb: ['A.scarcity'] },
      { key: 'types-of-economy', en: 'Types of Economy', zh: '經濟體系類型', edb: ['A.basic-problems'] },
      { key: 'economic-free-goods', en: 'Economic & Free Goods', zh: '免費物品和經濟物品', edb: ['A.scarcity'] },
      { key: 'opportunity-cost', en: 'Opportunity cost', zh: '機會成本', edb: ['A.scarcity'] },
      { key: 'interest', en: 'Interest', zh: '利息', edb: ['A'] },
      { key: 'three-basic-economic-problems', en: 'Three Basic Economic Problems', zh: '三個基本經濟問題', edb: ['A.basic-problems'] },
      { key: 'private-property-rights', en: 'Private Property Rights', zh: '私有產權', edb: ['A.basic-problems'] },
    ],
  },
  {
    key: 'B',
    en: 'Firms and Production',
    zh: '廠商與生產',
    topics: [
      { key: 'types-of-production', en: 'Types of Production', zh: '生產的種類', edb: ['B.production-types'] },
      { key: 'factors-of-production', en: 'Factors of Production', zh: '生產要素', edb: ['B.factors'] },
      { key: 'division-of-labour', en: 'Division of Labour', zh: '分工', edb: ['B.division-of-labour'] },
      { key: 'private-public-goods', en: 'Private & Public Goods', zh: '私用品及共用品', edb: ['B.goods'] },
      { key: 'consumer-producer-goods', en: 'Consumer & Producer Goods', zh: '生產者物品和消費品', edb: ['B.goods'] },
      { key: 'types-of-goods', en: 'Types of Goods', zh: '物品種類', edb: ['B.goods'] },
      { key: 'labour-supply', en: 'Labour Supply', zh: '勞力供應', edb: ['B.factors'] },
      { key: 'labour-productivity', en: 'Labour Productivity', zh: '勞動生產力', edb: ['B.factors'] },
      { key: 'labour-mobility', en: 'Labour Mobility', zh: '勞工流動性', edb: ['B.factors'] },
      { key: 'wage-payment-methods', en: 'Wage Payment Methods', zh: '工資支付方法', edb: ['B.factors'] },
      { key: 'law-of-diminishing-marginal-returns', en: 'Law of Diminishing Marginal Returns', zh: '邊際回報遞減定律', edb: ['B.costs'] },
      { key: 'economies-diseconomies-of-scale', en: 'Economies & Diseconomies of Scale', zh: '規模經濟和規模負經濟', edb: ['B.costs'] },
      { key: 'profit-maximization', en: 'Profit Maximization', zh: '利潤極大化', edb: ['B.objectives'] },
      { key: 'production-short-run-long-run', en: 'Production in Short Run & Long Run', zh: '短期與長期生產', edb: ['B.costs'] },
      { key: 'ownership-of-firms', en: 'Ownership of Firms', zh: '廠商的所有權', edb: ['B.ownership'] },
      { key: 'shares-bonds', en: 'Shares & Bonds', zh: '股票和債券', edb: ['B.ownership'] },
      { key: 'types-of-expansion', en: 'Types of Expansion', zh: '擴張與結合', edb: ['B'] },
    ],
  },
  {
    key: 'C',
    en: 'Market and Price',
    zh: '市場與價格',
    topics: [
      { key: 'basic-supply-demand', en: 'Basic Supply & Demand', zh: '需求與供應', edb: ['C.equilibrium'] },
      { key: 'relative-price-law-of-demand', en: 'Relative Price & Law of Demand', zh: '相對價格與需求定律', edb: ['C.law-of-demand'] },
      { key: 'shortage-surplus', en: 'Shortage/Surplus', zh: '短缺與過剩', edb: ['C.equilibrium'] },
      { key: 'function-of-price', en: 'Function of Price', zh: '價格的功能', edb: ['C.price-functions'] },
      { key: 'elasticity', en: 'Elasticity', zh: '彈性', edb: ['C.ped', 'C.pes'] },
      { key: 'consumer-producer-surplus', en: 'Consumer/Producer Surplus', zh: '消費者盈餘及生產者盈餘', edb: ['C.surplus'] },
      { key: 'price-ceiling', en: 'Price Ceiling', zh: '價格上限', edb: ['C.intervention'] },
      { key: 'price-floor', en: 'Price Floor', zh: '價格下限', edb: ['C.intervention'] },
      { key: 'quota', en: 'Quota', zh: '配額', edb: ['C.intervention'] },
      { key: 'per-unit-tax', en: 'Per-unit Tax', zh: '從量稅', edb: ['C.intervention'] },
      { key: 'per-unit-subsidy', en: 'Per-unit Subsidy', zh: '從量津貼', edb: ['C.intervention'] },
    ],
  },
  {
    key: 'D',
    en: 'Competition and Market Structure',
    zh: '競爭與市場結構',
    topics: [
      { key: 'types-of-market-structures', en: 'Types of Market Structures', zh: '市場結構', edb: ['D.structure'] },
    ],
  },
  {
    key: 'E',
    en: 'Efficiency, Equity & Role of Government',
    zh: '效率、公平和政府的角色',
    topics: [
      { key: 'efficiency', en: 'Efficiency', zh: '效率', edb: ['E.efficiency'] },
      { key: 'externalities', en: 'Externalities', zh: '界外效應', edb: ['E.efficiency'] },
      { key: 'equity', en: 'Equity', zh: '公平', edb: ['E.equity'] },
    ],
  },
  {
    key: 'F',
    en: 'Measurement of Economic Performance',
    zh: '經濟表現的量度',
    topics: [
      { key: 'circular-flow', en: 'Circular Flow', zh: '經濟活動的循環流程', edb: ['A.circular-flow'] },
      { key: 'gdp', en: 'GDP', zh: '本地生產總值', edb: ['F.national-income'] },
      { key: 'gnp-gni', en: 'GNP/GNI', zh: '本地居民總收入', edb: ['F.national-income'] },
      { key: 'real-nominal-gdp', en: 'Real/Nominal GDP', zh: '名義本地生產總值及實質本地生產總值', edb: ['F.national-income', 'F.price-level'] },
    ],
  },
  {
    key: 'G',
    en: 'National Income Determination and Price Level',
    zh: '國民收入決定及價格水平',
    topics: [
      { key: 'adas', en: 'ADAS', zh: '總需求與總供應', edb: ['G'] },
    ],
  },
  {
    key: 'H',
    en: 'Money and Banking',
    zh: '貨幣與銀行',
    topics: [
      { key: 'problems-of-barter', en: 'Problems of Barter', zh: '以物易物的問題', edb: ['H.money'] },
      { key: 'function-of-money', en: 'Function of Money', zh: '貨幣的功能', edb: ['H.money'] },
      { key: 'properties-of-good-money', en: 'Properties of Good Money', zh: '優良貨幣的特質', edb: ['H.money'] },
      { key: 'banking-system', en: 'Banking System', zh: '銀行體系', edb: ['H.banks'] },
      { key: 'function-of-hkma', en: 'Function of HKMA', zh: '金管局的功能', edb: ['H.banks'] },
      { key: 'liquidity', en: 'Liquidity', zh: '資產流動性', edb: ['H.banks'] },
      { key: 'm1-m2-m3', en: 'M1/M2/M3', zh: '貨幣供應（M1／M2／M3）', edb: ['H.money-supply'] },
      { key: 'deposit-creation-contraction', en: 'Deposit Creation/Contraction', zh: '存款創造與收縮', edb: ['H.money-supply'] },
      { key: 'monetary-base', en: 'Monetary Base', zh: '貨幣基礎', edb: ['H.money-supply'] },
      { key: 'money-demand', en: 'Money Demand', zh: '貨幣需求', edb: ['H.money-demand'] },
      { key: 'money-market-equilibrium', en: 'Money Market Equilibrium', zh: '貨幣市場均衡', edb: ['H.interest'] },
    ],
  },
  {
    key: 'I',
    en: 'Macroeconomic Problems and Policies',
    zh: '宏觀經濟問題和政策',
    topics: [
      { key: 'fiscal-monetary-policies', en: 'Fiscal/Monetary Policies', zh: '財政政策與貨幣政策', edb: ['I.fiscal', 'I.monetary'] },
      { key: 'business-cycle', en: 'Business Cycle', zh: '經濟周期', edb: ['I.cycles'] },
      { key: 'unemployment', en: 'Unemployment', zh: '失業', edb: ['I.unemployment'] },
      { key: 'inflation-deflation', en: 'Inflation/Deflation', zh: '通貨膨脹和通貨緊縮', edb: ['I.inflation'] },
      { key: 'nominal-real-interest-rate', en: 'Nominal/Real Interest Rate', zh: '名義利率和實質利率', edb: ['I.inflation'] },
      { key: 'quantity-theory-of-money', en: 'Quantity Theory of Money', zh: '貨幣數量論', edb: ['I.inflation'] },
      { key: 'principles-of-taxation', en: 'Principles of Taxation', zh: '賦稅原則', edb: ['I.fiscal'] },
      { key: 'progressive-regressive-proportional-tax', en: 'Progressive/Regressive/Proportional Tax', zh: '累進／累退／比例稅', edb: ['I.fiscal'] },
      { key: 'tax', en: 'Tax', zh: '稅項', edb: ['I.fiscal'] },
      { key: 'tax-base-tax-net-effects-of-tax-changes', en: 'Tax Base, Tax Net & Effects of Tax Changes', zh: '稅基、稅網及稅制改變的影響', edb: ['I.fiscal'] },
    ],
  },
  {
    key: 'J',
    en: 'International Trade and Finance',
    zh: '國際貿易和金融',
    topics: [
      { key: 'in-trade-calculation', en: 'In-trade: Calculation', zh: '比較優勢和貿易獲益：計算', edb: ['J.trade'] },
      { key: 'in-trade-concept', en: 'In-trade: Concept', zh: '比較優勢和貿易獲益：概念', edb: ['J.trade'] },
      { key: 'trade-barriers', en: 'Trade Barriers', zh: '貿易障礙', edb: ['J.trade'] },
      { key: 'balance-of-payment', en: 'Balance of Payment', zh: '國際收支平衡表', edb: ['J.bop'] },
      { key: 'exchange-rate', en: 'Exchange Rate', zh: '匯率', edb: ['J.exchange-rate'] },
      { key: 'linked-exchange-rate', en: 'Linked Exchange Rate', zh: '香港聯繫匯率制度', edb: ['J.exchange-rate'] },
    ],
  },
];
