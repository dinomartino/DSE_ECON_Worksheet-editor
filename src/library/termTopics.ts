import type { Glossary } from '@/glossary';
import { tagSearchWords } from '@/model/patterns';
import { TOPICS } from '@/model/topics';
import type { BankRow } from './types';

/**
 * Topics a question's own words point to, keyless: the EDB glossary (the term authority,
 * `src/glossary/`) finds its terms in the text, English and 中文 alike, and this table
 * says which syllabus topic each term belongs to. Tag as you go offers them before the
 * neighbouring tags (`src/components/bank/page/bankScreen.ts:suggestTopics`).
 *
 * Keys are EDB glossary keys exactly as the data spells them (a test holds every one to
 * the data, and every code to `model/topics.ts`). Only terms that point at a topic: "demand",
 * "cost", "price" or "money" say nothing about where a question belongs, and "peak" is
 * too often plain English, so they are left out. A term the guide teaches in two places
 * lists both.
 */
const TABLE: Readonly<Record<string, readonly string[]>> = {
  'A.social-science': ['ceteris paribus', 'ceteris paribus assumption', 'microeconomics', 'macroeconomics'],
  'A.scarcity': [
    'scarcity', 'opportunity cost', 'free good', 'economic good', 'unlimited wants', 'limited resources',
    'production-possibility curve', 'production-possibility frontier', 'trade-off',
  ],
  'A.basic-problems': [
    'economic system', 'market economy', 'command economy', 'planned economy', 'mixed economy', 'traditional economy',
    'free enterprise system', 'economic problem', 'private property rights', 'property rights', 'private property',
    'non-price allocation',
  ],
  'A.specialization': ['specialisation', 'barter', 'barter trade', 'double coincidence of wants', 'absolute advantage', 'comparative advantage'],
  'A.circular-flow': ['circular flow', 'circular flow of income', 'injection', 'leakage', 'factor market', 'product market'],
  'A.positive-normative': ['positive statement', 'normative statement', 'positive economics', 'normative economics'],

  B: [
    'horizontal integration', 'vertical integration', 'conglomerate integration', 'lateral integration',
    'backward integration', 'forward integration', 'horizontal merger', 'vertical merger', 'merger', 'takeover',
  ],
  'B.ownership': [
    'sole proprietorship', 'sole proprietor', 'partnership', 'general partnership', 'limited partnership', 'limited company',
    'private limited company', 'public limited company', 'unlimited liability', 'limited liability', 'shareholder',
    'board of directors', 'public corporation', 'joint-stock company', 'sleeping partner', 'active partner', 'dividend',
    'legal entity', 'ordinary share', 'preference share', 'co-operative society',
  ],
  'B.production-types': [
    'primary production', 'secondary production', 'tertiary production', 'primary industry', 'secondary industry',
    'tertiary industry', 'stage of production', 'type of production',
  ],
  'B.goods': ['consumer good', 'capital good', 'producer good', 'durable good', 'private good', 'public good'],
  'B.division-of-labour': ['division of labour', 'simple division of labour', 'complex division of labour', 'regional division of labour', 'mass production'],
  'B.factors': [
    'factor of production', 'entrepreneurship', 'entrepreneur', 'human capital', 'physical capital', 'labour mobility',
    'occupational mobility', 'geographical mobility', 'factor mobility', 'wage rate', 'time rate', 'piece rate',
  ],
  'B.costs': [
    'fixed cost', 'variable cost', 'total cost', 'average cost', 'marginal cost', 'fixed factor', 'variable factor',
    'fixed input', 'variable input', 'short run', 'long run', 'law of diminishing marginal returns',
    'law of diminishing returns', 'diminishing marginal returns', 'law of variable proportions', 'marginal product',
    'average product', 'total product', 'economies of scale', 'diseconomies of scale', 'internal economies of scale',
    'external economies of scale', 'internal diseconomies of scale', 'external diseconomies of scale', 'returns to scale',
    'increasing returns to scale', 'decreasing returns to scale', 'constant returns to scale', 'explicit cost',
    'implicit cost', 'sunk cost',
  ],
  'B.objectives': ['profit maximisation', 'objectives of firm'],

  'C.law-of-demand': ['law of demand', 'quantity demanded', 'change in quantity demanded', 'demand curve', 'demand schedule'],
  'C.individual-demand': [
    'individual demand', 'normal good', 'inferior good', 'substitute', 'complement', 'complementary good', 'change in demand',
    'income effect', 'substitution effect', 'joint demand', 'competitive demand', 'derived demand', 'composite demand',
  ],
  'C.market-demand': ['market demand'],
  'C.individual-supply': ['individual supply', 'law of supply', 'supply curve', 'quantity supplied', 'change in quantity supplied', 'change in supply', 'joint supply', 'competitive supply'],
  'C.market-supply': ['market supply'],
  'C.equilibrium': [
    'equilibrium price', 'equilibrium quantity', 'market equilibrium', 'excess demand', 'excess supply', 'shortage',
    'quantity transacted', 'market clearing price', 'disequilibrium', 'market disequilibrium',
  ],
  'C.surplus': ['consumer surplus', 'producer surplus', 'total social surplus', 'marginal use value'],
  'C.price-functions': ['price mechanism', 'allocative function', 'price system', 'invisible hand', 'rationing'],
  'C.ped': [
    'price elasticity of demand', 'elastic demand', 'inelastic demand', 'perfectly elastic demand', 'perfectly inelastic demand',
    'unitary elastic demand', 'elasticity of demand', 'price elasticity', 'total revenue', 'arc elasticity', 'point elasticity',
  ],
  'C.pes': [
    'price elasticity of supply', 'elastic supply', 'inelastic supply', 'perfectly elastic supply', 'perfectly inelastic supply',
    'unitary elastic supply', 'elasticity of supply',
  ],
  'C.intervention': [
    'price ceiling', 'price floor', 'price control', 'rent control', 'minimum wage', 'quota', 'per unit tax', 'unit tax',
    'per unit subsidy', 'unit subsidy', 'tax incidence', 'tax burden', 'tax shifting', 'quantity intervention',
    'price intervention', 'black market', 'production subsidy', 'subsidy', 'wage floor', 'market intervention',
  ],

  'D.structure': [
    'perfect competition', 'perfectly competitive market', 'monopoly', 'oligopoly', 'monopolistic competition',
    'imperfect competition', 'price taker', 'price searcher', 'barrier to entry', 'entry barrier', 'homogeneous product',
    'differentiated product', 'heterogeneous product', 'product differentiation', 'non-price competition', 'market power',
    'market structure', 'natural monopoly', 'franchised monopoly', 'government-granted monopoly', 'patent',
    'perfect information', 'free entry', 'market share', 'concentration ratio', 'dominant firm', 'kinked demand curve',
    'game theory',
  ],

  'E.efficiency': [
    'economic efficiency', 'allocative efficiency', 'production efficiency', 'Pareto efficiency', 'Pareto optimum',
    'deadweight loss', 'efficiency loss', 'externality', 'external cost', 'external benefit', 'detrimental externality',
    'beneficial externality', 'social cost', 'social benefit', 'private cost', 'private benefit', 'marginal benefit',
    'market failure', 'free rider', 'Coase Theorem', 'pollution',
  ],
  'E.equity': [
    'Gini coefficient', 'Lorenz curve', 'line of perfect equality', 'income inequality', 'income distribution',
    'distribution of income', 'income redistribution', 'equality of opportunity', 'progressive tax', 'regressive tax',
    'proportional tax', 'poverty', 'redistributive effect', 'wealth distribution', 'social security', 'transfer payment',
  ],
  'E.policy': ['canons of taxation', 'principle of taxation', 'benefit principle', 'positive non-intervention policy', 'big market, small government'],

  'F.national-income': [
    'Gross Domestic Product (GDP)', 'Gross Domestic Product (GDP) at current market prices',
    'Gross Domestic Product (GDP) at factor cost', 'real Gross Domestic Product (GDP)',
    'per capita Gross Domestic Product (GDP)', 'per capita real Gross Domestic Product (GDP)', 'Gross National Income (GNI)',
    'Gross National Product (GNP)', 'Gross Domestic Income (GDI)', 'real Gross National Income (GNI)',
    'per capita Gross National Income (GNI)', 'chain volume measures of GDP', 'national income', 'expenditure approach',
    'income approach', 'production approach', 'value added approach', 'double counting', 'intermediate product',
    'final product', 'per capita income', 'net export', 'net external primary income flow', 'external primary income flows',
    'national income accounting', 'national output', 'nominal output',
  ],
  'F.price-level': [
    'Consumer Price Index (CPI)', 'Composite Consumer Price Index', 'price index', 'general price level',
    'Gross Domestic Product (GDP) deflator', 'implicit price deflator of Gross Domestic Product (GDP)', 'price deflator',
    'base year', 'inflation rate', 'cost of living', 'real income', 'nominal income', 'real wage', 'nominal wage', 'money wage',
  ],
  'F.unemployment': [
    'unemployment rate', 'underemployment rate', 'underemployment', 'labour force', 'labour force participation rate',
    'economically active population', 'economically inactive population', 'working population',
  ],

  'G.ad': [
    'aggregate demand', 'aggregate expenditure', 'consumption expenditure', 'investment expenditure',
    'net exports effect', 'wealth effect', 'interest rate effect', 'exchange-rate effect', 'autonomous consumption',
    'marginal propensity to consume', 'marginal propensity to save', 'marginal propensity to import',
  ],
  'G.as': ['aggregate supply', 'potential output', 'full employment', 'sticky-wage theory', 'sticky-price theory', 'misperceptions theory'],
  'G.equilibrium': [
    'equilibrium income', 'national income determination', 'inflationary gap', 'deflationary gap',
    'above-full employment equilibrium', 'below-full employment equilibrium', 'multiplier effect', 'investment multiplier',
  ],

  'H.money': [
    'medium of exchange', 'unit of account', 'store of value', 'standard of deferred payment', 'legal tender',
    'fiat money', 'commodity money', 'barter economy', 'double coincidence of wants', 'paper money', 'banknote',
    'near money', 'electronic payment system', 'Faster Payment System (FPS)',
  ],
  'H.banks': [
    'commercial bank', 'licensed bank', 'restricted licence bank', 'deposit-taking company', 'Three-tier Banking System',
    'three-tier system', 'central bank', 'demand deposit', 'savings deposit', 'time deposit', 'fixed deposit',
    'certificate of deposit', 'cheque', 'bank run', 'lender of last resort',
  ],
  'H.money-supply': [
    'money supply', 'monetary base', 'deposit creation', 'credit creation', 'banking multiplier', 'reserve ratio',
    'required reserve ratio', 'legal reserve ratio', 'minimum reserve ratio', 'bank reserve', 'cash drain',
    'currency deposit ratio', 'high-powered money', 'money stock', 'deposit contraction', 'credit contraction',
    'fractional reserve system',
  ],
  'H.money-demand': [
    'money demand', 'transaction demand for money', 'precautionary demand for money', 'speculative demand for money',
    'asset demand for money', 'liquidity preference', 'theory of liquidity preference',
  ],
  'H.interest': [
    'interest rate', 'nominal interest rate', 'real interest rate', 'Fisher equation', 'money market', 'market rate of interest',
    'best lending rate', 'prime rate', 'Hong Kong Interbank Offered Rate',
  ],
  'H.financial-centre': [
    'financial centre', 'stock market', 'stock exchange', 'Hang Seng Index', 'Stock Exchange of Hong Kong Limited',
    'Hong Kong Exchanges and Clearing Limited', 'HKEX group', 'Securities and Futures Commission', 'bond market',
    'capital market', 'financial intermediary', 'financial market',
  ],

  'I.cycles': ['business cycle', 'boom', 'recession', 'depression', 'recovery', 'trough', 'economic fluctuation', 'cyclical fluctuation'],
  'I.inflation': [
    'inflation', 'deflation', 'hyperinflation', 'demand-pull inflation', 'cost-push inflation', 'imported inflation',
    'anticipated inflation', 'unanticipated inflation', 'expected rate of inflation', 'wage-price spiral', 'persistent inflation',
    'inflationary expectation', 'Quantity Theory of Money', 'equation of exchange', 'velocity of circulation',
    'velocity of circulation of money', 'stagflation', 'actual inflation rate', 'inflation rate',
  ],
  'I.unemployment': [
    'unemployment', 'frictional unemployment', 'structural unemployment', 'cyclical unemployment', 'seasonal unemployment',
    'search unemployment', 'natural rate of unemployment', 'voluntary unemployment', 'involuntary unemployment',
    'unemployment benefit',
  ],
  'I.fiscal': [
    'fiscal policy', 'expansionary fiscal policy', 'contractionary fiscal policy', 'counter-cyclical fiscal policy',
    'budget deficit', 'budget surplus', 'balanced budget', 'fiscal deficit', 'fiscal surplus', 'government revenue',
    'public expenditure', 'government expenditure', 'automatic stabiliser', 'built-in stabiliser', 'discretionary policy',
    'crowding-out effect', 'tax multiplier', 'balanced budget multiplier', 'national debt', 'public debt', 'deficit budget',
    'surplus budget', 'fiscal balance', 'salaries tax', 'profits tax', 'Financial Secretary',
  ],
  'I.monetary': [
    'monetary policy', 'expansionary monetary policy', 'contractionary monetary policy', 'counter-cyclical monetary policy',
    'open market operation', 'discount window', 'quantitative easing', 'transmission mechanism', 'monetary neutrality',
    'moral suasion', 'credit control', 'Hong Kong Monetary Authority',
  ],

  'J.trade': [
    'free trade', 'tariff', 'import quota', 'embargo', 'export subsidy', 'protectionism', 'protectionist policy', 'trade barrier',
    'trade restriction', 'trade war', 'infant industry', 'dumping', 'anti-dumping duty', 'gain from trade', 'terms of trade',
    'World Trade Organization', 're-export', 'domestic export', 'international trade', 'globalisation',
    'Closer Economic Partnership Arrangement (CEPA)', 'customs duty', 'import restriction',
  ],
  'J.bop': [
    'balance of payments', 'balance of payments account', 'current account', 'capital account', 'capital and financial account',
    'financial account', 'balance of trade', 'balance of visible trade', 'balance of invisible trade', 'visible trade',
    'invisible trade', 'trade deficit', 'trade surplus', 'trade balance', 'visible export', 'invisible export',
    'visible import', 'invisible import', 'change in reserve assets', 'current transfer', 'unilateral transfer',
    'primary income', 'secondary income', 'official reserve', 'foreign exchange reserve',
  ],
  'J.exchange-rate': [
    'exchange rate', 'foreign exchange rate', 'fixed exchange rate', 'floating exchange rate', 'flexible exchange rate',
    'linked exchange rate', 'linked exchange rate system', 'pegged exchange rate', 'appreciation', 'devaluation', 'revaluation',
    'effective exchange rate', 'effective exchange rate index', 'Currency Board System', 'foreign exchange market',
    'foreign exchange', 'purchasing power parity', 'clean float', 'dirty float', 'managed float', 'Exchange Fund',
  ],

  'EL1.pricing': [
    'price discrimination', 'first degree price discrimination', 'second degree price discrimination',
    'third degree price discrimination', 'perfect price discrimination', 'monopoly pricing', 'simple monopoly pricing',
    'multipart pricing', 'block pricing', 'all-or-nothing pricing', 'bundled pricing', 'tie-in-sales', 'package tie-in',
    'marginal revenue', 'average revenue',
  ],
  'EL1.competition-policy': [
    'Competition Ordinance', 'competition policy', 'anti-competitive behaviour', 'anti-competitive conduct',
    'the First Conduct Rule', 'the Second Conduct Rule', 'abuse of a dominant market position', 'abuse of dominance',
    'price fixing', 'bid rigging', 'market allocation', 'exclusive dealing', 'predatory pricing', 'resale price maintenance',
    'cartel', 'collusion', 'anti-trust', 'anti-trust law', 'horizontal agreement', 'vertical agreement', 'joint boycott',
  ],
  'EL2.trade-theory': [
    'comparative advantage', 'law of comparative advantage', 'principle of comparative advantage', 'absolute advantage',
    'comparative cost', 'consumption possibility frontier', 'consumption possibility curve', 'autarky', 'terms of trade',
  ],
  'EL2.growth': [
    'economic growth', 'economic development', 'developing country', 'developed country', 'human development index (HDI)',
    'sustainable development', 'life expectancy', 'adult literacy rate', 'literacy rate', 'capital accumulation',
    'technological change', 'growth accounting', 'brain drain', 'population pyramid', 'standard of living', 'living standard',
  ],
};

/** EDB glossary key → the topic codes it points to, in guide order. */
export const TERM_TOPICS: ReadonlyMap<string, readonly string[]> = (() => {
  const out = new Map<string, string[]>();
  for (const [code, terms] of Object.entries(TABLE)) for (const term of terms) out.set(term, [...(out.get(term) ?? []), code]);
  return out;
})();

const GUIDE_ORDER = new Map(TOPICS.flatMap((topic) => [topic, ...topic.children]).map((topic, index) => [topic.code, index] as const));

/** A topic the text points to: how many term mentions, and which terms (the glossary's keys, first seen first). */
export interface TextTopic {
  code: string;
  hits: number;
  terms: string[];
}

/**
 * The topics a text's glossary terms point to, most mentioned first, then guide order.
 * English leftmost-longest (so "price elasticity of demand" is one term, not "demand"
 * inside it), then 中文 the same way; a term found in both languages counts once per
 * mention. Pure over the glossary it is given.
 */
export function textTopics(text: string, glossary: Pick<Glossary, 'entries' | 'matchEn' | 'matchZh'>): TextTopic[] {
  const found = new Map<string, TextTopic>();
  const add = (keys: readonly string[]) => {
    const codes = new Set(keys.flatMap((key) => TERM_TOPICS.get(key) ?? []));
    for (const code of codes) {
      const topic = found.get(code) ?? { code, hits: 0, terms: [] };
      topic.hits += 1;
      for (const key of keys) if (TERM_TOPICS.get(key)?.includes(code) && !topic.terms.includes(key)) topic.terms.push(key);
      found.set(code, topic);
    }
  };
  const keyOf = (entryId: number) => glossary.entries[entryId]?.en;
  for (const hit of glossary.matchEn(text)) {
    const key = keyOf(hit.entryId);
    if (key) add([key]);
  }
  for (const hit of glossary.matchZh(text)) add(hit.entryIds.map(keyOf).filter((key): key is string => key !== undefined));
  const guide = (code: string) => GUIDE_ORDER.get(code) ?? Number.MAX_SAFE_INTEGER;
  return [...found.values()].sort((a, b) => b.hits - a.hits || guide(a.code) - guide(b.code));
}

/**
 * A row's printed words as the glossary can read them: `searchText` without the tag words
 * the indexer appends last (a topic's own name must not suggest that topic), with the
 * glossary's abbreviations given back their capitals ("gdp" → "GDP"), which the index
 * lower-cased and the matcher needs.
 */
export function rowText(row: Pick<BankRow, 'searchText' | 'tags'>, glossary: Pick<Glossary, 'entries'>): string {
  const tagWords = row.tags.flatMap(tagSearchWords).join('\n').toLowerCase();
  let text = row.searchText;
  if (tagWords && text === tagWords) text = '';
  else if (tagWords && text.endsWith(`\n${tagWords}`)) text = text.slice(0, -tagWords.length - 1);
  const abbreviations = abbreviationsOf(glossary);
  return abbreviations ? text.replace(abbreviations, (word) => word.toUpperCase()) : text;
}

const ABBREVIATIONS = new WeakMap<object, RegExp | null>();

function abbreviationsOf(glossary: Pick<Glossary, 'entries'>): RegExp | null {
  const cached = ABBREVIATIONS.get(glossary.entries);
  if (cached !== undefined) return cached;
  const words = [...new Set(glossary.entries.flatMap((entry) => (entry.abbreviation && /^[A-Z]{2,}$/.test(entry.abbreviation) ? [entry.abbreviation.toLowerCase()] : [])))];
  const pattern = words.length ? new RegExp(`\\b(?:${words.join('|')})(?=s?\\b)`, 'g') : null;
  ABBREVIATIONS.set(glossary.entries, pattern);
  return pattern;
}
