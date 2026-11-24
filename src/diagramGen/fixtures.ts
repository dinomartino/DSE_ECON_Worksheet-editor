import { emptySpec } from './schema';
import type { DiagramSpec, SpecText } from './types';

/**
 * DSE-style cases: a question, its key, and the spec a good model returns for it. The
 * tests compile and check each; `scripts/diagram-gen-samples.test.ts` draws them to
 * PNG for review. Invented questions (no paper's own words).
 */

const t = (en: string, zh: string): SpecText => ({ en, zh });
const AX = {
  price: t('Price', '價格'),
  quantity: t('Quantity', '數量'),
  wage: t('Wage rate', '工資率'),
  labour: t('Quantity\nof labour', '勞工數量'),
  priceLevel: t('Price level', '物價水平'),
  realOutput: t('Real output', '實質產出'),
};

export interface DiagramCase {
  id: string;
  question: string;
  key: string;
  spec: DiagramSpec;
}

const spec = (body: Partial<DiagramSpec>): DiagramSpec => ({ ...emptySpec('curves'), ...body });

export const CASES: DiagramCase[] = [
  {
    id: 'demand-increase',
    question:
      'Household income in Hong Kong rises. Overseas package tours are a normal good. With the aid of a diagram, explain the effect on the equilibrium price and quantity of package tours. (4 marks)',
    key: 'As income rises, the demand for package tours (a normal good) increases. The demand curve shifts to the right from D0 to D1. Equilibrium price rises from P0 to P1 and equilibrium quantity rises from Q0 to Q1.',
    spec: spec({
      reason: 'Demand for a normal good increases with income: D shifts right.',
      placement: 'answer',
      xAxis: AX.quantity,
      yAxis: AX.price,
      curves: [
        { id: 'D0', role: 'demand', slope: 'normal', place: 'mid', label: 'D_0' },
        { id: 'S', role: 'supply', slope: 'normal', place: 'mid', label: 'S' },
      ],
      shifts: [{ of: 'D0', id: 'D1', direction: 'right', size: 'normal', label: 'D_1' }],
      points: [
        { a: 'D0', b: 'S', name: '', yTick: 'P_0', xTick: 'Q_0', dot: true },
        { a: 'D1', b: 'S', name: '', yTick: 'P_1', xTick: 'Q_1', dot: true },
      ],
      changeArrows: true,
    }),
  },
  {
    id: 'unit-tax',
    question:
      'The government imposes a unit tax on cigarettes, whose demand is price inelastic. Draw a diagram to show the tax revenue and the deadweight loss. (4 marks)',
    key: 'The unit tax raises the cost of each unit: supply decreases and the supply curve shifts upward by the amount of the tax, from S0 to S1. Demand is inelastic, so the price paid by consumers rises by most of the tax. Tax revenue and deadweight loss are shaded.',
    spec: spec({
      reason: 'A unit tax shifts supply up by t; demand drawn steep (inelastic).',
      placement: 'answer',
      xAxis: AX.quantity,
      yAxis: AX.price,
      curves: [
        { id: 'D', role: 'demand', slope: 'steep', place: 'mid', label: 'D' },
        { id: 'S0', role: 'supply', slope: 'normal', place: 'mid', label: 'S_0' },
      ],
      shifts: [{ of: 'S0', id: 'S1', direction: 'up', size: 'normal', label: 'S_1 = S_0 + t' }],
      points: [
        { a: 'D', b: 'S0', name: '', yTick: 'P_0', xTick: 'Q_0', dot: true },
        { a: 'D', b: 'S1', name: '', yTick: 'P_1', xTick: 'Q_1', dot: true },
      ],
      shades: [
        { preset: 'taxRevenue', label: t('tax revenue', '稅收') },
        { preset: 'deadweightLoss', label: t('', '') },
      ],
    }),
  },
  {
    id: 'rent-ceiling',
    question:
      'The government sets a maximum rent for subdivided flats below the equilibrium rent. Illustrate the effect with a diagram. (4 marks)',
    key: 'A price ceiling below equilibrium: at Pc the quantity demanded (Qd) is greater than the quantity supplied (Qs), so there is a shortage of Qd − Qs.',
    spec: spec({
      reason: 'A binding price ceiling: the shortage between Qs and Qd at Pc.',
      placement: 'answer',
      xAxis: AX.quantity,
      yAxis: t('Rent', '租金'),
      curves: [
        { id: 'D', role: 'demand', slope: 'normal', place: 'mid', label: 'D' },
        { id: 'S', role: 'supply', slope: 'normal', place: 'mid', label: 'S' },
      ],
      levels: [{ id: 'Pc', kind: 'ceiling', above: [], below: [], side: 'below', style: 'line', label: 'P_c' }],
      points: [{ a: 'D', b: 'S', name: '', yTick: 'P_e', xTick: 'Q_e', dot: true }],
      gaps: [{ level: 'Pc', label: t('shortage', '短缺') }],
    }),
  },
  {
    id: 'minimum-wage',
    question: 'A statutory minimum wage is set above the equilibrium wage rate. Draw a labour market diagram showing its effect. (4 marks)',
    key: 'The minimum wage Wm is above the equilibrium wage. At Wm the quantity of labour supplied exceeds the quantity of labour demanded: a surplus of labour (unemployment).',
    spec: spec({
      reason: 'A binding minimum wage: the surplus of labour at Wm.',
      placement: 'answer',
      xAxis: AX.labour,
      yAxis: AX.wage,
      curves: [
        { id: 'D', role: 'demand', slope: 'normal', place: 'mid', label: 'D_L' },
        { id: 'S', role: 'supply', slope: 'normal', place: 'mid', label: 'S_L' },
      ],
      levels: [{ id: 'Wm', kind: 'floor', above: [], below: [], side: 'above', style: 'line', label: 'W_m' }],
      points: [{ a: 'D', b: 'S', name: '', yTick: 'W_e', xTick: 'Q_e', dot: true }],
      gaps: [{ level: 'Wm', label: t('surplus', '過剩') }],
    }),
  },
  {
    id: 'cost-push',
    question: 'World oil prices rise sharply. Using an AD-AS diagram, explain the effect on the price level and real output of Hong Kong in the short run. (4 marks)',
    key: 'Production costs rise, so short-run aggregate supply decreases: SRAS shifts to the left from SRAS0 to SRAS1. The price level rises from P0 to P1 and real output falls from Y0 to Y1.',
    spec: spec({
      reason: 'A cost shock: SRAS shifts left.',
      placement: 'answer',
      xAxis: AX.realOutput,
      yAxis: AX.priceLevel,
      curves: [
        { id: 'AD', role: 'ad', slope: 'normal', place: 'mid', label: 'AD' },
        { id: 'SRAS0', role: 'sras', slope: 'normal', place: 'mid', label: 'SRAS_0' },
      ],
      shifts: [{ of: 'SRAS0', id: 'SRAS1', direction: 'left', size: 'normal', label: 'SRAS_1' }],
      points: [
        { a: 'AD', b: 'SRAS0', name: '', yTick: 'P_0', xTick: 'Y_0', dot: true },
        { a: 'AD', b: 'SRAS1', name: '', yTick: 'P_1', xTick: 'Y_1', dot: true },
      ],
      changeArrows: true,
    }),
  },
  {
    id: 'ppc-growth',
    question: 'Refer to the PPC of Country X. Point A shows its current output. Which of the following best explains the shift of the PPC from PPC0 to PPC1?',
    key: 'An improvement in technology raises the maximum output of both goods: the PPC shifts outward from PPC0 to PPC1. Point A lies inside PPC0, showing unemployed resources.',
    spec: spec({
      reason: 'Economic growth: the PPC shifts outward; A inside shows unemployment.',
      placement: 'question',
      xAxis: t('Good X', '物品 X'),
      yAxis: t('Good Y', '物品 Y'),
      curves: [{ id: 'P0', role: 'frontier', slope: 'normal', place: 'low', label: 'PPC_0' }],
      shifts: [{ of: 'P0', id: 'P1', direction: 'out', size: 'normal', label: 'PPC_1' }],
      marks: [{ of: 'P0', where: 'inside', label: 'A' }],
    }),
  },
  {
    id: 'demand-fall-zh',
    question: '新冠疫情期間，訪港旅客人數大減。試以圖解釋酒店房間市場的均衡價格及交易量的變化。（4分）',
    key: '旅客減少，對酒店房間的需求減少，需求曲線由 D0 向左移至 D1。均衡價格由 P0 下降至 P1，交易量由 Q0 減少至 Q1。',
    spec: spec({
      reason: '需求減少：D 向左移。',
      placement: 'answer',
      xAxis: t('', '數量'),
      yAxis: t('', '價格'),
      curves: [
        { id: 'D0', role: 'demand', slope: 'normal', place: 'mid', label: 'D_0' },
        { id: 'S', role: 'supply', slope: 'normal', place: 'mid', label: 'S' },
      ],
      shifts: [{ of: 'D0', id: 'D1', direction: 'left', size: 'normal', label: 'D_1' }],
      points: [
        { a: 'D0', b: 'S', name: '', yTick: 'P_0', xTick: 'Q_0', dot: true },
        { a: 'D1', b: 'S', name: '', yTick: 'P_1', xTick: 'Q_1', dot: true },
      ],
      changeArrows: true,
    }),
  },
  {
    id: 'visitor-chart',
    question:
      'The table shows visitor arrivals to Hong Kong (million): 2022: 0.6 (Mainland 0.4); 2023: 34.0 (Mainland 26.8); 2024: 44.5 (Mainland 34.0). Present the data as a graph.',
    key: 'Arrivals recovered strongly after 2022, led by Mainland visitors.',
    spec: {
      ...emptySpec('chart'),
      reason: 'A table of figures over years: a bar chart.',
      placement: 'question',
      title: t('Visitor arrivals to Hong Kong', '訪港旅客人次'),
      chart: {
        type: 'bar',
        categories: [t('2022', '2022'), t('2023', '2023'), t('2024', '2024')],
        series: [
          { label: t('All visitors', '所有旅客'), values: [0.6, 34.0, 44.5] },
          { label: t('Mainland visitors', '內地旅客'), values: [0.4, 26.8, 34.0] },
        ],
        yTitle: t('(million)', '（百萬）'),
        xTitle: t('Year', '年份'),
      },
    },
  },
  {
    id: 'tariff-template',
    question: 'Country A imposes a tariff on imported rice. With the aid of a diagram, show the deadweight loss of the tariff. (4 marks)',
    key: 'The tariff raises the domestic price from Pw to Pw + t; domestic output rises, consumption falls, imports fall. The deadweight loss is the production and consumption triangles.',
    spec: { ...emptySpec('template'), reason: 'A tariff with its welfare areas: the editor template.', placement: 'answer', template: 'tariff-welfare' },
  },
];

export const caseById = (id: string): DiagramCase => CASES.find((c) => c.id === id)!;

/** A case's spec as the model's reply text. */
export const replyOf = (s: DiagramSpec): string => JSON.stringify(s);
