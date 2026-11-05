import { HKDSE_ECON_2025 } from './hkdse2025.data';
import type { SyllabusData, SyllabusKeyPoint, SyllabusPoint, SyllabusTopic } from './types';

export type { SyllabusData, SyllabusKeyPoint, SyllabusPoint, SyllabusTopic } from './types';

/** The edition the coverage check uses (the 2025 guide, first examined in 2028). */
export const SYLLABUS: SyllabusData = HKDSE_ECON_2025;

/** Where a code sits: always a topic and key point; a point only for a `#` code. */
export interface CodeHit {
  topic: SyllabusTopic;
  keyPoint: SyllabusKeyPoint;
  point?: SyllabusPoint;
}

const index = new Map<string, CodeHit>();
for (const topic of SYLLABUS.topics) {
  for (const keyPoint of topic.keyPoints) {
    index.set(keyPoint.code, { topic, keyPoint });
    for (const point of keyPoint.points) index.set(point.code, { topic, keyPoint, point });
  }
}

/** A key-point (`C.ped`) or point (`C.ped#arc`) code of this edition; anything else, undefined. */
export function lookupCode(code: string): CodeHit | undefined {
  return index.get(code);
}

export const isElective = (topic: SyllabusTopic): boolean => topic.part === 'elective';

/**
 * Lesson hours of one key point: its topic's hours spread over the topic's key points by
 * how many points each holds (the guide gives hours per topic only, p. 23).
 */
export function keyPointHours(topic: SyllabusTopic, keyPoint: SyllabusKeyPoint): number {
  const points = topic.keyPoints.reduce((n, kp) => n + kp.points.length, 0);
  return points === 0 ? 0 : (topic.hours * keyPoint.points.length) / points;
}
