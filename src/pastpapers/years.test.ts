import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { UiLanguageOverride } from '@/i18n/language';
import type { LanguageMode } from '@/model/types';
import type { UiLanguage } from '@/settings/language';
import { PastPaperYearPicker, ViewSwitch } from '@/components/pastpapers/PastPaperYearPicker';
import { PAST_PAPER_SETTINGS } from './config';
import { matchItem, paperLabel, papersOf, sittingKey, sittingLabel, sourceLabel, sourceOf, whenLabel, type SourceInfo } from './pack';
import { compareByYear, groupByYear, sittingOfPaper, stepYearRow, yearRows, yearSelection } from './years';

/**
 * The Past paper bank by year (k-0497, user u-nlb5): every paper under its exam and year, read
 * off the source tags the bank already carries; HKDSE newest first, then HKCEE, then HKALE; a
 * year's questions in paper, then question-number order.
 */

const row = (tag: string, words = '') => {
  const source = sourceOf({ tags: [tag] });
  const label = sourceLabel(source);
  return { source, searchText: [words, label.en, label.zh, tag].join(' ').toLowerCase() };
};

// The live bank's shape in small: HKDSE years with the Practice and Sample papers, HKCEE (one
// paper, Paper 2), HKALE with two papers a year. Listed out of order, as the index is (by topic).
const ROWS = [
  row('CE1990/P2/Q1'),
  row('DSE2012/P1/Q3', 'demand curve'),
  row('AL2005/P2/Q4'),
  row('DSE2026/P1/Q2', 'elasticity'),
  row('DSESP/P1/Q1'),
  row('AL2005/P1/Q1'),
  row('DSE2026/P1/Q1', 'scarcity'),
  row('CE2011/P2/Q8'),
  row('DSEPP/P1/Q5'),
  row('AL2005/P1/Q2'),
  row('DSE2026/P1/Q10', 'money supply'),
  row('AL1999/P2/Q1'),
];

const NONE = { words: '', exams: [] as SourceInfo['exam'][] };

describe('the bank by year', () => {
  it('HKDSE newest first (2026 … 2012, then Practice, then Sample), then HKCEE, then HKALE', () => {
    const groups = groupByYear(papersOf(ROWS));
    expect(groups.map((g) => g.exam)).toEqual(['HKDSE', 'HKCEE', 'HKALE']);
    expect(groups[0].sittings.map((s) => s.key)).toEqual(['DSE2026', 'DSE2012', 'DSEPP', 'DSESP']);
    expect(groups[1].sittings.map((s) => s.key)).toEqual(['CE2011', 'CE1990']);
    expect(groups[2].sittings.map((s) => s.key)).toEqual(['AL2005', 'AL1999']);
  });

  it('a year holds its papers in paper order, and counts its questions', () => {
    const al = groupByYear(papersOf(ROWS))[2];
    expect(al.sittings[0].papers.map((p) => p.key)).toEqual(['AL2005/P1', 'AL2005/P2']);
    expect(al.sittings[0].papers.map((p) => p.questions)).toEqual([2, 1]);
    expect(al.sittings[0].questions).toBe(3);
    expect(al.questions).toBe(4);
    expect(groupByYear(papersOf(ROWS))[0].sittings[0].questions).toBe(3);
  });

  it('a question with no source tag sits in no year, and an empty bank lists none', () => {
    expect(groupByYear(papersOf([{ source: sourceOf({ tags: ['C.ped'] }) }]))).toEqual([]);
    expect(groupByYear([])).toEqual([]);
  });

  it('orders questions by exam, newest year, paper, then question number (10 after 2)', () => {
    const sorted = [...ROWS].sort((a, b) => compareByYear(a.source, b.source)).map((r) => r.source.tag);
    expect(sorted).toEqual([
      'DSE2026/P1/Q1',
      'DSE2026/P1/Q2',
      'DSE2026/P1/Q10',
      'DSE2012/P1/Q3',
      'DSEPP/P1/Q5',
      'DSESP/P1/Q1',
      'CE2011/P2/Q8',
      'CE1990/P2/Q1',
      'AL2005/P1/Q1',
      'AL2005/P1/Q2',
      'AL2005/P2/Q4',
      'AL1999/P2/Q1',
    ]);
  });

  it('names a year and a paper as the source lines do, in both languages', () => {
    const sp = sourceOf({ tags: ['DSESP/P1/Q1'] });
    expect(sittingKey(sp)).toBe('DSESP');
    expect(sittingLabel(sp)).toEqual({ en: 'HKDSE Sample Paper', zh: '香港中學文憑考試 樣本試卷' });
    expect(whenLabel(sourceOf({ tags: ['DSEPP/P1/Q1'] }))).toEqual({ en: 'Practice Paper', zh: '練習卷' });
    expect(sittingLabel(sourceOf({ tags: ['CE2011/P2/Q8'] }))).toEqual({ en: 'HKCEE 2011', zh: '香港中學會考 2011' });
    expect(paperLabel(sourceOf({ tags: ['AL2005/P2/Q4'] }))).toEqual({ en: 'Paper 2', zh: '卷二' });
    expect(sittingOfPaper('AL2005/P2')).toBe('AL2005');
    // The full source line is unchanged by the split into parts.
    expect(sourceLabel(sourceOf({ tags: ['DSE2016/P1/Q34'] }))).toEqual({ en: 'HKDSE 2016 Paper 1 Q34', zh: '香港中學文憑考試 2016 卷一 第 34 題' });
  });

  it('a year filter keeps every paper of that year and nothing else', () => {
    const hits = ROWS.filter((r) => matchItem(r, { sitting: 'AL2005' })).map((r) => r.source.tag);
    expect(hits.sort()).toEqual(['AL2005/P1/Q1', 'AL2005/P1/Q2', 'AL2005/P2/Q4']);
    expect(ROWS.filter((r) => matchItem(r, { sitting: 'AL2005', paper: 'AL2005/P2' })).map((r) => r.source.tag)).toEqual(['AL2005/P2/Q4']);
  });
});

describe('what the by-year view shows', () => {
  it('opens the newest HKDSE year when none is chosen, or the chosen one', () => {
    expect(yearSelection(ROWS, NONE, undefined, false).sitting?.key).toBe('DSE2026');
    expect(yearSelection(ROWS, NONE, 'CE1990', false).sitting?.key).toBe('CE1990');
    // A remembered year the bank no longer lists falls back to the first.
    expect(yearSelection(ROWS, NONE, 'DSE1999', false).sitting?.key).toBe('DSE2026');
  });

  it('the exam and year filters narrow the list, and the open year follows when they drop it', () => {
    const ce = yearSelection(ROWS, { ...NONE, exams: ['HKCEE'] }, 'DSE2026', false);
    expect(ce.groups.map((g) => g.exam)).toEqual(['HKCEE']);
    expect(ce.sitting?.key).toBe('CE2011');
    const range = yearSelection(ROWS, { ...NONE, from: 2000, to: 2011 }, undefined, false);
    expect(range.groups.flatMap((g) => g.sittings.map((s) => s.key))).toEqual(['CE2011', 'AL2005']);
  });

  it('the question filter is the open year and the words; by every year, the words and the filters', () => {
    const one = yearSelection(ROWS, { ...NONE, words: 'money' }, 'DSE2026', false);
    expect(ROWS.filter((r) => matchItem(r, one.query)).map((r) => r.source.tag)).toEqual(['DSE2026/P1/Q10']);
    const every = yearSelection(ROWS, { ...NONE, words: 'demand' }, 'DSE2026', true);
    expect(ROWS.filter((r) => matchItem(r, every.query)).map((r) => r.source.tag)).toEqual(['DSE2012/P1/Q3']);
    // Searching a source by its words works within a year too ("2026 p1").
    const bySource = yearSelection(ROWS, { ...NONE, words: 'q10' }, 'DSE2026', false);
    expect(ROWS.filter((r) => matchItem(r, bySource.query))).toHaveLength(1);
  });

  it('narrows to one paper of the open year, and ignores a paper of another year', () => {
    expect(yearSelection(ROWS, { ...NONE, paper: 'AL2005/P2' }, 'AL2005', false).paper).toBe('AL2005/P2');
    const other = yearSelection(ROWS, { ...NONE, paper: 'AL2005/P2' }, 'DSE2026', false);
    expect(other.paper).toBeUndefined();
    expect(ROWS.filter((r) => matchItem(r, other.query))).toHaveLength(3);
  });

  it('with nothing listed, nothing matches', () => {
    const empty = yearSelection([], NONE, undefined, false);
    expect(empty.sitting).toBeUndefined();
    expect(ROWS.filter((r) => matchItem(r, empty.query))).toHaveLength(0);
  });
});

describe('the keyboard walks the list', () => {
  const groups = groupByYear(papersOf(ROWS));
  const open = (key: string, closed = new Set<never>()) => yearRows(groups, closed, key);

  it('lists the years, and the open year’s papers when it has more than one', () => {
    expect(open('DSE2026').map((r) => r.id)).toEqual(['DSE2026', 'DSE2012', 'DSEPP', 'DSESP', 'CE2011', 'CE1990', 'AL2005', 'AL1999']);
    expect(open('AL2005').map((r) => r.id)).toEqual(['DSE2026', 'DSE2012', 'DSEPP', 'DSESP', 'CE2011', 'CE1990', 'AL2005', 'AL2005/P1', 'AL2005/P2', 'AL1999']);
    expect(yearRows(groups, new Set(['HKDSE', 'HKCEE'] as const), 'AL1999').map((r) => r.id)).toEqual(['AL2005', 'AL1999']);
  });

  it('↑ ↓ the next year (across exams), Home / End the ends, → ← into and out of a year’s papers', () => {
    const rows = open('AL2005');
    expect(stepYearRow(rows, 'DSE2026', 'ArrowDown')?.id).toBe('DSE2012');
    expect(stepYearRow(rows, 'DSESP', 'ArrowDown')?.id).toBe('CE2011');
    expect(stepYearRow(rows, 'DSE2026', 'ArrowUp')).toBeUndefined();
    expect(stepYearRow(rows, 'AL1999', 'ArrowDown')).toBeUndefined();
    expect(stepYearRow(rows, 'CE2011', 'End')?.id).toBe('AL1999');
    expect(stepYearRow(rows, 'CE2011', 'Home')?.id).toBe('DSE2026');
    expect(stepYearRow(rows, 'AL2005', 'ArrowRight')).toMatchObject({ id: 'AL2005/P1', sitting: 'AL2005', paper: 'AL2005/P1' });
    expect(stepYearRow(rows, 'AL2005/P2', 'ArrowLeft')).toEqual({ id: 'AL2005', sitting: 'AL2005' });
    expect(stepYearRow(rows, 'AL2005/P2', 'ArrowDown')?.id).toBe('AL1999');
    expect(stepYearRow(rows, 'DSE2026', 'ArrowRight')).toBeUndefined();
    expect(stepYearRow(rows, 'DSE2026', 'Enter')).toBeUndefined();
  });
});

describe('the view is remembered on this computer', () => {
  it('by topic unless the teacher chose by year; anything else reads as by topic', () => {
    expect(PAST_PAPER_SETTINGS.defaults({ desktop: false }).view).toBe('topic');
    expect(PAST_PAPER_SETTINGS.fields.view('year')).toBe('year');
    expect(PAST_PAPER_SETTINGS.fields.view('decade')).toBeUndefined();
  });
});

describe('the by-year list on screen', () => {
  const groups = groupByYear(papersOf(ROWS));
  const draw = (ui: UiLanguage, language: LanguageMode, current = 'AL2005', paper?: string) =>
    renderToStaticMarkup(
      createElement(
        UiLanguageOverride.Provider,
        { value: ui },
        createElement(PastPaperYearPicker, {
          groups,
          current: groups.flatMap((g) => g.sittings).find((s) => s.key === current),
          paper,
          active: true,
          language,
          top: createElement(ViewSwitch, { value: 'year', onChange: () => {} }),
          onPick: () => {},
          onPickPaper: () => {},
        }),
      ),
    );

  it('exams in order, the open year marked, its papers under it', () => {
    const html = draw('en', 'en');
    const exams = [...html.matchAll(/data-pastpaper-exam="([^"]+)"/g)].map((m) => m[1]);
    expect(exams).toEqual(['HKDSE', 'HKCEE', 'HKALE']);
    expect(html).toMatch(/aria-current="true" data-pastpaper-year="AL2005"/);
    expect([...html.matchAll(/data-pastpaper-year-paper="([^"]+)"/g)].map((m) => m[1])).toEqual(['AL2005/P1', 'AL2005/P2']);
    expect(html).toContain('By year');
    expect(html).toContain('Exam years');
    expect(html).toContain('Sample Paper');
  });

  it('narrowed to a paper, the paper is marked, not the year', () => {
    const html = draw('en', 'en', 'AL2005', 'AL2005/P2');
    expect(html).not.toMatch(/aria-current="true" data-pastpaper-year="AL2005"/);
    expect(html).toMatch(/aria-current="true" data-pastpaper-year-paper="AL2005\/P2"/);
  });

  it('year and paper names follow the question language; the chrome the interface language', () => {
    const zhUiEnglish = draw('zh-HK', 'en');
    expect(zhUiEnglish).toContain('按年份');
    expect(zhUiEnglish).toContain('Sample Paper');
    expect(zhUiEnglish).toContain('Paper 2');
    expect(zhUiEnglish).not.toContain('卷二');
    const enUiChinese = draw('en', 'zh');
    expect(enUiChinese).toContain('By year');
    expect(enUiChinese).toContain('樣本試卷');
    expect(enUiChinese).toContain('卷二');
  });
});
