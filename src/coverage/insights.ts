import { gaps, type CoverageReport, type KeyPointRow, type TopicRow } from './report';
import { BANDS, type Band } from './types';

/**
 * What a reader takes from a coverage report before the tables (k-0489 v2): each section's
 * key points tested, the best-covered sections, the sections not tested at all, the skills
 * the marks go to, and the largest gaps by lesson time. Pure and deterministic: the words
 * around it are the printed report's (`reportText`), never the AI's.
 */

export interface SectionLine {
  topic: TopicRow;
  hit: number;
  of: number;
  /** hit ÷ of; 0 when the section has no key points. */
  share: number;
}

export interface Insights {
  /** Every section shown, in guide order (an Elective Part not counted included, marked). */
  sections: SectionLine[];
  /** Up to two counted sections with the largest share tested (at least one key point). */
  best: SectionLine[];
  /** Counted sections with no key point tested. */
  untested: SectionLine[];
  /** Each skill's share of the tagged marks; null when no marks were tagged. */
  skills: Record<Band, number> | null;
  /** The skill most marks go to, when there are marks. */
  topSkill: Band | null;
  /** Untested key points with the most lesson hours, largest first (at most `limit`). */
  biggestGaps: Array<{ topic: TopicRow; keyPoint: KeyPointRow }>;
  /** Untested key points, all of them. */
  gapCount: number;
  /** Share of tagged marks the AI was not sure of (low confidence). */
  lowConfidence: number;
}

export function insights(report: CoverageReport, limit = 5): Insights {
  const sections = report.topics.map((topic) => {
    const hit = topic.keyPoints.filter((keyPoint) => keyPoint.hit).length;
    const of = topic.keyPoints.length;
    return { topic, hit, of, share: of ? hit / of : 0 };
  });
  const counted = sections.filter((s) => s.topic.counted);
  const best = counted
    .filter((s) => s.hit > 0)
    .sort((a, b) => b.share - a.share || b.hit - a.hit)
    .slice(0, 2);
  const untested = counted.filter((s) => s.hit === 0);

  const tagged = BANDS.reduce((n, band) => n + report.bands[band], 0);
  const skills = tagged > 0 ? (Object.fromEntries(BANDS.map((band) => [band, report.bands[band] / tagged])) as Record<Band, number>) : null;
  const topSkill = skills ? BANDS.reduce((top, band) => (skills[band] > skills[top] ? band : top), BANDS[0]) : null;

  const missing = gaps(report).flatMap(({ topic, keyPoints }) => keyPoints.map((keyPoint) => ({ topic, keyPoint })));
  const biggestGaps = [...missing].sort((a, b) => b.keyPoint.hours - a.keyPoint.hours).slice(0, limit);

  const confident = report.confidence.high + report.confidence.medium + report.confidence.low;
  return {
    sections,
    best,
    untested,
    skills,
    topSkill,
    biggestGaps,
    gapCount: missing.length,
    lowConfidence: confident > 0 ? report.confidence.low / confident : 0,
  };
}
