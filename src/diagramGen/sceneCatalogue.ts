import { IMPORT_QUOTA_MENU_DEF } from './importQuota';
import { MONOPOLY_MENU_DEF } from './monopoly';
import { TRADE_MENU_DEF } from './trade';
import { WORDS } from './sceneKit';
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
  /** k-0589: a lettered point (a PPF's E, P, C) or a bracket (exports, imports) on a trade figure. */
  kind: 'curve' | 'yTick' | 'xTick' | 'point' | 'bracket';
  /** k-0589: the curve or point a number on the axis belongs to (a figure the student completes gives them together). */
  of?: string;
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

/**
 * A point a question may letter (k-0577 round 2), for areas named by their corners ("area efj").
 * It lies on curve `on`, where it meets `at`: another curve, or a tick part (directly above or
 * below that quantity, level with that price). `other` and `private` stand for the externality's
 * curves (the one the social curve crosses, the private one beside it).
 */
export interface ScenePointDef {
  id: string;
  on: string;
  at: string;
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
  /** Points a question may letter (corners of its areas). */
  points: ScenePointDef[];
}

const w = (en: string, zh: string): SpecText => ({ en, zh });

export { WORDS } from './sceneKit';

const curve = (id: string, label: string, what: string, place: string): ScenePartDef => ({ id, kind: 'curve', label, what, place });
const y = (id: string, label: string, what: string, place: string, labour?: string): ScenePartDef => ({ id, kind: 'yTick', label, what, place, ...(labour ? { labour } : {}) });
const x = (id: string, label: string, what: string, place: string): ScenePartDef => ({ id, kind: 'xTick', label, what, place });
const pt = (id: string, on: string, at: string): ScenePointDef => ({ id, on, at });

export const SCENES: SceneDef[] = [
  {
    type: 'surplus',
    when: 'one market at equilibrium: consumer and producer surplus, total social surplus, cost, revenue',
    parts: [curve('D', 'D', 'demand', 'downward-sloping'), curve('S', 'S', 'supply', 'upward-sloping'), y('P0', 'P_0', 'equilibrium price', 'where {D} meets {S}', 'W_0'), x('Q0', 'Q_0', 'equilibrium quantity', 'where {D} meets {S}')],
    regions: [
      { id: 'cs', what: 'CS: under D, above P0, 0 to Q0', words: WORDS.cs, shape: 'the area under {D} and above the {P0} line, from 0 to {Q0}' },
      { id: 'ps', what: 'PS: above S, below P0, 0 to Q0', words: WORDS.ps, shape: 'the area below the {P0} line and above {S}, from 0 to {Q0}' },
      { id: 'cost', what: 'cost of production: under S, 0 to Q0', words: WORDS.cost, shape: 'the area under {S}, from 0 to {Q0}' },
    ],
    measures: { cs: ['cs'], ps: ['ps'], tss: ['cs', 'ps'], cost: ['cost'], revenue: ['ps', 'cost'] },
    measureWords: { tss: WORDS.tss, revenue: WORDS.revenue },
    ticks: { priceBefore: ['P0'], quantityBefore: ['Q0'] },
    shown: ['P0', 'Q0'],
    edges: ['P0', 'Q0'],
    points: [pt('e0', 'D', 'S')],
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
      { id: 'csAfter', what: 'CS after the tax: under D above Pb, 0 to Q1', words: WORDS.cs, shape: 'the area under {D} and above the {Pb} line, from 0 to {Q1}' },
      { id: 'buyersBurden', what: "buyers' share of the tax revenue: Pb to P0, 0 to Q1", words: WORDS.buyersBurden, shape: 'the rectangle between the {Pb} and {P0} lines, from 0 to {Q1}' },
      { id: 'sellersBurden', what: "sellers' share of the tax revenue: P0 to Ps, 0 to Q1", words: WORDS.sellersBurden, shape: 'the rectangle between the {P0} and {Ps} lines, from 0 to {Q1}' },
      { id: 'psAfter', what: 'PS after the tax: above S0 below Ps, 0 to Q1', words: WORDS.ps, shape: 'the area below the {Ps} line and above {S0}, from 0 to {Q1}' },
      { id: 'dwlBuyers', what: 'DWL, upper part: under D above P0, Q1 to Q0', words: null, shape: 'the triangle under {D} and above the {P0} line, from {Q1} to {Q0}' },
      { id: 'dwlSellers', what: 'DWL, lower part: below P0 above S0, Q1 to Q0', words: null, shape: 'the triangle below the {P0} line and above {S0}, from {Q1} to {Q0}' },
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
    points: [pt('e0', 'D', 'S0'), pt('e1', 'D', 'S1'), pt('s0AtQ1', 'S0', 'Q1'), pt('s1AtQ0', 'S1', 'Q0')],
  },
  {
    type: 'taxChange',
    when: 'a per-unit tax raised from t1 to t2 (or cut from t2 to t1): three supply curves, S0 with no tax, S1 with t1, S2 with t2; the deadweight loss before and after and its change. Questions like this usually name areas by corner letters (area efj): letter points',
    parts: [
      curve('D', 'D', 'demand', 'downward-sloping'),
      curve('S0', 'S_0', 'supply with no tax', 'upward-sloping'),
      curve('S1', 'S_1', 'supply with the tax t1 (S0 moved up by t1)', '{S0} shifted upward'),
      curve('S2', 'S_2', 'supply with the larger tax t2 (S0 moved up by t2)', '{S1} shifted further upward'),
      y('Pt2', 'P_2', 'price with the tax t2', 'where {D} meets {S2}'),
      y('Pt1', 'P_1', 'price with the tax t1', 'where {D} meets {S1}'),
      y('P0', 'P_0', 'price with no tax', 'where {D} meets {S0}'),
      x('Qt2', 'Q_2', 'quantity with the tax t2', 'where {D} meets {S2}'),
      x('Qt1', 'Q_1', 'quantity with the tax t1', 'where {D} meets {S1}'),
      x('Q0', 'Q_0', 'quantity with no tax', 'where {D} meets {S0}'),
    ],
    regions: [
      { id: 'dwlBefore', what: 'DWL with t1: between D and S0, Qt1 to Q0', words: null, shape: 'the triangle between {D} and {S0}, from {Qt1} to {Q0}' },
      { id: 'dwlAddUpper', what: 'between D and S1, Qt2 to Qt1', words: null, shape: 'the triangle between {D} and {S1}, from {Qt2} to {Qt1}' },
      { id: 'dwlAddLower', what: 'between S1 and S0, Qt2 to Qt1', words: null, shape: 'the band between {S1} and {S0}, from {Qt2} to {Qt1}' },
    ],
    measures: {
      dwl: ['dwlBefore', 'dwlAddUpper', 'dwlAddLower'],
      dwlChange: ['dwlAddUpper', 'dwlAddLower'],
    },
    measureWords: { dwl: WORDS.dwl },
    ticks: { priceBefore: ['Pt1'], priceAfter: ['Pt2'], quantityBefore: ['Qt1'], quantityAfter: ['Qt2'] },
    shown: [],
    edges: ['Qt2', 'Qt1', 'Q0'],
    points: [
      pt('e0', 'D', 'S0'),
      pt('e1', 'D', 'S1'),
      pt('e2', 'D', 'S2'),
      pt('s0AtQt1', 'S0', 'Qt1'),
      pt('s0AtQt2', 'S0', 'Qt2'),
      pt('s1AtQt2', 'S1', 'Qt2'),
      pt('s1AtQ0', 'S1', 'Q0'),
      pt('s2AtQt1', 'S2', 'Qt1'),
      pt('s2AtQ0', 'S2', 'Q0'),
    ],
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
      { id: 'dwl', what: 'DWL: between S0 (above) and D, Q0 to Q1', words: WORDS.dwl, shape: 'the triangle between {S0} and {D}, from {Q0} to {Q1}' },
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
    points: [pt('e0', 'D', 'S0'), pt('e1', 'D', 'S1'), pt('s0AtQ1', 'S0', 'Q1'), pt('s1AtQ0', 'S1', 'Q0')],
  },
  {
    type: 'subsidyChange',
    when: 'a per-unit subsidy raised from s1 to s2 (or cut from s2 to s1): three supply curves, S0 with no subsidy, S1 with s1, S2 with s2, each lower; the deadweight loss before and after and its change. Questions like this usually name areas by corner letters: letter points',
    parts: [
      curve('D', 'D', 'demand', 'downward-sloping'),
      curve('S0', 'S_0', 'supply with no subsidy', 'upward-sloping'),
      curve('S1', 'S_1', 'supply with the subsidy s1 (S0 moved down by s1)', '{S0} shifted downward'),
      curve('S2', 'S_2', 'supply with the larger subsidy s2 (S0 moved down by s2)', '{S1} shifted further downward'),
      y('P0', 'P_0', 'price with no subsidy', 'where {D} meets {S0}'),
      y('Ps1', 'P_1', 'price with the subsidy s1', 'where {D} meets {S1}'),
      y('Ps2', 'P_2', 'price with the subsidy s2', 'where {D} meets {S2}'),
      x('Q0', 'Q_0', 'quantity with no subsidy', 'where {D} meets {S0}'),
      x('Qs1', 'Q_1', 'quantity with the subsidy s1', 'where {D} meets {S1}'),
      x('Qs2', 'Q_2', 'quantity with the subsidy s2', 'where {D} meets {S2}'),
    ],
    regions: [
      { id: 'dwlBefore', what: 'DWL with s1: between S0 (above) and D, Q0 to Qs1', words: null, shape: 'the triangle between {S0} and {D}, from {Q0} to {Qs1}' },
      { id: 'dwlAddUpper', what: 'between S0 and S1, Qs1 to Qs2', words: null, shape: 'the band between {S0} and {S1}, from {Qs1} to {Qs2}' },
      { id: 'dwlAddLower', what: 'between S1 and D, Qs1 to Qs2', words: null, shape: 'the triangle between {S1} and {D}, from {Qs1} to {Qs2}' },
    ],
    measures: {
      dwl: ['dwlBefore', 'dwlAddUpper', 'dwlAddLower'],
      dwlChange: ['dwlAddUpper', 'dwlAddLower'],
    },
    measureWords: { dwl: WORDS.dwl },
    ticks: { priceBefore: ['Ps1'], priceAfter: ['Ps2'], quantityBefore: ['Qs1'], quantityAfter: ['Qs2'] },
    shown: [],
    edges: ['Q0', 'Qs1', 'Qs2'],
    points: [
      pt('e0', 'D', 'S0'),
      pt('e1', 'D', 'S1'),
      pt('e2', 'D', 'S2'),
      pt('s0AtQs1', 'S0', 'Qs1'),
      pt('s0AtQs2', 'S0', 'Qs2'),
      pt('s1AtQs2', 'S1', 'Qs2'),
      pt('s1AtQ0', 'S1', 'Q0'),
      pt('s2AtQs1', 'S2', 'Qs1'),
      pt('s2AtQ0', 'S2', 'Q0'),
    ],
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
      x('Qx', 'Q_4', 'a 4th quantity on D, right of Qd (for a distractor)', 'on {D} below the {Pc} line, right of {Qd}'),
    ],
    regions: [
      { id: 'csKept', what: 'under D above P0, 0 to Qs', words: null, shape: 'the area under {D} and above the {P0} line, from 0 to {Qs}' },
      { id: 'transfer', what: 'from producers to consumers: P0 to Pc, 0 to Qs', words: null, shape: 'the rectangle between the {P0} and {Pc} lines, from 0 to {Qs}' },
      { id: 'dwlBuyers', what: 'DWL, upper part: under D above P0, Qs to Q0', words: null, shape: 'the triangle under {D} and above the {P0} line, from {Qs} to {Q0}' },
      { id: 'dwlSellers', what: 'DWL, lower part: below P0 above S, Qs to Q0', words: null, shape: 'the triangle below the {P0} line and above {S}, from {Qs} to {Q0}' },
      { id: 'psAfter', what: 'PS at the ceiling: below Pc above S, 0 to Qs', words: WORDS.ps, shape: 'the area below the {Pc} line and above {S}, from 0 to {Qs}' },
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
    points: [pt('e0', 'D', 'S'), pt('sAtPc', 'S', 'Pc'), pt('dAtPc', 'D', 'Pc'), pt('dAtQs', 'D', 'Qs')],
  },
  {
    // k-0577 round 3 (u-kmdo): HKDSE 2023 P1 Q21, a ceiling at the old equilibrium price that binds once demand rises.
    type: 'ceilingDemandRise',
    when: 'a ceiling at the price where D1 meets S, binding once demand rises to D2: shortage, underproduction, DWL (corner letters: dwl abc = e1, d2AtQs, e2)',
    parts: [
      curve('D1', 'D_1', 'demand before', 'downward-sloping'),
      curve('D2', 'D_2', 'demand after', '{D1} shifted to the right'),
      curve('S', 'S', 'supply', 'upward-sloping'),
      y('Pc', 'P_1', 'the ceiling (dashed line)', 'a horizontal price line through where {D1} meets {S}'),
      y('P2', 'P_2', 'price at D2×S', 'where {D2} meets {S}'),
      x('Qs', 'Q_1', 'quantity traded', 'where {D1} meets {S}'),
      x('Q2', 'Q_2', 'quantity at D2×S', 'where {D2} meets {S}'),
      x('Qd', 'Q_3', 'quantity demanded at Pc', 'where {D2} meets the {Pc} line'),
    ],
    regions: [
      { id: 'dwl', what: 'D2 to S, Qs to Q2', words: WORDS.dwl, shape: 'the triangle between {D2} and {S}, from {Qs} to {Q2}' },
      { id: 'shortfall', what: 'above Pc, under S and D2, Qs to Qd', words: null, shape: 'the triangle above the {Pc} line and under {S} and {D2}, from {Qs} to {Qd}' },
      { id: 'csAfter', what: 'under D2 above Pc, 0 to Qs', words: WORDS.cs, shape: 'the area under {D2} and above the {Pc} line, from 0 to {Qs}' },
      { id: 'psAfter', what: 'below Pc above S, 0 to Qs', words: WORDS.ps, shape: 'the area below the {Pc} line and above {S}, from 0 to {Qs}' },
    ],
    measures: { dwl: ['dwl'], csAfter: ['csAfter'], psAfter: ['psAfter'], tssAfter: ['csAfter', 'psAfter'] },
    measureWords: { dwl: WORDS.dwl, tssAfter: WORDS.tss },
    ticks: { shortage: ['Qs', 'Qd'], quantityAfter: ['Qs'], quantityDemanded: ['Qd'], priceAfter: ['Pc'] },
    // As the paper prints it: only the ceiling's P1; a dashed line from b down to a bounds the loss.
    shown: ['Pc'],
    edges: [],
    points: [pt('e1', 'D1', 'S'), pt('e2', 'D2', 'S'), pt('d2AtPc', 'D2', 'Pc'), pt('d2AtQs', 'D2', 'Qs'), pt('d1AtQ2', 'D1', 'Q2')],
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
      { id: 'csAfter', what: 'CS at the floor: under D above Pf, 0 to Qd', words: WORDS.cs, shape: 'the area under {D} and above the {Pf} line, from 0 to {Qd}' },
      { id: 'transfer', what: 'from consumers to producers: Pf to P0, 0 to Qd', words: null, shape: 'the rectangle between the {Pf} and {P0} lines, from 0 to {Qd}' },
      { id: 'dwlBuyers', what: 'DWL, upper part: under D above P0, Qd to Q0', words: null, shape: 'the triangle under {D} and above the {P0} line, from {Qd} to {Q0}' },
      { id: 'dwlSellers', what: 'DWL, lower part: below P0 above S, Qd to Q0', words: null, shape: 'the triangle below the {P0} line and above {S}, from {Qd} to {Q0}' },
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
    points: [pt('e0', 'D', 'S'), pt('dAtPf', 'D', 'Pf'), pt('sAtPf', 'S', 'Pf'), pt('sAtQd', 'S', 'Qd')],
  },
  {
    type: 'quota',
    when: 'a production or sales quota below the equilibrium quantity: supply becomes vertical at the quota; price, quantity, deadweight loss, changes in surplus (an IMPORT quota is scene importQuota)',
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
      { id: 'csAfter', what: 'CS with the quota: under D above P1, 0 to Qq', words: WORDS.cs, shape: 'the area under {D} and above the {P1} line, from 0 to {Qq}' },
      { id: 'transfer', what: 'from consumers to producers: P1 to P0, 0 to Qq', words: null, shape: 'the rectangle between the {P1} and {P0} lines, from 0 to {Qq}' },
      { id: 'psKept', what: 'below P0 above S, 0 to Qq', words: null, shape: 'the area below the {P0} line and above {S}, from 0 to {Qq}' },
      { id: 'dwlBuyers', what: 'DWL, upper part: under D above P0, Qq to Q0', words: null, shape: 'the triangle under {D} and above the {P0} line, from {Qq} to {Q0}' },
      { id: 'dwlSellers', what: 'DWL, lower part: below P0 above S, Qq to Q0', words: null, shape: 'the triangle below the {P0} line and above {S}, from {Qq} to {Q0}' },
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
    points: [pt('e0', 'D', 'S'), pt('dAtQq', 'D', 'Qq'), pt('sAtQq', 'S', 'Qq')],
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
      { id: 'dwl', what: 'DWL: between the social curve and the other curve, between Qm and Qe', words: WORDS.dwl, shape: 'the triangle between {social} and the curve it crosses, between {Qm} and {Qe}' },
      { id: 'external', what: 'external cost or benefit up to the nearer output: between the social and the private curve, from 0 to the smaller of Qm and Qe', words: null, shape: 'the area between {social} and the private curve it lies beside, from 0 to the smaller of {Qm} and {Qe}' },
      { id: 'wedge', what: 'the triangle beside the DWL: between the other curve and the private curve, between Qm and Qe', words: null, shape: 'the triangle between the private curve and the curve it crosses, between {Qm} and {Qe}' },
    ],
    measures: { dwl: ['dwl'], externalCost: ['external', 'dwl', 'wedge'] },
    measureWords: {},
    ticks: { marketQuantity: ['Qm'], efficientQuantity: ['Qe'], misallocation: ['Qm', 'Qe'], priceBefore: ['Pm'] },
    shown: ['Qm', 'Qe'],
    edges: ['Qm', 'Qe'],
    points: [pt('em', 'D', 'S'), pt('ee', 'social', 'other'), pt('socialAtQm', 'social', 'Qm'), pt('privateAtQe', 'private', 'Qe')],
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
    points: [pt('e0', 'D', 'S0'), pt('e1', 'D', 'S1'), pt('s0AtQ1', 'S0', 'Q1')],
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
      { id: 'psGain', what: 'gain in PS: Pt to Pw left of S, 0 to Q2', words: WORDS.psGain, shape: 'the area between the {Pt} and {Pw} lines, left of {S}' },
      { id: 'dwlProduction', what: 'DWL in production: between S and Pw, Q1 to Q2', words: null, shape: 'the triangle above the {Pw} line and below {S}, from {Q1} to {Q2}' },
      { id: 'revenue', what: 'tariff revenue: Pt to Pw, Q2 to Q3', words: WORDS.tariffRevenue, shape: 'the rectangle between the {Pt} and {Pw} lines, from {Q2} to {Q3}' },
      { id: 'dwlConsumption', what: 'DWL in consumption: between D and Pw, Q3 to Q4', words: null, shape: 'the triangle above the {Pw} line and below {D}, from {Q3} to {Q4}' },
      { id: 'csAfter', what: 'CS with the tariff: under D above Pt, 0 to Q3', words: WORDS.cs, shape: 'the area under {D} and above the {Pt} line, from 0 to {Q3}' },
      { id: 'psBefore', what: 'PS at the world price: below Pw above S, 0 to Q1', words: WORDS.ps, shape: 'the area below the {Pw} line and above {S}, from 0 to {Q1}' },
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
    points: [pt('sAtPw', 'S', 'Pw'), pt('sAtPt', 'S', 'Pt'), pt('dAtPt', 'D', 'Pt'), pt('dAtPw', 'D', 'Pw'), pt('pwAtQ2', 'Pw', 'Q2'), pt('pwAtQ3', 'Pw', 'Q3')],
  },
  // k-0589 (audit k-0583 task C): the monopoly firm; its MC shape and stage pick the entry (`monopoly.ts:monopolyDef`).
  MONOPOLY_MENU_DEF,
  // k-0589: PPF / CPF trade; its numbers pick the parts (`trade.ts:tradeDef`).
  TRADE_MENU_DEF,
  // k-0589: an import quota; its stage and the lines it draws pick the parts (`importQuota.ts:importQuotaDef`).
  IMPORT_QUOTA_MENU_DEF,
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
