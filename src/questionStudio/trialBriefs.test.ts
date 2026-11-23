import { describe, expect, it } from 'vitest';
import { lookupCode, SYLLABUS } from '@/syllabus';
import { makeBrief, normalizeRequest } from './brief';
import { LIMITED_TERMS } from './guard';
import { TRIAL_BRIEFS, TRIAL_EXAMPLES, briefById, requestOfBrief } from './trialBriefs';
import { MAX_NOTE_CHARS } from './types';

const count = <T,>(items: readonly T[], pick: (item: T) => unknown, value: unknown) => items.filter((item) => pick(item) === value).length;

describe('the 30 invented briefs', () => {
  it('are thirty, in the order B01 to B30, each found by its id', () => {
    expect(TRIAL_BRIEFS).toHaveLength(30);
    expect(TRIAL_BRIEFS.map((brief) => brief.id)).toEqual(Array.from({ length: 30 }, (_, i) => `B${String(i + 1).padStart(2, '0')}`));
    for (const brief of TRIAL_BRIEFS) expect(briefById(brief.id)).toBe(brief);
    expect(briefById('B99')).toBeUndefined();
  });

  it('each name a key point of the syllabus’s compulsory part (the Paper 1 scope) and points that belong to it', () => {
    const compulsory = new Set(SYLLABUS.topics.filter((topic) => topic.part === 'compulsory').flatMap((topic) => topic.keyPoints.map((kp) => kp.code)));
    for (const brief of TRIAL_BRIEFS) {
      const hit = lookupCode(brief.keyPoint);
      expect(hit && !hit.point, `${brief.id} key point ${brief.keyPoint}`).toBe(true);
      expect(compulsory.has(brief.keyPoint), `${brief.id} is compulsory`).toBe(true);
      for (const point of brief.points ?? []) {
        const found = lookupCode(point);
        expect(found?.keyPoint.code, `${brief.id} point ${point}`).toBe(brief.keyPoint);
        expect(found?.point, `${brief.id} point ${point}`).toBeDefined();
      }
    }
  });

  it('each make a request the studio accepts and can brief the writer on', () => {
    for (const brief of TRIAL_BRIEFS) {
      const made = makeBrief(normalizeRequest(requestOfBrief(brief)));
      expect('error' in made, `${brief.id} brief`).toBe(false);
    }
  });

  it('are spread over the syllabus: a different place each time, ten topics, nothing asked twice', () => {
    const keyPoints = new Set(TRIAL_BRIEFS.map((brief) => brief.keyPoint));
    expect(keyPoints.size).toBeGreaterThanOrEqual(28);
    const topics = new Set(TRIAL_BRIEFS.map((brief) => lookupCode(brief.keyPoint)?.topic.code));
    expect([...topics].sort()).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']);
    const asked = TRIAL_BRIEFS.map((brief) => [brief.keyPoint, (brief.points ?? []).join(','), brief.shape, brief.language].join('|'));
    expect(new Set(asked).size).toBe(30);
  });

  it('cover both languages and either, every shape, and both easier and harder', () => {
    expect(count(TRIAL_BRIEFS, (b) => b.language, 'bilingual')).toBeGreaterThanOrEqual(10);
    expect(count(TRIAL_BRIEFS, (b) => b.language, 'en')).toBeGreaterThanOrEqual(6);
    expect(count(TRIAL_BRIEFS, (b) => b.language, 'zh')).toBeGreaterThanOrEqual(6);
    for (const shape of ['plain', 'combination', 'any'] as const) expect(count(TRIAL_BRIEFS, (b) => b.shape, shape), shape).toBeGreaterThanOrEqual(6);
    expect(count(TRIAL_BRIEFS, (b) => b.level, 'harder')).toBeGreaterThanOrEqual(4);
    expect(count(TRIAL_BRIEFS, (b) => b.level, 'easier')).toBeGreaterThanOrEqual(4);
  });

  it('ask the writer for 1, 3 or 5 and come to about ninety drafts, so the reading stays near two hours', () => {
    for (const brief of TRIAL_BRIEFS) expect([1, 3, 5]).toContain(brief.count);
    const drafts = TRIAL_BRIEFS.reduce((sum, brief) => sum + brief.count, 0);
    expect(drafts).toBeGreaterThanOrEqual(70);
    expect(drafts).toBeLessThanOrEqual(100);
  });

  it('press on the syllabus limits: at least a third of them ask for a key point the guard knows terms of', () => {
    const guarded = new Set(LIMITED_TERMS.map((term) => term.code));
    expect(TRIAL_BRIEFS.filter((brief) => guarded.has(brief.keyPoint)).length).toBeGreaterThanOrEqual(10);
  });

  it('use the Change line and the examples a few times, and the line fits', () => {
    const noted = TRIAL_BRIEFS.filter((brief) => brief.note);
    expect(noted.length).toBeGreaterThanOrEqual(4);
    for (const brief of noted) expect(brief.note!.length).toBeLessThanOrEqual(MAX_NOTE_CHARS);
    const withExample = TRIAL_BRIEFS.filter((brief) => brief.example);
    expect(withExample.length).toBeGreaterThanOrEqual(3);
    for (const brief of withExample) expect(requestOfBrief(brief).examples).toEqual([TRIAL_EXAMPLES[brief.example!]]);
    expect(requestOfBrief(TRIAL_BRIEFS[0]).examples).toEqual([]);
  });

  it('say what each is there to find out', () => {
    for (const brief of TRIAL_BRIEFS) expect(brief.probe.length, brief.id).toBeGreaterThan(8);
  });
});

describe('the example questions', () => {
  it('are well-formed items: four options, a key among them, statements 0 or 2–4, both languages written', () => {
    for (const example of Object.values(TRIAL_EXAMPLES)) {
      expect(example.options).toHaveLength(4);
      expect(example.answerIndex).toBeGreaterThanOrEqual(0);
      expect(example.answerIndex).toBeLessThan(4);
      expect([0, 2, 3, 4]).toContain(example.statements.length);
      for (const text of [example.stem, ...example.statements, ...example.options]) {
        expect(text.en.trim()).not.toBe('');
        expect(text.zh.trim()).not.toBe('');
      }
      expect(example.hasFigure).toBe(false);
    }
  });

  it('carry a label that is for the teacher and says nothing of a paper', () => {
    for (const example of Object.values(TRIAL_EXAMPLES)) expect(example.label).not.toMatch(/\b(19|20)\d\d\b|HKDSE|CE|AL|Paper|Q\d/);
  });
});
