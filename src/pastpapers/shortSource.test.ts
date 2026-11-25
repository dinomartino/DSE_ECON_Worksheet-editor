import { describe, expect, it } from 'vitest';
import { plain } from '@/model/text';
import { sourceTrail } from '@/render/questionSource';
import { shortSourceLabel, sourceLabel, sourceOf } from './pack';

/** The short source label (user u-rvgs, k-0556): the editor's existing Short form, built from the tag. */
describe('shortSourceLabel', () => {
  it.each([
    ['DSE2024/P1/Q38', 'DSE2024/P1/Q38'],
    ['CE1990/P2/Q47', 'CE1990/P2/Q47'],
    ['AL2005/P1/Q12', 'AL2005/P1/Q12'],
    ['DSESP/P1/Q13', 'DSESP/P1/Q13'],
    ['DSEPP/P1/Q5', 'DSEPP/P1/Q5'],
  ])('%s reads %s', (tag, label) => {
    expect(shortSourceLabel(sourceOf({ tags: [tag] }))).toBe(label);
  });

  it('is what a paper prints in Short, on both language sides', () => {
    for (const tag of ['DSE2024/P1/Q38', 'CE1990/P2/Q47', 'AL2005/P1/Q12', 'DSESP/P1/Q13', 'DSEPP/P1/Q5']) {
      const source = sourceOf({ tags: [tag] });
      const words = sourceLabel(source);
      const printed = sourceTrail({ en: [{ text: words.en }], zh: [{ text: words.zh }] }, 'short');
      expect(plain(printed.en)).toBe(`(${shortSourceLabel(source)})`);
      expect(plain(printed.zh)).toBe(`(${shortSourceLabel(source)})`);
    }
  });

  it('shows a tag it cannot read as it is', () => {
    expect(shortSourceLabel({ exam: 'other', tag: 'Mock 2024 Q3' })).toBe('Mock 2024 Q3');
    expect(shortSourceLabel(sourceOf({ tags: [] }))).toBe('');
  });
});
