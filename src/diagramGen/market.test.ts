import { describe, expect, it } from 'vitest';
import { evaluateSpec } from './run';
import { parseSpec } from './schema';
import { Q21_KEY, Q21_MCQ } from './q21.fixture';
import { Q22_KEY, Q22_MCQ } from './q22.fixture';
import type { DiagramSpec } from './types';
import { compileSpec } from './compile';
import { C, compoundPlan, M, P, plan, q21Plan, q22Plan } from './planFixtures';
import { measureOf, solveMarket } from './market';

/**
 * The general plan path's area check (k-0596, u-a587 "code"): a kind "curves" figure whose
 * options name areas runs only behind the answer worked out from the market, and each planned
 * band against its corner letters.
 */

const errorsOf = (spec: DiagramSpec, mcq: typeof Q21_MCQ, key: string) =>
  evaluateSpec(spec, { sides: ['en', 'zh'], key, mcq }).issues.filter((i) => i.level === 'error');

describe('points above an earlier point (k-0596)', () => {
  it('puts b on D2 straight above a, joined by an unnamed dashed line', () => {
    const compiled = compileSpec(q21Plan());
    const d = compiled.diagram!;
    const at = (l: string) => d.points.find((p) => p.label?.en.map((r) => r.text).join('') === l)!.at;
    expect(at('b').x).toBeCloseTo(at('a').x, 5);
    expect(at('b').y).toBeGreaterThan(at('a').y);
    expect(compiled.guideIds?.size).toBe(1);
    const guide = d.curves.find((c) => compiled.guideIds!.has(c.id))!;
    expect(guide.stroke).toBe('dashed');
  });

  it('places every one-letter name off its dot', () => {
    const d = compileSpec(q21Plan()).diagram!;
    for (const p of d.points) expect(p.labelOffset).toBeDefined();
  });
});

describe('the market solver', () => {
  it('reads a binding ceiling after the demand rise: traded at a, efficient at c', () => {
    const spec = q21Plan();
    const compiled = compileSpec(spec);
    const f = solveMarket(spec, compiled, compiled.diagram!, M({ demand: 'D2', supply: 'S', control: 'P1' }));
    if (typeof f === 'string') throw new Error(f);
    const at = (l: string) => compiled.diagram!.points.find((p) => p.label?.en.map((r) => r.text).join('') === l)!.at;
    expect(f.qt).toBeCloseTo(at('a').x, 3);
    expect(f.qStar).toBeCloseTo(at('c').x, 3);
  });

  it('tells the change in DWL from the DWL after', () => {
    const spec = q22Plan();
    const compiled = compileSpec(spec);
    const change = measureOf(spec, compiled, compiled.diagram!);
    const after = measureOf({ ...spec, asks: { ...spec.asks, state: 'after' } }, compiled, compiled.diagram!);
    if (typeof change === 'string' || typeof after === 'string') throw new Error('no measure');
    const at = (l: string) => compiled.diagram!.points.find((p) => p.label?.en.map((r) => r.text).join('') === l)!.at;
    const e = at('e');
    const inEgm = { x: (at('g').x + at('m').x + e.x) / 3, y: (at('g').y + at('m').y + e.y) / 3 };
    const inEfj = { x: (at('f').x + at('j').x + e.x * 4) / 6, y: (at('f').y + at('j').y + e.y * 4) / 6 };
    expect(after.inside(inEfj)).toBe(true);
    expect(change.inside(inEfj)).toBe(false);
    expect(after.inside(inEgm)).toBe(true);
  });
});

describe('areas on the plan path (k-0596)', () => {
  it('passes HKDSE 2023 P1 Q21 drawn as a plan, key from the market', () => {
    const e = evaluateSpec(q21Plan(), { sides: ['en', 'zh'], key: Q21_KEY, mcq: Q21_MCQ });
    expect(e.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(e.solved?.option).toBe(2);
    expect(e.solved?.why).toMatch(/deadweight loss/);
  });

  it('fails Q21 with c and f swapped (the review\'s probe that passed before)', () => {
    const swapped = q21Plan([P('D1', 'S', 'a'), P('D2', 'a', 'b'), P('D2', 'P1', 'c'), P('D2', 'S', 'f')]);
    const codes = errorsOf(swapped, Q21_MCQ, Q21_KEY).map((i) => i.code);
    expect(codes).toContain('area.key');
  });

  it('refuses area options with no area asked (the gate)', () => {
    const codes = errorsOf(q21Plan(undefined, { what: 'none', state: 'after', markets: [] }), Q21_MCQ, Q21_KEY).map((i) => i.code);
    expect(codes).toContain('area.unchecked');
  });

  it('passes HKDSE 2018 P1 Q22 as a plan: the change between two taxed markets', () => {
    const e = evaluateSpec(q22Plan(), { sides: ['en', 'zh'], key: Q22_KEY, mcq: Q22_MCQ });
    expect(e.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(e.solved?.option).toBe(2);
  });

  it('fails Q22 when the markets leave out the tax (no cost named)', () => {
    const issues = errorsOf(q22Plan([M({ demand: 'D', supply: 'S1' }), M({ demand: 'D', supply: 'S2' })]), Q22_MCQ, Q22_KEY);
    expect(issues.map((i) => i.code)).toContain('area.empty');
    expect(issues.find((i) => i.code === 'area.empty')!.text).toMatch(/name the supply without it as cost/);
  });

  it('fails Q22 with j and m swapped', () => {
    const spec = q22Plan(undefined, { points: [P('D', 'S0', 'e'), P('D', 'S1', 'f'), P('D', 'S2', 'g'), P('S0', 'f', 'm'), P('S0', 'g', 'j'), P('S1', 'g', 'k'), P('S2', 'e', 'n')] });
    const codes = errorsOf(spec, Q22_MCQ, Q22_KEY).map((i) => i.code);
    expect(codes.some((c) => c === 'area.key' || c === 'figure.cornerEdge' || c === 'figure.cornerShape')).toBe(true);
  });

  it('a compound question no scene draws: a unit tax under a binding price floor', () => {
    // DWL with the tax (S0 → S1) and a floor Pf above the taxed equilibrium: traded = Qd at Pf.
    const { mcq, spec, key } = compoundPlan();
    const e = evaluateSpec(spec, { sides: ['en', 'zh'], key, mcq });
    expect(e.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(e.solved?.option).toBe(1);
    // The plan's own point names (a, e, f, h end its bands; e_1 as the live run wrote) are not printed: the question never uses them.
    spec.points = [...spec.points, P('D', 'S1', 'e_1')];
    const printed = e.compiled.diagram!.points.map((p) => p.label?.en.map((r) => r.text).join('') ?? '').filter(Boolean);
    expect(printed).toEqual([]);
    const wrong = evaluateSpec(spec, { sides: ['en', 'zh'], key, mcq: { ...mcq, answer: 0 } });
    expect(wrong.issues.map((i) => i.code)).toContain('area.key');
  });

  it('checks a band against its corner letters', () => {
    const good = q21Plan(undefined);
    good.bands = [{ label: '', corners: 'abc', top: 'D2', bottom: 'S', from: 'a', to: '' }];
    expect(errorsOf(good, Q21_MCQ, Q21_KEY)).toEqual([]);
    const bad = q21Plan(undefined);
    bad.bands = [{ label: '', corners: 'abc', top: 'D2', bottom: 'P1', from: 'a', to: '' }];
    expect(errorsOf(bad, Q21_MCQ, Q21_KEY).map((i) => i.code)).toContain('band.corners');
  });

  it('reports a band naming what is not drawn, and two bands on one spot', () => {
    const spec = q21Plan();
    spec.bands = [
      { label: 'A', corners: '', top: 'D9', bottom: 'S', from: 'a', to: '' },
      { label: 'B', corners: '', top: 'D2', bottom: 'S', from: 'a', to: '' },
      { label: 'C', corners: '', top: 'D2', bottom: 'S', from: 'a', to: 'c' },
    ];
    const codes = errorsOf(spec, Q21_MCQ, Q21_KEY).map((i) => i.code);
    expect(codes).toContain('band.ref');
    expect(codes).toContain('same.area');
  });

  it('reads bands and markets from a reply, and an old spec without them', () => {
    const spec = q21Plan();
    spec.bands = [{ label: 'A', corners: 'abc', top: 'D2', bottom: 'S', from: 'a', to: '' }];
    spec.asks = { what: 'dwl', state: 'change', markets: [M({ demand: 'D1', supply: 'S' }), M({ demand: 'D2', supply: 'S', control: 'P1' })] };
    const back = parseSpec(JSON.stringify(spec))!.spec;
    expect(back.bands).toEqual(spec.bands);
    expect(back.asks).toEqual(spec.asks);
    const old = parseSpec(JSON.stringify({ ...spec, bands: undefined, asks: { what: 'quantityTransacted', state: 'after' } }))!.spec;
    expect(old.bands).toEqual([]);
    expect(old.asks.markets).toEqual([]);
  });
});

describe('the live plan cases solve offline (k-0596)', () => {
  it('a ceiling at the old equilibrium, then a tax: bce by corners, with b above and c below a', () => {
    const spec = plan({
      curves: [C('D', 'demand', 'D'), C('S0', 'supply', 'S_0')],
      shifts: [{ of: 'S0', id: 'S1', direction: 'up', size: 'normal', label: 'S_1', through: [] }],
      levels: [{ id: 'Pc', kind: 'ceiling', above: [], below: [], side: 'below', style: 'line', label: 'P_c', through: ['D', 'S0'] }],
      points: [P('D', 'S0', 'e'), P('S1', 'Pc', 'a'), P('D', 'a', 'b'), P('S0', 'a', 'c'), P('D', 'S1', 'f')],
      asks: { what: 'dwl', state: 'after', markets: [M({ demand: 'D', supply: 'S1', cost: 'S0', control: 'Pc' })] },
    });
    const mcq = { stem: 'A maximum price at P_c, then a unit tax. Which area is the deadweight loss?', statements: [], options: ['Area abe', 'Area ace', 'Area bce', 'Area abf'], answer: 2 };
    const e = evaluateSpec(spec, { sides: ['en', 'zh'], key: 'Correct answer: C. bce.', mcq });
    expect(e.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(e.solved?.option).toBe(2);
  });
});

describe('an option sentence naming a lettered area (k-0596 live run 2)', () => {
  it('reads "the deadweight loss increases by area A" as area A, so the gate and the key check apply', async () => {
    const { areaLettersIn } = await import('./market');
    expect(areaLettersIn('The deadweight loss increases by area A.')).toEqual(['A']);
    expect(areaLettersIn('The new deadweight loss is areas A + B.')).toEqual(['A', 'B']);
    expect(areaLettersIn('效率損失增加了面積 A 及 B。')).toEqual(['A', 'B']);
    expect(areaLettersIn('The deadweight loss does not change.')).toBeNull();
    const { mcq, spec, key } = compoundPlan();
    const sentences = { ...mcq, options: ['It is area A.', 'It is area A + B.', 'It is area A + B + C.', 'It is area C.'] };
    expect(evaluateSpec(spec, { sides: ['en', 'zh'], key, mcq: sentences }).solved?.option).toBe(1);
    const unasked = { ...spec, asks: { what: 'none' as const, state: 'after' as const, markets: [] } };
    expect(evaluateSpec(unasked, { sides: ['en', 'zh'], key, mcq: sentences }).issues.map((i) => i.code)).toContain('area.unchecked');
  });
});
