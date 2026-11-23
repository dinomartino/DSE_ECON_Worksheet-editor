import type { Manifest } from '@/pastpapers/pack';
import { lookupCode, SYLLABUS } from '@/syllabus';

/**
 * How often HKDSE asks each syllabus key point (u-uugw/u-7jvk: DSE counts beside each key
 * point, sorted by them, key points DSE never asks folded away). Counted from the Past paper
 * bank's search index: one HKDSE multiple-choice question per row (a sitting with a year;
 * sample and practice papers and the older HKCEE/HKALE questions are not what "DSE tests"
 * means). A question belongs to the key points its topic names in the manifest
 * (`TopicEntry.syllabus`); a topic that names a whole syllabus topic ("G") stands for each key
 * point of it, and a topic naming several key points shares each question among them evenly,
 * so the counts are close, not exact.
 */

export interface KeyPointCounts {
  /** Key point code → questions (fractional where a topic is shared). */
  counts: ReadonlyMap<string, number>;
  /** HKDSE questions counted. */
  questions: number;
  /** The first and last HKDSE year seen. */
  years: readonly [number, number] | null;
}

/** The key points a manifest syllabus code stands for: itself, its key point, or all of a topic's. */
export function keyPointsOfCode(code: string): string[] {
  const hit = lookupCode(code);
  if (hit) return [hit.keyPoint.code];
  const topic = SYLLABUS.topics.find((t) => t.code === code);
  return topic ? topic.keyPoints.map((k) => k.code) : [];
}

export function keyPointCounts(manifest: Pick<Manifest, 'topics' | 'search'> | undefined): KeyPointCounts | undefined {
  const rows = manifest?.search;
  if (!manifest || !rows || rows.length === 0) return undefined;
  const shared = new Map(manifest.topics.map((t) => [t.id, [...new Set((t.syllabus ?? []).flatMap(keyPointsOfCode))]]));
  const counts = new Map<string, number>();
  let questions = 0;
  let first = Infinity;
  let last = -Infinity;
  for (const row of rows) {
    if (row.source.exam !== 'HKDSE' || row.source.year === undefined) continue;
    const points = shared.get(row.topicId) ?? [];
    questions += 1;
    first = Math.min(first, row.source.year);
    last = Math.max(last, row.source.year);
    for (const code of points) counts.set(code, (counts.get(code) ?? 0) + 1 / points.length);
  }
  if (questions === 0) return undefined;
  return { counts, questions, years: [first, last] };
}

/** Whole questions for display (a shared topic's halves round). */
export const countOf = (found: KeyPointCounts | undefined, code: string): number => Math.round(found?.counts.get(code) ?? 0);
