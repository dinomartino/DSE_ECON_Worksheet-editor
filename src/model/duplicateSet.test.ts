import { describe, expect, it } from 'vitest';
import { bumpYears, duplicateSetName, duplicateSetPapers, setYearTexts, yearChange } from './duplicateSet';
import { createMockSet } from './mockSet';
import { paperSetOf } from './paperSet';
import { paperDetails, withDetails } from './setDetails';
import { plain } from './text';
import type { Worksheet } from './types';

describe('bumpYears', () => {
  it.each([
    ['S6 Mock 2026-27', 'S6 Mock 2027-28'],
    ['2026/2027 Mock', '2027/2028 Mock'],
    ['中六模擬考試 2026–27', '中六模擬考試 2027–28'],
    ['2027-DSE / ECON / PAPER 1', '2028-DSE / ECON / PAPER 1'],
    ['S.6 MOCK EXAMINATION 2027', 'S.6 MOCK EXAMINATION 2028'],
    ['2099-00', '2100-01'],
    ['No year here', 'No year here'],
    ['Room 12027', 'Room 12027'],
  ])('%s → %s', (from, to) => expect(bumpYears(from)).toBe(to));

  it('finds the first year to offer', () => {
    expect(yearChange(['S6 Mock', 'Paper 1 2026-27'])).toEqual({ from: '2026-27', to: '2027-28' });
    expect(yearChange(['S6 Mock'])).toBeUndefined();
  });

  it('suggests a name', () => {
    expect(duplicateSetName('S6 Mock 2026-27', 'en')).toBe('S6 Mock 2027-28');
    expect(duplicateSetName('S6 Mock', 'en')).toBe('S6 Mock (copy)');
    expect(duplicateSetName('中六 Mock', 'zh-HK')).toBe('中六 Mock（副本）');
  });
});

describe('duplicateSetPapers', () => {
  const made = () => {
    const { chosen, blank } = createMockSet({
      documentType: 'paper1',
      name: 'S6 Mock 2026-27 Paper 1',
      coverDetails: { school: 'St Mary College', examName: 'S.6 MOCK EXAMINATION 2026-27' },
    });
    const dated = (w: Worksheet) => withDetails(w, { satOn: '2027-02-10', classes: ['6A'] });
    return [dated(chosen), dated(blank)];
  };
  let n = 0;
  const newId = () => `copy-${(n += 1)}`;

  it('copies every paper into one new set, the years moved on', () => {
    const papers = made();
    const copies = duplicateSetPapers(papers, { set: { id: 'set-2', name: 'S6 Mock 2027-28' }, bumpYear: true, lang: 'en', newId });
    expect(copies).toHaveLength(2);
    expect(new Set(copies.map((c) => c.id)).size).toBe(2);
    expect(copies.every((c) => !papers.some((p) => p.id === c.id))).toBe(true);
    expect(copies.map((c) => paperSetOf(c))).toEqual([
      { id: 'set-2', name: 'S6 Mock 2027-28' },
      { id: 'set-2', name: 'S6 Mock 2027-28' },
    ]);
    expect(copies.map((c) => c.name)).toEqual(['S6 Mock 2027-28 Paper 1', 'S6 Mock 2027-28 Paper 2']);
    expect(paperDetails(copies[0]).exam?.en).toBe('S.6 MOCK EXAMINATION 2027-28');
    expect(paperDetails(copies[0]).school?.en).toBe('St Mary College');
    // A new sitting: no date, no classes.
    expect(copies[0]).not.toHaveProperty('satOn');
    expect(copies[0]).not.toHaveProperty('classes');
    // Questions are copied as they are.
    expect(copies[0].questions).toEqual(papers[0].questions);
    // The originals are untouched.
    expect(paperDetails(papers[0]).exam?.en).toBe('S.6 MOCK EXAMINATION 2026-27');
    expect(paperSetOf(papers[0])?.id).not.toBe('set-2');
  });

  it('without the year change, names say (copy) and covers stay', () => {
    const papers = made();
    const copies = duplicateSetPapers(papers, { set: { id: 'set-3', name: 'Again' }, bumpYear: false, lang: 'en', newId });
    expect(copies.map((c) => c.name)).toEqual(['S6 Mock 2026-27 Paper 1 (copy)', 'S6 Mock 2026-27 Paper 2 (copy)']);
    expect(copies[0].cover).toEqual(papers[0].cover);
    expect(plain(copies[0].title.en)).toBe(plain(papers[0].title.en));
  });

  it('looks for years in the set name, names, titles and covers', () => {
    const texts = setYearTexts('S6 Mock', made());
    expect(yearChange(texts)).toEqual({ from: '2026-27', to: '2027-28' });
  });
});
