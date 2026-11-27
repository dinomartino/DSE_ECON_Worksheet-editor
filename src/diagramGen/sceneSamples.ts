import { emptyScene, emptySpec } from './schema';
import { SCENES } from './sceneCatalogue';
import type { DiagramSpec, Externality, SpecScene } from './types';

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
