import { newId } from './factories';
import { createMarkEc, HKEAA_EC_MAX } from './markScheme';
import type { MarkGroup, MarkPoint, MarkScheme } from './markSchemeTypes';
import { bi, emptyBiText } from './text';
import type { BiText } from './types';

/**
 * Starting points for a part's marking scheme, in the shapes HKEAA's DSE Economics schemes
 * use for a data-response question (k-0475; 2022–2026 Paper 2, the 2026 marking scheme):
 * each one a whole scheme sized to the marks the paper prints for the part, so a teacher
 * picks the shape and types the words. Everything stays editable afterwards; a pattern is
 * only a first draft, never remembered.
 *
 * The headings are printed text, so they carry HKEAA's own wording in both languages.
 */

export type SchemePatternId = 'points' | 'reasons' | 'paragraph' | 'explainDiagram' | 'essay';

export const SCHEME_PATTERN_IDS: readonly SchemePatternId[] = [
  'points',
  'reasons',
  'paragraph',
  'explainDiagram',
  'essay',
];

/** HKEAA's group headings, as its 2026 marking scheme prints them. */
export const SCHEME_HEADINGS = {
  reasons: bi('Possible reasons:', '可能理由：'),
  verbal: bi('Verbal elaboration:', '文字說明：'),
  diagram: bi('Indicate in the figure:', '在圖中顯示：'),
  achieve: bi('How the objective may be achieved:', '如何達成目標：'),
  limit: bi('Possible factors that may limit the effectiveness:', '可能限制有效達成目標的因素：'),
} as const satisfies Record<string, BiText>;

const point = (marks?: number): MarkPoint =>
  marks === undefined ? { id: newId(), text: emptyBiText() } : { id: newId(), text: emptyBiText(), marks };

const group = (points: MarkPoint[], extra: Partial<MarkGroup> = {}): MarkGroup => ({
  id: newId(),
  ...extra,
  points,
});

const scheme = (groups: MarkGroup[], extra: Partial<MarkScheme> = {}): MarkScheme => ({
  routes: [{ id: newId(), groups }],
  ...extra,
});

const whole = (marks: number | undefined, fallback: number) =>
  typeof marks === 'number' && Number.isFinite(marks) && marks > 0 ? Math.round(marks) : fallback;

/**
 * How a pattern divides `marks` (the part's printed marks), for the panel's hint and the
 * scheme it builds. Every pattern's derived total equals `marks` (`schemeMax`), except
 * `reasons` on an odd mark, which the panel's mismatch pill then reports.
 */
export interface PatternPlan {
  total: number;
  points?: number;
  each?: number;
  take?: number;
  max?: number;
  verbal?: number;
  diagram?: number;
  ec?: number;
  content?: number;
}

export function patternPlan(id: SchemePatternId, marks: number | undefined): Required<PatternPlan> {
  const plan = planFor(id, marks);
  return {
    points: 0, each: 0, take: 0, max: 0, verbal: 0, diagram: 0, ec: 0, content: 0,
    ...plan,
  };
}

function planFor(id: SchemePatternId, marks: number | undefined): PatternPlan {
  const total = whole(marks, id === 'essay' ? 14 : id === 'reasons' ? 4 : 3);
  switch (id) {
    case 'points':
      return { total, points: total };
    case 'reasons': {
      const take = Math.max(1, Math.floor(total / 2));
      return { total, each: 2, take, max: take * 2 };
    }
    case 'paragraph':
      return { total };
    case 'explainDiagram': {
      const diagram = Math.max(1, Math.ceil(total / 2));
      return { total, verbal: Math.max(1, total - diagram), diagram };
    }
    case 'essay': {
      const ec = total > HKEAA_EC_MAX ? HKEAA_EC_MAX : 0;
      return { total, ec, content: total - ec };
    }
  }
}

/** A new scheme in the shape of pattern `id`, sized to `marks`. */
export function createSchemeFromPattern(id: SchemePatternId, marks: number | undefined): MarkScheme {
  switch (id) {
    case 'points': {
      const plan = patternPlan('points', marks);
      return scheme([group(Array.from({ length: plan.points }, () => point(1)))]);
    }
    case 'reasons': {
      // HKEAA's "2@ max: N [Mark the FIRST N points only.]": one point more than marked,
      // as its schemes list the accepted reasons beyond the ones a candidate is credited.
      const plan = patternPlan('reasons', marks);
      return scheme([
        group(
          Array.from({ length: plan.take + 1 }, () => point()),
          { heading: SCHEME_HEADINGS.reasons, each: plan.each, take: plan.take, firstOnly: true, max: plan.max },
        ),
      ]);
    }
    case 'paragraph': {
      const plan = patternPlan('paragraph', marks);
      return scheme([group([point(plan.total)])], { display: 'paragraph' });
    }
    case 'explainDiagram': {
      const plan = patternPlan('explainDiagram', marks);
      return scheme([
        group([point(plan.verbal)], { heading: SCHEME_HEADINGS.verbal }),
        group(Array.from({ length: plan.diagram }, () => point(1)), { heading: SCHEME_HEADINGS.diagram }),
      ]);
    }
    case 'essay': {
      const plan = patternPlan('essay', marks);
      return scheme(
        [
          group([point(), point()], { heading: SCHEME_HEADINGS.achieve }),
          group([point(), point()], { heading: SCHEME_HEADINGS.limit }),
        ],
        { contentMax: plan.content, ...(plan.ec > 0 ? { ec: createMarkEc() } : {}) },
      );
    }
  }
}
