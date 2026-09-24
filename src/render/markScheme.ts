import {
  groupPoints,
  isSchemeEmpty,
  routeGroups,
  schemeLevels,
  schemeRoutes,
} from '@/model/markScheme';
import type { MarkGroup, MarkPoint, MarkScheme } from '@/model/markSchemeTypes';
import { bi, isBiTextEmpty } from '@/model/text';
import type { BiText, RichText } from '@/model/types';
import type { TextNode } from './ir';

/**
 * A marking scheme as IR, in HKEAA layout: one paragraph per point with its mark in the
 * marks column ("(1)", `TextNode.trail`), `/` between accepted wordings, a lead line for
 * "any N" / `n@`, "[Mark the FIRST N points only.]", a `max: N` line closing a capped
 * group, "OR" between routes, then level descriptors and the EC table.
 *
 * Emitted once and read by all three backends; the paper's teacher version and the
 * answer key both call it. Derived text only — nothing here carries an edit target.
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
      ? bi('[Mark the FIRST point only.]', '［只評閱第一點。］')
      : bi(`[Mark the FIRST ${wordEn(n)} points only.]`, `［只評閱首${wordZh(n)}點。］`),
  at: (n: number) => bi(`${n}@`, `${n}@`),
  max: (n: number) => bi(`max: ${n}`, `最高${n}分`),
  mark: (n: number) => bi(`(${n})`, `(${n})`),
  range: (min: number, max: number) =>
    bi(min === max ? `(${min})` : `(${min}–${max})`, min === max ? `(${min})` : `(${min}–${max})`),
  levels: bi('Levels of performance', '表現等級'),
  level: (n: number) => bi(`Level ${n}: `, `第${n}級：`),
  ec: bi('Effective communication (EC)', '有效傳意（EC）'),
} as const;

export interface MarkSchemeRenderOptions {
  /** The text column the scheme sits at, in twips (the leaf's answer column). */
  indent?: number;
  /** True on the paper, where the scheme is teacher-version only. */
  teacherOnly?: boolean;
}

/** `text / alternative / alternative`, side by side, skipping a side's empty wordings. */
function withAlternatives(point: MarkPoint): BiText {
  const join = (side: 'en' | 'zh'): RichText => {
    const wordings = [point.text, ...(point.alternatives ?? [])]
      .map((text) => text?.[side] ?? [])
      .filter((runs) => runs.some((run) => run.text.trim().length > 0));
    return wordings.flatMap((runs, index) => (index === 0 ? runs : [{ text: ' / ' }, ...runs]));
  };
  return { en: join('en'), zh: join('zh') };
}

function hasWording(point: MarkPoint): boolean {
  return !isBiTextEmpty(point.text) || (point.alternatives ?? []).some((alt) => !isBiTextEmpty(alt));
}

const positive = (value: number | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

export function renderMarkScheme(
  scheme: MarkScheme | undefined,
  options: MarkSchemeRenderOptions = {},
): TextNode[] {
  if (!scheme || isSchemeEmpty(scheme)) return [];
  const nodes: TextNode[] = [];
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

  const routes = schemeRoutes(scheme).filter((route) =>
    routeGroups(route).some((group) => groupPoints(group).some(hasWording)),
  );
  routes.forEach((route, routeIndex) => {
    if (routeIndex > 0) line(MARK_SCHEME_WORDING.or, { format: { bold: true }, keepNext: true });
    routeGroups(route).forEach((group: MarkGroup) => {
      const points = groupPoints(group).filter(hasWording);
      if (points.length === 0) return;
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
        line(withAlternatives(point), marks !== undefined ? { trail: MARK_SCHEME_WORDING.mark(marks) } : {});
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
      line(
        {
          en: [{ text: label.en[0].text, bold: true }, ...(descriptor.en ?? [])],
          zh: [{ text: label.zh[0].text, bold: true }, ...(descriptor.zh ?? [])],
        },
        { trail: MARK_SCHEME_WORDING.range(level.min, level.max) },
      );
    });
  }

  if (scheme.ec) {
    line(MARK_SCHEME_WORDING.ec, {
      format: { bold: true },
      keepNext: true,
      trail: MARK_SCHEME_WORDING.max(scheme.ec.max),
    });
    for (const row of scheme.ec.descriptors ?? []) {
      line(row.text ?? empty, { trail: MARK_SCHEME_WORDING.mark(row.marks) });
    }
  }

  return nodes;
}
