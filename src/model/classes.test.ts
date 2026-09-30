import { describe, expect, it } from 'vitest';
import { createWorksheet } from './factories';
import { cleanClasses, commitClassInput, foldLegacyClassTag, isIsoDate, normaliseClassName, parseClasses, dateOfUse } from './classes';
import { classRefs, sameStudents } from '@/library/cohort';
import { KNOWN_KEYS, migrate, serializeWorksheet } from './migrations';
import { duplicateWorksheet, editableCopy } from '@/storage/document';

describe('the Classes box', () => {
  it('Enter commits "5a" as a class, so "5B" typed next is another one (not "5a5B")', () => {
    const first = commitClassInput([], '5a', true);
    expect(first).toEqual({ classes: ['5A'], rest: '' });
    expect(commitClassInput(first.classes, '5B', true)).toEqual({ classes: ['5A', '5B'], rest: '' });
  });

  it('a comma or space commits what comes before it; the rest stays in the box', () => {
    expect(commitClassInput([], '5a,', false)).toEqual({ classes: ['5A'], rest: '' });
    expect(commitClassInput([], '5a, 5b', false)).toEqual({ classes: ['5A'], rest: '5b' });
    expect(commitClassInput([], '5a 5b 5', false)).toEqual({ classes: ['5A', '5B'], rest: '5' });
    expect(commitClassInput(['5A'], '5', false)).toEqual({ classes: ['5A'], rest: '5' });
  });

  it('never adds a class twice, and leaves the ones already there as they were stored', () => {
    expect(commitClassInput(['5a'], '5A', true)).toEqual({ classes: ['5a'], rest: '' });
    expect(commitClassInput(['5 a'], '5b, 5B', true)).toEqual({ classes: ['5 a', '5B'], rest: '' });
    expect(commitClassInput([], '   ', true)).toEqual({ classes: [], rest: '' });
  });

  it('capitalises form-led codes only', () => {
    expect(['5a', 's5b', 'F.4c', '6', '中五甲', 'Econ club', '5science'].map(normaliseClassName)).toEqual([
      '5A',
      'S5B',
      'F.4C',
      '6',
      '中五甲',
      'Econ club',
      '5science',
    ]);
  });

  it('tidying changes nothing the bank matches on: "5a" stored and "5A" added are the same students', () => {
    const [old] = classRefs(['5a'], '2025-11-03');
    const [added] = classRefs([normaliseClassName('5a')], '2025-11-03');
    expect(old.key).toBe(added.key);
    expect(old.cohort).toBe(added.cohort);
    expect(sameStudents(old, added)).toBe(true);
  });
});

describe('parseClasses', () => {
  it('splits on commas, spaces and slashes, once per class', () => {
    expect(parseClasses('5A, 5B')).toEqual({ classes: ['5A', '5B'] });
    expect(parseClasses(' 5A 5B/5c，5a ')).toEqual({ classes: ['5A', '5B', '5c'] });
    expect(parseClasses('')).toEqual({ classes: [] });
  });

  it('sets a school year apart from the classes', () => {
    expect(parseClasses('5A 2025-26')).toEqual({ classes: ['5A'], schoolYearEnd: 2026 });
    expect(parseClasses('2025–2026 5A')).toEqual({ classes: ['5A'], schoolYearEnd: 2026 });
    expect(parseClasses('5A 1999-00')).toEqual({ classes: ['5A'], schoolYearEnd: 2000 });
    // Not a school year: kept as written.
    expect(parseClasses('5A 2025-28')).toEqual({ classes: ['5A', '2025-28'] });
  });
});

describe('cleanClasses / isIsoDate / dateOfUse', () => {
  it('cleans a stored list and drops what is not a class', () => {
    expect(cleanClasses([' 5A', '5a', '', 3, '5B'])).toEqual(['5A', '5B']);
    expect(cleanClasses([])).toBeUndefined();
    expect(cleanClasses('5A')).toBeUndefined();
  });

  it('accepts only real calendar dates', () => {
    expect(isIsoDate('2025-11-03')).toBe(true);
    expect(isIsoDate('2025-02-30')).toBe(false);
    expect(isIsoDate('2025-11-03T00:00:00.000Z')).toBe(false);
    expect(isIsoDate(undefined)).toBe(false);
  });

  it('dates a paper by when it was sat, else when it was made, never by its last edit', () => {
    const made = { createdAt: '2024-10-01T00:00:00.000Z', updatedAt: '2026-09-29T00:00:00.000Z' };
    expect(dateOfUse(made)).toBe('2024-10-01T00:00:00.000Z');
    expect(dateOfUse({ ...made, satOn: '2024-11-15' })).toBe('2024-11-15');
    expect(dateOfUse({ ...made, satOn: 'next week' })).toBe('2024-10-01T00:00:00.000Z');
  });
});

describe('the legacy classTag (develop builds only)', () => {
  const base = { id: 'x', createdAt: '2025-10-01T00:00:00.000Z' };

  it('folds into classes, and dates a named school year the paper was not made in', () => {
    expect(foldLegacyClassTag({ ...base, classTag: ' 5A ' })).toEqual({ ...base, classes: ['5A'] });
    // Made in 2025-26 and tagged 2025-26: the creation date already says so.
    expect(foldLegacyClassTag({ ...base, classTag: '5A 2025-26' })).toEqual({ ...base, classes: ['5A'] });
    // Tagged with an earlier year: that year's first day stands in.
    expect(foldLegacyClassTag({ ...base, classTag: '4A 2024-25' })).toEqual({ ...base, classes: ['4A'], satOn: '2024-09-01' });
    expect(foldLegacyClassTag({ ...base, classTag: '4A 2024-25', satOn: '2025-01-10' })).toEqual({
      ...base,
      classes: ['4A'],
      satOn: '2025-01-10',
    });
    expect(foldLegacyClassTag({ ...base, classTag: '' })).toEqual(base);
  });

  it('leaves a document with nothing to fold, or with classes already, as it is', () => {
    const plain = { ...base };
    expect(foldLegacyClassTag(plain)).toBe(plain);
    const both = { ...base, classes: ['5B'], classTag: '5A' };
    expect(foldLegacyClassTag(both)).toBe(both);
  });

  it('opens a develop-saved document with its class, and saves the new shape', () => {
    const saved = { ...serializeWorksheet(createWorksheet()), classTag: '5A 2025-26', createdAt: '2025-10-01T00:00:00.000Z' };
    const loaded = migrate(saved);
    expect(loaded.classes).toEqual(['5A']);
    expect(loaded.__unknown).toBeUndefined();
    expect('classTag' in serializeWorksheet(loaded)).toBe(false);
    // With classes already present, classTag is kept verbatim in __unknown, never lost.
    const both = migrate({ ...saved, classes: ['5B'] });
    expect(both.classes).toEqual(['5B']);
    expect(both.__unknown).toEqual({ classTag: '5A 2025-26' });
  });
});

describe('classes and satOn are stored fields', () => {
  it('are known keys, and survive save → reload', () => {
    expect(KNOWN_KEYS.has('classes')).toBe(true);
    expect(KNOWN_KEYS.has('satOn')).toBe(true);
    expect(KNOWN_KEYS.has('classTag')).toBe(false);
    const worksheet = { ...createWorksheet(), classes: ['5A', '5B'], satOn: '2025-11-03' };
    const reloaded = migrate(JSON.parse(JSON.stringify(serializeWorksheet(worksheet))));
    expect(reloaded.__unknown).toBeUndefined();
    expect(reloaded.classes).toEqual(['5A', '5B']);
    expect(reloaded.satOn).toBe('2025-11-03');
  });

  it('are not copied: nobody has sat a duplicate yet', () => {
    const worksheet = { ...createWorksheet(), classes: ['5A'], satOn: '2025-11-03' };
    for (const copy of [duplicateWorksheet(worksheet, 'copy'), editableCopy(worksheet, 'copy')]) {
      expect(copy.classes).toBeUndefined();
      expect(copy.satOn).toBeUndefined();
      expect('classes' in copy || 'satOn' in copy).toBe(false);
    }
  });
});
