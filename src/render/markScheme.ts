import {
  groupHeading,
  groupPoints,
  isSchemeEmpty,
  pointBlocksOf,
  pointHasContent,
  routeGroups,
  routeMax,
  schemeDisplay,
  schemeLevels,
  schemeRoutes,
  statedContentMax,
} from '@/model/markScheme';
import type { MarkGroup, MarkPoint, MarkScheme } from '@/model/markSchemeTypes';
import { bi, isBiTextEmpty } from '@/model/text';
import type { BiText, ContentBlock, LanguageMode, RichText } from '@/model/types';
import { renderContentBlocks, type EditSegment, type EditTarget, type RenderNode, type SchemeAddress, type TextNode } from './ir';

/**
 * A marking scheme as IR, in HKEAA layout: one paragraph per point with its mark in the
 * marks column ("(1)", `TextNode.trail`), `/` between accepted wordings, a lead line for
 * "any N" / `n@`, "[Mark the FIRST N points only.]", a `max: N` line closing a capped
 * group, "OR" between routes, then level descriptors and the EC table. A scheme shown as
 * a paragraph (`display`) prints each route as one paragraph with its total instead.
 *
 * Emitted once and read by all three backends; the paper's teacher version and the
 * answer key both call it. Given the leaf's address (`at`), the authored text carries
 * edit targets — points, alternatives, level and EC descriptors — so it is typed where it
 * prints in both; the notation around it is derived and has none. Inert in export.
 */

const NUMBER_WORDS_EN = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN'];
const NUMBER_WORDS_ZH = ['一', '兩', '三', '四', '五', '六', '七', '八', '九', '十'];

const wordEn = (n: number) => NUMBER_WORDS_EN[n - 1] ?? String(n);
const wordZh = (n: number) => NUMBER_WORDS_ZH[n - 1] ?? String(n);

/** The notation's printed wording, in one place so the tests and backends agree. */
export const MARK_SCHEME_WORDING = {
  or: bi('OR', '或'),
  any: (n: number) => bi(`Any ${wordEn(n)} of the following:`, `以下任何${wordZh(n)}項：`),
  each: bi('Each of the following:', '以下每項：'),
  firstOnly: (n: number) =>
    n === 1
      ? bi('[Mark the FIRST point only.]', '［只批閱首項。］')
      : bi(`[Mark the FIRST ${wordEn(n)} points only.]`, `［只批閱首${wordZh(n)}項。］`),
  at: (n: number) => bi(`${n}@`, `${n}@`),
  max: (n: number) => bi(`max: ${n}`, `最高：${n}`),
  mark: (n: number) => bi(`(${n})`, `(${n})`),
  range: (min: number, max: number) =>
    bi(min === max ? `(${min})` : `(${min}–${max})`, min === max ? `(${min})` : `(${min}–${max})`),
  levels: bi('Levels of performance', '表現等級'),
  level: (n: number) => bi(`Level ${n}: `, `第${n}級：`),
  ec: bi('Effective communication (EC)', '有效傳意（EC）'),
  /** The answer key's EC table, as HKEAA heads and closes it. */
  ecTableHeading: (max: number) =>
    bi(
      `Marks for effective communication (EC: max ${max} ${max === 1 ? 'mark' : 'marks'})`,
      `有效傳意評分（EC：最高${max}分）`,
    ),
  ecMarks: bi('Marks', '分數'),
  ecPerformance: bi('Performance', '表現'),
  contentMax: (n: number) =>
    bi(`The maximum mark for content is ${n} ${n === 1 ? 'mark' : 'marks'}.`, `內容最高${n}分。`),
} as const;

export interface MarkSchemeRenderOptions {
  /** The text column the scheme sits at, in twips (the leaf's answer column). */
  indent?: number;
  /** True on the paper, where the scheme is teacher-version only. */
  teacherOnly?: boolean;
  /** The leaf owning the scheme; set, its authored text is editable on the page. */
  at?: SchemeAddress;
  /**
   * The page being typed on: an empty point in a printed group is drawn too, as an
   * `editOnly` line, so the point Enter just made can take the caret (k-0200). Never
   * set for an export, so nothing prints it.
   */
  editing?: boolean;
  /**
   * Leave the EC rows out: the answer key prints them as its own Marks | Performance
   * table (`answerKeySections.ts:ecTable`). The paper's teacher version keeps the lines.
   */
  omitEc?: boolean;
  /** The paper's language, for the points' figures (`renderContentBlocks`' picture gap). */
  language?: LanguageMode;
}

const ALTERNATIVE_SEPARATOR = ' / ';

const hasWords = (runs: RichText) => runs.some((run) => run.text.trim().length > 0);

/** A point's wordings in print order, each with the target that writes it back. */
function wordings(point: MarkPoint, at: SchemeAddress | undefined) {
  return [point.text, ...(point.alternatives ?? [])].map((text, index) => ({
    text,
    edit: (at
      ? index === 0
        ? { kind: 'schemePoint', ...at, pointId: point.id }
        : { kind: 'schemeAlternative', ...at, pointId: point.id, index: index - 1 }
      : undefined) as EditTarget | undefined,
  }));
}

/** `text / alternative / alternative`, side by side, skipping a side's empty wordings. */
function withAlternatives(point: MarkPoint): BiText {
  const join = (side: 'en' | 'zh'): RichText =>
    wordings(point, undefined)
      .map(({ text }) => text?.[side] ?? [])
      .filter(hasWords)
      .flatMap((runs, index) => (index === 0 ? runs : [{ text: ALTERNATIVE_SEPARATOR }, ...runs]));
  return { en: join('en'), zh: join('zh') };
}

/**
 * The same join as `withAlternatives`, as editable pieces: each printed wording is its
 * own field. A side with nothing printed offers the point's own wording, empty.
 */
function alternativeSegments(point: MarkPoint, at: SchemeAddress): TextNode['segments'] {
  const side = (key: 'en' | 'zh'): EditSegment[] => {
    const all = wordings(point, at);
    const shown = all.filter(({ text }) => hasWords(text?.[key] ?? []));
    if (shown.length === 0) return [{ edit: all[0].edit!, value: point.text }];
    return shown.flatMap(({ text, edit }, index): EditSegment[] => [
      ...(index === 0 ? [] : [{ runs: [{ text: ALTERNATIVE_SEPARATOR }] }]),
      { edit: edit!, value: text },
    ]);
  };
  return { en: side('en'), zh: side('zh') };
}

function hasWording(point: MarkPoint): boolean {
  return !isBiTextEmpty(point.text) || (point.alternatives ?? []).some((alt) => !isBiTextEmpty(alt));
}

const positive = (value: number | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/** One printed point: its wording, `text / alternative`, and how it is typed on the page. */
export interface PointLine {
  point: MarkPoint;
  text: BiText;
  /** The point's own figures (`MarkPoint.blocks`, k-0595), printed under its line; absent when none. */
  blocks?: ContentBlock[];
  edit?: EditTarget;
  segments?: TextNode['segments'];
}

/** A group's points that print, with the group's rules read as numbers (`take`, `each`). */
export interface PointGroup {
  group: MarkGroup;
  /** The group's heading (`MarkGroup.heading`), when it has words, and where it is typed. */
  heading?: BiText;
  headingEdit?: EditTarget;
  take?: number;
  each?: number;
  points: PointLine[];
}

/**
 * The scheme's printed points, route by route and group by group, for layouts that lay
 * them out themselves (the Detailed table, Suggested answers' bullets). The same points
 * `renderMarkScheme` prints, typed through the same targets; empty routes, groups and
 * points are left out, as it leaves them out.
 */
export function schemePointGroups(scheme: MarkScheme | undefined, at?: SchemeAddress): PointGroup[][] {
  if (!scheme || isSchemeEmpty(scheme)) return [];
  return schemeRoutes(scheme)
    .map((route) =>
      routeGroups(route)
        .map((group): PointGroup => ({
          group,
          ...(groupHeading(group)
            ? {
                heading: groupHeading(group),
                ...(at ? { headingEdit: { kind: 'schemeHeading', ...at, groupId: group.id } as EditTarget } : {}),
              }
            : {}),
          ...(positive(group.take) ? { take: group.take } : {}),
          ...(positive(group.each) ? { each: group.each } : {}),
          points: groupPoints(group)
            .filter(pointHasContent)
            .map((point) => ({
              point,
              text: withAlternatives(point),
              ...(pointBlocksOf(point).length > 0 ? { blocks: pointBlocksOf(point) } : {}),
              ...(at
                ? (point.alternatives ?? []).length > 0
                  ? { segments: alternativeSegments(point, at) }
                  : { edit: { kind: 'schemePoint', ...at, pointId: point.id } as EditTarget }
                : {}),
            })),
        }))
        .filter((group) => group.points.length > 0 || group.heading !== undefined),
    )
    .filter((groups) => groups.length > 0);
}

/** Between two points run together: a space in English; Chinese sentences close themselves. */
const PARAGRAPH_JOIN = { en: ' ', zh: '' } as const;

/** One route printed as a paragraph (`MarkScheme.display: 'paragraph'`). */
export interface SchemeParagraph {
  text: BiText;
  /** The route's total, for the marks column; absent with levels (they award the marks) or at 0. */
  marks?: number;
  /** Each point typed where it sits in the paragraph. */
  segments?: TextNode['segments'];
  /** The route's points' figures (`MarkPoint.blocks`, k-0595), in order, under the paragraph; absent when none. */
  blocks?: ContentBlock[];
}

/**
 * HKEAA's paragraph style: each route's points with words, in order, run together as one
 * paragraph (`/` wordings kept), its total once beside it. The group rules are not
 * printed — the paragraph is marked as a whole — but they still decide the total
 * (`routeMax`). On an editing page an empty point keeps a place to type in, so the point
 * Enter just made can take the caret. Empty routes are left out, as in the points style.
 */
export function schemeParagraphs(
  scheme: MarkScheme | undefined,
  options: { at?: SchemeAddress; editing?: boolean } = {},
): SchemeParagraph[] {
  if (!scheme || isSchemeEmpty(scheme)) return [];
  const { at } = options;
  const levels = schemeLevels(scheme).length > 0;
  return schemeRoutes(scheme)
    .filter((route) => routeGroups(route).some((group) => groupPoints(group).some(pointHasContent)))
    .map((route): SchemeParagraph => {
      const points = routeGroups(route)
        .flatMap(groupPoints)
        .filter((point) => pointHasContent(point) || (options.editing && at));
      const blocks = points.flatMap(pointBlocksOf);
      const text = (side: 'en' | 'zh'): RichText =>
        points
          .map((point) => withAlternatives(point)[side])
          .filter(hasWords)
          .flatMap((runs, index) => (index === 0 ? runs : [{ text: PARAGRAPH_JOIN[side] }, ...runs]))
          .filter((run) => run.text.length > 0);
      const segments = (side: 'en' | 'zh'): EditSegment[] =>
        points.flatMap((point, index): EditSegment[] => {
          const own: EditSegment[] =
            (point.alternatives ?? []).length > 0
              ? alternativeSegments(point, at!)![side]
              : [{ edit: { kind: 'schemePoint', ...at!, pointId: point.id }, value: point.text }];
          return index === 0 || !PARAGRAPH_JOIN[side] ? own : [{ runs: [{ text: PARAGRAPH_JOIN[side] }] }, ...own];
        });
      const total = routeMax(route);
      return {
        text: { en: text('en'), zh: text('zh') },
        ...(!levels && total > 0 ? { marks: total } : {}),
        ...(at ? { segments: { en: segments('en'), zh: segments('zh') } } : {}),
        ...(blocks.length > 0 ? { blocks } : {}),
      };
    });
}

export function renderMarkScheme(
  scheme: MarkScheme | undefined,
  options: MarkSchemeRenderOptions = {},
): RenderNode[] {
  if (!scheme || isSchemeEmpty(scheme)) return [];
  const { at } = options;
  const nodes: RenderNode[] = [];
  const line = (text: BiText, extra: Partial<TextNode> = {}) => {
    nodes.push({
      kind: 'text',
      style: 'Marking Scheme',
      text,
      ...(options.indent ? { indent: options.indent } : {}),
      ...(options.teacherOnly ? { teacherOnly: true } : {}),
      ...extra,
    });
  };
  const empty: BiText = { en: [], zh: [] };
  /** A point's figures under the line just pushed, which keeps with them; teacher-only as the scheme is. */
  const figures = (blocks: readonly ContentBlock[]) => {
    if (blocks.length === 0) return;
    (nodes[nodes.length - 1] as TextNode).keepNext = true;
    const start = nodes.length;
    renderContentBlocks(nodes, [...blocks], 'Marking Scheme', {
      ...(options.indent ? { indent: options.indent } : {}),
      ...(options.teacherOnly ? { teacherOnly: true } : {}),
      ...(options.language ? { language: options.language } : {}),
    });
    if (!options.teacherOnly) return;
    for (let index = start; index < nodes.length; index++) {
      (nodes[index] as { teacherOnly?: boolean }).teacherOnly = true;
    }
  };

  const routes = schemeRoutes(scheme).filter((route) =>
    routeGroups(route).some((group) => groupHeading(group) || groupPoints(group).some(pointHasContent)),
  );
  // A stated content mark (k-0475) heads the indicative content, as HKEAA prints it under
  // the EC table; where the answer key prints that table, the table's block says it.
  const stated = statedContentMax(scheme);
  if (stated !== undefined && !(options.omitEc && scheme.ec)) {
    line(MARK_SCHEME_WORDING.contentMax(stated), { keepNext: true });
  }
  if (schemeDisplay(scheme) === 'paragraph') {
    schemeParagraphs(scheme, { ...(at ? { at } : {}), ...(options.editing ? { editing: true } : {}) }).forEach(
      (paragraph, index) => {
        if (index > 0) line(MARK_SCHEME_WORDING.or, { format: { bold: true }, keepNext: true });
        line(paragraph.text, {
          ...(paragraph.marks !== undefined ? { trail: MARK_SCHEME_WORDING.mark(paragraph.marks) } : {}),
          ...(paragraph.segments ? { segments: paragraph.segments } : {}),
        });
        figures(paragraph.blocks ?? []);
      },
    );
  }
  (schemeDisplay(scheme) === 'paragraph' ? [] : routes).forEach((route, routeIndex) => {
    if (routeIndex > 0) line(MARK_SCHEME_WORDING.or, { format: { bold: true }, keepNext: true });
    routeGroups(route).forEach((group: MarkGroup) => {
      const all = groupPoints(group);
      const heading = groupHeading(group);
      if (heading || (at && options.editing && group.heading)) {
        line(heading ?? empty, {
          format: { underline: true },
          keepNext: true,
          ...(heading ? {} : { editOnly: true as const }),
          ...(at ? { edit: { kind: 'schemeHeading', ...at, groupId: group.id } } : {}),
        });
      }
      if (!all.some(pointHasContent)) return;
      // On an editing page an empty point keeps its line, to be typed in (`editOnly`).
      const points = all.filter((point) => pointHasContent(point) || (options.editing && at));
      const take = positive(group.take) ? group.take : undefined;
      const each = positive(group.each) ? group.each : undefined;
      if (take !== undefined || each !== undefined) {
        line(take !== undefined ? MARK_SCHEME_WORDING.any(take) : MARK_SCHEME_WORDING.each, {
          keepNext: true,
          ...(each !== undefined ? { trail: MARK_SCHEME_WORDING.at(each) } : {}),
        });
      }
      if (take !== undefined && group.firstOnly) {
        line(MARK_SCHEME_WORDING.firstOnly(take), { format: { italic: true }, keepNext: true });
      }
      points.forEach((point) => {
        // Under `n@` the lead line states the value once; a point's own mark would
        // contradict it, so only an unallocated group prints marks per point.
        const marks = each === undefined && typeof point.marks === 'number' ? point.marks : undefined;
        // A figure-only point (k-0595) prints its line for the mark beside it; with no mark
        // either, the line is only a place to type, and the figure prints alone.
        line(withAlternatives(point), {
          ...(hasWording(point) || marks !== undefined && pointBlocksOf(point).length > 0 ? {} : { editOnly: true as const }),
          ...(marks !== undefined ? { trail: MARK_SCHEME_WORDING.mark(marks) } : {}),
          ...(at
            ? (point.alternatives ?? []).length > 0
              ? { segments: alternativeSegments(point, at) }
              : { edit: { kind: 'schemePoint', ...at, pointId: point.id } }
            : {}),
        });
        figures(pointBlocksOf(point));
      });
      if (typeof group.max === 'number' && group.max >= 0) {
        line(empty, { trail: MARK_SCHEME_WORDING.max(group.max) });
      }
    });
  });

  const levels = schemeLevels(scheme);
  if (levels.length > 0) {
    line(MARK_SCHEME_WORDING.levels, { format: { bold: true }, keepNext: true });
    levels.forEach((level, index) => {
      const label = MARK_SCHEME_WORDING.level(index + 1);
      const descriptor = level.descriptor ?? empty;
      const lead = (side: 'en' | 'zh') => [{ text: label[side][0].text, bold: true }];
      const edit: EditTarget | undefined = at && { kind: 'schemeLevel', ...at, levelId: level.id };
      line(
        {
          en: [...lead('en'), ...(descriptor.en ?? [])],
          zh: [...lead('zh'), ...(descriptor.zh ?? [])],
        },
        {
          trail: MARK_SCHEME_WORDING.range(level.min, level.max),
          // The "Level 1: " lead is derived; only the descriptor after it is typed.
          ...(edit
            ? {
                segments: {
                  en: [{ runs: lead('en') }, { edit, value: descriptor }],
                  zh: [{ runs: lead('zh') }, { edit, value: descriptor }],
                },
              }
            : {}),
        },
      );
    });
  }

  if (scheme.ec && !options.omitEc) {
    line(MARK_SCHEME_WORDING.ec, {
      format: { bold: true },
      keepNext: true,
      trail: MARK_SCHEME_WORDING.max(scheme.ec.max),
    });
    for (const row of scheme.ec.descriptors ?? []) {
      line(row.text ?? empty, {
        trail: MARK_SCHEME_WORDING.mark(row.marks),
        ...(at ? { edit: { kind: 'schemeEc', ...at, descriptorId: row.id } } : {}),
      });
    }
  }

  return nodes;
}
