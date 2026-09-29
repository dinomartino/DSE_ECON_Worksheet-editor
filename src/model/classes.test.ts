import { describe, expect, it } from 'vitest';
import { createWorksheet } from './factories';
import { cleanClasses, foldLegacyClassTag, isIsoDate, parseClasses, dateOfUse } from './classes';
import { KNOWN_KEYS, migrate, serializeWorksheet } from './migrations';
import { duplicateWorksheet, editableCopy } from '@/storage/document';

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
