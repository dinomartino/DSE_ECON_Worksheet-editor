import { emptySpec } from './schema';
import type { DiagramSpec, SpecScene } from './types';

/**
 * HKDSE 2018 Paper 1 Q22 as the user's u-fbsp draft wrote it (k-0577 round 2): a unit tax raised
 * from t1 to t2, areas named by their corners. Key C, "the deadweight loss will increase by area
 * fgmj"; the explanation: with t1 the DWL is efj, with t2 egm; B's fgk lies between S2 and S1,
 * D's egn above the demand curve.
 */
export const Q22_MCQ = {
  stem: 'The following diagram shows the demand and supply curves of Good Y.\nSuppose the government increases the unit tax on Good Y from t1 to t2. Which of the following statements is correct?',
  statements: [] as string[],
  options: ['The deadweight loss will decrease by area efj.', 'The new deadweight loss is area fgk.', 'The deadweight loss will increase by area fgmj.', 'The new deadweight loss is area egn.'],
  answer: 2,
};

export const Q22_KEY =
  'Correct answer: C. The deadweight loss will increase by area fgmj.\nWith the tax t1, the deadweight loss is area efj. When the tax increases to t2, the deadweight loss becomes area egm, so the deadweight loss increases by area fgmj. Option A is wrong because a higher unit tax increases, rather than decreases, the deadweight loss. Option B is wrong because area fgk only lies between S2 and S1 instead of between D and S0. Option D is wrong because area egn lies above the demand curve D.';

export function q22Scene(points: SpecScene['points'], extra: Partial<SpecScene> = {}): DiagramSpec {
  const spec = emptySpec('scene');
  spec.scene = { ...spec.scene!, type: 'taxChange', ask: 'dwlChange', points, ...extra };
  return spec;
}

/** The letters where the key's geometry puts them. */
export const Q22_POINTS: SpecScene['points'] = [
  { point: 'e0', label: 'e' },
  { point: 'e1', label: 'f' },
  { point: 'e2', label: 'g' },
  { point: 's0AtQt1', label: 'j' },
  { point: 's0AtQt2', label: 'm' },
  { point: 's1AtQt2', label: 'k' },
  { point: 's2AtQ0', label: 'n' },
];
