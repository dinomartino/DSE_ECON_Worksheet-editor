import { emptyLorenz, emptySpec } from './schema';
import type { DiagramSpec, SpecLorenz, SpecLorenzCurve } from './types';

/**
 * Lorenz questions in the manner of the HKDSE Equity MCQs (k-0584; docs/Diagram_Requirements/
 * B_firms_micro.md "Equity — MCQ"): two economies in two boxes (SP Q19, 2012 Q20, 2020 Q22,
 * 2025 Q23), one box before and after a policy (2019 Q19, 2022 Q23), and the user's u-25vr
 * draft (Economy X and Economy Y). Our own words, not the papers'.
 */
export interface LorenzCase {
  id: string;
  /** The paper question it follows. */
  like: string;
  mcq: { stem: string; statements: string[]; options: string[]; answer: number };
  key: string;
  /** The figure a right reply draws. */
  spec: DiagramSpec;
}

const C = (label: string, inequality: SpecLorenzCurve['inequality'], name = '', style: SpecLorenzCurve['style'] = 'solid', nameZh = ''): SpecLorenzCurve => ({ label, name: { en: name, zh: nameZh }, inequality, style });
export function lorenzSpec(lz: Partial<SpecLorenz>): DiagramSpec {
  const spec = emptySpec('lorenz');
  spec.lorenz = { ...emptyLorenz(), ...lz };
  return spec;
}
const box = (en: string, zh: string, ...curves: SpecLorenzCurve[]) => ({ title: { en, zh }, curves });

export const LORENZ_CASES: LorenzCase[] = [
  {
    id: 'lz-two-economies',
    like: 'u-25vr (the user\'s draft), SP Q19',
    mcq: {
      stem: 'The diagrams below show the Lorenz curves of Economy X and Economy Y.\nBased on the above diagrams, we can conclude that',
      statements: [],
      options: [
        'Economy X has a more even income distribution than Economy Y.',
        'Economy Y has a more even income distribution than Economy X.',
        'the low-income group in Economy X earns a higher income than that in Economy Y.',
        'the low-income group in Economy Y earns a higher income than that in Economy X.',
      ],
      answer: 1,
    },
    key: 'Economy Y\'s Lorenz curve lies nearer the line of equality, so its income distribution is more even. Absolute incomes cannot be read from Lorenz curves.',
    spec: lorenzSpec({ panels: [box('Lorenz curve of Economy X', 'X 經濟體的洛倫茲曲線', C('', 'extreme')), box('Lorenz curve of Economy Y', 'Y 經濟體的洛倫茲曲線', C('', 'moderate'))], equality: false }),
  },
  {
    id: 'lz-grid-gini',
    like: '2025 Q23, 2020 Q22',
    mcq: {
      stem: 'Study the Lorenz curves of Country A and Country B below.\nCompared with Country B,',
      statements: [],
      options: ['the Gini coefficient of Country A is larger.', 'Country A has a higher standard of living.', 'the top 20% of households in Country A have less total income.', 'Country A has a more even income distribution.'],
      answer: 3,
    },
    key: 'Country A\'s curve is nearer the line of equality: a more even distribution and a smaller Gini coefficient. Living standards and total incomes cannot be read from the curves.',
    spec: lorenzSpec({ panels: [box('Lorenz curve of Country A', 'A 國的洛倫茲曲線', C('', 'moderate')), box('Lorenz curve of Country B', 'B 國的洛倫茲曲線', C('', 'extreme'))], equality: false, grid: true, axes: 'cumulative' }),
  },
  {
    id: 'lz-before-after',
    like: '2022 Q23',
    mcq: {
      stem: 'Refer to the following Lorenz curves of a country.\nWhich of the following statements is correct?',
      statements: [],
      options: [
        'Curve B shows a more even income distribution than curve A.',
        'Taxes and transfers make the income distribution more even.',
        'Taxes and transfers make the income distribution less even.',
        'The Gini coefficient is the same for curve A and curve B.',
      ],
      answer: 2,
    },
    key: 'Curve B (after taxes and transfers) lies further from the line of equality than curve A (before), so the redistribution made the distribution less even.',
    spec: lorenzSpec({ panels: [box('', '', C('A', 'moderate', 'based on pre-tax pre-transfer income', 'dashed', '以除稅及福利轉移前收入計算'), C('B', 'high', 'based on post-tax post-transfer income', 'solid', '以除稅及福利轉移後收入計算'))], equality: false }),
  },
  {
    id: 'lz-old-new',
    like: '2019 Q19',
    mcq: {
      stem: 'The diagram shows the change of the Lorenz curve of an economy from curve A to curve B.\nWhich of the following policies would result in this change?',
      statements: [],
      options: ['lowering the profits tax rate', 'reducing the salaries tax allowance', 'making the salaries tax more progressive', 'raising the air passenger departure tax'],
      answer: 2,
    },
    key: 'Curve B lies nearer the line of equality: post-tax income became more even, as a more progressive salaries tax would make it.',
    spec: lorenzSpec({ panels: [box('', '', C('A', 'high', 'old Lorenz curve', 'dashed', '原來的洛倫茲曲線'), C('B', 'moderate', 'new Lorenz curve', 'solid', '新的洛倫茲曲線'))], equality: true, grid: true, axes: 'cumulative' }),
  },
];

/** The user's u-25vr draft: two economies in the stem, one box of "before tax / after tax" curves. */
export const U25VR_WRONG = lorenzSpec({ panels: [box('Lorenz curves of Economy X and Economy Y', '', C('A', 'high', 'before tax'), C('B', 'moderate', 'after tax'))] });
