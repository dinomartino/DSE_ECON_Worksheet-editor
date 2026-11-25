import { describe, expect, it } from 'vitest';
import { createIdbPictureStore, PICTURES_DB } from './chatPictures';

/**
 * Just enough IndexedDB for `createIdbPictureStore`: one database, object stores by keyPath,
 * requests answered on a later tick, a transaction completing once its requests are done, and
 * a store that can refuse to commit (the browser's quota).
 */
function fakeIndexedDb({ quota = Infinity }: { quota?: number } = {}) {
  const stores = new Map<string, Map<string, Record<string, unknown>>>();
  let version = 0;
  const later = (fn: () => void) => setTimeout(fn, 0);
  const size = () => [...stores.values()].flatMap((s) => [...s.values()]).reduce((n, row) => n + JSON.stringify(row).length, 0);

  const db = {
    objectStoreNames: { contains: (name: string) => stores.has(name) },
    createObjectStore: (name: string) => void stores.set(name, new Map()),
    transaction(name: string, mode: IDBTransactionMode) {
      const rows = stores.get(name)!;
      const staged = new Map(rows);
      let pending = 0;
      const tx = { oncomplete: null as null | (() => void), onerror: null as null | (() => void), onabort: null as null | (() => void), error: null as unknown, objectStore: () => api };
      const settle = () =>
        later(() => {
          if (pending > 0) return;
          if (mode === 'readwrite') {
            const before = new Map(rows);
            rows.clear();
            for (const [k, v] of staged) rows.set(k, v);
            if (size() > quota) {
              rows.clear();
              for (const [k, v] of before) rows.set(k, v);
              tx.error = Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
              tx.onabort?.();
              return;
            }
          }
          tx.oncomplete?.();
        });
      const request = <T>(op: () => T) => {
        const req = { result: undefined as T | undefined, error: null as unknown, onsuccess: null as null | (() => void), onerror: null as null | (() => void) };
        pending += 1;
        later(() => {
          req.result = op();
          req.onsuccess?.();
          pending -= 1;
          settle();
        });
        return req;
      };
      const api = {
        put: (value: Record<string, unknown>) => request(() => void staged.set(value.id as string, structuredClone(value))),
        get: (key: string) => request(() => staged.get(key)),
        getAll: () => request(() => [...staged.values()]),
        getAllKeys: () => request(() => [...staged.keys()]),
        delete: (key: string) => request(() => void staged.delete(key)),
      };
      settle();
      return tx;
    },
  };

  const factory = {
    opened: [] as string[],
    open(name: string, v: number) {
      factory.opened.push(name);
      const req = { result: db, onupgradeneeded: null as null | (() => void), onsuccess: null as null | (() => void), onerror: null, onblocked: null };
      later(() => {
        if (v > version) {
          version = v;
          req.onupgradeneeded?.();
        }
        req.onsuccess?.();
      });
      return req;
    },
  };
  return { factory, stores };
}

describe('the browser picture store (k-0551)', () => {
  it('keeps, reads, counts and tidies pictures in its own database', async () => {
    const { factory, stores } = fakeIndexedDb();
    let clock = 100;
    const store = createIdbPictureStore(factory as unknown as IDBFactory, () => clock);
    expect(await store.putAll(new Map([['a-1', 'data:image/png;base64,AAA'], ['b-1', 'data:image/png;base64,BBB']]))).toBe(true);
    expect(factory.opened).toEqual([PICTURES_DB]);
    expect(stores.get('pictures')!.size).toBe(2);
    expect(await store.getAll(['a-1', 'zz-1'])).toEqual(new Map([['a-1', 'data:image/png;base64,AAA']]));
    expect(await store.usage()).toEqual({ pictures: 2, length: 50 });
    clock = 200;
    await store.putAll(new Map([['c-1', 'data:image/png;base64,CCC']]));
    // Not named and saved before 150: only b goes (a is named, c is newer).
    expect(await store.prune(new Set(['a-1']), 150)).toEqual(['b-1']);
    expect([...stores.get('pictures')!.keys()].sort()).toEqual(['a-1', 'c-1']);
  });

  it('a write the browser refuses (full) reports false and keeps nothing half-written', async () => {
    const { factory, stores } = fakeIndexedDb({ quota: 200 });
    const store = createIdbPictureStore(factory as unknown as IDBFactory);
    expect(await store.putAll(new Map([['a-1', 'x'.repeat(50)]]))).toBe(true);
    expect(await store.putAll(new Map([['b-1', 'y'.repeat(100)], ['c-1', 'z'.repeat(100)]]))).toBe(false);
    expect([...stores.get('pictures')!.keys()]).toEqual(['a-1']);
  });

  it('without IndexedDB (or when it will not open) says so instead of throwing', async () => {
    const none = createIdbPictureStore(undefined);
    expect(await none.putAll(new Map([['a-1', 'x']]))).toBe(false);
    expect(await none.getAll(['a-1'])).toBeUndefined();
    expect(await none.prune(new Set(), Date.now())).toEqual([]);
    const throwing = createIdbPictureStore({ open: () => { throw new Error('SecurityError'); } } as unknown as IDBFactory);
    expect(await throwing.putAll(new Map([['a-1', 'x']]))).toBe(false);
    expect(await throwing.getAll(['a-1'])).toBeUndefined();
  });
});
