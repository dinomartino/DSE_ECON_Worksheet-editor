import { describe, expect, it } from 'vitest';
import { blockOf, evaluateSpec } from './run';
import { letterRoom } from './pointLabels';
import { Q21_KEY, Q21_MCQ, Q21_POINTS, q21Scene } from './q21.fixture';
import { Q22_KEY, Q22_MCQ, Q22_POINTS, q22Scene } from './q22.fixture';
import { cornerAreasIn, cornerLettersIn, namedCorners, optionCorners, checkSceneLook } from './sceneCheck';
import { SCENES } from './sceneCatalogue';
import { compileScene } from './scene';
import { emptySpec } from './schema';
import type { SceneType, SpecScene } from './types';

/**
 * Areas named by their corners (k-0577 round 2, u-fbsp): HKDSE 2018 Paper 1 Q22, a unit tax
 * raised from t1 to t2. The user's first draft lettered only g, f, e while the options and the
 * explanation used j, k, m, n too; the second put m and j on the wrong points. Both must fail
 * before a teacher sees them, and the right lettering must pass with every letter clear.
 */

const run = (points: SpecScene['points'], extra: Partial<SpecScene> = {}) => evaluateSpec(q22Scene(points, extra), { sides: ['en', 'zh'], key: Q22_KEY, mcq: Q22_MCQ });
const codes = (e: ReturnType<typeof run>) => e.issues.filter((i) => i.level === 'error').map((i) => i.code);

describe('reading corner-named areas', () => {
  it('finds the areas and letters of the Q22 options and explanation', () => {
    expect(cornerAreasIn(Q22_KEY)).toEqual(['fgmj', 'efj', 'egm', 'fgk', 'egn']);
    expect(optionCorners(Q22_MCQ.options[2])).toBe('fgmj');
    expect(optionCorners('Area efj')).toBe('efj');
    expect(optionCorners('egn')).toBe('egn');
    expect(cornerLettersIn(Q22_MCQ.options.join('\n')).sort()).toEqual(['e', 'f', 'g', 'j', 'k', 'm', 'n']);
    expect(cornerLettersIn('At point e the market clears; 面積 abc 是稅收')).toEqual(expect.arrayContaining(['a', 'b', 'c', 'e']));
  });

  it('does not read English words after "area" as corners, nor region letters', () => {
    expect(cornerAreasIn('the area above the price line and the area under D')).toEqual([]);
    expect(cornerAreasIn('area A + B is the tax revenue')).toEqual([]);
    expect(optionCorners('B + C')).toBeNull();
  });
});

describe('HKDSE 2018 P1 Q22: tax raised from t1 to t2', () => {
  it('passes with every letter where the explanation puts it, and works the key out from the corners', () => {
    const e = run(Q22_POINTS);
    expect(e.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(e.solved?.option).toBe(2);
    expect(e.solved?.labels).toEqual(['fgmj']);
  });

  it('fails the user’s first draft: only g, f and e lettered while the question uses j, k, m and n', () => {
    const e = run([
      { point: 'e2', label: 'g' },
      { point: 'e1', label: 'f' },
      { point: 'e0', label: 'e' },
    ]);
    expect(codes(e)).toContain('scene.cornerMissing');
    expect(e.issues.find((i) => i.code === 'scene.cornerMissing')?.text).toMatch(/j, k, m, n/);
  });

  it('fails the user’s second draft: m and j swapped (m at Q1’s, j at Q2’s quantity)', () => {
    const swapped = Q22_POINTS.map((p) => (p.label === 'm' ? { ...p, point: 's0AtQt1' } : p.label === 'j' ? { ...p, point: 's0AtQt2' } : p));
    expect(codes(run(swapped))).toContain('scene.cornerEdge');
  });

  it('fails k off S1 below g (on S1 above e: no line runs from g to it)', () => {
    const moved = Q22_POINTS.map((p) => (p.label === 'k' ? { ...p, point: 's1AtQ0' } : p));
    expect(codes(run(moved))).toContain('scene.cornerEdge');
  });

  it('fails a key whose corners are not what is asked (fgmj asked as the new deadweight loss)', () => {
    const e = run(Q22_POINTS, { ask: 'dwl' });
    expect(codes(e)).toContain('scene.cornerKey');
    expect(e.issues.find((i) => i.code === 'scene.cornerKey')?.text).toMatch(/e0, e2, s0AtQt2/);
  });

  it('drops a lettered point no word of the question uses (nothing extra)', () => {
    const e = run([...Q22_POINTS, { point: 's1AtQ0', label: 'z' }]);
    const labels = e.compiled.diagram!.points.map((p) => p.label?.en.map((r) => r.text).join('')).filter(Boolean);
    expect(labels).not.toContain('z');
    expect(codes(e)).toEqual([]);
  });

  it('puts each letter clear of every line, arrow, dot and other label', () => {
    const e = run(Q22_POINTS);
    const ids = new Set(e.compiled.diagram!.points.filter((p) => p.label && p.dot !== false).map((p) => p.id));
    expect(ids.size).toBe(7);
    for (const [, room] of letterRoom(e.compiled.diagram!, ids)) expect(room).toBeGreaterThanOrEqual(2);
  });

  it('draws the dashed lines the areas’ upright sides run along, and both shift arrows', () => {
    const d = e2e();
    expect(d.points.filter((p) => p.dropTo?.includes('x')).length).toBe(3);
    expect(d.arrows).toHaveLength(2);
  });
});

function e2e() {
  const e = run(Q22_POINTS);
  return blockOf(e, ['en', 'zh'])!.diagram;
}

describe('every scene’s points', () => {
  const types = SCENES.map((s) => s.type);
  it.each(types)('%s: every catalogue point resolves on the default figure', (type) => {
    const spec = emptySpec('scene');
    const def = SCENES.find((s) => s.type === type)!;
    const letters = 'abcdefghijk';
    spec.scene = { ...spec.scene!, type: type as SceneType, externality: type === 'externality' ? 'negativeProduction' : 'none', points: def.points.map((p, i) => ({ point: p.id, label: letters[i] })) };
    const built = compileScene(spec);
    expect(built.issues.filter((i) => i.level === 'error'), type).toEqual([]);
    expect(built.pointLabels.size).toBe(def.points.length);
  });
});

describe('curve names', () => {
  it('asks for a short symbol, not words in brackets (u-fbsp v1)', () => {
    const spec = q22Scene(Q22_POINTS, { labels: [{ part: 'S2', label: 'S_2 (with tax = t_2)' }] });
    expect(checkSceneLook(spec).map((i) => i.code)).toEqual(['scene.longName']);
    expect(checkSceneLook(q22Scene(Q22_POINTS))).toEqual([]);
  });
});

describe('HKDSE 2023 P1 Q21: a ceiling made effective by a rise in demand (k-0577 round 3, u-kmdo)', () => {
  const run21 = (points: SpecScene['points'], extra: Partial<SpecScene> = {}, mcq = Q21_MCQ) => evaluateSpec(q21Scene(points, extra), { sides: ['en', 'zh'], key: Q21_KEY, mcq });
  const errors = (e: ReturnType<typeof run21>) => e.issues.filter((i) => i.level === 'error').map((i) => i.code);

  it('passes with a, b, c, f where the paper puts them, and works the key out from the corners', () => {
    const e = run21(Q21_POINTS);
    expect(e.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(e.solved?.option).toBe(2);
    expect(e.solved?.labels).toEqual(['abc']);
  });

  it('does not call A and C two keys: they name one area but differ in over- or under-production', () => {
    expect(errors(run21(Q21_POINTS))).not.toContain('scene.twoKeys');
    const same = { ...Q21_MCQ, options: ['Area abc.', 'Area acf.', 'area abc', 'Area bcf.'] };
    expect(errors(run21(Q21_POINTS, {}, same))).toContain('scene.twoKeys');
  });

  it('fails b on D1 instead of D2 (no line runs from it to c)', () => {
    const moved = Q21_POINTS.map((p) => (p.label === 'b' ? { ...p, point: 'd1AtQ2' } : p));
    expect(errors(run21(moved))).toContain('scene.cornerEdge');
  });

  it('fails c and f swapped (abc is then not the deadweight loss)', () => {
    const swapped = Q21_POINTS.map((p) => (p.label === 'c' ? { ...p, point: 'd2AtPc' } : p.label === 'f' ? { ...p, point: 'e2' } : p));
    const codes = errors(run21(swapped));
    expect(codes.some((c) => c === 'scene.cornerKey' || c === 'scene.cornerEdge')).toBe(true);
  });

  it('draws the figure as the paper does: P1 a dashed line, a dashed line from b down to a, no quantity ticks', () => {
    const d = blockOf(run21(Q21_POINTS), ['en', 'zh'])!.diagram;
    const dashed = d.curves.filter((c) => c.stroke === 'dashed');
    expect(dashed.map((c) => c.label?.en.map((r) => r.text).join('') ?? '')).toEqual(['P1', '']);
    const upright = dashed.find((c) => c.derive?.kind === 'vertical')!;
    const at = (l: string) => d.points.find((p) => p.label?.en.map((r) => r.text).join('') === l)!.at;
    expect(upright.points[0].x).toBeCloseTo(at('a').x, 6);
    expect(Math.min(...upright.points.map((p) => p.y))).toBeCloseTo(at('a').y, 6);
    expect(Math.max(...upright.points.map((p) => p.y))).toBeCloseTo(at('b').y, 6);
    expect(d.points.some((p) => p.xTickLabel)).toBe(false);
    expect(d.arrows).toHaveLength(0);
  });

  it('puts every letter above its dot and clear of every line, as the paper prints them', () => {
    for (const demand of ['normal', 'steep', 'flat'] as const) {
      for (const supply of ['normal', 'steep', 'flat'] as const) {
        const d = run21(Q21_POINTS, { demand, supply }).compiled.diagram!;
        const ids = new Set(d.points.filter((p) => p.label && p.dot !== false).map((p) => p.id));
        expect(ids.size, `${demand}/${supply}`).toBe(4);
        for (const [, room] of letterRoom(d, ids)) expect(room, `${demand}/${supply}`).toBeGreaterThanOrEqual(2);
        if (demand === 'normal' && supply === 'normal') for (const p of d.points.filter((q) => ids.has(q.id))) expect(p.labelOffset!.y, p.id).toBeGreaterThan(0);
      }
    }
  });
});

describe('a price ceiling’s fourth quantity (the shortage case’s distractor Q4)', () => {
  it('carries Q4 on D below the ceiling, so an option naming it is on the figure', () => {
    const spec = emptySpec('scene');
    spec.scene = {
      ...spec.scene!,
      type: 'priceCeiling',
      ask: 'shortage',
      labels: [
        { part: 'P0', label: '' },
        { part: 'Pc', label: 'P_1' },
        { part: 'Qs', label: 'Q_1' },
        { part: 'Q0', label: 'Q_2' },
        { part: 'Qd', label: 'Q_3' },
        { part: 'Qx', label: 'Q_4' },
      ],
    };
    const mcq = { stem: 'The government sets a maximum price of P_1 for good X. Refer to the diagram. What is the shortage?', statements: [], options: ['Q_1Q_2', 'Q_1Q_3', 'Q_2Q_3', 'Q_3Q_4'], answer: 1 };
    const e = evaluateSpec(spec, { sides: ['en', 'zh'], key: 'At P_1 quantity supplied is Q_1 and quantity demanded is Q_3: the shortage is Q_1Q_3.', mcq });
    expect(e.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(e.solved?.option).toBe(1);
    const xs = e.compiled.diagram!.points.filter((p) => p.xTickLabel).map((p) => p.at.x).sort((a, b) => a - b);
    expect(xs).toHaveLength(4);
  });
});

describe('a figure drawn from curves against its corner letters', () => {
  it('fails the develop drawing of 2023 P1 Q21 from curves: b is not on it', () => {
    const spec = emptySpec('curves');
    spec.xAxis = { en: 'Quantity', zh: '數量' };
    spec.yAxis = { en: 'Price', zh: '價格' };
    Object.assign(spec, {
      curves: [
        { id: 'D1', role: 'demand', slope: 'normal', place: 'mid', label: 'D_1', shape: 'none', rise: 'rising' },
        { id: 'S', role: 'supply', slope: 'normal', place: 'mid', label: 'S', shape: 'none', rise: 'rising' },
      ],
      shifts: [{ of: 'D1', id: 'D2', direction: 'right', size: 'normal', label: 'D_2' }],
      levels: [{ id: 'P1', kind: 'ceiling', above: [], below: [], side: 'below', style: 'guide', label: 'P_1' }],
      points: [
        { a: 'D1', b: 'S', name: 'a', xTick: '', yTick: '', dot: true },
        { a: 'D2', b: 'S', name: 'c', xTick: '', yTick: '', dot: true },
        { a: 'D2', b: 'P1', name: 'f', xTick: '', yTick: '', dot: true },
      ],
    });
    const e = evaluateSpec(spec, { sides: ['en', 'zh'], key: Q21_KEY, mcq: Q21_MCQ });
    const issue = e.issues.find((i) => i.code === 'figure.cornerMissing');
    expect(issue?.text).toMatch(/\bb is not on the figure/);
    expect(issue?.text).toMatch(/ceilingDemandRise/);
  });
});

describe('English after "area" is not corner letters (the independent review)', () => {
  it('reads only areas the options name, or that share letters with them, or that are named twice', () => {
    const mcq = { stem: 'Refer to the diagram.', statements: [], options: ['Area abc.', 'Area acf.', 'Area bcf.', 'Area abf.'] };
    expect(namedCorners(mcq, 'Area abc is the loss; the area gained by consumers is not, nor the area left of S.').areas).toEqual(['abc', 'acf', 'bcf', 'abf']);
    expect(namedCorners(Q22_MCQ, Q22_KEY).areas).toEqual(expect.arrayContaining(['fgmj', 'efj', 'egm']));
  });

  it('does not fail a plain-curves figure whose explanation says "the area gained by consumers"', () => {
    const spec = emptySpec('curves');
    spec.xAxis = { en: 'Quantity', zh: '數量' };
    spec.yAxis = { en: 'Price', zh: '價格' };
    Object.assign(spec, {
      curves: [
        { id: 'D', role: 'demand', slope: 'normal', place: 'mid', label: 'D', shape: 'none', rise: 'rising' },
        { id: 'S', role: 'supply', slope: 'normal', place: 'mid', label: 'S', shape: 'none', rise: 'rising' },
      ],
      points: [{ a: 'D', b: 'S', name: '', xTick: 'Q_0', yTick: 'P_0', dot: false }],
    });
    const mcq = { stem: 'Refer to the diagram. What is the equilibrium quantity?', statements: [], options: ['Q_0', 'P_0', 'zero', 'none of these'], answer: 0 };
    const e = evaluateSpec(spec, { sides: ['en', 'zh'], key: 'D meets S at Q_0. The area gained by consumers and the area left of S are not asked.', mcq });
    expect(e.issues.map((i) => i.code)).not.toContain('figure.cornerMissing');
  });
});
