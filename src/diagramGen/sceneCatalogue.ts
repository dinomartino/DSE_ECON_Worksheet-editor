import type { Externality, SceneAsk, SceneMarket, SceneType, SpecText } from './types';

/**
 * The scene catalogue (k-0577): for each typed market scene, the parts the question may label,
 * the regions a figure can letter (a partition: no two overlap), the areas an HKDSE question asks
 * about as sums of regions, and the ticks it can ask for. Pure data: the prompt's menu, the
 * builder (`scene.ts`), the key check and the figure's words all read it, so they never drift.
 *
 * Words are the EDB terms the dse-econ-graph skill prints (效率損失 for deadweight loss, 買家負擔 /
 * 賣家負擔, 消費者得益 / 生產者得益, 政府稅收).
 */

export interface ScenePartDef {
  id: string;
  kind: 'curve' | 'yTick' | 'xTick';
  /** The label printed when the model gives none, per market. */
  label: string;
  labour?: string;
  /** For the prompt: what the part is. */
  what: string;
  /** Where it is, in other parts' labels, for the blind solve: "where {D} meets {S1}". */
  place: string;
}

export interface SceneRegionDef {
  id: string;
  /** For the prompt: what the region is, in economics. */
  what: string;
  /** Printed when the region carries no letter of the model's; null = the model must label it. */
  words: SpecText | null;
  /**
   * Its outline in parts, for the blind solve (never its economic name): `{P0}` etc. are the
   * parts' printed labels. "the area between {D} and the {P0} line, from {Q1} to {Q0}".
   */
  shape: string;
}

export interface SceneDef {
  type: Exclude<SceneType, 'none'>;
  /** For the prompt: when to use it. */
  when: string;
  parts: ScenePartDef[];
  regions: SceneRegionDef[];
  /** Area asks: the regions each is made of. A measure may also be drawn as one area (its `words`). */
  measures: Partial<Record<SceneAsk, string[]>>;
  /** Words for a measure drawn whole (a model answer's "shade the deadweight loss"). */
  measureWords: Partial<Record<SceneAsk, SpecText>>;
  /** Tick asks: the parts whose labels answer them (two = a gap, "Q1Q3"). */
  ticks: Partial<Record<SceneAsk, string[]>>;
  /** The parts the default figure prints ticks for; others print only when the model labels them. */
  shown: string[];
  /** Ticks whose dashed line bounds a region: drawn (unlabelled if need be) whenever regions are. */
  edges: string[];
}

const w = (en: string, zh: string): SpecText => ({ en, zh });

export const WORDS = {
  cs: w('Consumer surplus', '消費者盈餘'),
  ps: w('Producer surplus', '生產者盈餘'),
  tss: w('Total social surplus', '總社會盈餘'),
  dwl: w('Deadweight loss', '效率損失'),
  taxRevenue: w('Tax revenue', '政府稅收'),
  buyersBurden: w("Buyers' burden", '買家負擔'),
  sellersBurden: w("Sellers' burden", '賣家負擔'),
  consumerBenefit: w('Consumer benefit', '消費者得益'),
  producerBenefit: w('Producer benefit', '生產者得益'),
  cost: w('Cost of production', '生產成本'),
  revenue: w('Total revenue', '總收入'),
  tssLoss: w('Decrease in total social surplus', '總社會盈餘減少'),
  externalCost: w('External cost', '界外成本'),
  externalBenefit: w('External benefit', '界外利益'),
  tariffRevenue: w('Tariff revenue', '關稅收入'),
  psGain: w('Increase in producer surplus', '生產者盈餘增加'),
  csLoss: w('Decrease in consumer surplus', '消費者盈餘減少'),
} as const;

const curve = (id: string, label: string, what: string, place: string): ScenePartDef => ({ id, kind: 'curve', label, what, place });
const y = (id: string, label: string, what: string, place: string, labour?: string): ScenePartDef => ({ id, kind: 'yTick', label, what, place, ...(labour ? { labour } : {}) });
const x = (id: string, label: string, what: string, place: string): ScenePartDef => ({ id, kind: 'xTick', label, what, place });

export const SCENES: SceneDef[] = [
  {
    type: 'surplus',
    when: 'one market at equilibrium: consumer and producer surplus, total social surplus, cost, revenue',
    parts: [curve('D', 'D', 'demand', 'downward-sloping'), curve('S', 'S', 'supply', 'upward-sloping'), y('P0', 'P_0', 'equilibrium price', 'where {D} meets {S}', 'W_0'), x('Q0', 'Q_0', 'equilibrium quantity', 'where {D} meets {S}')],
    regions: [
      { id: 'cs', what: 'consumer surplus: under D, above P0, 0 to Q0', words: WORDS.cs, shape: 'the area under {D} and above the {P0} line, from 0 to {Q0}' },
      { id: 'ps', what: 'producer surplus: above S, below P0, 0 to Q0', words: WORDS.ps, shape: 'the area below the {P0} line and above {S}, from 0 to {Q0}' },
      { id: 'cost', what: 'cost of production: under S, 0 to Q0', words: WORDS.cost, shape: 'the area under {S}, from 0 to {Q0}' },
    ],
    measures: { cs: ['cs'], ps: ['ps'], tss: ['cs', 'ps'], cost: ['cost'], revenue: ['ps', 'cost'] },
    measureWords: { tss: WORDS.tss, revenue: WORDS.revenue },
    ticks: { priceBefore: ['P0'], quantityBefore: ['Q0'] },
    shown: ['P0', 'Q0'],
    edges: ['P0', 'Q0'],
  },
  {
    type: 'unitTax',
    when: 'a per-unit (specific) tax: supply shifts up by the tax; incidence, tax revenue, deadweight loss, changes in surplus',
    parts: [
      curve('D', 'D', 'demand', 'downward-sloping'),
      curve('S0', 'S_0', 'supply before the tax', 'upward-sloping'),
      curve('S1', 'S_1', 'supply with the tax (S0 moved up by the tax)', '{S0} shifted upward'),
      y('Pb', 'P_1', 'price buyers pay after the tax (on D at Q1)', 'where {D} meets {S1}'),
      y('P0', 'P_0', 'equilibrium price before the tax', 'where {D} meets {S0}'),
      y('Ps', 'P_2', 'price sellers keep after the tax (on S0 at Q1)', 'on {S0} directly below the point where {D} meets {S1}'),
      x('Q1', 'Q_1', 'quantity after the tax', 'where {D} meets {S1}'),
      x('Q0', 'Q_0', 'quantity before the tax', 'where {D} meets {S0}'),
    ],
    regions: [
      { id: 'csAfter', what: 'consumer surplus after the tax: under D above Pb, 0 to Q1', words: WORDS.cs, shape: 'the area under {D} and above the {Pb} line, from 0 to {Q1}' },
      { id: 'buyersBurden', what: "buyers' share of the tax revenue: Pb to P0, 0 to Q1", words: WORDS.buyersBurden, shape: 'the rectangle between the {Pb} and {P0} lines, from 0 to {Q1}' },
      { id: 'sellersBurden', what: "sellers' share of the tax revenue: P0 to Ps, 0 to Q1", words: WORDS.sellersBurden, shape: 'the rectangle between the {P0} and {Ps} lines, from 0 to {Q1}' },
      { id: 'psAfter', what: 'producer surplus after the tax: above S0 below Ps, 0 to Q1', words: WORDS.ps, shape: 'the area below the {Ps} line and above {S0}, from 0 to {Q1}' },
      { id: 'dwlBuyers', what: 'upper half of the deadweight loss: under D above P0, Q1 to Q0', words: null, shape: 'the triangle under {D} and above the {P0} line, from {Q1} to {Q0}' },
      { id: 'dwlSellers', what: 'lower half of the deadweight loss: below P0 above S0, Q1 to Q0', words: null, shape: 'the triangle below the {P0} line and above {S0}, from {Q1} to {Q0}' },
    ],
    measures: {
      taxRevenue: ['buyersBurden', 'sellersBurden'],
      dwl: ['dwlBuyers', 'dwlSellers'],
      buyersBurden: ['buyersBurden'],
      sellersBurden: ['sellersBurden'],
      csAfter: ['csAfter'],
      csBefore: ['csAfter', 'buyersBurden', 'dwlBuyers'],
      csLoss: ['buyersBurden', 'dwlBuyers'],
      psAfter: ['psAfter'],
      psBefore: ['psAfter', 'sellersBurden', 'dwlSellers'],
      psLoss: ['sellersBurden', 'dwlSellers'],
      tssBefore: ['csAfter', 'buyersBurden', 'sellersBurden', 'psAfter', 'dwlBuyers', 'dwlSellers'],
      tssLoss: ['dwlBuyers', 'dwlSellers'],
    },
    measureWords: { taxRevenue: WORDS.taxRevenue, dwl: WORDS.dwl, csLoss: WORDS.csLoss },
    ticks: { buyersPay: ['Pb'], sellersGet: ['Ps'], priceBefore: ['P0'], priceAfter: ['Pb'], quantityAfter: ['Q1'], quantityBefore: ['Q0'] },
    shown: ['Pb', 'P0', 'Ps', 'Q1', 'Q0'],
    edges: ['Pb', 'P0', 'Ps', 'Q1', 'Q0'],
  },
  {
    type: 'unitSubsidy',
    when: 'a per-unit subsidy to producers: supply shifts down by the subsidy; consumer and producer benefit, cost of the subsidy, deadweight loss (overproduction)',
    parts: [
      curve('D', 'D', 'demand', 'downward-sloping'),
      curve('S0', 'S_0', 'supply before the subsidy', 'upward-sloping'),
      curve('S1', 'S_1', 'supply with the subsidy (S0 moved down by it)', '{S0} shifted downward'),
      y('Ps', 'P_2', 'price sellers receive with the subsidy (on S0 at Q1)', 'on {S0} directly above the point where {D} meets {S1}'),
      y('P0', 'P_0', 'equilibrium price before', 'where {D} meets {S0}'),
      y('Pb', 'P_1', 'price buyers pay with the subsidy (on D at Q1)', 'where {D} meets {S1}'),
      x('Q0', 'Q_0', 'quantity before', 'where {D} meets {S0}'),
      x('Q1', 'Q_1', 'quantity with the subsidy', 'where {D} meets {S1}'),
    ],
    regions: [
      { id: 'consumerBenefit', what: 'consumer benefit: left of D between P0 and Pb, 0 to Q1', words: WORDS.consumerBenefit, shape: 'the area between the {P0} and {Pb} lines, left of {D}, from 0 to {Q1}' },
      { id: 'producerBenefit', what: 'producer benefit: left of S0 between Ps and P0, 0 to Q1', words: WORDS.producerBenefit, shape: 'the area between the {Ps} and {P0} lines, left of {S0}, from 0 to {Q1}' },
      { id: 'dwl', what: 'deadweight loss: between S0 (above) and D, Q0 to Q1', words: WORDS.dwl, shape: 'the triangle between {S0} and {D}, from {Q0} to {Q1}' },
    ],
    measures: {
      consumerBenefit: ['consumerBenefit'],
      producerBenefit: ['producerBenefit'],
      dwl: ['dwl'],
      subsidyCost: ['consumerBenefit', 'producerBenefit', 'dwl'],
    },
    measureWords: { subsidyCost: w("Government's subsidy expenditure", '政府的津貼開支') },
    ticks: { buyersPay: ['Pb'], sellersGet: ['Ps'], priceBefore: ['P0'], priceAfter: ['Pb'], quantityAfter: ['Q1'], quantityBefore: ['Q0'] },
    shown: ['Ps', 'P0', 'Pb', 'Q0', 'Q1'],
    edges: ['Ps', 'P0', 'Pb', 'Q0', 'Q1'],
  },
  {
    type: 'priceCeiling',
    when: 'a price ceiling (maximum price, rent control) below equilibrium: shortage, quantity traded, deadweight loss, changes in surplus',
    parts: [
      curve('D', 'D', 'demand', 'downward-sloping'),
      curve('S', 'S', 'supply', 'upward-sloping'),
      y('P0', 'P_0', 'equilibrium price', 'where {D} meets {S}', 'W_0'),
      y('Pc', 'P_c', 'the ceiling (drawn as a line below P0)', 'a horizontal price line below where {D} meets {S}', 'W_c'),
      x('Qs', 'Q_s', 'quantity supplied at the ceiling (= quantity traded)', 'where {S} meets the {Pc} line'),
      x('Q0', 'Q_0', 'equilibrium quantity', 'where {D} meets {S}'),
      x('Qd', 'Q_d', 'quantity demanded at the ceiling', 'where {D} meets the {Pc} line'),
    ],
    regions: [
      { id: 'csKept', what: 'under D above P0, 0 to Qs', words: null, shape: 'the area under {D} and above the {P0} line, from 0 to {Qs}' },
      { id: 'transfer', what: 'from producers to consumers: P0 to Pc, 0 to Qs', words: null, shape: 'the rectangle between the {P0} and {Pc} lines, from 0 to {Qs}' },
      { id: 'dwlBuyers', what: 'upper part of the deadweight loss: under D above P0, Qs to Q0', words: null, shape: 'the triangle under {D} and above the {P0} line, from {Qs} to {Q0}' },
      { id: 'dwlSellers', what: 'lower part of the deadweight loss: below P0 above S, Qs to Q0', words: null, shape: 'the triangle below the {P0} line and above {S}, from {Qs} to {Q0}' },
      { id: 'psAfter', what: 'producer surplus at the ceiling: below Pc above S, 0 to Qs', words: WORDS.ps, shape: 'the area below the {Pc} line and above {S}, from 0 to {Qs}' },
    ],
    measures: {
      dwl: ['dwlBuyers', 'dwlSellers'],
      csAfter: ['csKept', 'transfer'],
      csBefore: ['csKept', 'dwlBuyers'],
      psAfter: ['psAfter'],
      psBefore: ['transfer', 'dwlSellers', 'psAfter'],
      psLoss: ['transfer', 'dwlSellers'],
      transfer: ['transfer'],
      tssAfter: ['csKept', 'transfer', 'psAfter'],
      tssBefore: ['csKept', 'transfer', 'psAfter', 'dwlBuyers', 'dwlSellers'],
      tssLoss: ['dwlBuyers', 'dwlSellers'],
    },
    measureWords: { dwl: WORDS.dwl, csAfter: WORDS.cs },
    ticks: { shortage: ['Qs', 'Qd'], quantityAfter: ['Qs'], quantitySupplied: ['Qs'], quantityDemanded: ['Qd'], quantityBefore: ['Q0'], priceBefore: ['P0'], priceAfter: ['Pc'] },
    shown: ['P0', 'Pc', 'Qs', 'Q0', 'Qd'],
    edges: ['P0', 'Qs', 'Q0'],
  },
  {
    type: 'priceFloor',
    when: 'a price floor (minimum price) or minimum wage above equilibrium: surplus or unemployment, quantity traded, deadweight loss, changes in surplus; market "labour" for wages',
    parts: [
      curve('D', 'D', 'demand (for labour: the demand for labour)', 'downward-sloping'),
      curve('S', 'S', 'supply', 'upward-sloping'),
      y('Pf', 'P_f', 'the floor or minimum wage (drawn as a line above P0)', 'a horizontal price line above where {D} meets {S}', 'W_m'),
      y('P0', 'P_0', 'equilibrium price or wage', 'where {D} meets {S}', 'W_0'),
      x('Qd', 'Q_d', 'quantity demanded at the floor (= quantity traded, employment)', 'where {D} meets the {Pf} line'),
      x('Q0', 'Q_0', 'equilibrium quantity', 'where {D} meets {S}'),
      x('Qs', 'Q_s', 'quantity supplied at the floor', 'where {S} meets the {Pf} line'),
    ],
    regions: [
      { id: 'csAfter', what: 'consumer surplus at the floor: under D above Pf, 0 to Qd', words: WORDS.cs, shape: 'the area under {D} and above the {Pf} line, from 0 to {Qd}' },
      { id: 'transfer', what: 'from consumers to producers: Pf to P0, 0 to Qd', words: null, shape: 'the rectangle between the {Pf} and {P0} lines, from 0 to {Qd}' },
      { id: 'dwlBuyers', what: 'upper part of the deadweight loss: under D above P0, Qd to Q0', words: null, shape: 'the triangle under {D} and above the {P0} line, from {Qd} to {Q0}' },
      { id: 'dwlSellers', what: 'lower part of the deadweight loss: below P0 above S, Qd to Q0', words: null, shape: 'the triangle below the {P0} line and above {S}, from {Qd} to {Q0}' },
      { id: 'psKept', what: 'below P0 above S, 0 to Qd', words: null, shape: 'the area below the {P0} line and above {S}, from 0 to {Qd}' },
    ],
    measures: {
      dwl: ['dwlBuyers', 'dwlSellers'],
      csAfter: ['csAfter'],
      csBefore: ['csAfter', 'transfer', 'dwlBuyers'],
      csLoss: ['transfer', 'dwlBuyers'],
      psAfter: ['transfer', 'psKept'],
      psBefore: ['psKept', 'dwlSellers'],
      transfer: ['transfer'],
      tssLoss: ['dwlBuyers', 'dwlSellers'],
    },
    measureWords: { dwl: WORDS.dwl, psAfter: WORDS.ps },
    ticks: { surplus: ['Qd', 'Qs'], quantityAfter: ['Qd'], quantityDemanded: ['Qd'], quantitySupplied: ['Qs'], quantityBefore: ['Q0'], priceBefore: ['P0'], priceAfter: ['Pf'] },
    shown: ['Pf', 'P0', 'Qd', 'Q0', 'Qs'],
    edges: ['P0', 'Qd', 'Q0'],
  },
  {
    type: 'quota',
    when: 'a production or sales quota below the equilibrium quantity: supply becomes vertical at the quota; price, quantity, deadweight loss, changes in surplus (an IMPORT quota is the template import-quota)',
    parts: [
      curve('D', 'D', 'demand', 'downward-sloping'),
      curve('S', 'S_0', 'supply without the quota', 'upward-sloping'),
      curve('S1', 'S_1', 'supply with the quota (S up to the quota, then vertical)', 'follows {S} up to {Qq}, then vertical'),
      y('P1', 'P_1', 'price with the quota (on D at the quota)', 'where {D} meets {S1} (on {D} above {Qq})'),
      y('P0', 'P_0', 'equilibrium price without the quota', 'where {D} meets {S}'),
      x('Qq', 'Q_1', 'the quota', 'where {S1} turns vertical'),
      x('Q0', 'Q_0', 'equilibrium quantity without the quota', 'where {D} meets {S}'),
    ],
    regions: [
      { id: 'csAfter', what: 'consumer surplus with the quota: under D above P1, 0 to Qq', words: WORDS.cs, shape: 'the area under {D} and above the {P1} line, from 0 to {Qq}' },
      { id: 'transfer', what: 'from consumers to producers: P1 to P0, 0 to Qq', words: null, shape: 'the rectangle between the {P1} and {P0} lines, from 0 to {Qq}' },
      { id: 'psKept', what: 'below P0 above S, 0 to Qq', words: null, shape: 'the area below the {P0} line and above {S}, from 0 to {Qq}' },
      { id: 'dwlBuyers', what: 'upper part of the deadweight loss: under D above P0, Qq to Q0', words: null, shape: 'the triangle under {D} and above the {P0} line, from {Qq} to {Q0}' },
      { id: 'dwlSellers', what: 'lower part of the deadweight loss: below P0 above S, Qq to Q0', words: null, shape: 'the triangle below the {P0} line and above {S}, from {Qq} to {Q0}' },
    ],
    measures: {
      dwl: ['dwlBuyers', 'dwlSellers'],
      csAfter: ['csAfter'],
      csBefore: ['csAfter', 'transfer', 'dwlBuyers'],
      csLoss: ['transfer', 'dwlBuyers'],
      psAfter: ['transfer', 'psKept'],
      psBefore: ['psKept', 'dwlSellers'],
      transfer: ['transfer'],
      tssLoss: ['dwlBuyers', 'dwlSellers'],
    },
    measureWords: { dwl: WORDS.dwl, psAfter: WORDS.ps },
    ticks: { priceAfter: ['P1'], quantityAfter: ['Qq'], priceBefore: ['P0'], quantityBefore: ['Q0'] },
    shown: ['P1', 'P0', 'Qq', 'Q0'],
    edges: ['P1', 'P0', 'Qq', 'Q0'],
  },
  {
    type: 'externality',
    when: 'external costs or benefits: MPC/MSC or MPB/MSB, market output against the socially efficient output, the deadweight loss; set "externality"',
    parts: [
      curve('D', 'D', 'demand (MPB; "D = MPB = MSB" when the externality is in production)', 'downward-sloping'),
      curve('S', 'S', 'supply (MPC; "S = MPC = MSC" when the externality is in consumption)', 'upward-sloping'),
      curve('social', 'MSC', 'the social curve: MSC (production) or MSB (consumption)', 'parallel to the private curve, above or below it as drawn'),
      y('Pm', '', 'market price', 'where {D} meets {S}'),
      y('Pe', '', 'socially efficient price', 'where {social} meets the other curve'),
      x('Qm', 'Q_m', 'market output (where D meets S)', 'where {D} meets {S}'),
      x('Qe', 'Q*', 'socially efficient output (where the social curve meets the other one)', 'where {social} meets the other curve'),
    ],
    regions: [
      { id: 'dwl', what: 'deadweight loss: between the social curve and the other curve, between Qm and Qe', words: WORDS.dwl, shape: 'the triangle between {social} and the curve it crosses, between {Qm} and {Qe}' },
      { id: 'external', what: 'external cost or benefit up to the nearer output: between the social and the private curve, from 0 to the smaller of Qm and Qe', words: null, shape: 'the area between {social} and the private curve it lies beside, from 0 to the smaller of {Qm} and {Qe}' },
      { id: 'wedge', what: 'the triangle beside the deadweight loss: between the other curve and the private curve, between Qm and Qe', words: null, shape: 'the triangle between the private curve and the curve it crosses, between {Qm} and {Qe}' },
    ],
    measures: { dwl: ['dwl'], externalCost: ['external', 'dwl', 'wedge'] },
    measureWords: {},
    ticks: { marketQuantity: ['Qm'], efficientQuantity: ['Qe'], misallocation: ['Qm', 'Qe'], priceBefore: ['Pm'] },
    shown: ['Qm', 'Qe'],
    edges: ['Qm', 'Qe'],
  },
  {
    type: 'costRise',
    when: 'a rise in production cost (MC rises, supply shifts up) and the change in total social surplus',
    parts: [
      curve('D', 'D', 'demand', 'downward-sloping'),
      curve('S0', 'S_0', 'supply before', 'upward-sloping'),
      curve('S1', 'S_1', 'supply after the cost rise (S0 moved up)', '{S0} shifted upward'),
      y('P1', 'P_1', 'new equilibrium price', 'where {D} meets {S1}'),
      y('P0', 'P_0', 'old equilibrium price', 'where {D} meets {S0}'),
      x('Q1', 'Q_1', 'new equilibrium quantity', 'where {D} meets {S1}'),
      x('Q0', 'Q_0', 'old equilibrium quantity', 'where {D} meets {S0}'),
    ],
    regions: [
      { id: 'band', what: 'between S1 and S0, 0 to Q1', words: null, shape: 'the band between {S1} and {S0}, from 0 to {Q1}' },
      { id: 'triangle', what: 'between D and S0, Q1 to Q0', words: null, shape: 'the triangle between {D} and {S0}, from {Q1} to {Q0}' },
      { id: 'remaining', what: 'total social surplus after: between D and S1, 0 to Q1', words: WORDS.tss, shape: 'the area between {D} and {S1}, from 0 to {Q1}' },
    ],
    measures: { tssLoss: ['band', 'triangle'], tssAfter: ['remaining'], tssBefore: ['remaining', 'band', 'triangle'] },
    measureWords: { tssLoss: WORDS.tssLoss },
    ticks: { priceAfter: ['P1'], priceBefore: ['P0'], quantityAfter: ['Q1'], quantityBefore: ['Q0'] },
    shown: ['Q1', 'Q0'],
    edges: ['Q1', 'Q0'],
  },
  {
    type: 'tariff',
    when: 'a small open economy importing at the world price, with a tariff: imports, tariff revenue, producer surplus gain, deadweight loss',
    parts: [
      curve('D', 'D', 'domestic demand', 'downward-sloping'),
      curve('S', 'S', 'domestic supply', 'upward-sloping'),
      y('Pt', 'P_t', 'domestic price with the tariff (world price + tariff)', 'a horizontal price line above {Pw}, below where {D} meets {S}'),
      y('Pw', 'P_w', 'world price', 'a horizontal price line below where {D} meets {S}'),
      x('Q1', 'Q_1', 'domestic output at the world price', 'where {S} meets the {Pw} line'),
      x('Q2', 'Q_2', 'domestic output with the tariff', 'where {S} meets the {Pt} line'),
      x('Q3', 'Q_3', 'quantity demanded with the tariff', 'where {D} meets the {Pt} line'),
      x('Q4', 'Q_4', 'quantity demanded at the world price', 'where {D} meets the {Pw} line'),
    ],
    regions: [
      { id: 'psGain', what: 'gain in producer surplus: Pt to Pw left of S, 0 to Q2', words: WORDS.psGain, shape: 'the area between the {Pt} and {Pw} lines, left of {S}' },
      { id: 'dwlProduction', what: 'deadweight loss in production: between S and Pw, Q1 to Q2', words: null, shape: 'the triangle above the {Pw} line and below {S}, from {Q1} to {Q2}' },
      { id: 'revenue', what: 'tariff revenue: Pt to Pw, Q2 to Q3', words: WORDS.tariffRevenue, shape: 'the rectangle between the {Pt} and {Pw} lines, from {Q2} to {Q3}' },
      { id: 'dwlConsumption', what: 'deadweight loss in consumption: between D and Pw, Q3 to Q4', words: null, shape: 'the triangle above the {Pw} line and below {D}, from {Q3} to {Q4}' },
      { id: 'csAfter', what: 'consumer surplus with the tariff: under D above Pt, 0 to Q3', words: WORDS.cs, shape: 'the area under {D} and above the {Pt} line, from 0 to {Q3}' },
      { id: 'psBefore', what: 'producer surplus at the world price: below Pw above S, 0 to Q1', words: WORDS.ps, shape: 'the area below the {Pw} line and above {S}, from 0 to {Q1}' },
    ],
    measures: {
      dwl: ['dwlProduction', 'dwlConsumption'],
      revenue: ['revenue'],
      psGain: ['psGain'],
      csLoss: ['psGain', 'dwlProduction', 'revenue', 'dwlConsumption'],
      csAfter: ['csAfter'],
      psBefore: ['psBefore'],
      psAfter: ['psBefore', 'psGain'],
    },
    measureWords: { csLoss: WORDS.csLoss, dwl: WORDS.dwl },
    ticks: { importsBefore: ['Q1', 'Q4'], importsAfter: ['Q2', 'Q3'], domesticOutput: ['Q2'], quantityAfter: ['Q3'], priceAfter: ['Pt'], priceBefore: ['Pw'] },
    shown: ['Pt', 'Pw', 'Q1', 'Q2', 'Q3', 'Q4'],
    edges: ['Q1', 'Q2', 'Q3', 'Q4'],
  },
];

export function sceneDef(type: SceneType): SceneDef | undefined {
  return SCENES.find((s) => s.type === type);
}

/** The part's label when the model gives none. */
export function defaultLabel(part: ScenePartDef, market: SceneMarket, externality: Externality): string {
  if (part.id === 'social') return externality === 'negativeConsumption' || externality === 'positiveConsumption' ? 'MSB' : 'MSC';
  if (part.id === 'D' && (externality === 'negativeProduction' || externality === 'positiveProduction')) return 'D = MPB = MSB';
  if (part.id === 'D' && externality !== 'none') return 'MPB';
  if (part.id === 'S' && (externality === 'negativeConsumption' || externality === 'positiveConsumption')) return 'S = MPC = MSC';
  if (part.id === 'S' && externality !== 'none') return 'MPC';
  return market === 'labour' && part.labour ? part.labour : part.label;
}

/** Every region a measure names, or the region itself; [] when the scene has neither. */
export function regionsOf(def: SceneDef, id: string): string[] {
  if (def.regions.some((r) => r.id === id)) return [id];
  return def.measures[id as SceneAsk] ?? [];
}
