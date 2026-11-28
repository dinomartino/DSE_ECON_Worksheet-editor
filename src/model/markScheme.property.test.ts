import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { holds } from '@/test/property';
import {
  contentMax,
  groupMax,
  joinMarkPoint,
  pointValue,
  routeMax,
  schemeMax,
  schemeMismatch,
  splitMarkPoint,
} from './markScheme';
import type { MarkEc, MarkGroup, MarkPoint, MarkRoute, MarkScheme } from './markSchemeTypes';
import { normalizeRuns, richTextLength } from './text';
import type { ContentBlock, InlineRun, RichText } from './types';

/**
 * Property tests for the marking-scheme totals (k-0607). The rules are HKEAA's, as
 * `markScheme.ts` states them: a point earns its own mark, or the group's `n@` instead;
 * "any N" takes the best N; `max: N` caps the group; OR routes are alternatives (the best
 * one counts); levels or a stated content mark replace the points; EC adds on top. A
 * saved scheme is hand-editable data, so marks may be anything a JSON file can hold.
 */

// ---------------------------------------------------------------- generators

/** What a stored mark may be: usually a small whole number, sometimes junk. */
const storedMark = fc.oneof(
  { weight: 8, arbitrary: fc.integer({ min: 0, max: 6 }) },
  { weight: 1, arbitrary: fc.constantFrom(undefined, -1, 0.5, 2.5, Number.NaN, Number.POSITIVE_INFINITY) },
);

/** An optional rule value (`each`, `take`, `max`): mostly absent or small, sometimes junk. */
const ruleValue = fc.oneof(
  { weight: 4, arbitrary: fc.constant(undefined) },
  { weight: 4, arbitrary: fc.integer({ min: 0, max: 5 }) },
  { weight: 1, arbitrary: fc.constantFrom(-2, 1.5, Number.NaN) },
);

const run: fc.Arbitrary<InlineRun> = fc.record(
  {
    text: fc.string({ unit: fc.constantFrom('a', 'b', ' ', '需', '求', '\n'), minLength: 1, maxLength: 6 }),
    bold: fc.constant(true),
    italic: fc.constant(true),
  },
  { requiredKeys: ['text'] },
);

/** Rich text as the editor stores it: runs merged where their format agrees (`normalizeRuns`). */
const richText: fc.Arbitrary<RichText> = fc.array(run, { maxLength: 3 }).map(normalizeRuns);

const figure: fc.Arbitrary<ContentBlock> = fc.constantFrom<ContentBlock>(
  { kind: 'paragraph', id: 'fig-p', text: { en: [{ text: 'figure' }], zh: [] } },
  { kind: 'table', id: 'fig-t', rows: [{ id: 'r', cells: [{ id: 'c', text: { en: [{ text: 'P' }], zh: [] } }] }] },
);

const pointBody = fc.record(
  {
    text: fc.record({ en: richText, zh: richText }),
    marks: storedMark,
    alternatives: fc.array(fc.record({ en: richText, zh: richText }), { maxLength: 2 }),
    blocks: fc.array(figure, { minLength: 1, maxLength: 2 }),
  },
  { requiredKeys: ['text'] },
);

const groupBody = fc.record(
  {
    points: fc.array(pointBody, { maxLength: 5 }),
    each: ruleValue,
    take: ruleValue,
    max: ruleValue,
  },
  { requiredKeys: ['points'] },
);

/** Unique ids, so a split or join addresses exactly one point. */
function withIds(routes: Array<Array<{ points: Omit<MarkPoint, 'id'>[] } & Omit<MarkGroup, 'id' | 'points'>>>): MarkRoute[] {
  let next = 0;
  const id = (prefix: string) => `${prefix}${next++}`;
  return routes.map((groups) => ({
    id: id('r'),
    groups: groups.map((group) => ({
      ...group,
      id: id('g'),
      points: group.points.map((point) => ({ ...point, id: id('p') })),
    })),
  }));
}

const scheme: fc.Arbitrary<MarkScheme> = fc
  .record(
    {
      routes: fc.array(fc.array(groupBody, { minLength: 1, maxLength: 3 }), { minLength: 1, maxLength: 3 }),
      ec: fc.record({ max: fc.integer({ min: 0, max: 3 }), descriptors: fc.constant<MarkEc['descriptors']>([]) }),
    },
    { requiredKeys: ['routes'] },
  )
  .map(({ routes, ec }) => ({ routes: withIds(routes), ...(ec ? { ec } : {}) }));

const group: fc.Arbitrary<MarkGroup> = groupBody.map((body) => withIds([[body]])[0].groups[0]);

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const values = (g: MarkGroup) => g.points.map((point) => pointValue(g, point));
/** A rule value as the readers take it: a positive finite number, or nothing. */
const usable = (value: number | undefined) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;

// ---------------------------------------------------------------- properties

describe('marking scheme totals (property)', { timeout: 60_000 }, () => {
  it('a point earns the group’s n@ when set, its own mark otherwise, and never less than 0', () => {
    holds(
      fc.property(group, (g) => {
        for (const point of g.points) {
          const value = pointValue(g, point);
          expect(value).toBeGreaterThanOrEqual(0);
          expect(Number.isFinite(value)).toBe(true);
          expect(value).toBe(g.each !== undefined ? usable(g.each) : usable(point.marks));
        }
      }),
    );
  });

  it('a group never awards more than the sum of its points, nor more than its max, nor more than its best N', () => {
    holds(
      fc.property(group, (g) => {
        const total = groupMax(g);
        const own = values(g);
        expect(total).toBeGreaterThanOrEqual(0);
        expect(total).toBeLessThanOrEqual(sum(own));
        if (g.max !== undefined) expect(total).toBeLessThanOrEqual(usable(g.max));
        if (g.take !== undefined) {
          const best = Math.max(0, ...own);
          expect(total).toBeLessThanOrEqual(Math.trunc(usable(g.take)) * best);
        }
        // With no rule at all, the group is exactly its points.
        if (g.take === undefined && g.max === undefined) expect(total).toBe(sum(own));
      }),
    );
  });

  it('"any N" reaches the best N: the order the points are written in never changes the total', () => {
    holds(
      fc.property(
        group.chain((g) => fc.tuple(fc.constant(g), fc.shuffledSubarray(g.points, { minLength: g.points.length }))),
        ([g, shuffled]) => {
          expect(groupMax({ ...g, points: shuffled })).toBe(groupMax(g));
        },
      ),
    );
  });

  it('adding a point never lowers what a group awards', () => {
    holds(
      fc.property(group, pointBody, (g, extra) => {
        const more = { ...g, points: [...g.points, { ...extra, id: 'extra' }] };
        expect(groupMax(more)).toBeGreaterThanOrEqual(groupMax(g));
      }),
    );
  });

  it('a route is the sum of its groups; the content mark is the best route; the total adds EC', () => {
    holds(
      fc.property(scheme, (s) => {
        for (const route of s.routes) expect(routeMax(route)).toBe(sum(route.groups.map(groupMax)));
        expect(contentMax(s)).toBe(Math.max(...s.routes.map(routeMax)));
        expect(schemeMax(s)).toBe(contentMax(s) + (s.ec?.max ?? 0));
      }),
    );
  });

  it('a stated content mark or levels replace the points; EC still adds on top', () => {
    holds(
      fc.property(
        scheme,
        fc.oneof(
          fc.record({ contentMax: fc.integer({ min: 0, max: 20 }) }),
          fc.record({
            levels: fc.array(fc.record({ min: fc.integer({ min: 0, max: 5 }), max: fc.integer({ min: 0, max: 12 }) }), {
              minLength: 1,
              maxLength: 4,
            }),
          }),
        ),
        (s, override) => {
          const withLevels =
            'levels' in override
              ? { ...s, levels: override.levels.map((level, i) => ({ ...level, id: `l${i}`, descriptor: { en: [], zh: [] } })) }
              : { ...s, contentMax: override.contentMax };
          const content =
            'levels' in override ? Math.max(0, ...override.levels.map((level) => level.max)) : override.contentMax;
          expect(contentMax(withLevels)).toBe(content);
          expect(schemeMax(withLevels)).toBe(content + (s.ec?.max ?? 0));
        },
      ),
    );
  });

  it('a scheme checked against its own total never mismatches; any other printed total always does', () => {
    holds(
      fc.property(scheme, fc.integer({ min: -3, max: 3 }), (s, delta) => {
        // Give every scheme words, so it is never "empty" (an empty one makes no claim).
        const worded: MarkScheme = {
          ...s,
          routes: s.routes.map((route) => ({
            ...route,
            groups: route.groups.map((g) => ({
              ...g,
              points: [...g.points, { id: `${g.id}-w`, text: { en: [{ text: 'w' }], zh: [] }, marks: 0 }],
            })),
          })),
        };
        const total = schemeMax(worded);
        expect(schemeMismatch(worded, total)).toBeUndefined();
        expect(schemeMismatch(worded, undefined)).toBeUndefined();
        if (delta !== 0) expect(schemeMismatch(worded, total + delta)).toEqual({ scheme: total, printed: total + delta });
      }),
    );
  });

  /*
   * Splitting a point does NOT keep the total, by design: the new point carries the old
   * one's mark (as Word carries a line's format to the next), so a teacher typing a scheme
   * line by line gets "(1)" on each, and the panel's mismatch note reports the new total
   * (`splitMarkPoint`). What must hold is that the split never lowers the total and that a
   * split joined straight back is the scheme it was, total included (`joinMarkPoint`).
   */
  const splitCase = scheme.chain((s) => {
    const points = s.routes.flatMap((route) => route.groups.flatMap((g) => g.points));
    if (points.length === 0) return fc.constant(undefined);
    return fc
      .record({
        point: fc.constantFrom(...points),
        side: fc.constantFrom<'en' | 'zh'>('en', 'zh'),
        at: fc.nat({ max: 20 }),
      })
      .map(({ point, side, at }) => ({ s, point, side, at: Math.min(at, richTextLength(point.text[side])) }));
  });

  it('splitting a point never lowers the total, and adds exactly one point to its group', () => {
    holds(
      fc.property(splitCase, (c) => {
        fc.pre(c !== undefined);
        const { s, point, side, at } = c!;
        const split = splitMarkPoint(s, point.id, side, at, at, 'new');
        expect(schemeMax(split)).toBeGreaterThanOrEqual(schemeMax(s));
        const count = (x: MarkScheme) => x.routes.flatMap((route) => route.groups.flatMap((g) => g.points)).length;
        expect(count(split)).toBe(count(s) + 1);
      }),
    );
  });

  it('a split joined straight back is the scheme it was, total included', () => {
    holds(
      fc.property(splitCase, fc.boolean(), (c, backward) => {
        fc.pre(c !== undefined);
        const { s, point, side, at } = c!;
        const split = splitMarkPoint(s, point.id, side, at, at, 'new');
        // Backspace at the new point's start, or Delete at the old point's end.
        const joined = backward
          ? joinMarkPoint(split, 'new', side, 'backward')
          : joinMarkPoint(split, point.id, side, 'forward');
        expect(joined).toBeDefined();
        expect(joined!.pointId).toBe(point.id);
        expect(joined!.caret).toBe(at);
        expect(joined!.scheme).toEqual(s);
        expect(schemeMax(joined!.scheme)).toBe(schemeMax(s));
      }),
    );
  });
});
