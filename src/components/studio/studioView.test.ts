import { describe, expect, it } from 'vitest';
import { INVENTED } from '@/questionStudio/fixtures';
import type { SheetDraft } from '@/questionStudio/session';
import type { CheckRow, StudioDraft } from '@/questionStudio/types';
import { draftItem, explanationLines, keyPointGroups, rankKeyPoints, syllabusName, keyPointOfTags, letterOf, rowOf, stemLines, tokenCount } from './studioView';

const [A, , C] = INVENTED;
const entry = (id: string, source = A, status: StudioDraft['status'] = 'ok', checks: CheckRow[] = []): SheetDraft => ({
  draft: {
    id,
    draft: { kind: 'mcq', stem: source.stem, statements: source.statements, options: source.options, answerIndex: source.answer, explanation: source.explanation },
    angle: source.angle,
    status,
    checks,
    attempt: 1,
  },
  request: { keyPoint: 'C.ped', points: [], examples: [], count: 1, level: 'same', shape: 'any', sides: ['en', 'zh'], note: '' },
});

describe('the key point list', () => {
  it('is every topic of the syllabus with its key points, named in the studio’s language (k-0500)', () => {
    const en = keyPointGroups('en');
    const zh = keyPointGroups('zh');
    expect(en).toHaveLength(12);
    expect(en.reduce((n, g) => n + g.options.length, 0)).toBe(53);
    const ped = en.flatMap((g) => g.options).find((o) => o.code === 'C.ped');
    expect(ped?.name).toBe('Price elasticity of demand');
    expect(zh.flatMap((g) => g.options).find((o) => o.code === 'C.ped')?.name).toBe('需求價格彈性');
    expect(en.every((g) => g.name && g.options.every((o) => o.name))).toBe(true);
    expect(zh.find((g) => g.code === 'C')?.name).toBe('市場與價格');
  });

  it('names both sides for both languages', () => {
    const both = keyPointGroups('both');
    expect(both.flatMap((g) => g.options).find((o) => o.code === 'C.ped')?.name).toBe('Price elasticity of demand 需求價格彈性');
  });
});

describe('a syllabus name', () => {
  it('reads one side, both, or English where the asked side is empty', () => {
    expect(syllabusName({ en: 'Law of demand', zh: '需求定律' }, 'zh')).toBe('需求定律');
    expect(syllabusName({ en: 'Law of demand', zh: '需求定律' }, 'en')).toBe('Law of demand');
    expect(syllabusName({ en: 'Law of demand', zh: '需求定律' }, 'both')).toBe('Law of demand 需求定律');
    expect(syllabusName({ en: 'GDP', zh: '' }, 'zh')).toBe('GDP');
    expect(syllabusName({ en: 'GDP', zh: 'GDP' }, 'both')).toBe('GDP');
  });
});

describe('the key point a question names', () => {
  it('is its first topic tag; a pattern tag counts by its topic; a point or a free tag does not', () => {
    expect(keyPointOfTags(['C.ped', 'D.market'])).toBe('C.ped');
    expect(keyPointOfTags(['some free tag', 'C.ped::unit'])).toBe('C.ped');
    expect(keyPointOfTags(['C.ped#arc'])).toBeUndefined();
    expect(keyPointOfTags(['nonsense'])).toBeUndefined();
    expect(keyPointOfTags(undefined)).toBeUndefined();
    expect(keyPointOfTags([])).toBeUndefined();
  });
});

describe('the sheet', () => {
  it('draws a draft saved as failed before k-0531 like any other: nothing is left out', () => {
    expect(draftItem(entry('b', A, 'failed'))?.question.type).toBe('mcq');
  });

  it('draws a draft as the Past paper card does: one multiple-choice question with its four options and key', () => {
    const item = draftItem(entry('a', C));
    expect(item?.question.type).toBe('mcq');
    expect((item?.question as { options: unknown[] }).options).toHaveLength(4);
    expect((item?.question as { answerIndex: number }).answerIndex).toBe(C.answer);
    expect(item?.source.tag).toBe('');
  });

  it('reads the explanation and the stem as plain lines, one per side written', () => {
    const d = entry('a').draft.draft;
    expect(explanationLines(d, ['en'])).toEqual([A.explanation.en]);
    expect(explanationLines(d, ['en', 'zh'])).toHaveLength(2);
    expect(stemLines(d, ['zh'])).toEqual([A.stem.zh]);
    expect(stemLines({ ...d, stem: { en: 'Which is **NOT** true?', zh: '' } }, ['en', 'zh'])).toEqual(['Which is NOT true?']);
  });

  it('finds a check row by id', () => {
    const checks: CheckRow[] = [{ id: 'key', state: 'look', findings: [{ id: 'key.differs' }] }];
    expect(rowOf(entry('a', A, 'look', checks).draft, 'key')?.state).toBe('look');
    expect(rowOf(entry('a').draft, 'copy')).toBeUndefined();
  });

  it('names the key letters and counts tokens briefly', () => {
    expect([0, 1, 2, 3, 4].map(letterOf)).toEqual(['A', 'B', 'C', 'D', '?']);
    expect([0, 999, 1000, 18_420, 99_950, 1_250_000].map(tokenCount)).toEqual(['0', '999', '1k', '18.4k', '100k', '1250k']);
  });
});

describe('the key point list, ranked by how often HKDSE asks', () => {
  const groups = keyPointGroups('en');
  const found = (counts: Record<string, number>) => ({ counts: new Map(Object.entries(counts)), questions: 40, years: [2012, 2026] as const });

  it('is the syllabus’s own list, nothing folded, while there are no counts', () => {
    const ranked = rankKeyPoints(groups, undefined);
    expect(ranked.groups).toEqual(groups);
    expect(ranked.folded).toEqual([]);
  });

  it('carries each count, sorts key points and topics by them, and folds the key points never asked', () => {
    const ranked = rankKeyPoints(groups, found({ 'C.ped': 9, 'C.equilibrium': 38, 'I.fiscal': 52, 'A.scarcity': 2 }));
    expect(ranked.groups.map((g) => g.code)).toEqual(['I', 'C', 'A']);
    expect(ranked.groups[1].options.map((o) => [o.code, o.count])).toEqual([['C.equilibrium', 38], ['C.ped', 9]]);
    const folded = ranked.folded.flatMap((g) => g.options.map((o) => o.code));
    expect(folded).toContain('C.law-of-demand');
    expect(folded).toContain('EL1.pricing');
    expect(folded).not.toContain('C.ped');
    expect(ranked.groups.flatMap((g) => g.options).length + folded.length).toBe(53);
  });

  it('keeps the chosen key point in the list even when HKDSE has never asked it', () => {
    const ranked = rankKeyPoints(groups, found({ 'C.ped': 9 }), 'A.specialization');
    expect(ranked.groups.flatMap((g) => g.options).map((o) => o.code)).toContain('A.specialization');
    expect(ranked.folded.flatMap((g) => g.options).map((o) => o.code)).not.toContain('A.specialization');
  });
});
