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
import {
  createFolder,
  EMPTY_FOLDERS,
  folderOf,
  moveToFolder,
  updateFolders,
  type FolderState,
} from './folders';

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

describe('folders in a backup', () => {
  const filed = (): FolderState => {
    let state = createFolder(EMPTY_FOLDERS, 'Mocks', 'f-mocks');
    state = createFolder(state, 'Term 1', 'f-term');
    return moveToFolder(moveToFolder(state, ['a'], 'f-mocks'), ['b', 'not-backed-up'], 'f-term');
  };

  it('ride inside the manifest — no zip entry a shipped build would read as a document', async () => {
    const bytes = await buildBackup([doc('a'), doc('b'), doc('c')], 'T', filed());
    const zip = await JSZip.loadAsync(bytes);
    // Exactly what v0.3.0's reader iterates: every .json but the manifest.
    const read = Object.keys(zip.files).filter((n) => n.endsWith('.json') && n !== MANIFEST_NAME);
    expect(read.every((name) => name.endsWith('.worksheet.json'))).toBe(true);
    expect(read).toHaveLength(3);

    const manifest = JSON.parse(await zip.file(MANIFEST_NAME)!.async('string'));
    expect(manifest.count).toBe(3);
    // Only the assignments of documents in this backup.
    expect(manifest.folders.assignments).toEqual({ a: 'f-mocks', b: 'f-term' });

    const { folders, failures } = await readBackup(bytes);
    expect(failures).toEqual([]);
    expect(folders.folders.map((f) => f.name)).toEqual(['Mocks', 'Term 1']);
  });

  it('an older backup, or no folders, has no folders key and reads as none', async () => {
    const bytes = await buildBackup([doc('a')], 'T', EMPTY_FOLDERS);
    const zip = await JSZip.loadAsync(bytes);
    expect(JSON.parse(await zip.file(MANIFEST_NAME)!.async('string')).folders).toBeUndefined();
    expect((await readBackup(bytes)).folders).toEqual({ folders: [], assignments: {} });
  });

  it('a mangled manifest costs the filing, never a document', async () => {
    const zip = new JSZip();
    zip.file(MANIFEST_NAME, '{ broken');
    zip.file('a.worksheet.json', stringifyWorksheet(doc('a')));
    const contents = await readBackup(await zip.generateAsync({ type: 'uint8array' }));
    expect(contents.worksheets).toHaveLength(1);
    expect(contents.folders).toEqual({ folders: [], assignments: {} });
  });

  it('restores filing into an empty library', async () => {
    const { worksheets, folders } = await readBackup(
      await buildBackup([doc('a'), doc('b')], 'T', filed()),
    );
    await restoreBackup(store(), worksheets, makeId, folders);
    const state = await store().readFolders();
    expect(folderOf(state, 'a')?.name).toBe('Mocks');
    expect(folderOf(state, 'b')?.name).toBe('Term 1');
  });

  it('merges without overwriting: filed documents stay put, same-named folders are reused', async () => {
    const s = store();
    const a = doc('a');
    await s.save(a);
    await s.save(doc('b', 'Mine'));
    // Here: a folder named "mocks" of our own, and `a` filed somewhere else.
    await updateFolders(s, (state) =>
      moveToFolder(createFolder(createFolder(state, 'mocks', 'mine'), 'Elsewhere', 'else'), ['a'], 'else'),
    );
    const { worksheets, folders } = await readBackup(
      await buildBackup([a, doc('b', 'Theirs'), doc('c')], 'T', {
        ...filed(),
        assignments: { a: 'f-mocks', b: 'f-mocks', c: 'f-mocks' },
      }),
    );
    const report = await restoreBackup(s, worksheets, () => 'b-copy', folders);

    expect(report.skipped).toEqual(['Doc a']);
    const state = await s.readFolders();
    expect(folderOf(state, 'a')?.id).toBe('else'); // skipped, and already filed: untouched
    expect(folderOf(state, 'b')).toBeUndefined(); // ours, not in the backup's folder
    expect(folderOf(state, 'b-copy')?.id).toBe('mine'); // the copy, into the reused folder
    expect(folderOf(state, 'c')?.id).toBe('mine');
    expect(state.folders.map((f) => f.name)).toEqual(['mocks', 'Elsewhere', 'Term 1']);
  });
});
