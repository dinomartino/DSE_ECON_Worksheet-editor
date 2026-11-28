import { describe, expect, it } from 'vitest';
import type { Diagram, DiagramPointMark } from '@/model/diagram';
import fixture from './k0600Fixture.json';
import { evaluateSpec } from './run';
import { checkCornerLettersDrawn, cornerAreasIn, cornerLettersIn, namedCorners, optionCorners } from './sceneCheck';
import { plainOf } from './text';
import type { DiagramSpec } from './types';
import { figureWords } from './words';

/**
 * k-0600, the studio review "Make it to be subsidy": a per-unit subsidy with perfectly elastic
 * demand (after HKDSE 2025 P1 Q22), statement (2) "The decrease in total social surplus is area
 * 0abc". The stored figure printed no letter at all and every check passed: "0abc" was not read
 * as an area (0 is no letter), so b and c counted as names the question never uses and were
 * hidden, and the letters check had nothing to look for. Corner 0 is the origin.
 */

const spec = fixture.spec as unknown as DiagramSpec;
const mcq = fixture.mcq;
const key = fixture.key;
const letter = (t: string) => ({ en: [{ text: t }], zh: [{ text: t }] });
const labelsOf = (d: Diagram) => d.points.map((p) => plainOf(p.label ?? { en: [], zh: [] }));

describe('the origin as a corner', () => {
  it('reads "area 0abc" in either language, and its letters', () => {
    expect(cornerAreasIn('The decrease in total social surplus is area 0abc.')).toEqual(['0abc']);
    expect(cornerAreasIn('總社會盈餘的下降是面積 0abc。')).toEqual(['0abc']);
    expect(optionCorners('Area 0abc')).toBe('0abc');
    expect(cornerLettersIn('area 0abc').sort()).toEqual(['0', 'a', 'b', 'c']);
  });

  it('is not a number or a lone letter pair', () => {
    expect(cornerAreasIn('an area of 100 square metres')).toEqual([]);
    expect(cornerAreasIn('area 0ab0')).toEqual([]);
    expect(cornerAreasIn('area 00a')).toEqual([]);
  });

  it('counts an area a statement names once, as an option’s ("(1)…(3)" questions)', () => {
    const named = namedCorners(mcq, '');
    expect(named.areas).toEqual(['0abc']);
    expect(named.letters.sort()).toEqual(['0', 'a', 'b', 'c']);
  });
});

describe('the chat’s draft 1, checked again', () => {
  it('stored a figure with no letters (the export as it came)', () => {
    expect(labelsOf(fixture.storedBlock.diagram as unknown as Diagram).filter(Boolean)).toEqual([]);
    expect(fixture.storedFigureWords).not.toMatch(/\bb\b/);
  });

  it('now fails: a is named by statement (2) and drawn nowhere; b and c are printed', () => {
    const e = evaluateSpec(spec, { sides: ['en'], key, mcq });
    const issue = e.issues.find((i) => i.code === 'figure.cornerMissing');
    expect(issue?.level).toBe('error');
    expect(issue?.text).toMatch(/\ba is not on the figure/);
    expect(issue?.text).toMatch(/points\[\]\.name/);
    expect(labelsOf(e.compiled.diagram!)).toEqual(['b', 'c']);
  });

  it('describes the letters it prints, for the blind solve and the chat', () => {
    const e = evaluateSpec(spec, { sides: ['en'], key, mcq });
    expect(figureWords(e.spec, e.compiled.diagram!)).toMatch(/Lettered points: b \(where D meets S0\), c \(where D meets S1\)\./);
  });
});

describe('corner 0 against the figure’s lines', () => {
  // The figure the question means: S0 from the origin, S1 (the subsidy) from a on the quantity axis.
  const base = fixture.storedBlock.diagram as unknown as Diagram;
  const [d, s0, s1] = base.curves;
  const P = 0.48;
  const pt = (id: string, x: number, y: number, label: string): DiagramPointMark => ({ id, at: { x, y }, label: letter(label) });

  it('passes when 0a runs along the axis, ac along S1, cb along D and b0 along S0', () => {
    const diagram: Diagram = {
      ...base,
      curves: [d, { ...s0, points: [{ x: 0, y: 0 }, { x: 0.7, y: 0.84 }] }, { ...s1, derive: undefined, points: [{ x: 0.2, y: 0 }, { x: 0.9, y: 0.84 }] }],
      points: [pt('a', 0.2, 0, 'a'), pt('b', P / 1.2, P, 'b'), pt('c', 0.2 + P / 1.2, P, 'c')],
    };
    expect(checkCornerLettersDrawn(diagram, mcq, key)).toEqual([]);
  });

  it('fails the drawn figure lettered: S0 does not start at the origin, so side b–0 runs along no line', () => {
    const diagram: Diagram = { ...base, points: [pt('a', 0.24, 0.1, 'a'), { ...base.points[0], label: letter('b') }, { ...base.points[1], label: letter('c') }] };
    const issues = checkCornerLettersDrawn(diagram, mcq, key);
    expect(issues.map((i) => i.code)).toEqual(['figure.cornerEdge']);
    expect(issues[0].text).toMatch(/0abc/);
  });

  it('names a hidden origin as missing', () => {
    const diagram: Diagram = { ...base, showOrigin: false, points: [pt('a', 0.24, 0, 'a'), { ...base.points[0], label: letter('b') }, { ...base.points[1], label: letter('c') }] };
    expect(checkCornerLettersDrawn(diagram, mcq, key)[0]?.text).toMatch(/0 \(the origin, hidden on this figure\) is not on the figure/);
  });
});
