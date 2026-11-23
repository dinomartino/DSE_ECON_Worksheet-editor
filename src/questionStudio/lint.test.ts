import { describe, expect, it } from 'vitest';
import type { BiDraft, McqDraft } from '@/generate/types';
import { lintBatch, lintDraft } from './lint';

const t = (en: string, zh = en): BiDraft => ({ en, zh });
const mcq = (over: Omit<Partial<McqDraft>, 'options'> & { options: string[] }): McqDraft => ({
  kind: 'mcq',
  stem: t('Which of the following describes a normal good?'),
  statements: [],
  answerIndex: 0,
  explanation: t('Because.'),
  ...over,
  options: over.options.map((o) => t(o)),
});
const ids = (d: McqDraft) => lintDraft(d, ['en']).map((f) => f.id);

describe('lintDraft', () => {
  it('passes a plain, balanced question', () => {
    expect(ids(mcq({ options: ['Demand rises as income rises.', 'Demand falls as income rises.', 'Demand does not respond to price.', 'Demand rises when price rises.'], answerIndex: 0 }))).toEqual([]);
  });
  it('flags a key that is clearly the longest option', () => {
    expect(ids(mcq({ options: ['Quantity demanded rises a lot more than price falls.', 'It rises.', 'It falls.', 'It stays.'], answerIndex: 0 }))).toContain('lint.keyLongest');
  });
  it('flags options of very different length', () => {
    expect(ids(mcq({ options: ['Yes.', 'No.', 'Only when the government sets a price ceiling below the market price.', 'Never.'], answerIndex: 1 }))).toContain('lint.uneven');
  });
  it('flags "all of the above" and its Chinese forms', () => {
    expect(ids(mcq({ options: ['A rise.', 'A fall.', 'No change.', 'All of the above'], answerIndex: 0 }))).toContain('lint.allNone');
    const zh = mcq({ options: ['上升。', '下降。', '不變。', '以上皆是'], answerIndex: 0 });
    expect(lintDraft(zh, ['zh']).map((f) => f.id)).toContain('lint.allNone');
  });
  it('flags a negative question stem that is not in bold, and accepts bold', () => {
    expect(ids(mcq({ stem: t('Which of the following is not a function of money?'), options: ['A.', 'B.', 'C.', 'D.'] }))).toContain('lint.negativeStem');
    expect(ids(mcq({ stem: t('Which of the following is **NOT** a function of money?'), options: ['A.', 'B.', 'C.', 'D.'] }))).not.toContain('lint.negativeStem');
  });
  it('reads only the question sentence: a "not" in the scenario is fine', () => {
    expect(ids(mcq({ stem: t('A firm does not change its price. What is the likely effect on revenue?'), options: ['A.', 'B.', 'C.', 'D.'] }))).not.toContain('lint.negativeStem');
  });
  it('leaves the length cues alone on a combination item', () => {
    const d = mcq({ statements: [t('One.'), t('Two.'), t('Three.')], options: ['(1) and (2) only', '(1) and (3) only', '(2) and (3) only', '(1), (2) and (3)'], answerIndex: 3 });
    expect(ids(d)).toEqual([]);
  });
});

describe('lintBatch', () => {
  it('flags one letter on most of a batch of three or more', () => {
    expect(lintBatch([2, 2, 2])).toEqual([{ id: 'lint.keySpread', params: { letter: 'C', count: 3, of: 3 } }]);
    expect(lintBatch([1, 1, 1, 3, 0])).toHaveLength(1);
  });
  it('is quiet for a spread, a pair or two of a kind', () => {
    expect(lintBatch([0, 1, 2, 3, 1])).toEqual([]);
    expect(lintBatch([1, 1])).toEqual([]);
    expect(lintBatch([1, 1, 2, 3])).toEqual([]);
  });
});
