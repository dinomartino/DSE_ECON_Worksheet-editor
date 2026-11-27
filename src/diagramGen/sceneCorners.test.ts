import { describe, expect, it } from 'vitest';
import { blockOf, evaluateSpec } from './run';
import { letterRoom } from './pointLabels';
import { Q22_KEY, Q22_MCQ, Q22_POINTS, q22Scene } from './q22.fixture';
import { cornerAreasIn, cornerLettersIn, optionCorners, checkSceneLook } from './sceneCheck';
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
