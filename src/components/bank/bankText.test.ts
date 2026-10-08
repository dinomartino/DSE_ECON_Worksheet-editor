import { describe, expect, it } from 'vitest';
import { allOf, countOf, diffSnippet, rowExcerpt, versionDiff } from './bankText';

describe('counts agree with their noun', () => {
  it('says one and many', () => {
    expect(countOf(1, 'sub-topic')).toBe('1 sub-topic');
    expect(countOf(2, 'sub-topic')).toBe('2 sub-topics');
    expect(countOf(0, 'question')).toBe('0 questions');
    expect(countOf(1, 'copy', 'copies')).toBe('1 copy');
    expect(countOf(3, 'copy', 'copies')).toBe('3 copies');
  });

  it('says both for two, never "all 2"', () => {
    expect(allOf(2, 'copies')).toBe('both copies');
    expect(allOf(3, 'copies')).toBe('all 3 copies');
    expect(allOf(12, 'questions')).toBe('all 12 questions');
  });
});

describe('what an edited version changed', () => {
  const was = 'The price of a concert ticket falls by 20% and the quantity demanded rises by 10%. The price elasticity of demand is';
  const now = 'The price of a concert ticket falls by 25% and the quantity demanded rises by 10%. The price elasticity of demand is';

  it('quotes the changed words with a word either side', () => {
    expect(diffSnippet(now, was)).toBe('…by 25% and…');
    expect(diffSnippet(was, now)).toBe('…by 20% and…');
  });

  it('shows the neighbours of a deleted word, and a change at either end', () => {
    expect(diffSnippet('a b d', 'a b c d')).toBe('…b d');
    expect(diffSnippet('Which is true?', 'Which is false?')).toBe('…is true?');
    expect(diffSnippet('Explain why', 'State why')).toBe('Explain why');
  });

  it('cuts a long change short', () => {
    const long = diffSnippet('x 1 2 3 4 5 6 7 8 9 10 11 12 y', 'x y', 4);
    expect(long).toBe('x 1 2 3…');
  });

  it('compares 中文 character by character', () => {
    expect(diffSnippet('價格下跌25%', '價格下跌20%')).toBe('…25%');
  });

  it('is nothing when the two read the same', () => {
    expect(diffSnippet(was, was)).toBeUndefined();
    expect(versionDiff({ excerpt: { en: was, zh: '' } }, { excerpt: { en: was, zh: '' } }, 'en')).toBe('Edited further down');
  });

  it('reads the language the list shows, falling back to the other', () => {
    const a = { excerpt: { en: now, zh: '價格下跌25%' } };
    const b = { excerpt: { en: was, zh: '價格下跌20%' } };
    expect(versionDiff(a, b, 'zh')).toBe('Says “…25%”');
    expect(versionDiff(a, b, 'bilingual')).toBe('Says “…by 25% and…”');
    expect(versionDiff({ excerpt: { en: '', zh: '甲乙' } }, { excerpt: { en: '', zh: '甲丙' } }, 'en')).toBe('Says “甲乙”');
  });

  it('says a version was reworded when it shares neither its start nor its end', () => {
    const other = { excerpt: { en: 'When the price of a good rises from $10 to $12, total revenue rises.', zh: '' } };
    expect(versionDiff({ excerpt: { en: now, zh: '' } }, other, 'en')).toBe('Reworded');
  });
});

describe('a row reads in the view language', () => {
  const both = { excerpt: { en: 'Demand rises', zh: '需求上升' } };

  it('picks the view side, English first for both languages', () => {
    expect(rowExcerpt(both, 'zh')).toBe('需求上升');
    expect(rowExcerpt(both, 'en')).toBe('Demand rises');
    expect(rowExcerpt(both, 'bilingual')).toBe('Demand rises');
  });

  it('falls back to the other side only when the view side is empty', () => {
    expect(rowExcerpt({ excerpt: { en: 'Demand rises', zh: '' } }, 'zh')).toBe('Demand rises');
    expect(rowExcerpt({ excerpt: { en: '', zh: '需求上升' } }, 'en')).toBe('需求上升');
    expect(rowExcerpt({ excerpt: { en: '', zh: '需求上升' } }, 'bilingual')).toBe('需求上升');
  });
});
