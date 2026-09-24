/**
 * Trash on the web store. Keys are literals, like `legacyIndex.test.ts`: what an older
 * build reads is the contract, and a trashed document must look deleted to it while
 * staying intact for this one.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalStorageWorksheetStore } from '.';
import { createWorksheet } from '@/model/factories';
import { settleTrash, trashAge, TRASH_RETENTION_DAYS } from './trash';

const INDEX_KEY = 'econ-worksheet-index';
const PREFIX = 'econ-worksheet:';
const TRASH_KEY = 'econ-worksheet-trash';
const DAY = 86_400_000;

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
let clock: number;
const store = () => new LocalStorageWorksheetStore(() => clock);
const doc = (id: string, name = `Doc ${id}`) => ({
  ...createWorksheet(),
  id,
  name,
  updatedAt: '2026-01-01T00:00:00.000Z',
});

beforeEach(() => {
  storage = fakeStorage();
  vi.stubGlobal('window', { localStorage: storage });
  clock = Date.parse('2026-09-01T00:00:00.000Z');
});

describe('moving to Trash', () => {
  it('leaves the list, lands in Trash, and keeps the document', async () => {
    await store().save(doc('a'));
    await store().save(doc('b'));
    await store().trash('a');

    expect((await store().list()).map((e) => e.id)).toEqual(['b']);
    expect(await store().listTrash()).toEqual([
      expect.objectContaining({ id: 'a', title: 'Doc a', deletedAt: '2026-09-01T00:00:00.000Z' }),
    ]);
    expect(storage.getItem(PREFIX + 'a')).not.toBeNull();
  });

  it('looks deleted to an older build: gone from the index, the trash key is not a document key', async () => {
    await store().save(doc('a'));
    await store().trash('a');

    expect(JSON.parse(storage.getItem(INDEX_KEY)!)).toEqual([]);
    expect(TRASH_KEY.startsWith(PREFIX)).toBe(false);
  });

  it('restores round trip, with the same id and content', async () => {
    const original = doc('a');
    await store().save(original);
    await store().trash('a');

    expect(await store().restore('a')).toBe('a');
    expect((await store().list()).map((e) => e.id)).toEqual(['a']);
    expect(await store().listTrash()).toEqual([]);
    expect((await store().load('a'))?.name).toBe(original.name);
  });

  it('a save of a trashed id makes it live again, never in both lists', async () => {
    // The editor's autosave for a document trashed while open.
    await store().save(doc('a'));
    await store().trash('a');
    await store().save(doc('a', 'edited'));

    expect((await store().list()).map((e) => e.id)).toEqual(['a']);
    expect(await store().listTrash()).toEqual([]);
  });

  it('hides a row whose id is live again (an older build re-imported it)', async () => {
    await store().save(doc('a'));
    await store().trash('a');
    // Older build: writes the document and its index row, knows nothing of Trash.
    const index = JSON.parse(storage.getItem(INDEX_KEY)!);
    storage.setItem(INDEX_KEY, JSON.stringify([{ id: 'a', title: 'Doc a', updatedAt: 'x' }, ...index]));

    expect(await store().listTrash()).toEqual([]);
    // And purging cannot reach the live document through the shared key.
    await store().purge('a');
    expect(storage.getItem(PREFIX + 'a')).not.toBeNull();
  });

  it('drops a row whose document is gone (an older build cleared storage)', async () => {
    await store().save(doc('a'));
    await store().trash('a');
    storage.removeItem(PREFIX + 'a');

    expect(await store().listTrash()).toEqual([]);
    expect(storage.getItem(TRASH_KEY)).toBeNull();
  });
});

describe('the 30-day purge', () => {
  it('keeps a document for 30 days, then deletes it when the Trash is next read', async () => {
    await store().save(doc('a'));
    await store().trash('a');

    clock += (TRASH_RETENTION_DAYS - 1) * DAY;
    expect(await store().listTrash()).toHaveLength(1);

    clock += DAY;
    expect(await store().listTrash()).toEqual([]);
    expect(storage.getItem(PREFIX + 'a')).toBeNull();
  });

  it('re-dates an undated row instead of purging it', () => {
    const now = Date.parse('2026-09-01T00:00:00.000Z');
    const { kept, expired } = settleTrash(
      [{ id: 'a', title: 'A', updatedAt: '', deletedAt: 'garbage' }],
      now,
    );
    expect(expired).toEqual([]);
    expect(kept[0].deletedAt).toBe('2026-09-01T00:00:00.000Z');
  });

  it('counts days ago and days left', () => {
    const deleted = '2026-09-01T00:00:00.000Z';
    expect(trashAge(deleted, Date.parse(deleted))).toEqual({ daysAgo: 0, daysLeft: 30 });
    expect(trashAge(deleted, Date.parse(deleted) + 3 * DAY + 1000)).toEqual({
      daysAgo: 3,
      daysLeft: 27,
    });
  });
});

describe('a damaged Trash list', () => {
  it('keeps the good rows when one is malformed', async () => {
    await store().save(doc('a'));
    await store().save(doc('b'));
    await store().trash('a');
    await store().trash('b');
    const rows = JSON.parse(storage.getItem(TRASH_KEY)!);
    storage.setItem(TRASH_KEY, JSON.stringify([{ title: 'No id' }, 42, ...rows]));

    expect((await store().listTrash()).map((r) => r.id).sort()).toEqual(['a', 'b']);
  });

  it('an unreadable Trash list does not touch the file list', async () => {
    await store().save(doc('a'));
    storage.setItem(TRASH_KEY, '{ broken');

    expect(await store().listTrash()).toEqual([]);
    expect((await store().list()).map((e) => e.id)).toEqual(['a']);
  });
});

describe('deleting for good', () => {
  it('purge and Empty Trash delete the documents', async () => {
    await store().save(doc('a'));
    await store().save(doc('b'));
    await store().save(doc('c'));
    await store().trash('a');
    await store().trash('b');
    await store().purge('a');
    expect(storage.getItem(PREFIX + 'a')).toBeNull();
    expect((await store().listTrash()).map((r) => r.id)).toEqual(['b']);

    await store().emptyTrash();
    expect(storage.getItem(PREFIX + 'b')).toBeNull();
    expect(await store().listTrash()).toEqual([]);
    expect((await store().list()).map((e) => e.id)).toEqual(['c']);
  });

  it('clear() takes the Trash with it', async () => {
    await store().save(doc('a'));
    await store().trash('a');
    await store().clear();

    expect(storage.getItem(TRASH_KEY)).toBeNull();
    expect(storage.getItem(PREFIX + 'a')).toBeNull();
  });

  it('trashing a row whose document is already gone just drops the row', async () => {
    storage.setItem(INDEX_KEY, JSON.stringify([{ id: 'ghost', title: 'Ghost', updatedAt: 'x' }]));
    await store().trash('ghost');

    expect(await store().list()).toEqual([]);
    expect(await store().listTrash()).toEqual([]);
  });
});
