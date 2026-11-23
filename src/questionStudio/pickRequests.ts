/**
 * Typed requests with the key point(s) a teacher would call right (k-0514), for measuring
 * step 1 (`pick.ts`): invented by hand, English and Chinese, specific and vague. `ok` lists
 * every code that counts as a hit (a vague request has more than one). Not a test oracle for
 * CI: the model's answers are run by `pickEval.test.ts` on demand.
 */
export interface TypedCase {
  text: string;
  ok: readonly string[];
  vague?: true;
}

export const TYPED_CASES: readonly TypedCase[] = [
  { text: 'A question that calculates price elasticity of demand from a table of prices and quantities', ok: ['C.ped'] },
  { text: 'Total revenue and elasticity: when should a firm cut its price?', ok: ['C.ped'] },
  { text: 'Why is the supply of fresh vegetables price inelastic in the short run?', ok: ['C.pes'] },
  { text: 'Rent control: what happens in the housing market when the government sets a price ceiling', ok: ['C.intervention'] },
  { text: 'The effects of a minimum wage on the labour market', ok: ['C.intervention'] },
  { text: 'How consumer surplus and producer surplus change when the market price rises', ok: ['C.surplus'] },
  { text: 'The opportunity cost of studying at university instead of working', ok: ['A.scarcity'] },
  { text: 'Classify these statements about the government budget as positive or normative', ok: ['A.positive-normative'] },
  { text: 'Advantages and disadvantages of division of labour in a factory', ok: ['B.division-of-labour'] },
  { text: 'Advertising and product differentiation in monopolistic competition', ok: ['D.structure'] },
  { text: 'What shifts the aggregate demand curve? An effect of lower interest rates on AD', ok: ['G.ad'] },
  { text: 'Calculate GDP using the expenditure approach from given components', ok: ['F.national-income'] },
  { text: 'CPI and the cost of living in Hong Kong', ok: ['F.price-level', 'F.hk-trends'] },
  { text: 'The linked exchange rate system in Hong Kong', ok: ['J.exchange-rate'] },
  { text: 'Tariffs and import quotas: who gains and who loses?', ok: ['J.trade'] },
  { text: 'How banks create credit: the deposit multiplier with a reserve ratio', ok: ['H.money-supply', 'H.banks'] },
  { text: 'Why is Hong Kong an international financial centre?', ok: ['H.financial-centre'] },
  { text: 'Fiscal policy in a recession: government spending and the multiplier', ok: ['I.fiscal'] },
  { text: 'Monetary policy under the linked exchange rate', ok: ['I.monetary', 'J.exchange-rate'] },
  { text: 'Cost-push inflation versus demand-pull inflation', ok: ['I.inflation', 'G.equilibrium'] },
  { text: 'Collusion between firms and the Competition Ordinance', ok: ['EL1.competition-policy'] },
  { text: 'A monopolist uses price discrimination: effects on output and profit', ok: ['EL1.pricing'] },
  { text: 'Comparative advantage with two countries and two goods', ok: ['EL2.trade-theory', 'J.trade'] },
  { text: '一條關於短期生產成本的題目，邊際成本與平均成本的關係', ok: ['B.costs'] },
  { text: '需求定律：價格上升對需求量的影響', ok: ['C.law-of-demand'] },
  { text: '關於失業類型（結構性失業、週期性失業）的題目', ok: ['I.unemployment', 'F.unemployment'] },
  { text: '需求增加後，市場均衡價格和數量的變化', ok: ['C.equilibrium'] },
  { text: '公平與效率之間的取捨', ok: ['E.equity', 'E.efficiency', 'E.policy'] },
  { text: 'Something about the housing market in Hong Kong', ok: ['C.intervention', 'C.equilibrium', 'C.market-demand', 'C.market-supply'], vague: true },
  { text: '一條關於政府如何幫助窮人的題目', ok: ['E.equity', 'C.intervention', 'I.fiscal'], vague: true },
];
