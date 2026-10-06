/**
 * The web's sync base (IndexedDB `econ-worksheet-sync`). IndexedDB is faked in memory with
 * just the calls the store makes; requests settle on later tasks, as in a browser.
 */
import { describe, expect, it } from 'vitest';
import { LIBRARY_DB } from '@/library/idbBackend';
import { baseEntryFrom } from './baseStore';
import { createBaseStore, idbBaseStore, SYNC_DB } from './persistentBase';
import type { BaseEntry } from './types';

const HASH = 'a'.repeat(64);
const entry = (id: string, extra: Partial<BaseEntry> = {}): BaseEntry => ({
  id,
  kind: 'worksheet',
  place: 'live',
  hash: HASH,
  revision: `r-${id}`,
  schemaVersion: 1,
  ...extra,
});
const ids = (map: Map<string, BaseEntry>) => [...map.keys()].sort();

interface StoreData {
  keyPath: string[];
  indexes: Map<string, string>;
  rows: Map<string, { key: unknown; value: Record<string, unknown> }>;
}

function fakeIndexedDb() {
  const dbs = new Map<string, { version: number; stores: Map<string, StoreData> }>();
  const later = (fn: () => void) => setTimeout(fn, 0);

  function connection(data: { version: number; stores: Map<string, StoreData> }) {
    const db = {
      onversionchange: null as null | (() => void),
      closed: false,
      objectStoreNames: { contains: (name: string) => data.stores.has(name) },
      createObjectStore(name: string, options: { keyPath: string[] }) {
        const store: StoreData = { keyPath: options.keyPath, indexes: new Map(), rows: new Map() };
        data.stores.set(name, store);
        return { createIndex: (index: string, path: string) => void store.indexes.set(index, path) };
      },
      close() {
        db.closed = true;
      },
      transaction(name: string, mode: 'readonly' | 'readwrite') {
        if (db.closed) throw new Error('InvalidStateError');
        const store = data.stores.get(name)!;
        let pending = 0;
        let ended = false;
        let failure: unknown;
        const tx = {
          oncomplete: null as null | (() => void),
          onerror: null as null | (() => void),
          onabort: null as null | (() => void),
          error: null as unknown,
          objectStore: () => api,
        };
        const finish = () =>
          later(() => {
            if (pending > 0 || ended) return;
            ended = true;
            if (failure) {
              tx.error = failure;
              tx.onerror?.();
            } else tx.oncomplete?.();
          });
        const request = <T>(op: () => T) => {
          const req = { result: undefined as T | undefined, error: null as unknown, onsuccess: null as null | (() => void), onerror: null as null | (() => void) };
          pending += 1;
          later(() => {
            try {
              req.result = op();
              req.onsuccess?.();
            } catch (error) {
              req.error = failure = error;
              req.onerror?.();
            }
            pending -= 1;
            finish();
          });
          return req;
        };
        const writable = () => {
          if (mode !== 'readwrite') throw new Error('ReadOnlyError');
        };
        const matching = (index: string, value: unknown) =>
          [...store.rows.values()].filter((row) => row.value[store.indexes.get(index)!] === value);
        const api = {
          put: (value: Record<string, unknown>) =>
            request(() => {
              writable();
              const key = store.keyPath.map((path) => value[path]);
              store.rows.set(JSON.stringify(key), { key, value: structuredClone(value) });
            }),
          delete: (key: unknown) =>
            request(() => {
              writable();
              store.rows.delete(JSON.stringify(key));
            }),
          index: (index: string) => ({
            getAll: (value: unknown) => request(() => matching(index, value).map((row) => structuredClone(row.value))),
            getAllKeys: (value: unknown) => request(() => matching(index, value).map((row) => row.key)),
          }),
        };
        finish();
        return tx;
      },
    };
    return db;
  }

  const factory = {
    open(name: string, version: number) {
      const req = { result: undefined as unknown, onupgradeneeded: null as null | (() => void), onsuccess: null as null | (() => void) };
      later(() => {
        let data = dbs.get(name);
        if (!data) dbs.set(name, (data = { version: 0, stores: new Map() }));
        const db = connection(data);
        req.result = db;
        if (version > data.version) {
          data.version = version;
          req.onupgradeneeded?.();
        }
        req.onsuccess?.();
      });
      return req;
    },
  } as unknown as IDBFactory;

  /** Write a raw row, as another build (or a corruption) might have. */
  const plant = (value: Record<string, unknown>) => {
    const store = dbs.get(SYNC_DB)!.stores.get('base')!;
    const key = [value.sourceId, value.id];
    store.rows.set(JSON.stringify(key), { key, value });
  };
  return { factory, dbs, plant };
}

describe('baseEntryFrom (one stored row)', () => {
  it('keeps a whole row and drops unknown fields', () => {
    expect(baseEntryFrom({ ...entry('a'), extra: 1, sourceId: 's' })).toEqual(entry('a'));
    expect(baseEntryFrom(entry('a', { place: 'trash', revision: '' }))).toEqual(entry('a', { place: 'trash', revision: '' }));
  });

  it('rejects a row with any field off, rather than guess', () => {
    const bad: unknown[] = [
      null,
      'a',
      { ...entry('a'), id: '' },
      { ...entry('a'), id: 3 },
      { ...entry('a'), kind: 'graph' },
      { ...entry('a'), place: 'gone' },
      { ...entry('a'), hash: '' },
      { ...entry('a'), hash: undefined },
      { ...entry('a'), revision: null },
      { ...entry('a'), schemaVersion: '1' },
      { ...entry('a'), schemaVersion: 1.5 },
      { ...entry('a'), schemaVersion: -1 },
    ];
    for (const row of bad) expect(baseEntryFrom(row)).toBeUndefined();
  });
});

describe('idbBaseStore', () => {
  it('round-trips through its own database, never the library one', async () => {
    const idb = fakeIndexedDb();
    const store = idbBaseStore('folder:1', idb.factory);
    await store.put(entry('a'));
    await store.put(entry('b', { place: 'trash' }));
    await store.put(entry('a', { revision: 'r2' }));
    await store.remove('missing');

    const reopened = idbBaseStore('folder:1', idb.factory);
    expect(await reopened.load()).toEqual(new Map([['a', entry('a', { revision: 'r2' })], ['b', entry('b', { place: 'trash' })]]));
    await reopened.remove('b');
    expect(ids(await store.load())).toEqual(['a']);
    expect([...idb.dbs.keys()]).toEqual([SYNC_DB]);
    expect(SYNC_DB).not.toBe(LIBRARY_DB);
  });

  it('hands out copies: changing a loaded entry changes nothing stored', async () => {
    const idb = fakeIndexedDb();
    const store = idbBaseStore('s', idb.factory);
    await store.put(entry('a'));
    (await store.load()).get('a')!.hash = 'changed';
    expect((await store.load()).get('a')!.hash).toBe(HASH);
  });

  it('drops each bad row alone; the rest load', async () => {
    const idb = fakeIndexedDb();
    const store = idbBaseStore('s', idb.factory);
    await store.put(entry('good'));
    idb.plant({ sourceId: 's', ...entry('noHash'), hash: 7 });
    idb.plant({ sourceId: 's', ...entry('badPlace'), place: 'elsewhere' });
    idb.plant({ sourceId: 's', id: 'bare' });
    idb.plant({ sourceId: 's', ...entry('alsoGood') });
    expect(ids(await store.load())).toEqual(['alsoGood', 'good']);
  });

  it('keeps sources apart, and clear forgets only its own', async () => {
    const idb = fakeIndexedDb();
    const one = idbBaseStore('one', idb.factory);
    const two = idbBaseStore('two', idb.factory);
    await one.put(entry('a'));
    await two.put(entry('a', { revision: 'theirs' }));
    await two.put(entry('b'));
    expect((await one.load()).get('a')!.revision).toBe('r-a');
    expect(ids(await two.load())).toEqual(['a', 'b']);

    await two.clear();
    expect(await two.load()).toEqual(new Map());
    expect(await idbBaseStore('two', idb.factory).load()).toEqual(new Map());
    expect(ids(await one.load())).toEqual(['a']);
  });

  it('works for the session in memory when there is no IndexedDB', async () => {
    const store = idbBaseStore('s', undefined);
    expect(await store.load()).toEqual(new Map());
    await store.put(entry('a'));
    expect(ids(await store.load())).toEqual(['a']);
    await store.clear();
    expect(await store.load()).toEqual(new Map());
  });

  it('never throws on load when IndexedDB refuses to open; clear says it could not forget', async () => {
    const throwing = { open: () => { throw new Error('SecurityError'); } } as unknown as IDBFactory;
    const failing = {
      open: () => {
        const req = { error: new Error('denied'), onerror: null as null | (() => void) };
        setTimeout(() => req.onerror?.(), 0);
        return req;
      },
    } as unknown as IDBFactory;
    for (const factory of [throwing, failing]) {
      const store = idbBaseStore('s', factory);
      expect(await store.load()).toEqual(new Map());
      await store.put(entry('a'));
      expect(ids(await store.load())).toEqual(['a']);
      await expect(store.clear()).rejects.toThrow();
      expect(await store.load()).toEqual(new Map());
    }
  });

  it('reads as empty, without throwing, when the database goes away mid-session', async () => {
    const idb = fakeIndexedDb();
    const store = idbBaseStore('s', idb.factory);
    await store.put(entry('a'));
    idb.dbs.get(SYNC_DB)!.stores.delete('base'); // a read that fails
    await expect(store.load()).resolves.toEqual(new Map());
    await expect(store.put(entry('b'))).resolves.toBeUndefined();
  });
});

describe('createBaseStore on the web', () => {
  it('needs a source id and hands each source one store', async () => {
    expect(() => createBaseStore('')).toThrow();
    const a = createBaseStore('web-a');
    expect(createBaseStore('web-a')).toBe(a);
    expect(createBaseStore('web-b')).not.toBe(a);
    // Node has no IndexedDB: the session store still works.
    await a.put(entry('x'));
    expect(ids(await a.load())).toEqual(['x']);
    expect(await createBaseStore('web-b').load()).toEqual(new Map());
  });
});
