import { describe, expect, it } from 'vitest';
import {
  contentMax,
  createMarkEc,
  createMarkGroup,
  createMarkLevel,
  createMarkPoint,
  createMarkScheme,
  groupMax,
  isSchemeEmpty,
  pointValue,
  routeMax,
  routesDisagree,
  schemeMax,
  schemeMismatch,
  schemeTexts,
} from './markScheme';
import type { MarkGroup, MarkPoint, MarkScheme } from './markSchemeTypes';
import { bi } from './text';

let ids = 0;
const point = (text: string, marks?: number): MarkPoint => ({
  id: `p${ids++}`,
  text: bi(text, `${text}（中）`),
  ...(marks !== undefined ? { marks } : {}),
});

const group = (points: MarkPoint[], rules: Partial<MarkGroup> = {}): MarkGroup => ({
  ...createMarkGroup(points),
  ...rules,
});

const scheme = (...groups: MarkGroup[][]): MarkScheme => ({
  routes: groups.map((route, index) => ({ id: `r${index}`, groups: route })),
});

describe('marking-point totals', () => {
  it('creates a point worth one mark', () => {
    expect(createMarkPoint().marks).toBe(1);
  });

  it('sums the points of an unallocated group', () => {
    expect(groupMax(group([point('a', 1), point('b', 2)]))).toBe(3);
  });

  it('counts an unmarked point as nothing — absent is not zero, but earns zero', () => {
    const g = group([point('a', 1), point('elaboration')]);
    expect(pointValue(g, g.points[1])).toBe(0);
    expect(groupMax(g)).toBe(1);
  });

  it('n@ overrides every point’s own mark', () => {
    const g = group([point('a', 1), point('b', 3), point('c')], { each: 2 });
    expect(g.points.map((p) => pointValue(g, p))).toEqual([2, 2, 2]);
    expect(groupMax(g)).toBe(6);
  });

  it('"any N" credits only the best N points', () => {
    const g = group([point('a', 1), point('b', 3), point('c', 2)], { take: 2 });
    expect(groupMax(g)).toBe(5);
  });

  it('"any TWO @1" — the common HKEAA allocation', () => {
    const g = group([point('a'), point('b'), point('c'), point('d')], { take: 2, each: 1 });
    expect(groupMax(g)).toBe(2);
  });

  it('"first N only" limits like "any N" (the rule is about which answers are read)', () => {
    const g = group([point('a'), point('b'), point('c')], { take: 2, each: 2, firstOnly: true });
    expect(groupMax(g)).toBe(4);
  });

  it('max: N caps the group', () => {
    expect(groupMax(group([point('a', 2), point('b', 2), point('c', 2)], { max: 4 }))).toBe(4);
    // A cap above what the points can reach changes nothing.
    expect(groupMax(group([point('a', 1)], { max: 4 }))).toBe(1);
    expect(groupMax(group([point('a', 1)], { max: 0 }))).toBe(0);
  });

  it('adds groups within a route', () => {
    const route = { id: 'r', groups: [group([point('a', 1)]), group([point('b'), point('c')], { each: 2, max: 3 })] };
    expect(routeMax(route)).toBe(4);
  });

  it('marks one OR route: the total is the best route, and unequal routes are flagged', () => {
    const equal = scheme([group([point('a', 2)])], [group([point('b', 1), point('c', 1)])]);
    expect(schemeMax(equal)).toBe(2);
    expect(routesDisagree(equal)).toBe(false);

    const unequal = scheme([group([point('a', 2)])], [group([point('b', 3)])]);
    expect(schemeMax(unequal)).toBe(3);
    expect(routesDisagree(unequal)).toBe(true);
  });

  it('takes the content mark from the top level when levels are set, then adds EC', () => {
    const s = scheme([group([point('indicative', 1)])]);
    const l1 = { ...createMarkLevel(), max: 4 };
    const l2 = { ...createMarkLevel(l1), max: 8 };
    const l3 = { ...createMarkLevel(l2), max: 12 };
    s.levels = [l1, l2, l3];
    expect(l2.min).toBe(5);
    expect(l3.min).toBe(9);
    expect(contentMax(s)).toBe(12);
    s.ec = createMarkEc();
    expect(schemeMax(s)).toBe(14);
    // Levels make the points indicative, so unequal routes are not a slip.
    expect(routesDisagree(s)).toBe(false);
  });
});

describe('checking a scheme against the printed marks', () => {
  it('reports a mismatch, and nothing when they agree or the leaf is unmarked', () => {
    const s = scheme([group([point('a'), point('b'), point('c')], { take: 2, each: 1 })]);
    expect(schemeMismatch(s, 2)).toBeUndefined();
    expect(schemeMismatch(s, 4)).toEqual({ scheme: 2, printed: 4 });
    expect(schemeMismatch(s, undefined)).toBeUndefined();
  });

  it('never flags an empty scheme', () => {
    expect(schemeMismatch(createMarkScheme(), 4)).toBeUndefined();
  });
});

describe('an empty scheme', () => {
  it('is empty until a point has words, or a level or EC exists', () => {
    expect(isSchemeEmpty(undefined)).toBe(true);
    expect(isSchemeEmpty(createMarkScheme())).toBe(true);
    const withAlt = createMarkScheme();
    withAlt.routes[0].groups[0].points[0].alternatives = [bi('alt', '')];
    expect(isSchemeEmpty(withAlt)).toBe(false);
    expect(isSchemeEmpty({ ...createMarkScheme(), ec: createMarkEc() })).toBe(false);
    expect(isSchemeEmpty({ ...createMarkScheme(), levels: [createMarkLevel()] })).toBe(false);
  });
});

describe('a malformed saved scheme', () => {
  it('reads as empty rather than throwing', () => {
    const broken = { routes: [{ id: 'r' }, { id: 'q', groups: [{ id: 'g' }] }] } as unknown as MarkScheme;
    expect(isSchemeEmpty(broken)).toBe(true);
    expect(schemeMax(broken)).toBe(0);
    expect(schemeTexts(broken)).toEqual([]);
    expect(schemeMax({} as MarkScheme)).toBe(0);
  });
});

describe('schemeTexts', () => {
  it('lists every authored string', () => {
    const s = scheme([group([{ ...point('a', 1), alternatives: [bi('a2', '')] }])]);
    s.levels = [{ ...createMarkLevel(), descriptor: bi('L1', '') }];
    s.ec = createMarkEc();
    expect(schemeTexts(s)).toHaveLength(2 + 1 + 3);
  });
});
