import { describe, expect, it } from 'vitest';
import v1Corpus from '@/test/corpus/v1-published.json';
import type { CoverPage } from './coverTypes';
import { migrate, serializeWorksheet } from './migrations';
import { createMockSet } from './mockSet';
import { createWorksheetFrom } from './newWorksheet';
import { detailDrift, paperDetails, sharedLines, startingDetails, withDetails } from './setDetails';
import { bi, plain } from './text';
import type { Worksheet } from './types';

const mock = () =>
  createMockSet({
    documentType: 'paper1',
    name: 'S6 Mock Paper 1',
    coverDetails: { school: 'St Mary College', examName: 'S.6 MOCK EXAMINATION 2026-27' },
  });
const at = (w: Worksheet, minute: number): Worksheet => ({ ...w, updatedAt: `2026-11-02T08:${String(minute).padStart(2, '0')}:00.000Z` });

describe('shared details: which cover lines hold them', () => {
  it('a new cover tags its school (head and foot) and examination lines', () => {
    const paper = createWorksheetFrom({ documentType: 'lqMock', coverDetails: { school: 'St Mary College' } });
    expect(sharedLines(paper.cover, 'school').map((l) => plain(l.text.en))).toEqual(['St Mary College', 'St Mary College']);
    expect(sharedLines(paper.cover, 'exam').map((l) => l.sharedAs)).toEqual(['exam']);
  });

  it('an untagged cover (made before step B): the school is the head line the foot repeats', () => {
    const paper = createWorksheetFrom({ documentType: 'paper1', coverDetails: { school: 'Hong Kong College' } });
    const untag = (cover: CoverPage): CoverPage => ({
      ...cover,
      headLines: cover.headLines?.map(({ sharedAs: _s, ...l }) => (void _s, l)),
      footLines: cover.footLines?.map(({ sharedAs: _s, ...l }) => (void _s, l)),
    });
    const old = { ...paper, cover: untag(paper.cover!) };
    expect(sharedLines(old.cover, 'school').map((l) => plain(l.text.en))).toEqual(['Hong Kong College', 'Hong Kong College']);
    expect(plain(sharedLines(old.cover, 'exam')[0].text.en)).toMatch(/MOCK EXAMINATION/);
    // Applied once, the lines are tagged and then found by their tags.
    const applied = withDetails(old, { school: { en: 'St Paul College', zh: '' } });
    expect(sharedLines(applied.cover, 'school').every((l) => l.sharedAs === 'school')).toBe(true);
  });

  it('never guesses: a cover whose lines do not say what they are has none', () => {
    const cover: CoverPage = {
      headLines: [
        { id: 'a', text: bi('ECONOMICS PAPER 1', '') },
        { id: 'b', text: bi('Time allowed: 1 hour', '') },
      ],
      footLines: [{ id: 'f', text: bi('Page 1', '') }],
    };
    expect(sharedLines(cover, 'school')).toEqual([]);
    expect(sharedLines(cover, 'exam')).toEqual([]);
    const paper = { ...createWorksheetFrom({ documentType: 'paper1' }), cover };
    expect(withDetails(paper, { school: { en: 'X', zh: '' }, exam: { en: 'Y', zh: '' } })).toBe(paper);
  });

  it('the frozen v1 document opens and takes details only where its cover says them', () => {
    const doc = migrate(JSON.parse(JSON.stringify(v1Corpus)));
    const applied = withDetails(doc, { school: { en: 'St Mary College', zh: '' } });
    // Whatever it found, nothing else on the paper changed.
    const strip = (w: Worksheet) => ({ ...w, cover: undefined });
    expect(strip(applied)).toEqual(strip(doc));
    expect(migrate(JSON.parse(JSON.stringify(serializeWorksheet(applied)))).id).toBe(doc.id);
  });
});

describe('shared details: writing and comparing', () => {
  it('writes school, exam, date and classes, keeping each line’s formatting', () => {
    const { blank } = mock();
    const before = sharedLines(blank.cover, 'school')[0];
    const next = withDetails(blank, {
      school: { en: 'St Paul College', zh: '聖保羅書院' },
      exam: { en: 'S.6 MOCK EXAMINATION 2027', zh: '' },
      satOn: '2027-02-10',
      classes: ['6A', '6B'],
    });
    expect(paperDetails(next)).toEqual({
      school: { en: 'St Paul College', zh: '聖保羅書院' },
      exam: { en: 'S.6 MOCK EXAMINATION 2027', zh: '' },
      satOn: '2027-02-10',
      classes: ['6A', '6B'],
    });
    const after = sharedLines(next.cover, 'school')[0];
    expect(after.format).toEqual(before.format);
    expect(after.gapAfter).toBe(before.gapAfter);
    // Clearing.
    const cleared = withDetails(next, { satOn: '', classes: [] });
    expect(cleared).not.toHaveProperty('satOn');
    expect(cleared).not.toHaveProperty('classes');
  });

  it('returns the paper itself when nothing would change', () => {
    const { chosen } = mock();
    const same = paperDetails(chosen);
    expect(withDetails(chosen, { school: same.school, exam: same.exam, classes: [] })).toBe(chosen);
  });

  it('a mock set made in one go starts in step', () => {
    const { chosen, blank } = mock();
    expect(detailDrift([chosen, blank])).toEqual([]);
  });

  it('finds where papers disagree, and offers the newest filled-in value', () => {
    const { chosen } = mock();
    const other = at(createWorksheetFrom({ documentType: 'lqMock' }), 1); // SCHOOL NAME, default exam
    const p1 = at(withDetails(chosen, { satOn: '2027-02-10', classes: ['6A'] }), 5);
    const drift = detailDrift([p1, other]);
    const school = drift.find((d) => d.field === 'school')!;
    expect(school.values).toEqual([
      { id: p1.id, value: 'St Mary College', placeholder: false },
      { id: other.id, value: 'SCHOOL NAME', placeholder: true },
    ]);
    expect(school.suggestion).toEqual({ en: 'St Mary College', zh: '學校名稱' });
    expect(drift.map((d) => d.field).sort()).toEqual(['classes', 'exam', 'satOn', 'school']);
    expect(startingDetails([p1, other]).school?.en).toBe('St Mary College');
  });
});
