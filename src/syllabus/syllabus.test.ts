import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildSyllabusData, renderModule, SOURCE, TARGET } from '../../scripts/gen-syllabus.mjs';
import { isTopicCode, TOPICS } from '@/model/topics';
import { keyPointHours, lookupCode, SYLLABUS } from './index';

describe('the syllabus data module', () => {
  it('is what the generator writes from the research JSON (run node scripts/gen-syllabus.mjs)', () => {
    const json = JSON.parse(readFileSync(SOURCE, 'utf8'));
    expect(readFileSync(TARGET, 'utf8')).toBe(renderModule(buildSyllabusData(json)));
  });

  it('holds the 2025 guide: 12 topics, 53 key points, 130 points, 194 + 24 hours', () => {
    const keyPoints = SYLLABUS.topics.flatMap((t) => t.keyPoints);
    expect(SYLLABUS.topics).toHaveLength(12);
    expect(keyPoints).toHaveLength(53);
    expect(keyPoints.flatMap((k) => k.points)).toHaveLength(130);
    const compulsory = SYLLABUS.topics.filter((t) => t.part === 'compulsory');
    expect(compulsory.flatMap((t) => t.keyPoints)).toHaveLength(49);
    expect(compulsory.reduce((n, t) => n + t.hours, 0)).toBe(SYLLABUS.hours.compulsory);
    expect(SYLLABUS.hours).toEqual({ compulsory: 194, elective: 24 });
  });

  it('uses topics.ts codes for every topic and key point, and # point codes that are never tags', () => {
    const known = new Set(TOPICS.flatMap((t) => [t.code, ...t.children.map((s) => s.code)]));
    for (const topic of SYLLABUS.topics) {
      expect(known.has(topic.code)).toBe(true);
      for (const kp of topic.keyPoints) {
        expect(known.has(kp.code), kp.code).toBe(true);
        for (const p of kp.points) {
          expect(p.code.startsWith(`${kp.code}#`)).toBe(true);
          expect(isTopicCode(p.code)).toBe(false);
        }
      }
    }
  });

  it('looks codes up and spreads a topic\'s hours over its key points by points', () => {
    expect(lookupCode('C.ped')?.topic.code).toBe('C');
    expect(lookupCode('C.ped')?.point).toBeUndefined();
    expect(lookupCode('A.scarcity#scarcity')?.point?.en).toMatch(/scarcity/);
    expect(lookupCode('C')).toBeUndefined();
    expect(lookupCode('nope')).toBeUndefined();
    for (const topic of SYLLABUS.topics) {
      const sum = topic.keyPoints.reduce((n, kp) => n + keyPointHours(topic, kp), 0);
      expect(sum).toBeCloseTo(topic.hours, 9);
    }
  });
});
