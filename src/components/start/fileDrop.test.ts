import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  droppedKind,
  fileNameOf,
  importSummary,
  overlayFor,
  planDrop,
  type ImportCounts,
} from './fileDrop';
import { entryFailure, worksheetEntry } from '@/storage/backup';

const byPath = (p: string) => droppedKind(fileNameOf(p));

describe('droppedKind', () => {
  it('takes .json and .worksheet.json as worksheets, .zip as a backup', () => {
    expect(droppedKind('Unit 3.json')).toBe('worksheet');
    expect(droppedKind('Demand (abc).worksheet.json')).toBe('worksheet');
    expect(droppedKind('PAPER.JSON')).toBe('worksheet');
    expect(droppedKind('econ-backup-2026-09-25.zip')).toBe('backup');
  });

  it('refuses everything else', () => {
    expect(droppedKind('paper.docx')).toBeUndefined();
    expect(droppedKind('notes.json.txt')).toBeUndefined();
    expect(droppedKind('json')).toBeUndefined();
  });

  it('trusts the browser MIME type when the name has no extension', () => {
    expect(droppedKind('download', 'application/json')).toBe('worksheet');
    expect(droppedKind('download', 'application/x-zip-compressed')).toBe('backup');
  });
});

describe('fileNameOf', () => {
  it('reads both separators', () => {
    expect(fileNameOf('/Users/t/Documents/Econ Worksheets/Unit 3.json')).toBe('Unit 3.json');
    expect(fileNameOf('C:\\Users\\t\\Desktop\\Unit 3.worksheet.json')).toBe('Unit 3.worksheet.json');
    expect(fileNameOf('bare.json')).toBe('bare.json');
  });
});

describe('planDrop', () => {
  it('opens one worksheet and restores one backup — what a drop has always meant', () => {
    expect(planDrop(['/a/one.json'], byPath)).toEqual({ kind: 'open', file: '/a/one.json' });
    expect(planDrop(['/a/b.zip'], byPath)).toEqual({ kind: 'restore', file: '/a/b.zip' });
  });

  it('imports several, opening none, and counts what it ignored', () => {
    expect(planDrop(['/a/1.json', 'C:\\x\\2.worksheet.json', '/a/b.zip', '/a/c.docx'], byPath)).toEqual({
      kind: 'import',
      worksheets: ['/a/1.json', 'C:\\x\\2.worksheet.json'],
      backups: ['/a/b.zip'],
      ignored: 1,
    });
  });

  it('does not open a lone worksheet dragged in with other files', () => {
    expect(planDrop(['/a/1.json', '/a/pic.png'], byPath)).toMatchObject({
      kind: 'import',
      worksheets: ['/a/1.json'],
      ignored: 1,
    });
  });

  it('rejects a drop with nothing usable, or nothing at all', () => {
    expect(planDrop(['/a/paper.docx', '/a/pic.png'], byPath)).toEqual({ kind: 'reject' });
    expect(planDrop([], byPath)).toEqual({ kind: 'reject' });
  });
});

describe('importSummary', () => {
  const none: ImportCounts = {
    imported: 0,
    copied: 0,
    skipped: 0,
    unreadable: 0,
    failed: 0,
    ignored: 0,
  };

  it('is one line', () => {
    expect(importSummary({ ...none, imported: 3 })).toBe('Imported 3 worksheets');
    expect(importSummary({ ...none, imported: 1 })).toBe('Imported 1 worksheet');
    expect(importSummary({ ...none, imported: 1, copied: 1, skipped: 2, unreadable: 1, ignored: 1 })).toBe(
      'Imported 2 worksheets (1 as a copy) · skipped 2 already here · 1 unreadable · 1 not a .json or .zip',
    );
  });

  it('capitalises whatever comes first', () => {
    expect(importSummary({ ...none, skipped: 2 })).toBe('Skipped 2 already here');
    expect(importSummary(none)).toBe('Nothing to import.');
  });
});

describe('overlayFor (desktop native drag)', () => {
  it('shows the hint for usable files and the rejection for anything else, from enter', () => {
    expect(overlayFor({ type: 'enter', paths: ['/a/1.json'] }, undefined)).toBe('hint');
    expect(overlayFor({ type: 'enter', paths: ['/a/p.docx'] }, undefined)).toBe('rejected');
  });

  it('keeps the decision while hovering and clears on leave or drop', () => {
    expect(overlayFor({ type: 'over' }, 'rejected')).toBe('rejected');
    expect(overlayFor({ type: 'over' }, undefined)).toBe('hint');
    expect(overlayFor({ type: 'leave' }, 'hint')).toBeUndefined();
    expect(overlayFor({ type: 'drop', paths: ['/a/1.json'] }, 'hint')).toBeUndefined();
  });
});

describe('worksheetEntry (a loose dropped .json)', () => {
  it('reads a document the v1 build wrote', () => {
    const text = readFileSync(
      path.resolve(__dirname, '../../test/corpus/v1-published.json'),
      'utf8',
    );
    const entry = worksheetEntry('v1.json', text);
    expect(entry.name).toBe('v1.json');
    expect(entry.worksheet.id).toBeTruthy();
    expect(entry.worksheet.questions.length).toBeGreaterThan(0);
  });

  it('names why a file is refused', () => {
    const reason = (text: string) => {
      try {
        worksheetEntry('x.json', text);
        return 'accepted';
      } catch (cause) {
        return entryFailure(cause);
      }
    };
    expect(reason('{not json')).toBe('not valid JSON');
    expect(reason('[1, 2, 3]')).toBe('not a worksheet');
  });
});
