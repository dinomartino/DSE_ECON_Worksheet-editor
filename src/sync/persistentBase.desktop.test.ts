/**
 * The desktop's sync base: `$APPDATA/sync/base-<hash>.json` through `fileStore.ts:syncBaseFile`.
 * The filesystem is faked in memory and the shell by the global it injects;
 * `@tauri-apps/plugin-fs` is never really loaded.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BaseEntry } from './types';

const files = new Map<string, string>();
const dirs = new Set<string>();
const fault = { rename: false, remove: false, read: false };
let writes = 0;

vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: { AppData: 13 },
  exists: async (path: string) => files.has(path) || dirs.has(path),
  mkdir: async (path: string) => void dirs.add(path),
  readTextFile: async (path: string) => {
    const value = files.get(path);
    if (fault.read || value === undefined) throw new Error(`ENOENT ${path}`);
    return value;
  },
  writeTextFile: async (path: string, contents: string) => {
    if (!dirs.has(path.slice(0, path.lastIndexOf('/')))) throw new Error(`ENOENT dir of ${path}`);
    writes += 1;
    files.set(path, contents);
  },
  remove: async (path: string) => {
    if (fault.remove) throw new Error('EBUSY');
    if (!files.delete(path)) throw new Error(`ENOENT ${path}`);
  },
  rename: async (from: string, to: string) => {
    if (fault.rename) throw new Error('EPERM');
    const value = files.get(from);
    if (value === undefined) throw new Error(`ENOENT ${from}`);
    files.delete(from);
    files.set(to, value);
  },
}));

vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });

const { syncBaseFile, syncBasePath, SYNC_DIR } = await import('@/storage/fileStore');
const { createBaseStore, fileBaseStore, parseBaseFile, serializeBaseFile } = await import('./persistentBase');

const entry = (id: string, extra: Partial<BaseEntry> = {}): BaseEntry => ({
  id,
  kind: 'worksheet',
  place: 'live',
  hash: 'f'.repeat(64),
  revision: `r-${id}`,
  schemaVersion: 1,
  ...extra,
});
const ids = (map: Map<string, BaseEntry>) => [...map.keys()].sort();
/** A store with no timer of its own: writes happen on `flush`. */
const open = (sourceId = 'src') => fileBaseStore(sourceId, syncBaseFile(sourceId), 60_000);
const stored = (sourceId = 'src') => files.get(syncBasePath(sourceId));

beforeEach(() => {
  files.clear();
  dirs.clear();
  Object.assign(fault, { rename: false, remove: false, read: false });
  writes = 0;
});
afterEach(() => vi.useRealTimers());

describe('fileBaseStore on desktop', () => {
  it('round-trips through a file under sync/, never under worksheets/', async () => {
    const store = open();
    await store.put(entry('a'));
    await store.put(entry('b', { place: 'trash', revision: '' }));
    await store.remove('a');
    await store.put(entry('c'));
    await store.flush();

    const path = syncBasePath('src');
    expect(path).toMatch(/^sync\/base-[0-9a-f]{32}\.json$/);
    expect(SYNC_DIR).toBe('sync');
    expect([...files.keys()]).toEqual([path]);
    expect(await open().load()).toEqual(new Map([['b', entry('b', { place: 'trash', revision: '' })], ['c', entry('c')]]));
  });

  it('coalesces a run of puts into one write, on the timer or on flush', async () => {
    vi.useFakeTimers();
    const store = fileBaseStore('src', syncBaseFile('src'), 1000);
    for (let i = 0; i < 500; i += 1) await store.put(entry(`d${i}`));
    expect(writes).toBe(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(writes).toBe(1);
    expect(parseBaseFile('src', stored()).size).toBe(500);

    await store.put(entry('late'));
    await store.flush();
    expect(writes).toBe(2);
    await store.flush(); // nothing new: no write
    expect(writes).toBe(2);
  });

  it('lags, never runs ahead: a crash before the write leaves the last written agreement', async () => {
    const store = open();
    await store.put(entry('a', { revision: 'r1' }));
    await store.flush();
    await store.put(entry('a', { revision: 'r2' }));
    await store.put(entry('b'));
    // The process dies here. The next launch reads only what was agreed and written.
    expect(await open().load()).toEqual(new Map([['a', entry('a', { revision: 'r1' })]]));
    // The live store still sees its own puts.
    expect(ids(await store.load())).toEqual(['a', 'b']);
  });

  it('reads a torn, foreign or unreadable file as an empty base, and writes a good one over it', async () => {
    const path = syncBasePath('src');
    dirs.add(SYNC_DIR);
    const bad = [
      '{"format":1,"sourceId":"src","entries":[{"id":"a","kin',
      '',
      'null',
      JSON.stringify({ format: 2, sourceId: 'src', entries: [entry('a')] }),
      serializeBaseFile('another source', new Map([['a', entry('a')]])),
      JSON.stringify({ format: 1, sourceId: 'src', entries: 'a' }),
    ];
    for (const text of bad) {
      files.set(path, text);
      await expect(open().load()).resolves.toEqual(new Map());
    }
    const store = open();
    await store.put(entry('z'));
    await store.flush();
    expect(ids(await open().load())).toEqual(['z']);

    fault.read = true;
    await expect(open().load()).resolves.toEqual(new Map());
  });

  it('drops a bad row alone, and both rows of an id listed twice', async () => {
    dirs.add(SYNC_DIR);
    files.set(
      syncBasePath('src'),
      JSON.stringify({
        format: 1,
        sourceId: 'src',
        entries: [entry('good'), { ...entry('noHash'), hash: null }, entry('twice'), entry('twice', { revision: 'other' }), 5, entry('fine')],
      }),
    );
    expect(ids(await open().load())).toEqual(['fine', 'good']);
  });

  it('keeps the old file whole when the rename is refused, then retries', async () => {
    const store = open();
    await store.put(entry('a', { revision: 'r1' }));
    await store.flush();
    const before = stored();

    fault.rename = true;
    await store.put(entry('a', { revision: 'r2' }));
    await store.flush();
    expect(stored()).toBe(before);
    expect([...files.keys()]).toEqual([syncBasePath('src')]); // no temp file left behind

    fault.rename = false;
    await store.flush();
    expect((await open().load()).get('a')!.revision).toBe('r2');
  });

  it('keeps sources apart', async () => {
    const one = open('one');
    const two = open('two');
    await one.put(entry('a'));
    await two.put(entry('b'));
    await Promise.all([one.flush(), two.flush()]);
    expect(syncBasePath('one')).not.toBe(syncBasePath('two'));
    expect(ids(await open('one').load())).toEqual(['a']);
    expect(ids(await open('two').load())).toEqual(['b']);
    await two.clear();
    expect(ids(await open('one').load())).toEqual(['a']);
  });

  it('clear forgets the base for good: no pending or in-flight write brings it back', async () => {
    vi.useFakeTimers();
    const store = fileBaseStore('src', syncBaseFile('src'), 1000);
    await store.put(entry('a'));
    await store.flush();
    await store.put(entry('b')); // pending on the timer
    await store.clear();
    expect(stored()).toBeUndefined();
    await vi.advanceTimersByTimeAsync(5000);
    expect(stored()).toBeUndefined();
    expect(await store.load()).toEqual(new Map());
    expect(await open().load()).toEqual(new Map());

    // A put after clear is a new agreement, and is kept.
    await store.put(entry('c'));
    await store.flush();
    expect(ids(await open().load())).toEqual(['c']);
  });

  it('clear before the first read never resurrects the file', async () => {
    const seeded = open();
    await seeded.put(entry('old'));
    await seeded.flush();
    const store = open();
    const loading = store.load(); // read in flight
    await store.clear();
    await loading;
    expect(await store.load()).toEqual(new Map());
    expect(stored()).toBeUndefined();
  });

  it('clear throws when the file will not go', async () => {
    const store = open();
    await store.put(entry('a'));
    await store.flush();
    fault.remove = true;
    await expect(store.clear()).rejects.toThrow();
    fault.remove = false;
    await store.clear();
    expect(stored()).toBeUndefined();
  });
});

describe('createBaseStore on desktop', () => {
  it('is file-backed, one store per source', async () => {
    const store = createBaseStore('desk');
    expect(createBaseStore('desk')).toBe(store);
    await store.put(entry('a'));
    await store.flush();
    expect(parseBaseFile('desk', stored('desk'))).toEqual(new Map([['a', entry('a')]]));
  });
});
