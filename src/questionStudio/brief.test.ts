import { describe, expect, it } from 'vitest';
import { presetFor } from '@/ai/providers';
import { fakeGlossary } from '@/translate/fakeGlossary';
import { PAYLOAD_KEYS, briefPayload, examplePayload, keyPlan, makeBrief, normalizeRequest, sentSummary } from './brief';
import { EXAMPLE, REQUEST } from './fixtures';
import { buildWriteRequest, emptyJob, STUDIO_SYSTEM_PROMPT, WRITE_TASK_MARKER } from './prompt';
import { MAX_EXAMPLES } from './types';

const seeded = () => {
  let n = 7;
  return () => {
    n = (n * 9301 + 49297) % 233280;
    return n / 233280;
  };
};

describe('keyPlan', () => {
  it('gives each position once before repeating', () => {
    const plan = keyPlan(4, seeded());
    expect([...plan].sort()).toEqual([0, 1, 2, 3]);
    const five = keyPlan(5, seeded());
    expect(five).toHaveLength(5);
    const counts = [0, 1, 2, 3].map((p) => five.filter((x) => x === p).length);
    expect(Math.max(...counts)).toBe(2);
  });
});

describe('normalizeRequest', () => {
  it('clamps the count, caps examples and the note, keeps only the key point\'s own points', () => {
    const r = normalizeRequest({
      ...REQUEST,
      count: 99,
      examples: [EXAMPLE, EXAMPLE, EXAMPLE, EXAMPLE, EXAMPLE],
      note: ` ${'x'.repeat(900)} `,
      points: ['C.ped#arc', 'C.ped#arc', 'A.scarcity#choice-cost', 'nonsense'],
    });
    expect(r.count).toBe(5);
    expect(r.examples).toHaveLength(MAX_EXAMPLES);
    expect(r.note).toHaveLength(400);
    expect(r.points.every((p) => p.startsWith('C.ped#'))).toBe(true);
    expect(normalizeRequest({ ...REQUEST, count: 0 }).count).toBe(1);
  });
});

describe('makeBrief', () => {
  it('reads the key point, its points and its limits from the 2025 data', () => {
    const b = makeBrief(REQUEST);
    if ('error' in b) throw new Error('no brief');
    expect(b.topic.code).toBe('C');
    expect(b.keyPoint).toMatchObject({ code: 'C.ped', en: 'Price elasticity of demand' });
    expect(b.keyPoint.notRequired.length).toBeGreaterThan(0);
    expect(b.points.length).toBeGreaterThan(0);
    expect(b.keys).toHaveLength(3);
  });
  it('refuses an unknown key point, a point code and a request with no language', () => {
    expect(makeBrief({ ...REQUEST, keyPoint: 'Z.none' })).toEqual({ error: 'unknownKeyPoint' });
    expect(makeBrief({ ...REQUEST, keyPoint: 'C.ped#arc' })).toEqual({ error: 'unknownKeyPoint' });
    expect(makeBrief({ ...REQUEST, sides: [] })).toEqual({ error: 'noSides' });
  });
  it('narrows to the chosen points', () => {
    const all = makeBrief(REQUEST);
    const code = 'error' in all ? '' : all.points[0].code;
    const one = makeBrief({ ...REQUEST, points: [code] });
    expect('error' in one ? 0 : one.points.length).toBe(1);
  });
});

describe('what is sent', () => {
  const brief = () => {
    const b = makeBrief({ ...REQUEST, examples: [EXAMPLE], note: 'use property prices' }, seeded());
    if ('error' in b) throw new Error('no brief');
    return b;
  };

  it('the payload names only keys the form lists', () => {
    const payload = briefPayload(brief(), fakeGlossary(), false);
    expect(Object.keys(payload).filter((k) => !PAYLOAD_KEYS.includes(k))).toEqual([]);
    expect(Object.keys(payload)).toEqual(expect.arrayContaining(['task', 'make', 'languages', 'syllabus', 'glossary', 'examples', 'teacherNote']));
  });

  it('an example goes whole (stem, options, key) but never its label or id', () => {
    const request = buildWriteRequest(brief(), emptyJob(brief()), null, presetFor('gemini'), new AbortController().signal);
    const text = JSON.stringify(request);
    const user = request.turns.at(-1)!.content;
    expect(user).toContain('When the price of a pen rises');
    expect(user).toContain('"key":"B"');
    expect(text).not.toContain('EXAMPLE-LABEL');
    expect(text).not.toContain('2099');
    expect(text).not.toContain('BANK/ex1');
  });

  it('sends nothing from a bank question when none is picked, and says so', () => {
    const b = makeBrief(REQUEST);
    if ('error' in b) throw new Error('no brief');
    const payload = briefPayload(b, null, false);
    expect(payload.examples).toBeUndefined();
    expect(payload.teacherNote).toBeUndefined();
    expect(sentSummary(REQUEST)).toMatchObject({ examples: 0, exampleChars: 0, note: false, count: 3, level: 'same', sides: ['en', 'zh'] });
  });

  it('the summary counts what the payload carries', () => {
    const s = sentSummary({ ...REQUEST, examples: [EXAMPLE], note: 'x' });
    expect(s).toMatchObject({ keyPoint: 'C.ped', examples: 1, note: true });
    expect(s.exampleChars).toBe(JSON.stringify(examplePayload(EXAMPLE, ['en', 'zh'])).length);
    expect(s.limits).toBeGreaterThan(0);
  });

  it('writes only the sides the paper prints, and no key when the example has none', () => {
    const en = examplePayload({ ...EXAMPLE, answerIndex: -1 }, ['en']);
    expect(JSON.stringify(en)).not.toContain('當筆的價格');
    expect(en.key).toBeUndefined();
  });

  it('pins EDB terms only when the 中文 side is written', () => {
    const b = brief();
    const withZh = briefPayload(b, fakeGlossary(), false).glossary as string[];
    expect(Array.isArray(withZh)).toBe(true);
    const onlyEn = makeBrief({ ...REQUEST, sides: ['en'] }, seeded());
    if ('error' in onlyEn) throw new Error('no brief');
    expect(briefPayload(onlyEn, fakeGlossary(), false).glossary).toEqual([]);
  });

  it('the system prompt starts with the task marker and treats the JSON as data', () => {
    expect(STUDIO_SYSTEM_PROMPT.startsWith(WRITE_TASK_MARKER)).toBe(true);
    expect(STUDIO_SYSTEM_PROMPT).toMatch(/data/);
    expect(STUDIO_SYSTEM_PROMPT).toMatch(/notRequired/);
  });
});
