import { emptySpec } from './schema';
import type { DiagramSpec, SpecMarket } from './types';

/**
 * Plans for the general path (k-0596): what a model writes in kind "curves" for reference
 * figures no scene is needed for (relations only: crossings, shifts, a price line through a
 * crossing, a point above another, bands, the markets in force). Shared by `market.test.ts`
 * and the proof sheet `scripts/k0596-plans.test.ts`.
 */

export const C = (id: string, role: 'demand' | 'supply', label: string, slope: 'normal' | 'steep' | 'flat' = 'normal') => ({ id, role, slope, place: 'mid' as const, label, shape: 'none' as const, rise: 'rising' as const });
export const P = (a: string, b: string, name = '', xTick = '', yTick = '') => ({ a, b, name, xTick, yTick, dot: false });
export const M = (m: Partial<SpecMarket>): SpecMarket => ({ demand: '', supply: '', cost: '', benefit: '', socialCost: '', control: '', ...m });

export function plan(parts: Partial<DiagramSpec>): DiagramSpec {
  return { ...emptySpec('curves'), xAxis: { en: 'Quantity', zh: '數量' }, yAxis: { en: 'Price', zh: '價格' }, ...parts };
}

/** HKDSE 2023 P1 Q21 as a plan: P1 through D1×S, D1 → D2, a, b above a on D2, c, f. */
export function q21Plan(points = [P('D1', 'S', 'a'), P('D2', 'a', 'b'), P('D2', 'S', 'c'), P('D2', 'P1', 'f')], asks: DiagramSpec['asks'] = { what: 'dwl', state: 'after', markets: [] }) {
  return plan({
    curves: [C('D1', 'demand', 'D_1'), C('S', 'supply', 'S')],
    shifts: [{ of: 'D1', id: 'D2', direction: 'right', size: 'normal', label: 'D_2', through: [] }],
    levels: [{ id: 'P1', kind: 'ceiling', above: [], below: [], side: 'below', style: 'line', label: 'P_1', through: ['D1', 'S'] }],
    points,
    asks,
  });
}

/** HKDSE 2018 P1 Q22 as a plan: the tax raised from t1 (S1) to t2 (S2) over S0. */
export function q22Plan(markets: SpecMarket[] = [M({ demand: 'D', supply: 'S1', cost: 'S0' }), M({ demand: 'D', supply: 'S2', cost: 'S0' })], extra: Partial<DiagramSpec> = {}) {
  return plan({
    curves: [C('D', 'demand', 'D'), C('S0', 'supply', 'S_0')],
    shifts: [
      { of: 'S0', id: 'S1', direction: 'up', size: 'small', label: 'S_1', through: [] },
      { of: 'S1', id: 'S2', direction: 'up', size: 'small', label: 'S_2', through: [] },
    ],
    points: [P('D', 'S0', 'e'), P('D', 'S1', 'f'), P('D', 'S2', 'g'), P('S0', 'f', 'j'), P('S0', 'g', 'm'), P('S1', 'g', 'k'), P('S2', 'e', 'n')],
    asks: { what: 'dwl', state: 'change', markets },
    ...extra,
  });
}

/** A compound question no scene draws: a unit tax (S0 → S1) under a binding price floor; DWL = A + B. */
export function compoundPlan() {
  const mcq = {
    stem: 'The government imposes a unit tax on Good Z, shifting supply from S_0 to S_1, and sets a minimum price at P_f. What is the deadweight loss?',
    statements: [],
    options: ['Area A', 'Area A + B', 'Area A + B + C', 'Area C'],
    answer: 1,
  };
  const spec = plan({
    curves: [C('D', 'demand', 'D'), C('S0', 'supply', 'S_0')],
    shifts: [{ of: 'S0', id: 'S1', direction: 'up', size: 'small', label: 'S_1', through: [] }],
    levels: [{ id: 'Pf', kind: 'floor', above: ['D', 'S1'], below: [], side: 'above', style: 'line', label: 'P_f', through: [] }],
    points: [P('D', 'Pf', 'a', 'Q_1'), P('D', 'S0', 'e', 'Q_0'), P('D', 'S1', 'f'), P('S0', 'a', 'h')],
    bands: [
      { label: 'A', corners: '', top: 'D', bottom: 'S0', from: 'Q_1', to: 'f' },
      { label: 'B', corners: '', top: 'D', bottom: 'S0', from: 'f', to: '' },
      { label: 'C', corners: '', top: 'Pf', bottom: 'S1', from: '', to: 'Q_1' },
    ],
    asks: { what: 'dwl', state: 'after', markets: [M({ demand: 'D', supply: 'S1', cost: 'S0', control: 'Pf' })] },
  });
  const key = 'Correct answer: B. At P_f buyers take Q_1, less than the efficient Q_0: the deadweight loss is A + B.';
  return { mcq, spec, key };
}
