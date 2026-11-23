import { describe, expect, it } from 'vitest';
import { INVENTED } from '@/questionStudio/fixtures';
import type { SheetDraft } from '@/questionStudio/session';
import type { CheckRow, StudioDraft } from '@/questionStudio/types';
import { draftItem, explanationLines, keyPointGroups, syllabusName, keyPointOfTags, letterOf, partition, rowOf, stemLines, tokenCount } from './studioView';

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
  it('keeps the usable drafts in order and sets the failed ones apart', () => {
    const { standing, leftOut } = partition([entry('a'), entry('b', A, 'failed'), entry('c', A, 'look')]);
    expect(standing.map((e) => e.draft.id)).toEqual(['a', 'c']);
    expect(leftOut.map((e) => e.draft.id)).toEqual(['b']);
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
