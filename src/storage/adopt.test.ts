import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeLocalStorage, localFeed } from '@/library/bankTestKit';
import { createWorksheet } from '@/model/factories';
import { CURRENT_SCHEMA_VERSION } from '@/model/migrations';
import type { Worksheet } from '@/model/types';
import { withChangeFeed } from './changes';
import { adoptRefused, NewerDocumentError } from './document';
import { LocalStorageWorksheetStore } from '.';
import type { WorksheetStore } from './types';

/**
 * `adopt` (the sync engine's write) and `loadTrashed`, on both stores. The rule: a
 * downloaded document may replace a newer build's document, but never with an older
 * schema — an older build must not put older content over newer data.
 */

const files = new Map<string, string>();

vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: { AppData: 13 },
  exists: async (path: string) => files.has(path) || [...files.keys()].some((key) => key.startsWith(`${path}/`)),
  mkdir: async () => {},
  readTextFile: async (path: string) => {
    const value = files.get(path);
    if (value === undefined) throw new Error(`ENOENT ${path}`);
    return value;
  },
  writeTextFile: async (path: string, contents: string) => void files.set(path, contents),
  remove: async (path: string) => {
    if (!files.delete(path)) throw new Error(`ENOENT ${path}`);
  },
  readDir: async (path: string) => {
    const names = new Set<string>();
    for (const key of files.keys()) {
      if (key.startsWith(`${path}/`)) names.add(key.slice(path.length + 1).split('/')[0]);
    }
    return [...names].map((name) => ({ name, isFile: name.includes('.'), isDirectory: !name.includes('.') }));
  },
}));

const { FileWorksheetStore } = await import('./fileStore');

const NEWER = CURRENT_SCHEMA_VERSION + 97;
const doc = (id: string, extra: Partial<Worksheet> = {}): Worksheet => ({ ...createWorksheet(), id, ...extra });

let storage: Storage;
beforeEach(() => {
  files.clear();
  storage = fakeLocalStorage();
});

const stores: [string, () => WorksheetStore, (id: string) => string | undefined][] = [
  ['web', () => new LocalStorageWorksheetStore(Date.now, () => storage), (id) => storage.getItem(`econ-worksheet:${id}`) ?? undefined],
  ['desktop', () => new FileWorksheetStore(), (id) => files.get(`worksheets/${id}.worksheet.json`)],
];

describe('adoptRefused', () => {
  const stored = (schemaVersion: number) => JSON.stringify({ schemaVersion });
  it('refuses only an older schema over a newer build’s document, or over unreadable text', () => {
    expect(adoptRefused(stored(CURRENT_SCHEMA_VERSION), { schemaVersion: NEWER })).toBe(false);
    expect(adoptRefused(stored(CURRENT_SCHEMA_VERSION), { schemaVersion: 1 })).toBe(false);
    expect(adoptRefused(stored(NEWER), { schemaVersion: NEWER })).toBe(false);
    expect(adoptRefused(stored(NEWER), { schemaVersion: NEWER + 1 })).toBe(false);
    expect(adoptRefused(stored(NEWER), { schemaVersion: CURRENT_SCHEMA_VERSION })).toBe(true);
    expect(adoptRefused('{torn', { schemaVersion: NEWER })).toBe(true);
    expect(adoptRefused('{}', { schemaVersion: NEWER })).toBe(true);
  });
});

describe.each(stores)('%s store: adopt', (_name, make, raw) => {
  it('writes where save would refuse: a newer build’s document over this build’s', async () => {
    const store = make();
    await store.save(doc('a'));
    const newer = doc('a', { schemaVersion: NEWER, name: 'From the newer build' });
    await expect(store.save(newer)).rejects.toBeInstanceOf(NewerDocumentError);
    await store.adopt(newer);
    expect(await store.load('a')).toMatchObject({ schemaVersion: NEWER, name: 'From the newer build' });
    expect((await store.list()).map((row) => row.id)).toEqual(['a']);
  });

  it('replaces a newer build’s document with the same or a newer schema', async () => {
    const store = make();
    await store.adopt(doc('a', { schemaVersion: NEWER, name: 'one' }));
    await store.adopt(doc('a', { schemaVersion: NEWER, name: 'two' }));
    expect(await store.load('a')).toMatchObject({ name: 'two' });
    await store.adopt(doc('a', { schemaVersion: NEWER + 1, name: 'three' }));
    expect(await store.load('a')).toMatchObject({ schemaVersion: NEWER + 1, name: 'three' });
  });

  it('never puts an older schema over a newer build’s document: the bytes stay', async () => {
    const store = make();
    await store.adopt(doc('a', { schemaVersion: NEWER, name: 'newer' }));
    const before = raw('a');
    await expect(store.adopt(doc('a', { name: 'older' }))).rejects.toBeInstanceOf(NewerDocumentError);
    expect(raw('a')).toBe(before);
  });

  it('writes plain documents like save, and makes a trashed id live', async () => {
    const store = make();
    await store.adopt(doc('a', { name: 'first' }));
    await store.trash('a');
    await store.adopt(doc('a', { name: 'second' }));
    expect(await store.load('a')).toMatchObject({ name: 'second' });
    expect((await store.list()).map((row) => row.id)).toEqual(['a']);
  });

  it('loadTrashed reads a trashed document, and nothing for a live or missing one', async () => {
    const store = make();
    await store.save(doc('a', { name: 'gone' }));
    await store.save(doc('b'));
    await store.trash('a');
    expect(await store.loadTrashed('a')).toMatchObject({ id: 'a', name: 'gone' });
    expect(await store.loadTrashed('b')).toBeUndefined();
    expect(await store.loadTrashed('zzz')).toBeUndefined();
  });

  it('is announced as saved, with origin sync; save stays unmarked', async () => {
    const feed = localFeed();
    const store = withChangeFeed(make(), feed.emit);
    await store.save(doc('a'));
    await store.adopt(doc('b'));
    expect(feed.events).toEqual([
      { docId: 'a', kind: 'saved' },
      { docId: 'b', kind: 'saved', origin: 'sync' },
    ]);
  });
});

describe('web store: a trashed newer document shares its key, so adopt guards it too', () => {
  it('refuses an older schema over a trashed newer document', async () => {
    const store = new LocalStorageWorksheetStore(Date.now, () => storage);
    await store.adopt(doc('a', { schemaVersion: NEWER }));
    await store.trash('a');
    const before = storage.getItem('econ-worksheet:a');
    await expect(store.adopt(doc('a'))).rejects.toBeInstanceOf(NewerDocumentError);
    expect(storage.getItem('econ-worksheet:a')).toBe(before);
    expect(await store.loadTrashed('a')).toMatchObject({ schemaVersion: NEWER });
  });
});
