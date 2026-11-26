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
  { id: 'floor-letters', type: 'Price floor: DWL, transfer', spec: lettered('priceFloor') },
  { id: 'min-wage', type: 'Minimum wage: unemployment (answer)', spec: sceneSpec({ type: 'priceFloor', market: 'labour', gap: true }, 'answer') },
  { id: 'quota-letters', type: 'Quota: price, DWL', spec: lettered('quota') },
  { id: 'quota-words', type: 'Quota (answer)', spec: worded('quota', ['dwl']) },
  ...EXTERNALITY_KINDS.map((externality) => ({ id: `ext-${externality}`, type: `Externality: ${externality}`, spec: lettered('externality', { externality }) })),
  { id: 'cost-rise-letters', type: 'Cost rises: TSS loss', spec: lettered('costRise') },
  { id: 'cost-rise-words', type: 'Cost rises (answer)', spec: worded('costRise', ['tssLoss']) },
  { id: 'tariff-letters', type: 'Tariff: welfare areas', spec: { ...lettered('tariff'), scene: { ...lettered('tariff').scene!, areas: ['psGain', 'dwlProduction', 'revenue', 'dwlConsumption'].map((region, i) => ({ region, label: { en: 'abcd'[i], zh: 'abcd'[i] } })) } } },
  { id: 'tariff-words', type: 'Tariff (answer)', spec: worded('tariff', ['revenue', 'dwl']) },
];
