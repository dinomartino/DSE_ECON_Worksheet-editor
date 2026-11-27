import { emptySpec } from './schema';
import type { DiagramSpec, SpecScene } from './types';

/**
 * A question in the manner of HKDSE 2023 Paper 1 Q21 (k-0577 round 3, u-kmdo): a price ceiling
 * at P1, the price where D1 meets S, binds once demand rises from D1 to D2. Key C: under-
 * production, and the deadweight loss is area abc (a where D1 meets S, b on D2 above a, c where
 * D2 meets S); acf (f where D2 meets P1) is a distractor. Options A and C name the same area and
 * differ only in over- or under-production. Our own words, not the paper's.
 */
export const Q21_MCQ = {
  stem: 'The diagram below shows the market for Good X.\nThe government sets a price ceiling at P_1. Demand for Good X then increases from D_1 to D_2. Which of the following is correct?',
  statements: [] as string[],
  options: [
    'There is over-production, and the deadweight loss is area abc.',
    'There is over-production, and the deadweight loss is area acf.',
    'There is under-production, and the deadweight loss is area abc.',
    'There is under-production, and the deadweight loss is area acf.',
  ],
  answer: 2,
};

export const Q21_KEY =
  'Correct answer: C. There is under-production, and the deadweight loss is area abc.\nBefore the rise, D_1 meets S at point a on the ceiling, so the ceiling does not bind. After demand rises to D_2, the equilibrium would be at c, but the price cannot rise above P_1. Sellers supply only the quantity at a, less than the efficient quantity at c: there is under-production. The units between a and c, which buyers value (up to b on D_2) more than they cost to make (along S), are not produced: the deadweight loss is area abc. Area acf lies under D_2 and above P_1 beyond c, which is not a loss of surplus.';

export function q21Scene(points: SpecScene['points'], extra: Partial<SpecScene> = {}): DiagramSpec {
  const spec = emptySpec('scene');
  spec.scene = { ...spec.scene!, type: 'ceilingDemandRise', ask: 'dwl', points, ...extra };
  return spec;
}

/** The letters where the paper puts them. */
export const Q21_POINTS: SpecScene['points'] = [
  { point: 'e1', label: 'a' },
  { point: 'd2AtQs', label: 'b' },
  { point: 'e2', label: 'c' },
  { point: 'd2AtPc', label: 'f' },
];
