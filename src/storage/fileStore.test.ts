/**
 * The desktop store must behave exactly like the localStorage one — a rule that
 * survived the move to files, or a teacher's list changes shape when they open the
 * desktop build. Plus the one thing files can do that `localStorage` cannot: rebuild a
 * lost index by reading the documents themselves.
 *
 * The filesystem is faked in memory, keyed by path, so nothing here touches a disk and
 * `@tauri-apps/plugin-fs` is never really loaded.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorksheet } from '@/model/factories';
import { stringifyWorksheet } from './document';
import { createFolder, folderOf, moveToFolder, updateFolders } from './folders';

const files = new Map<string, string>();
const dirs = new Set<string>();

vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: { AppData: 13 },
  exists: async (path: string) =>
    files.has(path) ||
    dirs.has(path) ||
    [...files.keys()].some((key) => key.startsWith(`${path}/`)),
  mkdir: async (path: string) => {
    dirs.add(path);
  },
  readTextFile: async (path: string) => {
    const value = files.get(path);
    if (value === undefined) throw new Error(`ENOENT ${path}`);
    return value;
  },
  writeTextFile: async (path: string, contents: string) => {
    files.set(path, contents);
  },
  writeFile: async (path: string, bytes: Uint8Array) => {
    files.set(path, new TextDecoder().decode(bytes));
  },
  remove: async (path: string) => {
    if (!files.delete(path)) throw new Error(`ENOENT ${path}`);
  },
  rename: async (from: string, to: string) => {
    const value = files.get(from);
    if (value === undefined) throw new Error(`ENOENT ${from}`);
    files.set(to, value);
    files.delete(from);
  },
  // Subdirectories are listed too, as the real plugin does — `trash/` must be skipped.
  readDir: async (path: string) => {
    const names = new Map<string, boolean>();
    for (const key of [...files.keys(), ...dirs]) {
      if (!key.startsWith(`${path}/`)) continue;
      const rest = key.slice(path.length + 1);
      const [head] = rest.split('/');
      names.set(head, rest.includes('/') || dirs.has(`${path}/${head}`));
    }
    return [...names].map(([name, isDirectory]) => ({ name, isFile: !isDirectory, isDirectory }));
  },
}));

const { FileWorksheetStore } = await import('./fileStore');

const DIR = 'worksheets';
const INDEX = `${DIR}/index.json`;
const doc = (id: string) => `${DIR}/${id}.worksheet.json`;

const TRASH_INDEX = `${DIR}/trash/index.json`;
const trashed = (id: string) => `${DIR}/trash/${id}.worksheet.json`;
const DAY = 86_400_000;

function worksheet(id: string, updatedAt: string) {
  return { ...createWorksheet(), id, name: `Doc ${id}`, updatedAt };
}

beforeEach(() => {
  files.clear();
  dirs.clear();
});

describe('FileWorksheetStore', () => {
  it('saves a document as a file and indexes it', async () => {
    const store = new FileWorksheetStore();
    await store.save(worksheet('a', '2024-01-01T00:00:00.000Z'));

    expect(files.has(doc('a'))).toBe(true);
    const index = JSON.parse(files.get(INDEX)!);
    expect(index).toHaveLength(1);
    expect(index[0].id).toBe('a');
  });

  it('lists newest first and round-trips a load', async () => {
    const store = new FileWorksheetStore();
    await store.save(worksheet('old', '2024-01-01T00:00:00.000Z'));
    await store.save(worksheet('new', '2025-01-01T00:00:00.000Z'));

    expect((await store.list()).map((entry) => entry.id)).toEqual(['new', 'old']);
    expect((await store.load('old'))?.id).toBe('old');
    expect(await store.load('missing')).toBeUndefined();
  });

  it('puts the freshly saved summary first', async () => {
    const store = new FileWorksheetStore();
    await store.save(worksheet('a', '2024-01-01T00:00:00.000Z'));
    await store.save(worksheet('b', '2025-01-01T00:00:00.000Z'));
    await store.save(worksheet('a', '2024-01-01T00:00:00.000Z'));

    const index = JSON.parse(files.get(INDEX)!);
    expect(index.map((entry: { id: string }) => entry.id)).toEqual(['a', 'b']);
  });

  it('renames the document, never its printed title', async () => {
    const store = new FileWorksheetStore();
    const original = worksheet('a', '2024-01-01T00:00:00.000Z');
    await store.save(original);
    await store.rename('a', 'Term 2 paper');

    const saved = await store.load('a');
    expect(saved?.name).toBe('Term 2 paper');
    expect(saved?.title).toEqual(original.title);
  });

  it('removes the file and its index row', async () => {
    const store = new FileWorksheetStore();
    await store.save(worksheet('a', '2024-01-01T00:00:00.000Z'));
    await store.save(worksheet('b', '2025-01-01T00:00:00.000Z'));
    await store.remove('a');

    expect(files.has(doc('a'))).toBe(false);
    expect((await store.list()).map((entry) => entry.id)).toEqual(['b']);
  });

  it('clears only the worksheets directory', async () => {
    files.set('window-state.json', '{}');
    const store = new FileWorksheetStore();
    await store.save(worksheet('a', '2024-01-01T00:00:00.000Z'));
    await store.clear();

    expect(await store.list()).toEqual([]);
    expect(files.has('window-state.json')).toBe(true);
  });

  it('keeps the good rows when one index entry is malformed', async () => {
    files.set(
      INDEX,
      JSON.stringify([
        { id: 'a', title: 'Fine', updatedAt: '2024-01-01T00:00:00.000Z' },
        { title: 'No id' },
        { id: 'c', title: 'Undated' },
      ]),
    );
    const store = new FileWorksheetStore();
    // The undated row sorts last but is still shown.
    expect((await store.list()).map((entry) => entry.id)).toEqual(['a', 'c']);
  });

  it('rebuilds a missing index by scanning the directory', async () => {
    files.set(doc('a'), stringifyWorksheet(worksheet('a', '2024-01-01T00:00:00.000Z')));
    files.set(doc('b'), stringifyWorksheet(worksheet('b', '2025-01-01T00:00:00.000Z')));

    const store = new FileWorksheetStore();
    expect((await store.list()).map((entry) => entry.id)).toEqual(['b', 'a']);
    // And it is written back, so the next visit is a plain read.
    expect(JSON.parse(files.get(INDEX)!)).toHaveLength(2);
  });

  it('skips an unreadable document while rebuilding', async () => {
    files.set(doc('a'), stringifyWorksheet(worksheet('a', '2024-01-01T00:00:00.000Z')));
    files.set(doc('broken'), 'not json');

    const store = new FileWorksheetStore();
    expect((await store.list()).map((entry) => entry.id)).toEqual(['a']);
  });

  it('rebuilds when the index file is corrupt', async () => {
    files.set(INDEX, '{ broken');
    files.set(doc('a'), stringifyWorksheet(worksheet('a', '2024-01-01T00:00:00.000Z')));

    const store = new FileWorksheetStore();
    expect((await store.list()).map((entry) => entry.id)).toEqual(['a']);
  });
});

describe('FileWorksheetStore Trash', () => {
  let clock = Date.parse('2026-09-01T00:00:00.000Z');
  const store = () => new FileWorksheetStore(() => clock);
  beforeEach(() => {
    clock = Date.parse('2026-09-01T00:00:00.000Z');
  });

  it('moves the file into trash/ and round-trips a restore', async () => {
    await store().save(worksheet('a', '2024-01-01T00:00:00.000Z'));
    await store().save(worksheet('b', '2025-01-01T00:00:00.000Z'));
    await store().trash('a');

    expect(files.has(doc('a'))).toBe(false);
    expect(files.has(trashed('a'))).toBe(true);
    expect((await store().list()).map((e) => e.id)).toEqual(['b']);
    expect(await store().listTrash()).toEqual([
      expect.objectContaining({ id: 'a', title: 'Doc a', deletedAt: '2026-09-01T00:00:00.000Z' }),
    ]);

    expect(await store().restore('a')).toBe('a');
    expect(files.has(doc('a'))).toBe(true);
    expect(files.has(trashed('a'))).toBe(false);
    expect((await store().list()).map((e) => e.id)).toEqual(['b', 'a']);
    expect(await store().listTrash()).toEqual([]);
  });

  it('a lost index is never rebuilt with trashed documents in it', async () => {
    await store().save(worksheet('a', '2024-01-01T00:00:00.000Z'));
    await store().save(worksheet('b', '2025-01-01T00:00:00.000Z'));
    await store().trash('a');
    files.delete(INDEX);

    expect((await store().list()).map((e) => e.id)).toEqual(['b']);
  });

  it('a lost Trash index is rebuilt from the files, with a fresh window', async () => {
    await store().save(worksheet('a', '2024-01-01T00:00:00.000Z'));
    await store().trash('a');
    files.delete(TRASH_INDEX);
    clock += 10 * DAY;

    expect(await store().listTrash()).toEqual([
      expect.objectContaining({ id: 'a', deletedAt: new Date(clock).toISOString() }),
    ]);
  });

  it('purges after 30 days, lazily', async () => {
    await store().save(worksheet('a', '2024-01-01T00:00:00.000Z'));
    await store().trash('a');
    clock += 29 * DAY;
    expect(await store().listTrash()).toHaveLength(1);
    clock += DAY;
    expect(await store().listTrash()).toEqual([]);
    expect(files.has(trashed('a'))).toBe(false);
  });

  it('keeps the good rows when one Trash row is malformed', async () => {
    await store().save(worksheet('a', '2024-01-01T00:00:00.000Z'));
    await store().trash('a');
    const rows = JSON.parse(files.get(TRASH_INDEX)!);
    files.set(TRASH_INDEX, JSON.stringify([{ title: 'no id' }, null, ...rows]));

    expect((await store().listTrash()).map((r) => r.id)).toEqual(['a']);
  });

  it('restores beside a live document of the same id, never over it', async () => {
    await store().save(worksheet('a', '2024-01-01T00:00:00.000Z'));
    await store().trash('a');
    // An older build re-imported the same file meanwhile.
    await store().save({ ...worksheet('a', '2025-01-01T00:00:00.000Z'), name: 'Live one' });

    const id = await store().restore('a');
    expect(id).not.toBe('a');
    expect((await store().load('a'))?.name).toBe('Live one');
    expect((await store().load(id!))?.name).toBe('Doc a');
    expect(await store().listTrash()).toEqual([]);
  });

  it('purge, Empty Trash and clear() remove trashed files; remove() leaves them', async () => {
    await store().save(worksheet('a', '2024-01-01T00:00:00.000Z'));
    await store().save(worksheet('b', '2024-01-01T00:00:00.000Z'));
    await store().save(worksheet('c', '2024-01-01T00:00:00.000Z'));
    await store().trash('a');
    await store().trash('b');
    await store().remove('a');
    expect(files.has(trashed('a'))).toBe(true);

    await store().purge('a');
    expect(files.has(trashed('a'))).toBe(false);
    expect((await store().listTrash()).map((r) => r.id)).toEqual(['b']);

    await store().emptyTrash();
    expect(files.has(trashed('b'))).toBe(false);
    expect(await store().listTrash()).toEqual([]);

    await store().trash('c');
    await store().clear();
    expect([...files.keys()].filter((key) => key.startsWith(`${DIR}/`))).toEqual([]);
  });

  it('an older build clearing worksheets/ leaves trash/ alone', async () => {
    await store().save(worksheet('a', '2024-01-01T00:00:00.000Z'));
    await store().trash('a');
    // What v0.2 clear() removes: top-level *.worksheet.json and index.json only.
    for (const key of [...files.keys()]) {
      const rest = key.slice(DIR.length + 1);
      if (!rest.includes('/') && (rest.endsWith('.worksheet.json') || rest === 'index.json')) {
        files.delete(key);
      }
    }
    expect((await store().listTrash()).map((r) => r.id)).toEqual(['a']);
  });
});

describe('FileWorksheetStore folders', () => {
  let clock = Date.parse('2026-09-01T00:00:00.000Z');
  const store = () => new FileWorksheetStore(() => clock);
  const FOLDERS = `${DIR}/folders.json`;
  const file = (s: InstanceType<typeof FileWorksheetStore>, ids: string[]) =>
    updateFolders(s, (state) => moveToFolder(createFolder(state, 'Mocks', 'f1'), ids, 'f1'));
  beforeEach(() => {
    clock = Date.parse('2026-09-01T00:00:00.000Z');
  });

  it('lives in folders.json beside index.json, and is never read as a document', async () => {
    await store().save(worksheet('a', '2024-01-01T00:00:00.000Z'));
    await file(store(), ['a']);
    expect(JSON.parse(files.get(FOLDERS)!)).toMatchObject({ assignments: { a: 'f1' } });

    // A lost index is rebuilt by scanning: folders.json must not become a row.
    files.delete(INDEX);
    expect((await store().list()).map((e) => e.id)).toEqual(['a']);
    expect(folderOf(await store().readFolders(), 'a')?.name).toBe('Mocks');
  });

  it('a malformed folders.json lists every document and reads as no folders', async () => {
    await store().save(worksheet('a', '2024-01-01T00:00:00.000Z'));
    await store().save(worksheet('b', '2025-01-01T00:00:00.000Z'));
    files.set(FOLDERS, '[[[');
    expect((await store().list()).map((e) => e.id)).toEqual(['b', 'a']);
    expect(await store().readFolders()).toEqual({ folders: [], assignments: {} });
  });

  it('Trash keeps the folder; Restore, even as a copy, comes back into it', async () => {
    await store().save(worksheet('a', '2024-01-01T00:00:00.000Z'));
    await store().save(worksheet('b', '2024-01-01T00:00:00.000Z'));
    await file(store(), ['a', 'b']);
    await store().trash('a');
    expect(await store().restore('a')).toBe('a');
    expect(folderOf(await store().readFolders(), 'a')?.id).toBe('f1');

    await store().trash('b');
    await store().save({ ...worksheet('b', '2025-01-01T00:00:00.000Z'), name: 'Live one' });
    const copy = await store().restore('b');
    expect(copy).not.toBe('b');
    expect(folderOf(await store().readFolders(), copy!)?.id).toBe('f1');
  });

  it('deleting for good forgets the folder; remove() keeps it while a trashed copy exists', async () => {
    for (const id of ['p', 'e', 'x', 't', 'keep']) {
      await store().save(worksheet(id, '2024-01-01T00:00:00.000Z'));
    }
    await file(store(), ['p', 'e', 'x', 't', 'keep']);
    await store().trash('p');
    await store().purge('p');
    await store().trash('x');
    clock += 31 * DAY;
    await store().listTrash();
    await store().trash('e');
    await store().emptyTrash();
    // Same id live and trashed (an older build re-imported it): deleting the live one
    // leaves the trashed copy its folder.
    await store().trash('t');
    await store().save(worksheet('t', '2025-01-01T00:00:00.000Z'));
    await store().remove('t');

    expect((await store().readFolders()).assignments).toEqual({ t: 'f1', keep: 'f1' });
  });

  it('clear() removes folders.json; an older build’s clear() leaves it, harmlessly', async () => {
    await store().save(worksheet('a', '2024-01-01T00:00:00.000Z'));
    await file(store(), ['a']);
    // What v0.2/v0.3 clear() removes: top-level *.worksheet.json and index.json only.
    for (const key of [...files.keys()]) {
      const rest = key.slice(DIR.length + 1);
      if (!rest.includes('/') && (rest.endsWith('.worksheet.json') || rest === 'index.json')) {
        files.delete(key);
      }
    }
    expect(await store().list()).toEqual([]);
    expect(files.has(FOLDERS)).toBe(true);

    await store().clear();
    expect(files.has(FOLDERS)).toBe(false);
  });
});
