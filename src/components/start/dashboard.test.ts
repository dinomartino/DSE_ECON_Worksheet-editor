import { describe, expect, it } from 'vitest';
import type { FolderState, WorksheetSummary } from '@/storage';
import {
  DEFAULT_QUERY,
  isFiltered,
  relativeTime,
  scopedSummaries,
  trashAgeLabel,
  visibleSummaries,
} from './dashboard';

const rows: WorksheetSummary[] = [
  { id: 'a', title: 'Unit 10 elasticity', updatedAt: '2026-09-20T00:00:00Z', hasCover: false },
  { id: 'b', title: 'Mock Paper 1', updatedAt: '2026-09-19T00:00:00Z', hasCover: true },
  { id: 'c', title: 'unit 9 demand', updatedAt: '2026-09-18T00:00:00Z' },
  // An index row from an early build: no timestamp, no cover flag. Still a document.
  { id: 'd', title: 'Old notes' } as WorksheetSummary,
];

const ids = (list: WorksheetSummary[]) => list.map((row) => row.id);

describe('visibleSummaries', () => {
  it('shows every row, in index order, by default', () => {
    expect(ids(visibleSummaries(rows, DEFAULT_QUERY))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('searches titles case-blind and ignores surrounding space', () => {
    expect(ids(visibleSummaries(rows, { ...DEFAULT_QUERY, search: '  UNIT ' }))).toEqual([
      'a',
      'c',
    ]);
  });

  it('splits mocks from worksheets by cover, counting a missing flag as a worksheet', () => {
    expect(ids(visibleSummaries(rows, { ...DEFAULT_QUERY, kind: 'mock' }))).toEqual(['b']);
    expect(ids(visibleSummaries(rows, { ...DEFAULT_QUERY, kind: 'worksheet' }))).toEqual([
      'a',
      'c',
      'd',
    ]);
  });

  it('sorts by name naturally, without reordering the input', () => {
    const sorted = visibleSummaries(rows, { ...DEFAULT_QUERY, sort: 'name' });
    expect(ids(sorted)).toEqual(['b', 'd', 'c', 'a']);
    expect(ids(rows)).toEqual(['a', 'b', 'c', 'd']);
  });

  describe('inside a folder', () => {
    const folders: FolderState = {
      folders: [
        { id: 'f-units', name: 'Units' },
        { id: 'f-mocks', name: 'Mocks' },
      ],
      // `d` names a folder that has since been deleted: it is at root.
      assignments: { a: 'f-units', c: 'f-units', b: 'f-mocks', d: 'gone' },
    };
    const inFolder = (folderId: string | undefined) => ({ folderId, folders });

    it('All documents shows every row, filed or not', () => {
      expect(ids(visibleSummaries(rows, DEFAULT_QUERY, inFolder(undefined)))).toEqual([
        'a',
        'b',
        'c',
        'd',
      ]);
    });

    it('a folder shows its own rows, in the same order', () => {
      expect(ids(visibleSummaries(rows, DEFAULT_QUERY, inFolder('f-units')))).toEqual(['a', 'c']);
      expect(ids(visibleSummaries(rows, DEFAULT_QUERY, inFolder('f-mocks')))).toEqual(['b']);
      expect(ids(scopedSummaries(rows, inFolder('f-units')))).toEqual(['a', 'c']);
    });

    it('search, kind and order work within the folder', () => {
      const units = inFolder('f-units');
      expect(ids(visibleSummaries(rows, { ...DEFAULT_QUERY, search: '9' }, units))).toEqual(['c']);
      expect(ids(visibleSummaries(rows, { ...DEFAULT_QUERY, kind: 'mock' }, units))).toEqual([]);
      expect(ids(visibleSummaries(rows, { ...DEFAULT_QUERY, sort: 'name' }, units))).toEqual([
        'c',
        'a',
      ]);
      // A search never reaches outside the open folder.
      expect(
        ids(visibleSummaries(rows, { ...DEFAULT_QUERY, search: 'mock' }, units)),
      ).toEqual([]);
    });

    it('a stale assignment is at root: in All documents, in no folder', () => {
      expect(ids(visibleSummaries(rows, DEFAULT_QUERY, inFolder('gone')))).toEqual([]);
      expect(ids(visibleSummaries(rows, DEFAULT_QUERY, inFolder(undefined)))).toContain('d');
    });
  });

  it('knows when a filter is narrowing the list', () => {
    expect(isFiltered(DEFAULT_QUERY)).toBe(false);
    expect(isFiltered({ ...DEFAULT_QUERY, sort: 'name' })).toBe(false);
    expect(isFiltered({ ...DEFAULT_QUERY, search: ' ' })).toBe(false);
    expect(isFiltered({ ...DEFAULT_QUERY, search: 'x' })).toBe(true);
    expect(isFiltered({ ...DEFAULT_QUERY, kind: 'mock' })).toBe(true);
  });
});

describe('relativeTime', () => {
  const now = Date.parse('2026-09-24T12:00:00Z');
  it('says it in words, and survives a bad date', () => {
    expect(relativeTime('2026-09-24T11:59:30Z', now)).toBe('just now');
    expect(relativeTime('2026-09-24T11:00:00Z', now)).toBe('1 hour ago');
    expect(relativeTime('2026-09-23T12:00:00Z', now)).toBe('yesterday');
    expect(relativeTime('not a date', now)).toBe('unknown');
  });
});

describe('trashAgeLabel', () => {
  const deleted = '2026-09-01T00:00:00.000Z';
  const at = (days: number) => Date.parse(deleted) + days * 86_400_000;

  it('says how long ago and how long is left', () => {
    expect(trashAgeLabel(deleted, at(0))).toBe('Deleted today · removed in 30 days');
    expect(trashAgeLabel(deleted, at(1))).toBe('Deleted yesterday · removed in 29 days');
    expect(trashAgeLabel(deleted, at(29.5))).toBe('Deleted 29 days ago · removed in 1 day');
  });
});
