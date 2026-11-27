import { emptyScene, emptySpec } from './schema';
import { SCENES } from './sceneCatalogue';
import type { DiagramSpec, Externality, SpecScene, SpecTrade, SpecTradeCountry } from './types';

/**
 * Every scene of the catalogue, drawn the two ways a question uses it (k-0577): an MCQ figure
 * with every region lettered A, B, C … in catalogue order, and a model answer with its key
 * areas in words. Plus the variants: labour market, the four externalities, inelastic and
 * elastic slopes. The tests compile each; `scripts/k0577-scenes.test.ts` draws them.
 */

export interface SceneSample {
  id: string;
  type: string;
  spec: DiagramSpec;
}

const LETTERS = 'ABCDEFGH';

function sceneSpec(scene: Partial<SpecScene>, placement: DiagramSpec['placement'] = 'question'): DiagramSpec {
  return { ...emptySpec('scene'), placement, scene: { ...emptyScene(), ...scene } };
}

function lettered(type: SpecScene['type'], extra: Partial<SpecScene> = {}): DiagramSpec {
  const def = SCENES.find((s) => s.type === type)!;
  const regions = def.regions.map((r) => r.id);
  return sceneSpec({ type, ...extra, areas: regions.map((region, i) => ({ region, label: { en: LETTERS[i], zh: LETTERS[i] } })) });
}

/** A model answer: the areas the scheme names, in words (the catalogue's EDB terms). */
function worded(type: SpecScene['type'], regions: string[], extra: Partial<SpecScene> = {}): DiagramSpec {
  return sceneSpec({ type, ...extra, areas: regions.map((region) => ({ region, label: { en: '', zh: '' } })) }, 'answer');
}

const EXTERNALITY_KINDS: Exclude<Externality, 'none'>[] = ['negativeProduction', 'positiveProduction', 'negativeConsumption', 'positiveConsumption'];

export const SCENE_SAMPLES: SceneSample[] = [
  { id: 'surplus-letters', type: 'Consumer and producer surplus', spec: lettered('surplus') },
  { id: 'surplus-words', type: 'Consumer and producer surplus (answer)', spec: worded('surplus', ['cs', 'ps']) },
  { id: 'tax-letters', type: 'Unit tax: incidence, revenue, DWL', spec: lettered('unitTax') },
  { id: 'tax-words', type: 'Unit tax (answer)', spec: worded('unitTax', ['taxRevenue', 'dwl']) },
  { id: 'tax-inelastic', type: 'Unit tax, inelastic demand', spec: lettered('unitTax', { demand: 'steep' }) },
  { id: 'tax-elastic', type: 'Unit tax, elastic demand', spec: worded('unitTax', ['buyersBurden', 'sellersBurden'], { demand: 'flat' }) },
  { id: 'subsidy-letters', type: 'Unit subsidy: benefits, DWL', spec: lettered('unitSubsidy') },
  { id: 'subsidy-words', type: 'Unit subsidy (answer)', spec: worded('unitSubsidy', ['consumerBenefit', 'producerBenefit', 'dwl']) },
  { id: 'ceiling-letters', type: 'Price ceiling: DWL, transfer', spec: lettered('priceCeiling') },
  { id: 'ceiling-shortage', type: 'Price ceiling: shortage (answer)', spec: sceneSpec({ type: 'priceCeiling', gap: true }, 'answer') },
  {
    id: 'ceiling-q4',
    type: 'Price ceiling: shortage, with a fourth quantity for a distractor',
    spec: sceneSpec({ type: 'priceCeiling', labels: [{ part: 'P0', label: '' }, { part: 'Pc', label: 'P_1' }, { part: 'Qs', label: 'Q_1' }, { part: 'Q0', label: 'Q_2' }, { part: 'Qd', label: 'Q_3' }, { part: 'Qx', label: 'Q_4' }], ask: 'shortage' }),
  },
  { id: 'ceiling-rise-letters', type: 'Ceiling made effective by a demand rise: regions', spec: lettered('ceilingDemandRise') },
  {
    id: 'ceiling-rise-corners',
    type: 'Ceiling made effective by a demand rise: corner letters (HKDSE 2023 P1 Q21)',
    spec: sceneSpec({ type: 'ceilingDemandRise', ask: 'dwl', points: [{ point: 'e1', label: 'a' }, { point: 'd2AtQs', label: 'b' }, { point: 'e2', label: 'c' }, { point: 'd2AtPc', label: 'f' }] }),
  },
  { id: 'floor-letters', type: 'Price floor: DWL, transfer', spec: lettered('priceFloor') },
  { id: 'min-wage', type: 'Minimum wage: unemployment (answer)', spec: sceneSpec({ type: 'priceFloor', market: 'labour', gap: true }, 'answer') },
  { id: 'quota-letters', type: 'Quota: price, DWL', spec: lettered('quota') },
  { id: 'quota-words', type: 'Quota (answer)', spec: worded('quota', ['dwl']) },
  ...EXTERNALITY_KINDS.map((externality) => ({ id: `ext-${externality}`, type: `Externality: ${externality}`, spec: lettered('externality', { externality }) })),
  { id: 'cost-rise-letters', type: 'Cost rises: TSS loss', spec: lettered('costRise') },
  { id: 'cost-rise-words', type: 'Cost rises (answer)', spec: worded('costRise', ['tssLoss']) },
  { id: 'tariff-letters', type: 'Tariff: welfare areas', spec: { ...lettered('tariff'), scene: { ...lettered('tariff').scene!, areas: ['psGain', 'dwlProduction', 'revenue', 'dwlConsumption'].map((region, i) => ({ region, label: { en: 'abcd'[i], zh: 'abcd'[i] } })) } } },
  { id: 'tariff-words', type: 'Tariff (answer)', spec: worded('tariff', ['revenue', 'dwl']) },
  // k-0587 (audit k-0583 task B): two-state controls, each like the HKDSE figure it is named after.
  ...STAGE_SAMPLES(),
  // k-0589 (audit k-0583 task C): the monopoly firm, each like the Paper 2 figure it is named after.
  ...MONOPOLY_SAMPLES(),
  // k-0589: PPF / CPF trade, each like the Paper 2 figure it is named after.
  ...TRADE_SAMPLES(),
];

function pts(pairs: Array<[string, string]>) {
  return pairs.map(([point, label]) => ({ point, label }));
}
function lab(pairs: Array<[string, string]>) {
  return pairs.map(([part, label]) => ({ part, label }));
}

/** Two-state control scenes (k-0587), modelled on the papers the audit cites. */
function STAGE_SAMPLES(): SceneSample[] {
  return [
    { id: 'stage-ceiling-lowered-across', type: 'Ceiling lowered from above to below equilibrium (like DSE2021 P1 Q17, 2015 P1 Q19)', spec: sceneSpec({ type: 'priceCeiling', stage: 'lowered', binds: 'after' }) },
    {
      id: 'stage-ceiling-lowered-dwl',
      type: 'Ceiling lowered, both binding: increase in DWL, both shortages (answer, like DSE2012 P2 Q5)',
      spec: sceneSpec({ type: 'priceCeiling', stage: 'lowered', binds: 'both', gap: true, areas: [{ region: 'dwlChange', label: { en: '', zh: '' } }], labels: lab([['Qs1', 'Q_1'], ['Qs2', 'Q_2']]) }, 'answer'),
    },
    { id: 'stage-floor-raised-across', type: 'Floor changed from below to above equilibrium (like DSE2020 P1 Q20)', spec: sceneSpec({ type: 'priceFloor', stage: 'raised', binds: 'after', labels: lab([['Qs1', 'Q_1']]) }) },
    { id: 'stage-floor-both-below', type: 'Floor changed, both below equilibrium (like DSE2023 P1 Q17)', spec: sceneSpec({ type: 'priceFloor', stage: 'lowered', binds: 'neither' }) },
    {
      id: 'stage-ceiling-supply-rise',
      type: 'Ceiling, supply rises: ceiling between the equilibria, Q1–Q4 (like DSE2026 P1 Q16)',
      spec: sceneSpec({ type: 'priceCeiling', stage: 'supplyRise', binds: 'before', ask: 'quantityAfter', labels: lab([['D', 'D_1'], ['S', 'S_1'], ['S2', 'S_2'], ['Pc1', 'P_1'], ['Q0', 'Q_1'], ['Qd1', 'Q_2'], ['Qn', 'Q_3'], ['Qs2', 'Q_4']]) }),
    },
    {
      id: 'stage-ceiling-demand-rise',
      type: 'Ceiling at the old price, demand rises: DWL abc (like DSE2023 P1 Q21, was ceilingDemandRise)',
      spec: sceneSpec({ type: 'priceCeiling', stage: 'demandRise', binds: 'after', ask: 'dwl', points: pts([['e0', 'a'], ['d2AtQ0', 'b'], ['en', 'c'], ['d2AtPc1', 'f']]) }),
    },
    {
      id: 'stage-ceiling-demand-both',
      type: 'Ceiling below both equilibria, demand rises: original and new shortage (answer)',
      spec: sceneSpec({ type: 'priceCeiling', stage: 'demandRise', binds: 'both', gap: true, labels: lab([['Qs1', 'Q_s'], ['Qd1', 'Q_1'], ['Qd2', 'Q_2']]) }, 'answer'),
    },
    {
      id: 'stage-quota-enlarged',
      type: 'Quota enlarged from Q1 to Q2: DWL falls by WXYZ (like DSE2015 P2 Q3)',
      spec: sceneSpec({ type: 'quota', stage: 'raised', binds: 'both', ask: 'dwlChange', points: pts([['dAtQq1', 'W'], ['dAtQq2', 'X'], ['sAtQq2', 'Y'], ['sAtQq1', 'Z']]) }),
    },
    {
      id: 'stage-quota-demand-rise',
      type: 'Quota, demand rises from D0 to D1: the added DWL band (answer, like DSE2024 P2 Q3)',
      spec: sceneSpec({ type: 'quota', stage: 'demandRise', binds: 'both', areas: [{ region: 'dwlChange', label: { en: '', zh: '' } }], labels: lab([['D', 'D_0'], ['D2', 'D_1']]) }, 'answer'),
    },
    {
      id: 'stage-min-wage-supply-fall',
      type: 'Minimum wage, labour supply falls: unemployment gone (answer, like DSE2013 P2 Q10)',
      spec: sceneSpec({ type: 'priceFloor', market: 'labour', stage: 'supplyFall', binds: 'before', gap: true, labels: lab([['Pc1', 'W_m']]) }, 'answer'),
    },
    {
      id: 'stage-quota-letters',
      type: 'Quota, demand rises: regions lettered A, B',
      spec: sceneSpec({ type: 'quota', stage: 'demandRise', binds: 'both', areas: [{ region: 'dwlKept', label: { en: 'A', zh: 'A' } }, { region: 'dwlAdded', label: { en: 'B', zh: 'B' } }] }),
    },
  ];
}

function words(region: string, en = '', zh = '') {
  return { region, label: { en, zh } };
}

/** Monopoly scenes (k-0589), modelled on the Elective 1 questions the audit cites. */
function MONOPOLY_SAMPLES(): SceneSample[] {
  return [
    { id: 'mono-letters', type: 'Monopoly, constant MC: CS, PS, DWL lettered', spec: lettered('monopoly') },
    {
      id: 'mono-flat-answer',
      type: 'Monopoly, constant MC: Qm, Pm, efficient Qc, DWL (answer, like DSE2013 / DSE2020 P2)',
      spec: sceneSpec({ type: 'monopoly', mc: 'flat', labels: lab([['Qc', 'Q_c']]), areas: [words('dwl')] }, 'answer'),
    },
    {
      id: 'mono-rising-compare',
      type: 'Monopoly against perfect competition, rising MC: Qm, Pm, Qc, Pc (answer, like DSE2014 P2 Q13)',
      spec: sceneSpec({ type: 'monopoly', mc: 'rising', labels: lab([['Qc', 'Q_c'], ['Pc', 'P_c']]), areas: [words('dwl')] }, 'answer'),
    },
    {
      id: 'mono-zero',
      type: 'Monopoly, MC = 0: QM at MR = 0, QE at D (answer, like DSE2017 P2 Q14, DSEPP Q15)',
      spec: sceneSpec({ type: 'monopoly', mc: 'zero', labels: lab([['D', 'D = MB'], ['Qm', 'Q_M'], ['Pm', 'P_M'], ['Qc', 'Q_E']]), areas: [words('dwl')] }, 'answer'),
    },
    {
      id: 'mono-u',
      type: 'Monopoly, U-shaped MC: Qm, Pm, DWL (answer, like DSE2016 P2 Q14(a))',
      spec: sceneSpec({ type: 'monopoly', mc: 'uShaped', areas: [words('dwl', 'DL', 'DL')] }, 'answer'),
    },
    {
      id: 'mono-mc-rise-given',
      type: 'Given D only; the answer: MR, MC1 to MC2, QM, PM, Q2, P2, the new DWL (like DSE2018 P2 Q14)',
      spec: sceneSpec({ type: 'monopoly', mc: 'rising', stage: 'mcRise', given: ['D'], labels: lab([['Qm', 'Q_M'], ['Pm', 'P_M']]), areas: [words('dwlAfter', 'DL', 'DL')] }),
    },
    {
      id: 'mono-mc-fall-given',
      type: 'Given D1 and MC1; the answer: MR, MC2, Q1, P1, Q2, P2, the old and new DWL hatched both ways (like DSE2019 P2 Q13)',
      spec: sceneSpec({ type: 'monopoly', mc: 'rising', stage: 'mcFall', given: ['D', 'MC'], labels: lab([['D', 'D_1']]), areas: [words('dwlBefore'), words('dwlAfter')] }),
    },
    {
      id: 'mono-same-output',
      type: 'MC falls, the firm keeps P and Q: DL0 and the increase in DL (answer, like DSE2016 P2 Q14(b))',
      spec: sceneSpec({ type: 'monopoly', mc: 'uShaped', stage: 'mcFallKept', labels: lab([['MC', 'MC_0'], ['MC2', 'MC_1'], ['Qm', 'Q_m'], ['Pm', 'P_m']]), areas: [words('dwlBefore', 'DL_0', 'DL_0'), words('dwlChange')] }, 'answer'),
    },
    {
      id: 'mono-lump-sum',
      type: 'A lump-sum tax: Q1 = Q2, P1 = P2, the DWL unchanged (answer, like DSE2015 / DSE2020 P2)',
      spec: sceneSpec({ type: 'monopoly', mc: 'flat', stage: 'lumpSumTax', areas: [words('dwl', 'DWL_0 = DWL_1', 'DWL_0 = DWL_1')] }, 'answer'),
    },
    {
      id: 'mono-mc-to-price',
      type: 'MC rises to the old price: the new efficient output is Q0, the new monopoly output Q2 (answer, like DSE2025 P2 Q12)',
      spec: sceneSpec({ type: 'monopoly', mc: 'flat', stage: 'mcRiseToPrice', given: ['D', 'MC'], labels: lab([['Qm', 'Q_0'], ['Pm', 'P_0'], ['Qc', 'Q_1']]), areas: [words('dwlBefore')] }),
    },
    {
      id: 'mono-mc-fall-letters',
      type: 'MC falls: the DWL kept, removed and added lettered A, B, C (an MCQ)',
      spec: sceneSpec({ type: 'monopoly', mc: 'flat', stage: 'mcFall', areas: [words('dwlKept', 'A', 'A'), words('dwlRemoved', 'B', 'B'), words('dwlAdded', 'C', 'C')] }),
    },
  ];
}

function nation(c: Partial<SpecTradeCountry> & Pick<SpecTradeCountry, 'x' | 'y'>): SpecTradeCountry {
  return { name: '', shape: 'linear', noTradeX: 0, noTradeCost: 0, trade: true, consume: 'none', amount: 0, brackets: false, gain: false, ...c };
}
function tradeOf(t: Partial<SpecTrade> & Pick<SpecTrade, 'tot' | 'countries'>): SpecTrade {
  return { totLine: false, grow: 0, xGood: { en: '', zh: '' }, yGood: { en: '', zh: '' }, ...t };
}

/** PPF / CPF trade scenes (k-0589), modelled on the Elective 2 questions the audit cites. */
function TRADE_SAMPLES(): SceneSample[] {
  const t = (trade: SpecTrade, extra: Partial<SpecScene> = {}, placement: DiagramSpec['placement'] = 'answer') => sceneSpec({ type: 'ppfTrade', trade, ...extra }, placement);
  return [
    {
      id: 'ppf-2019-given',
      type: 'Given PPF_A (20X or 30Y); the answer: C0 at (10, 15), P1, CPF_A at 1X = 2Y, C1 at (10, 20), the gain, exports and imports (like DSE2019 P2 Q14)',
      spec: t(tradeOf({ tot: 2, countries: [nation({ x: 20, y: 30, noTradeX: 10, consume: 'sameX', brackets: true, gain: true })] }), { given: ['PPF'], labels: lab([['PPF', 'PPF_A'], ['CPF', 'CPF_A'], ['E', 'C_0'], ['P', 'P_1'], ['C', 'C_1'], ['X', 'X_A'], ['M', 'M_A']]) }, 'question'),
    },
    {
      id: 'ppf-2013-growth',
      type: 'Linear PPF (10X or 4Y) and CPF at 1X = 1Y, then labour doubles (answer, like DSE2013 P2 Q14)',
      spec: t(tradeOf({ tot: 1, grow: 2, countries: [nation({ x: 10, y: 4 })] })),
    },
    {
      id: 'ppf-2014-two',
      type: 'Given PPF_A (10, 10) and PPF_B (8X or 16Y); the answer: A specialises in X, CPF_A at 1X = 1.5Y, consumption with 4X traded (like DSE2014 P2 Q14)',
      spec: t(tradeOf({ tot: 1.5, countries: [nation({ name: 'A', x: 10, y: 10, consume: 'tradedX', amount: 4 }), nation({ name: 'B', x: 8, y: 16, trade: false })] }), { given: ['PPF', 'PPF2'] }, 'question'),
    },
    {
      id: 'ppf-2018-two',
      type: 'Two linear PPFs at 1X = 1Y: P_B, CPF_B, C_B with equal X and Y; CPF_A, A’s exports and imports (answer, like DSE2018 P2 Q15)',
      spec: t(tradeOf({ tot: 1, countries: [nation({ name: 'A', x: 100, y: 80, consume: 'tradedX', amount: 30, brackets: true }), nation({ name: 'B', x: 30, y: 60, consume: 'equal' })] })),
    },
    {
      id: 'ppf-pp-same-cpf',
      type: 'Two linear PPFs, complete specialisation at 1X = 1Y: both CPFs on one line (answer, like DSEPP P2 Q16)',
      spec: t(tradeOf({ tot: 1, countries: [nation({ name: 'A', x: 100, y: 50 }), nation({ name: 'B', x: 50, y: 100 })] })),
    },
    {
      id: 'ppf-2016-concave',
      type: 'Concave PPF, no-trade point E_a, the world price tangent: P_A, C_A with the same X, export and import brackets (answer, like DSE2016 P2 Q15)',
      spec: t(tradeOf({ tot: 2.5, countries: [nation({ shape: 'concave', x: 20, y: 40, noTradeCost: 1, consume: 'sameX', brackets: true })] }), { labels: lab([['E', 'E_a'], ['P', 'P_A'], ['C', 'C_A']]) }),
    },
    {
      id: 'ppf-2017-flatter',
      type: 'Concave PPF, a flatter world price line TT’: P_T up-left of P_A, CPF parallel to TT’, imports of X (answer, like DSE2017 P2 Q15)',
      spec: t(tradeOf({ tot: 0.8, totLine: true, countries: [nation({ shape: 'concave', x: 30, y: 30, noTradeCost: 2, consume: 'tradedX', amount: 8, brackets: true })] }), { labels: lab([['E', 'P_A'], ['P', 'P_T'], ['C', 'C_T'], ['TOT', "TT'"]]) }),
    },
    {
      id: 'ppf-2025-two',
      type: 'Given concave PPF_A with A_0 and linear PPF_B; the answer: P_A, CPF_A at slope 1, CPF_B, C_B with 10X traded, B’s exports and imports (like DSE2025 P2 Q13)',
      spec: t(
        tradeOf({ tot: 1, totLine: true, countries: [nation({ name: 'A', shape: 'concave', x: 30, y: 30, noTradeCost: 0.5 }), nation({ name: 'B', x: 20, y: 30, consume: 'tradedX', amount: 10, brackets: true })] }),
        { given: ['PPF', 'E', 'PPF2', 'TOT'], labels: lab([['E', 'A_0']]) },
        'question',
      ),
    },
    {
      id: 'ppf-sp-growth',
      type: 'Concave PPF AA’ with trade at 1X = 1Y, then technology moves it out to BB’ (answer, like DSESP P2 Q13)',
      spec: t(tradeOf({ tot: 1, grow: 1.3, xGood: { en: 'Clothing', zh: '衣服' }, yGood: { en: 'Food', zh: '食物' }, countries: [nation({ shape: 'concave', x: 30, y: 30, noTradeCost: 0.5, consume: 'sameX' })] })),
    },
  ];
}
