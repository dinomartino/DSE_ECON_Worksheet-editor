/**
 * Backup and restore. The restore path is the one that must never lose or overwrite:
 * every entry goes through the migration chain, a bad entry is reported not fatal, and
 * an id collision becomes a copy unless the two documents are identical.
 */
import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorksheet } from '@/model/factories';
import v1Corpus from '@/test/corpus/v1-published.json';
import { LocalStorageWorksheetStore, stringifyWorksheet } from '.';
import {
  backupEntryName,
  BackupError,
  buildBackup,
  MANIFEST_NAME,
  readBackup,
  restoreBackup,
  restoreSummary,
  type BackupEntry,
} from './backup';
import type { WorksheetStore } from './types';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return new Proxy(
    {
      get length() {
        return map.size;
      },
      key: (i: number) => [...map.keys()][i] ?? null,
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, String(v)),
      removeItem: (k: string) => void map.delete(k),
      clear: () => map.clear(),
    } as unknown as Storage,
    {
      ownKeys: () => [...map.keys()],
      getOwnPropertyDescriptor: (_t, p) =>
        map.has(String(p))
          ? { configurable: true, enumerable: true, value: map.get(String(p)) }
          : undefined,
    },
  );
}

beforeEach(() => {
  vi.stubGlobal('window', { localStorage: memoryStorage() });
});

const store = () => new LocalStorageWorksheetStore();
const doc = (id: string, name = `Doc ${id}`) => ({
  ...createWorksheet(),
  id,
  name,
  updatedAt: '2026-01-01T00:00:00.000Z',
});
let counter = 0;
const makeId = () => `new-${++counter}`;

describe('building a backup', () => {
  it('writes one entry per document plus a manifest, and reads back identical', async () => {
    const docs = [doc('a', 'Unit 1: Demand'), doc('b')];
    const bytes = await buildBackup(docs, '2026-09-24T00:00:00.000Z');

    const zip = await JSZip.loadAsync(bytes);
    const manifest = JSON.parse(await zip.file(MANIFEST_NAME)!.async('string'));
    expect(manifest).toMatchObject({ app: 'econ-worksheet', count: 2, schemaVersion: 1 });
    expect(typeof manifest.appVersion).toBe('string');
    expect(Object.keys(zip.files).sort()).toEqual(
      [MANIFEST_NAME, 'Unit 1- Demand (a).worksheet.json', 'Doc b (b).worksheet.json'].sort(),
    );

    const { worksheets, failures } = await readBackup(bytes);
    expect(failures).toEqual([]);
    const byId = (id: string) => worksheets.find((entry) => entry.worksheet.id === id)!.worksheet;
    expect(docs.map((d) => stringifyWorksheet(byId(d.id)))).toEqual(docs.map(stringifyWorksheet));
  });

  it('names an entry safely', () => {
    expect(backupEntryName(doc('x', 'a/b:c?'))).toBe('a-b-c- (x).worksheet.json');
  });
});

describe('reading a backup', () => {
  it('rejects a file that is not a zip', async () => {
    await expect(readBackup(new TextEncoder().encode('not a zip'))).rejects.toBeInstanceOf(
      BackupError,
    );
  });

  it('skips and reports a corrupt entry, keeping the rest', async () => {
    const zip = new JSZip();
    zip.file('good (a).worksheet.json', stringifyWorksheet(doc('a')));
    zip.file('broken.worksheet.json', '{ nope');
    zip.file('stranger.json', JSON.stringify({ hello: 1 }));
    zip.file('__MACOSX/._good.json', 'junk');
    zip.file('readme.txt', 'ignored');
    const { worksheets, failures } = await readBackup(await zip.generateAsync({ type: 'uint8array' }));

    expect(worksheets.map((entry) => entry.worksheet.id)).toEqual(['a']);
    expect(failures).toEqual([
      { name: 'broken.worksheet.json', reason: 'not valid JSON' },
      { name: 'stranger.json', reason: 'not a worksheet' },
    ]);
  });

  it('migrates an old-schema document (the frozen v1 corpus)', async () => {
    const zip = new JSZip();
    zip.file('v1.worksheet.json', JSON.stringify(v1Corpus));
    const { worksheets, failures } = await readBackup(await zip.generateAsync({ type: 'uint8array' }));

    expect(failures).toEqual([]);
    expect(worksheets[0].worksheet.id).toBe('v1-published-corpus');
    expect(worksheets[0].worksheet.__unknown).toBeUndefined();
    await restoreBackup(store(), worksheets, makeId);
    expect((await store().list()).map((entry) => entry.id)).toEqual(['v1-published-corpus']);
  });
});

describe('restoring', () => {
  const entries = (...docs: ReturnType<typeof doc>[]): BackupEntry[] =>
    docs.map((worksheet) => ({ name: worksheet.id, worksheet }));

  it('restores new documents under their own ids', async () => {
    const report = await restoreBackup(store(), entries(doc('a'), doc('b')), makeId);
    expect(report.restored).toEqual(['Doc a', 'Doc b']);
    expect((await store().list()).map((entry) => entry.id).sort()).toEqual(['a', 'b']);
  });

  it('skips an identical document, and copies a different one — never overwrites', async () => {
    const same = doc('same');
    await store().save(same);
    await store().save(doc('diff', 'Mine'));
    const report = await restoreBackup(
      store(),
      entries({ ...same }, doc('diff', 'Theirs')),
      () => 'copy-1',
    );

    expect(report.skipped).toEqual(['Doc same']);
    expect(report.copied).toEqual(['Theirs']);
    expect((await store().load('diff'))?.name).toBe('Mine');
    const copy = await store().load('copy-1');
    expect(copy?.name).toBe('Theirs (restored)');
    expect(copy?.title).toEqual(doc('x').title);
  });

  it('never reaches into the Trash: a trashed id comes back as a copy', async () => {
    await store().save(doc('t'));
    await store().trash('t');
    const report = await restoreBackup(store(), entries(doc('t')), () => 'copy-t');

    expect(report.copied).toEqual(['Doc t']);
    expect((await store().listTrash()).map((row) => row.id)).toEqual(['t']);
    expect((await store().list()).map((entry) => entry.id)).toEqual(['copy-t']);
  });

  it('reports each document that does not fit, and keeps going', async () => {
    const real = store();
    const full: WorksheetStore = Object.assign(Object.create(real), {
      save: async (worksheet: { id: string }) => {
        if (worksheet.id === 'big') {
          throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
        }
        return real.save(worksheet as never);
      },
    });
    const report = await restoreBackup(full, entries(doc('big'), doc('small')), makeId);

    expect(report.failed).toEqual([{ name: 'Doc big', reason: 'storage is full' }]);
    expect(report.restored).toEqual(['Doc small']);
  });

  it('summarises in one line', () => {
    expect(
      restoreSummary({ restored: ['a', 'b'], copied: ['c'], skipped: ['d'], failed: [] }, 1),
    ).toBe('Restored 3 (1 as a copy) · skipped 1 already here · 1 unreadable');
    expect(restoreSummary({ restored: [], copied: [], skipped: ['d'], failed: [] }, 0)).toBe(
      'Skipped 1 already here',
    );
    expect(restoreSummary({ restored: [], copied: [], skipped: [], failed: [] }, 0)).toBe(
      'That backup has no worksheets in it.',
    );
  });
});
