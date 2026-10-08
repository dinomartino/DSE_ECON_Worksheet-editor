import { describe, expect, it, vi } from 'vitest';
import { fakeLocalStorage } from '@/library/bankTestKit';
import { LocalStorageWorksheetStore } from '@/storage';
import type { WorksheetStore } from '@/storage/types';
import { forgetOnWrite, memoryHashCache } from './hashCache';
import { paper } from './testKit';
import type { HashEntry } from './types';

const entry = (id: string, hash = 'h1'): HashEntry => ({
  id,
  place: 'live',
  updatedAt: '2026-10-05T06:32:00.000Z',
  hash,
  schemaVersion: 1,
  newer: false,
});

describe('memoryHashCache', () => {
  it('drops a put whose document was read before a write that has since landed', () => {
    const cache = memoryHashCache();
    const ticket = cache.ticket('x');
    cache.forget('x'); // a save finished while the engine was loading the old version
    cache.put(entry('x'), ticket);
    expect(cache.get('x')).toBeUndefined();
    cache.put(entry('x'), cache.ticket('x'));
    expect(cache.get('x')).toEqual(entry('x'));
  });

  it('forgets one id, or every id', () => {
    const cache = memoryHashCache();
    cache.put(entry('x'), cache.ticket('x'));
    cache.put(entry('y'), cache.ticket('y'));
    const before = cache.ticket('y');
    cache.forget('x');
    expect(cache.get('x')).toBeUndefined();
    expect(cache.get('y')).toBeDefined();
    cache.put(entry('y', 'h2'), before); // another id's write does not stale this ticket
    expect(cache.get('y')?.hash).toBe('h2');
    cache.forget();
    expect(cache.entries.size).toBe(0);
    cache.put(entry('y'), before);
    expect(cache.get('y')).toBeUndefined();
  });
});

describe('forgetOnWrite', () => {
  const setup = () => {
    const storage = fakeLocalStorage();
    const cache = memoryHashCache();
    const store = forgetOnWrite(new LocalStorageWorksheetStore(Date.now, () => storage), cache);
    return { storage, cache, store };
  };

  it('forgets each document a write touches', async () => {
    const { cache, store } = setup();
    const doc = paper('One');
    await store.save(doc);
    const writes: [string, (s: WorksheetStore) => Promise<unknown>][] = [
      ['save', (s) => s.save({ ...doc })],
      ['adopt', (s) => s.adopt({ ...doc })],
      ['rename', (s) => s.rename(doc.id, 'Renamed')],
      ['trash', (s) => s.trash(doc.id)],
      ['restore', (s) => s.restore(doc.id)],
      ['purge', (s) => s.purge(doc.id)],
      ['remove', (s) => s.remove(doc.id)],
      ['emptyTrash', (s) => s.emptyTrash()],
      ['clear', (s) => s.clear()],
    ];
    for (const [name, write] of writes) {
      cache.put(entry(doc.id), cache.ticket(doc.id));
      await write(store);
      expect(cache.get(doc.id), name).toBeUndefined();
    }
  });

  it('forgets a write that failed: the document may have landed before its index row', async () => {
    const { storage, cache, store } = setup();
    const doc = paper('One');
    await store.save(doc);
    cache.put(entry(doc.id), cache.ticket(doc.id));
    const setItem = storage.setItem.bind(storage);
    storage.setItem = (key: string, value: string) => {
      if (key === 'econ-worksheet-index') throw new Error('QuotaExceededError');
      setItem(key, value);
    };
    await expect(store.save({ ...doc, name: 'Edited' })).rejects.toThrow();
    expect(cache.get(doc.id)).toBeUndefined();
  });
});

/** Every `WorksheetStore` method and its argument count: the compiler keeps this whole. */
const EVERY_METHOD: Record<keyof WorksheetStore, number> = {
  list: 1,
  load: 1,
  save: 1,
  adopt: 2,
  loadTrashed: 1,
  rename: 2,
  remove: 1,
  trash: 1,
  listTrash: 1,
  restore: 1,
  purge: 1,
  emptyTrash: 0,
  readFolders: 0,
  writeFolders: 1,
  clear: 0,
};

describe('forgetOnWrite around the app store', () => {
  it('forwards every WorksheetStore method, with its arguments and its result, and adds none', async () => {
    const received = new Map<string, unknown[]>();
    const inner = Object.fromEntries(
      Object.keys(EVERY_METHOD).map((name) => [
        name,
        async (...args: unknown[]) => {
          received.set(name, args);
          return `result of ${name}`;
        },
      ]),
    ) as unknown as WorksheetStore;
    const wrapped = forgetOnWrite(inner, memoryHashCache()) as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
    expect(Object.keys(wrapped).sort()).toEqual(Object.keys(EVERY_METHOD).sort());
    for (const [name, arity] of Object.entries(EVERY_METHOD)) {
      const args = [{ id: 'x' }, 'second'].slice(0, arity);
      await expect(wrapped[name](...args), name).resolves.toBe(`result of ${name}`);
      expect(received.get(name), name).toEqual(args);
    }
  });

  it('the app singleton forgets each id it writes and otherwise behaves as the store', async () => {
    vi.resetModules();
    vi.stubGlobal('window', { localStorage: fakeLocalStorage() });
    try {
      const { worksheetStore, worksheetHashCache, onStoreChange } = await import('@/storage');
      const changes: string[] = [];
      const stop = onStoreChange((change) => changes.push(`${change.kind}${change.origin ? `:${change.origin}` : ''}`));
      const doc = paper('One');
      await worksheetStore.save(doc);
      expect(await worksheetStore.load(doc.id)).toEqual(doc);
      expect((await worksheetStore.list()).map((row) => row.id)).toEqual([doc.id]);
      worksheetHashCache.put(entry(doc.id), worksheetHashCache.ticket(doc.id));
      await worksheetStore.trash(doc.id);
      expect(worksheetHashCache.get(doc.id)).toBeUndefined();
      expect(await worksheetStore.list()).toEqual([]);
      expect(await worksheetStore.restore(doc.id)).toBe(doc.id);
      worksheetHashCache.put(entry(doc.id), worksheetHashCache.ticket(doc.id));
      await worksheetStore.adopt({ ...doc, name: 'Synced' });
      expect(worksheetHashCache.get(doc.id)).toBeUndefined();
      expect((await worksheetStore.load(doc.id))?.name).toBe('Synced');
      await worksheetStore.clear();
      expect(await worksheetStore.list()).toEqual([]);
      expect(changes).toEqual(['saved', 'trashed', 'restored', 'saved:sync', 'cleared']);
      stop();
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });
});
