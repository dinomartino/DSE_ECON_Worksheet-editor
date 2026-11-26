import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findMentor, OUT, readMentorTopics, renderModule } from '../../scripts/sync-mcq-topics.mjs';
import { MCQ_SECTION_ROWS } from './mcqTopics';
import { isMcqTag, MCQ_SCHEME, mcqTag, mcqTagKey, mcqTopic, schemeFor } from './topicSchemes';
import { topicOf } from './topics';

const mentor: string | undefined = findMentor();

describe('the bundled MCQ topics (k-0569)', () => {
  it('lists 72 topics in sections A–J, every key once', () => {
    expect(MCQ_SECTION_ROWS.map((section) => section.key)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']);
    const keys = MCQ_SCHEME.topics.map((topic) => topic.key);
    expect(keys).toHaveLength(72);
    expect(new Set(keys).size).toBe(72);
    for (const key of keys) expect(key).toMatch(/^[a-z0-9-]+$/);
  });

  it('maps every topic onto EDB codes this build knows', () => {
    for (const topic of MCQ_SCHEME.topics) {
      expect(topic.edb.length, topic.key).toBeGreaterThan(0);
      for (const code of topic.edb) expect(topicOf(code), `${topic.key} → ${code}`).toBeDefined();
      expect(topic.en.trim()).not.toBe('');
      expect(topic.zh.trim()).not.toBe('');
    }
  });

  it('keeps the site order: Circular Flow under F, right before GDP', () => {
    const f = MCQ_SECTION_ROWS.find((section) => section.key === 'F')!;
    expect(f.topics.map((topic) => topic.key).slice(0, 2)).toEqual(['circular-flow', 'gdp']);
  });

  it('reads and writes the @mcq: tag form', () => {
    expect(mcqTag('per-unit-tax')).toBe('@mcq:per-unit-tax');
    expect(mcqTagKey('@mcq:per-unit-tax')).toBe('per-unit-tax');
    expect(mcqTagKey('@mcq:Not A Key')).toBeUndefined();
    expect(mcqTagKey('C.ped')).toBeUndefined();
    expect(isMcqTag('@mcq:a-later-key')).toBe(true);
    expect(mcqTopic('a-later-key')).toBeUndefined();
    expect(schemeFor('mcq')).toBe('mcq');
    expect(schemeFor('structured')).toBe('mcq');
  });

  it.skipIf(!mentor)('matches DSEcon Mentor (scripts/sync-mcq-topics.mjs)', () => {
    expect(renderModule(readMentorTopics(mentor!))).toBe(readFileSync(OUT, 'utf8'));
  });
});
