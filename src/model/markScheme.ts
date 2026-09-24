import { newId } from './factories';
import { bi, emptyBiText, isBiTextEmpty } from './text';
import type { BiText } from './types';
import type {
  MarkEc,
  MarkGroup,
  MarkLevel,
  MarkPoint,
  MarkRoute,
  MarkScheme,
} from './markSchemeTypes';

/**
 * Marking schemes in HKEAA notation: factories and the derived totals.
 *
 * A total is never stored. It follows from the rules a co-marker applies — `n@`,
 * "any N", `max: N`, OR routes, levels, EC — so the editor can check it against the
 * marks the paper prints. Every reader is defensive: a scheme is nested data in a saved
 * file, and a hand-edited one must not stop the document rendering.
 */

export function createMarkPoint(marks = 1): MarkPoint {
  return { id: newId(), text: emptyBiText(), marks };
}

export function createMarkGroup(points: MarkPoint[] = [createMarkPoint()]): MarkGroup {
  return { id: newId(), points };
}

export function createMarkRoute(): MarkRoute {
  return { id: newId(), groups: [createMarkGroup()] };
}

export function createMarkScheme(): MarkScheme {
  return { routes: [createMarkRoute()] };
}

/** The next level up: its range starts one above the last level's top. */
export function createMarkLevel(previous?: MarkLevel): MarkLevel {
  const min = previous ? previous.max + 1 : 1;
  return { id: newId(), min, max: min + 1, descriptor: emptyBiText() };
}

/**
 * EC with the three rows every Paper 2 essay prints. The wording is a starting point to
 * edit, not HKEAA's text.
 */
export function createMarkEc(): MarkEc {
  return {
    max: 2,
    descriptors: [
      {
        id: newId(),
        marks: 2,
        text: bi(
          'Clear and logical presentation; economic terms used accurately.',
          '表達清晰、有條理；準確運用經濟學術語。',
        ),
      },
      {
        id: newId(),
        marks: 1,
        text: bi(
          'Some lapses in organisation or terminology, but the answer can be followed.',
          '組織或術語運用有欠妥善，但答案仍可理解。',
        ),
      },
      {
        id: newId(),
        marks: 0,
        text: bi('Disorganised, or largely irrelevant.', '組織混亂或大部分內容不相關。'),
      },
    ],
  };
}

export function schemeRoutes(scheme: MarkScheme | undefined): MarkRoute[] {
  return Array.isArray(scheme?.routes) ? scheme.routes : [];
}

export function groupPoints(group: MarkGroup | undefined): MarkPoint[] {
  return Array.isArray(group?.points) ? group.points : [];
}

export function routeGroups(route: MarkRoute | undefined): MarkGroup[] {
  return Array.isArray(route?.groups) ? route.groups : [];
}

export function schemeLevels(scheme: MarkScheme | undefined): MarkLevel[] {
  return Array.isArray(scheme?.levels) ? scheme.levels : [];
}

const count = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;

/** What one point earns: the group's `n@` wins over the point's own mark. */
export function pointValue(group: MarkGroup, point: MarkPoint): number {
  return count(group.each ?? point.marks);
}

/**
 * The most a group can earn: its best `take` points (all of them without "any N"),
 * then capped by `max`. The best ones, because "any N" lets the candidate hit any.
 */
export function groupMax(group: MarkGroup): number {
  const values = groupPoints(group)
    .map((point) => pointValue(group, point))
    .sort((a, b) => b - a);
  const taken = group.take !== undefined ? values.slice(0, count(group.take)) : values;
  const sum = taken.reduce((total, value) => total + value, 0);
  return group.max !== undefined ? Math.min(sum, count(group.max)) : sum;
}

export function routeMax(route: MarkRoute): number {
  return routeGroups(route).reduce((total, group) => total + groupMax(group), 0);
}

/**
 * The content mark: the top level's ceiling when levels are set (the points are then
 * indicative), otherwise the best route — a candidate is marked on one approach.
 */
export function contentMax(scheme: MarkScheme): number {
  const levels = schemeLevels(scheme);
  if (levels.length > 0) return Math.max(0, ...levels.map((level) => count(level.max)));
  const routes = schemeRoutes(scheme);
  return routes.length > 0 ? Math.max(...routes.map(routeMax)) : 0;
}

/** Content plus EC: what the scheme awards in total. */
export function schemeMax(scheme: MarkScheme): number {
  return contentMax(scheme) + count(scheme.ec?.max);
}

/** OR routes that award different totals — almost always an authoring slip. */
export function routesDisagree(scheme: MarkScheme): boolean {
  if (schemeLevels(scheme).length > 0) return false;
  const totals = new Set(schemeRoutes(scheme).map(routeMax));
  return totals.size > 1;
}

/** Nothing a co-marker could read: no point text, no level, no EC. */
export function isSchemeEmpty(scheme: MarkScheme | undefined): boolean {
  if (!scheme) return true;
  if (schemeLevels(scheme).length > 0 || scheme.ec) return false;
  return !schemeRoutes(scheme).some((route) =>
    routeGroups(route).some((group) =>
      groupPoints(group).some(
        (point) =>
          !isBiTextEmpty(point.text) ||
          (point.alternatives ?? []).some((alt) => !isBiTextEmpty(alt)),
      ),
    ),
  );
}

/**
 * The scheme's total against the marks the paper prints for the leaf, when they differ.
 * Absent printed marks make no claim, so they never mismatch.
 */
export function schemeMismatch(
  scheme: MarkScheme | undefined,
  printedMarks: number | undefined,
): { scheme: number; printed: number } | undefined {
  if (!scheme || isSchemeEmpty(scheme) || printedMarks === undefined) return undefined;
  const total = schemeMax(scheme);
  return total === printedMarks ? undefined : { scheme: total, printed: printedMarks };
}

/** Every authored string in a scheme, for the translation count. */
export function schemeTexts(scheme: MarkScheme | undefined): BiText[] {
  if (!scheme) return [];
  const texts: BiText[] = [];
  for (const route of schemeRoutes(scheme)) {
    for (const group of routeGroups(route)) {
      for (const point of groupPoints(group)) {
        texts.push(point.text, ...(point.alternatives ?? []));
      }
    }
  }
  for (const level of schemeLevels(scheme)) texts.push(level.descriptor);
  for (const row of scheme.ec?.descriptors ?? []) texts.push(row.text);
  return texts.filter((text): text is BiText => Boolean(text && text.en && text.zh));
}
