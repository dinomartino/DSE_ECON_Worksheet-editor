import { emptySpec } from './schema';
import type { DiagramSpec, SpecLevel, SpecPoint, SpecText } from './types';

/**
 * Multiple-choice figures (k-0534): a question as printed (no words about the figure),
 * its options and key, and the spec a good reply holds. The tests compile each, check its
 * labels against the options and work the key out again from the drawing;
 * `scripts/k0534-before-after.mjs` draws them. `hkdse-q16` is a real paper's figure read
 * into the spec (the reference the user gave), to show a reference maps to the same
 * vocabulary; the rest are invented.
 */

const t = (en: string, zh: string): SpecText => ({ en, zh });
const PRICE = t('Price', '價格');
const QUANTITY = t('Quantity', '數量');

export interface McCase {
  id: string;
  title: string;
  sides: Array<'en' | 'zh'>;
  stem: string;
  options: string[];
  answer: number;
  /** The writer's note to the diagram maker. */
  figure: string;
  spec: DiagramSpec;
}

const spec = (body: Partial<DiagramSpec>): DiagramSpec => ({ ...emptySpec('curves'), placement: 'question', xAxis: QUANTITY, yAxis: PRICE, ...body });
const level = (l: Partial<SpecLevel> & Pick<SpecLevel, 'id' | 'kind' | 'label'>): SpecLevel => ({ above: [], below: [], side: 'below', style: 'guide', ...l });
const pt = (a: string, b: string, xTick: string, yTick = ''): SpecPoint => ({ a, b, name: '', xTick, yTick, dot: false });
const Q4 = ['Q1', 'Q2', 'Q3', 'Q4'];

/** A ceiling between the two equilibria, supply rises: HKDSE Q16's figure. */
const ceilingShift = spec({
  reason: 'A ceiling at P1 between the old and new equilibria; supply increases from S1 to S2.',
  curves: [
    { id: 'D1', role: 'demand', slope: 'normal', place: 'mid', label: 'D_1' },
    { id: 'S1', role: 'supply', slope: 'normal', place: 'mid', label: 'S_1' },
  ],
  shifts: [{ of: 'S1', id: 'S2', direction: 'right', size: 'normal', label: 'S_2' }],
  levels: [level({ id: 'P1', kind: 'ceiling', below: ['D1', 'S1'], above: ['D1', 'S2'], label: 'P_1' })],
  points: [pt('S1', 'P1', 'Q_1'), pt('D1', 'P1', 'Q_2'), pt('D1', 'S2', 'Q_3'), pt('S2', 'P1', 'Q_4')],
  asks: { what: 'quantityTransacted', state: 'after' },
});

/** The k-0534 draft done right: a floor between the equilibria, supply falls. */
const floorShift = spec({
  reason: 'A floor at P1 above the old equilibrium and below the new one; supply decreases from S1 to S2.',
  curves: [
    { id: 'D1', role: 'demand', slope: 'normal', place: 'mid', label: 'D_1' },
    { id: 'S1', role: 'supply', slope: 'normal', place: 'mid', label: 'S_1' },
  ],
  shifts: [{ of: 'S1', id: 'S2', direction: 'left', size: 'normal', label: 'S_2' }],
  levels: [level({ id: 'P1', kind: 'floor', above: ['D1', 'S1'], below: ['D1', 'S2'], side: 'above', label: 'P_1' })],
  points: [pt('S2', 'P1', 'Q_1'), pt('D1', 'S2', 'Q_2'), pt('D1', 'P1', 'Q_3'), pt('S1', 'P1', 'Q_4')],
  asks: { what: 'quantityTransacted', state: 'after' },
});

const tax = spec({
  reason: 'A unit tax shifts supply up from S0 to S1; sellers receive the price on S0 at the new quantity.',
  curves: [
    { id: 'D', role: 'demand', slope: 'normal', place: 'mid', label: 'D' },
    { id: 'S0', role: 'supply', slope: 'normal', place: 'mid', label: 'S_0' },
  ],
  shifts: [{ of: 'S0', id: 'S1', direction: 'up', size: 'normal', label: 'S_1' }],
  points: [pt('D', 'S1', 'Q_1', 'P_3'), pt('D', 'S0', 'Q_2', 'P_2'), pt('S0', 'Q_1', '', 'P_1')],
  asks: { what: 'sellersGet', state: 'after' },
});

const subsidy = spec({
  reason: 'A unit subsidy shifts supply down from S0 to S1; buyers pay the new market price.',
  curves: [
    { id: 'D', role: 'demand', slope: 'normal', place: 'mid', label: 'D' },
    { id: 'S0', role: 'supply', slope: 'normal', place: 'mid', label: 'S_0' },
  ],
  shifts: [{ of: 'S0', id: 'S1', direction: 'down', size: 'normal', label: 'S_1' }],
  points: [pt('D', 'S0', 'Q_1', 'P_2'), pt('D', 'S1', 'Q_2', 'P_1'), pt('S0', 'Q_2', '', 'P_3')],
  asks: { what: 'buyersPay', state: 'after' },
});

const quota = spec({
  reason: 'A quota left of the equilibrium quantity: the price is read off demand at the quota.',
  curves: [
    { id: 'D', role: 'demand', slope: 'normal', place: 'mid', label: 'D' },
    { id: 'S', role: 'supply', slope: 'normal', place: 'mid', label: 'S' },
  ],
  levels: [level({ id: 'Qq', kind: 'quota', below: ['D', 'S'], label: 'Q_1' })],
  points: [pt('D', 'Qq', '', 'P_2'), pt('S', 'Qq', '', ''), pt('D', 'S', 'Q_2', 'P_1')],
  asks: { what: 'marketPrice', state: 'after' },
});

const ppc = spec({
  reason: 'The economy grows: the PPC moves out from PPC0 to PPC1; A inside, B on PPC0, C between them.',
  xAxis: t('Good X', 'X 物品'),
  yAxis: t('Good Y', 'Y 物品'),
  curves: [{ id: 'F0', role: 'frontier', slope: 'normal', place: 'mid', label: 'PPC_0' }],
  shifts: [{ of: 'F0', id: 'F1', direction: 'out', size: 'normal', label: 'PPC_1' }],
  marks: [
    { of: 'F0', where: 'inside', label: 'A' },
    { of: 'F0', where: 'on', label: 'B' },
    { of: 'F0', where: 'outside', label: 'C' },
  ],
});

export const MC_CASES: McCase[] = [
  {
    id: 'hkdse-q16',
    title: 'Ceiling + supply rises (HKDSE Q16, read from the reference)',
    sides: ['en'],
    stem: 'Refer to the following supply-demand diagram of good Z.\n\nSuppose Country A sets a price ceiling on good Z at P_1. If the supply curve shifts from S_1 to S_2, the new quantity transacted will be at ____.',
    options: Q4,
    answer: 2,
    figure: 'D1, S1 shifting right to S2; a ceiling P1 below the D1×S1 equilibrium and above D1×S2; Q1 S1 at P1, Q2 D1 at P1, Q3 D1×S2, Q4 S2 at P1; key Q3.',
    spec: ceilingShift,
  },
  {
    id: 'floor-shift',
    title: 'Floor + supply falls (the k-0534 draft, done right)',
    sides: ['en'],
    stem: 'Refer to the following supply-demand diagram of good X.\n\nSuppose Country B sets a price floor on good X at P_1. If the supply curve shifts from S_1 to S_2, the new quantity transacted will be at ____.',
    options: Q4,
    answer: 1,
    figure: 'D1, S1 shifting left to S2; a floor P1 above D1×S1 and below D1×S2; Q1 S2 at P1, Q2 D1×S2, Q3 D1 at P1, Q4 S1 at P1; key Q2 (the floor no longer binds).',
    spec: floorShift,
  },
  {
    id: 'floor-shift-zh',
    title: 'Floor + supply falls, 中文',
    sides: ['zh'],
    stem: '參看下面 X 物品的供求圖。\n\n假設 B 國為 X 物品設定最低價格 P_1。若供應曲線由 S_1 移至 S_2，新的交易量會是 ____。',
    options: Q4,
    answer: 1,
    figure: 'Same as floor-shift.',
    spec: floorShift,
  },
  {
    id: 'unit-tax',
    title: 'Unit tax: price sellers receive',
    sides: ['en'],
    stem: 'Refer to the following diagram. The government imposes a unit tax on good Y and the supply curve shifts from S_0 to S_1.\n\nAfter the tax, the price received by sellers is ____.',
    options: ['P1', 'P2', 'P3', 'P3 − P1'],
    answer: 0,
    figure: 'D, S0 shifting up to S1 by the tax; P3/Q1 at D×S1, P2/Q2 at D×S0, P1 on S0 above Q1; key P1.',
    spec: tax,
  },
  {
    id: 'subsidy-zh',
    title: 'Subsidy: price buyers pay, 中文',
    sides: ['zh'],
    stem: '參看下圖。政府向 Y 物品的生產者提供從量津貼，供應曲線由 S_0 移至 S_1。\n\n津貼實施後，買家支付的價格是 ____。',
    options: ['P1', 'P2', 'P3', 'P3 − P1'],
    answer: 0,
    figure: 'D, S0 shifting down to S1 by the subsidy; P2/Q1 at D×S0, P1/Q2 at D×S1, P3 on S0 above Q2; key P1.',
    spec: subsidy,
  },
  {
    id: 'quota',
    title: 'Quota: the market price',
    sides: ['en'],
    stem: 'Refer to the following supply-demand diagram of good W. The government sets a quota of Q_1 on the output of good W.\n\nThe market price will be ____.',
    options: ['P1', 'P2', 'Q1', 'Q2'],
    answer: 1,
    figure: 'D, S; a quota Q1 left of D×S; P2 on D at Q1, P1/Q2 at D×S; key P2.',
    spec: quota,
  },
  {
    id: 'ppc-growth',
    title: 'PPC: economic growth',
    sides: ['en'],
    stem: 'Refer to the following diagram. The production possibilities curve of an economy shifts from PPC_0 to PPC_1.\n\nWhich of the following points was unattainable before the shift but attainable after it?',
    options: ['Point A', 'Point B', 'Point C', 'None of them'],
    answer: 2,
    figure: 'PPC0 moving out to PPC1; A inside PPC0, B on PPC0, C between PPC0 and PPC1; key C.',
    spec: ppc,
  },
];

export const mcCaseById = (id: string): McCase => {
  const found = MC_CASES.find((c) => c.id === id);
  if (!found) throw new Error(`no MC case ${id}`);
  return found;
};
