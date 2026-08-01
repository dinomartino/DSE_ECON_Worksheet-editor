import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalStorageWorksheetStore } from '.';
import { createWorksheet } from '@/model/factories';
import { bi } from '@/model/text';

/**
 * Browser persistence (§6).
 *
 * The store is the reason a document survives a restart — it lives in `localStorage`,
 * not in the build — so the risks are about *reach*: clearing more than this app owns,
 * or failing to clear what it does.
 */

/** A `localStorage` good enough for the store, since the tests run under node. */
function fakeStorage(): Storage {
  const map = new Map<string, string>();
  const storage = {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
  // `Object.keys(storage)` is what the implementation enumerates, so the entries have to
  // be own properties of the object itself, exactly as the browser exposes them.
  return new Proxy(storage as unknown as Storage, {
    ownKeys: () => [...map.keys()],
    getOwnPropertyDescriptor: (_t, p) =>
      map.has(String(p))
        ? { configurable: true, enumerable: true, value: map.get(String(p)) }
        : undefined,
    get: (target, p) =>
      p in target ? (target as never)[p] : (map.get(String(p)) as never),
  });
}

let storage: Storage;

beforeEach(() => {
  storage = fakeStorage();
  vi.stubGlobal('window', { localStorage: storage });
});

const store = () => new LocalStorageWorksheetStore();

describe('saving and reopening', () => {
  it('round-trips a worksheet and lists it', async () => {
    const worksheet = { ...createWorksheet(), title: bi('Test paper', '測驗') };
    await store().save(worksheet);

    expect(await store().load(worksheet.id)).toMatchObject({ id: worksheet.id });
    expect(await store().list()).toEqual([
      expect.objectContaining({ id: worksheet.id, title: 'Test paper' }),
    ]);
  });

  it('lists the most recently updated document first', async () => {
    // What the editor reopens on load, so the ordering *is* the "my last work came
    // back" behaviour rather than an incidental detail of the index.
    const older = { ...createWorksheet(), updatedAt: '2026-01-01T00:00:00.000Z' };
    const newer = { ...createWorksheet(), updatedAt: '2026-08-01T00:00:00.000Z' };
    await store().save(older);
    await store().save(newer);

    expect((await store().list())[0].id).toBe(newer.id);
  });
});

describe('clearing', () => {
  it('forgets every saved document', async () => {
    await store().save(createWorksheet());
    await store().save(createWorksheet());
    expect(await store().list()).toHaveLength(2);

    await store().clear();
    expect(await store().list()).toEqual([]);
  });

  it('touches nothing that belongs to another app on the same origin', async () => {
    // `localStorage` is shared across everything served from this origin. Clearing it
    // wholesale — or reaching for the browser's own "clear site data" — would delete a
    // neighbour's keys, which is why the implementation filters by prefix rather than
    // calling `storage.clear()`.
    storage.setItem('some-other-app:token', 'keep me');
    storage.setItem('theme', 'dark');
    await store().save(createWorksheet());

    await store().clear();

    expect(storage.getItem('some-other-app:token')).toBe('keep me');
    expect(storage.getItem('theme')).toBe('dark');
  });

  it('is safe to call when nothing has ever been saved', async () => {
    await expect(store().clear()).resolves.toBeUndefined();
    expect(await store().list()).toEqual([]);
  });
});
