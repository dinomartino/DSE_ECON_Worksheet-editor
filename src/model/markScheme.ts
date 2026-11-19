import { newId } from './factories';
import { joinApart } from './paragraphs';
import { bi, emptyBiText, isBiTextEmpty, normalizeRuns, richTextLength, sliceRichText } from './text';
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
 * HKEAA's effective-communication statements, as its DSE Economics marking schemes print
 * them under "Marks for effective communication (EC: max 2 marks)" (Sample Paper 2025,
 * Paper 2 Q12(d), written for the 2028 framework; English and Chinese versions). One
 * row per mark, its four statements one per line. The standard every new EC block starts
 * from, so the table reads the same in every question (k-0470, issue #7).
 */
export const HKEAA_EC_MAX = 2;

const statements = (lines: string[]) => lines.map((line) => `\u2022 ${line}`).join('\n');

export const HKEAA_EC_STANDARD: ReadonlyArray<{ marks: number; text: BiText }> = [
  {
    marks: 2,
    text: bi(
      statements([
        'Support arguments with the source/data and appropriate economic theories.',
        'Present relevant material.',
        'Present well-organised and coherent answers without repetition of ideas.',
        'Use language that expresses ideas clearly and fluently with appropriate use of words/terms/symbols.',
      ]),
      statements([
        '運用資料／數據及適當的經濟理論支持論點。',
        '答案切合題旨。',
        '答案組織良好，並且前後連貫一致，概念沒有重複。',
        '能以清晰流暢的語文表達意思，並恰當地使用術語或符號。',
      ]),
    ),
  },
  {
    marks: 1,
    text: bi(
      statements([
        'Present arguments with some support of the source/data and economic theories.',
        'Present some irrelevant material.',
        'Present answers in a less organised way with some repetition.',
        'Use language that conveys a clear message with some inappropriate use of words/terms/symbols.',
      ]),
      statements([
        '從一些資料／數據和經濟理論支持論點。',
        '部分答案並不切題。',
        '答案組織一般，有些概念重複。',
        '能運用語文清晰地傳遞訊息，但間中用詞不當／誤用術語或符號。',
      ]),
    ),
  },
  {
    marks: 0,
    text: bi(
      statements([
        'Present arguments with no support of the source/data and economic theories.',
        'Present material unrelated to the gist of the question.',
        'Present inconsistent arguments.',
        'Express limited ideas with inappropriate use of words/terms/symbols.',
      ]),
      statements([
        '沒有以資料／數據和經濟理論支持論點。',
        '答案無關題旨。',
        '答案組織鬆散欠連貫。',
        '表達有限的意思，有用詞不當／誤用術語或符號的情況。',
      ]),
    ),
  },
];

/**
 * EC as HKEAA prints it: max 2, the 2 / 1 / 0 rows in its words (`HKEAA_EC_STANDARD`),
 * each row still the teacher's to edit. Fresh ids, so two questions never share a row.
 */
export function createMarkEc(): MarkEc {
  return {
    max: HKEAA_EC_MAX,
    descriptors: HKEAA_EC_STANDARD.map((row) => ({ id: newId(), marks: row.marks, text: row.text })),
  };
}

/**
 * Whether `ec` already is the standard table: max 2 and the same rows, marks and words
 * (ids aside), so "Use HKEAA standard" has nothing to do.
 */
export function isStandardEc(ec: MarkEc | undefined): boolean {
  if (!ec || ec.max !== HKEAA_EC_MAX) return false;
  const rows = Array.isArray(ec.descriptors) ? ec.descriptors : [];
  return (
    rows.length === HKEAA_EC_STANDARD.length &&
    rows.every((row, index) => {
      const standard = HKEAA_EC_STANDARD[index];
      return (
        row.marks === standard.marks &&
        plainText(row.text?.en) === plainText(standard.text.en) &&
        plainText(row.text?.zh) === plainText(standard.text.zh)
      );
    })
  );
}

const plainText = (runs: BiText['en'] | undefined) => (runs ?? []).map((run) => run.text).join('');

/**
 * How a scheme's points print (`MarkScheme.display`): `points` (one line per point, its
 * mark beside it; absent, and anything this build does not know) or `paragraph` (HKEAA's
 * other style: each route's points as one paragraph, its total marks beside it).
 */
export type SchemeDisplay = 'points' | 'paragraph';

export function schemeDisplay(scheme: MarkScheme | undefined): SchemeDisplay {
  return scheme?.display === 'paragraph' ? 'paragraph' : 'points';
}

/** `scheme` shown as `display`; points removes the field, so a scheme set back stores nothing. */
export function withSchemeDisplay(scheme: MarkScheme, display: SchemeDisplay): MarkScheme {
  const { display: _previous, ...rest } = scheme;
  void _previous;
  return display === 'paragraph' ? { ...rest, display } : rest;
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

/** As `schemeMismatch`, for a leaf read structurally (`QualityAnchor`): a shared label's marks win. */
export function anchorSchemeMismatch(anchor: {
  scheme?: MarkScheme;
  marks?: number;
  schemeMarks?: number;
}): { scheme: number; printed: number } | undefined {
  return schemeMismatch(anchor.scheme, anchor.schemeMarks ?? anchor.marks);
}

/**
 * One piece of authored scheme text, by id: a point's wording, its `alternative`-th `/`
 * wording, a level's descriptor, or an EC row's descriptor. What the page's scheme edit
 * targets name (`render/ir.ts:EditTarget`).
 */
export type SchemeTextSlot =
  | { point: string; alternative?: number }
  | { level: string }
  | { ec: string };

/** The text in `slot`, or undefined when it no longer resolves. */
export function schemeTextAt(scheme: MarkScheme | undefined, slot: SchemeTextSlot): BiText | undefined {
  if (!scheme) return undefined;
  if ('level' in slot) return schemeLevels(scheme).find((level) => level.id === slot.level)?.descriptor;
  if ('ec' in slot) return scheme.ec?.descriptors?.find((row) => row.id === slot.ec)?.text;
  for (const route of schemeRoutes(scheme)) {
    for (const group of routeGroups(route)) {
      const point = groupPoints(group).find((entry) => entry.id === slot.point);
      if (point) return slot.alternative === undefined ? point.text : point.alternatives?.[slot.alternative];
    }
  }
  return undefined;
}

/**
 * The scheme with `slot`'s text replaced; the same object when the slot no longer
 * resolves. A cleared field stays, empty: removing a point or an alternative is a
 * structural edit, made in the panel.
 */
export function withSchemeText(scheme: MarkScheme, slot: SchemeTextSlot, text: BiText): MarkScheme {
  if ('level' in slot) {
    const levels = schemeLevels(scheme);
    if (!levels.some((level) => level.id === slot.level)) return scheme;
    return {
      ...scheme,
      levels: levels.map((level) => (level.id === slot.level ? { ...level, descriptor: text } : level)),
    };
  }
  if ('ec' in slot) {
    const rows = scheme.ec?.descriptors ?? [];
    if (!scheme.ec || !rows.some((row) => row.id === slot.ec)) return scheme;
    return {
      ...scheme,
      ec: { ...scheme.ec, descriptors: rows.map((row) => (row.id === slot.ec ? { ...row, text } : row)) },
    };
  }
  let found = false;
  const write = (point: MarkPoint): MarkPoint => {
    if (point.id !== slot.point) return point;
    if (slot.alternative === undefined) {
      found = true;
      return { ...point, text };
    }
    const alternatives = point.alternatives ?? [];
    if (slot.alternative < 0 || slot.alternative >= alternatives.length) return point;
    found = true;
    return { ...point, alternatives: alternatives.map((alt, index) => (index === slot.alternative ? text : alt)) };
  };
  const routes = schemeRoutes(scheme).map((route) => ({
    ...route,
    groups: routeGroups(route).map((group) => ({ ...group, points: groupPoints(group).map(write) })),
  }));
  return found ? { ...scheme, routes } : scheme;
}

/**
 * Word's Enter in a mark point (k-0200): the point splits at `[start, end)` of `side`, as a
 * paragraph does (`model/paragraphs.ts`). The selected characters go and the words after
 * them become a new point `newId` straight after it, in the same group, so it is marked by
 * the same rule (`n@`, "any N", `max`).
 *
 * The new point carries the old one's own mark, as Word carries a line's format into the
 * next — a teacher typing a scheme line by line gets "(1)" on each — so the derived total
 * can rise, which the panel's mismatch note reports. The `/` alternatives stay with the
 * first point; the side not being typed stays with it too, and the new point asks for its
 * own. The same object when the point is not found.
 */
export function splitMarkPoint(
  scheme: MarkScheme,
  pointId: string,
  side: 'en' | 'zh',
  start: number,
  end: number,
  newId: string,
): MarkScheme {
  let found = false;
  const routes = schemeRoutes(scheme).map((route) => ({
    ...route,
    groups: routeGroups(route).map((group) => {
      const points = groupPoints(group);
      const index = points.findIndex((point) => point.id === pointId);
      if (index === -1) return group;
      found = true;
      const point = points[index];
      const runs = point.text[side] ?? [];
      const length = richTextLength(runs);
      const from = Math.max(0, Math.min(start, end, length));
      const to = Math.min(length, Math.max(start, end));
      const after = sliceRichText(runs, to, length);
      const first: MarkPoint = { ...point, text: { ...point.text, [side]: sliceRichText(runs, 0, from) } };
      const second: MarkPoint = {
        id: newId,
        text: side === 'en' ? { en: after, zh: [] } : { en: [], zh: after },
        ...(point.marks !== undefined ? { marks: point.marks } : {}),
      };
      return { ...group, points: [...points.slice(0, index), first, second, ...points.slice(index + 1)] };
    }),
  }));
  return found ? { ...scheme, routes } : scheme;
}

/** The point a join lands in, and where in its `side` the caret goes. */
export interface MarkPointJoin {
  scheme: MarkScheme;
  pointId: string;
  caret: number;
}

/**
 * Word's Backspace at a point's start (`backward`, into the point before) and Delete at its
 * end (`forward`, pulling the next one in): two points of one group become one. The joined
 * point keeps the first point's mark — so a split joined straight back is the scheme it
 * was — and both points' `/` alternatives; the side not being typed keeps both texts, a
 * line break apart, as a paragraph join does. `undefined` at a group's edge: points marked
 * by different rules are never merged by a keystroke.
 */
export function joinMarkPoint(
  scheme: MarkScheme,
  pointId: string,
  side: 'en' | 'zh',
  direction: 'backward' | 'forward',
): MarkPointJoin | undefined {
  let result: MarkPointJoin | undefined;
  const routes = schemeRoutes(scheme).map((route) => ({
    ...route,
    groups: routeGroups(route).map((group) => {
      const points = groupPoints(group);
      const index = points.findIndex((point) => point.id === pointId);
      if (index === -1) return group;
      const at = direction === 'backward' ? index - 1 : index;
      const head = points[at];
      const tail = points[at + 1];
      if (!head || !tail) return group;
      const other = side === 'en' ? 'zh' : 'en';
      const alternatives = [...(head.alternatives ?? []), ...(tail.alternatives ?? [])];
      const joined: MarkPoint = {
        ...head,
        text: {
          ...head.text,
          [side]: normalizeRuns([...(head.text[side] ?? []), ...(tail.text[side] ?? [])]),
          [other]: joinApart(head.text[other], tail.text[other]),
        },
        ...(alternatives.length > 0 ? { alternatives } : {}),
      };
      result = { scheme, pointId: head.id, caret: richTextLength(head.text[side]) };
      return { ...group, points: [...points.slice(0, at), joined, ...points.slice(at + 2)] };
    }),
  }));
  return result ? { ...result, scheme: { ...scheme, routes } } : undefined;
}

/**
 * Word's Enter on an empty list item ends the list: Enter on an empty mark point removes it,
 * so a second Enter leaves no stray "(1)" adding to the total. Only a point with no words on
 * either side and no `/` alternatives goes, and never a group's last point (the group would
 * go with it); otherwise the same object.
 */
export function withoutEmptyMarkPoint(scheme: MarkScheme, pointId: string): MarkScheme {
  let found = false;
  const routes = schemeRoutes(scheme).map((route) => ({
    ...route,
    groups: routeGroups(route).map((group) => {
      const points = groupPoints(group);
      const point = points.find((entry) => entry.id === pointId);
      if (!point || points.length < 2 || !isBiTextEmpty(point.text) || (point.alternatives ?? []).length > 0) return group;
      found = true;
      return { ...group, points: points.filter((entry) => entry !== point) };
    }),
  }));
  return found ? { ...scheme, routes } : scheme;
}
