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
  readDir: async (path: string) =>
    [...files.keys()]
      .filter((key) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes('/'))
      .map((key) => ({ name: key.slice(path.length + 1), isFile: true, isDirectory: false })),
}));

const { FileWorksheetStore } = await import('./fileStore');

const DIR = 'worksheets';
const INDEX = `${DIR}/index.json`;
const doc = (id: string) => `${DIR}/${id}.worksheet.json`;

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
