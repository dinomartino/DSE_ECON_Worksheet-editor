import { beforeEach, describe, expect, it } from 'vitest';
import { installLocalStorage, localFeed } from '@/library/bankTestKit';
import { createWorksheet } from '@/model/factories';
import type { Worksheet } from '@/model/types';
import { LocalStorageWorksheetStore, worksheetStore } from '.';
import { buildBackup, readBackup, restoreBackup } from './backup';
import { emitStoreChange, onStoreChange, withChangeFeed } from './changes';

/**
 * The change feed announces every successful mutation of the store and changes nothing
 * else: same results, same errors, nothing announced for a call that failed.
 */

beforeEach(() => {
  installLocalStorage();
});

const doc = (extra: Partial<Worksheet> = {}): Worksheet => ({ ...createWorksheet(), ...extra });

function fed() {
  const feed = localFeed();
  const inner = new LocalStorageWorksheetStore();
  return { feed, inner, store: withChangeFeed(inner, feed.emit) };
}

describe('withChangeFeed', () => {
  it('announces a save with the worksheet written, and a rename as a save', async () => {
    const { feed, store } = fed();
    const worksheet = doc();
    let carried: Worksheet | undefined;
    const withHint = withChangeFeed(new LocalStorageWorksheetStore(), (_change, written) => (carried = written));
    await withHint.save(worksheet);
    expect(carried).toBe(worksheet);

    await store.save(worksheet);
    await store.rename(worksheet.id, 'Renamed');
    expect(feed.events).toEqual([
      { docId: worksheet.id, kind: 'saved' },
      { docId: worksheet.id, kind: 'saved' },
    ]);
  });

  it('announces trash, restore (under the id it came back as), remove, purge, Empty Trash and clear', async () => {
    const { feed, store } = fed();
    const [a, b, c] = [doc(), doc(), doc()];
    for (const worksheet of [a, b, c]) await store.save(worksheet);
    feed.events.length = 0;

    await store.trash(a.id);
    expect(await store.restore(a.id)).toBe(a.id);
    expect(await store.restore('nothing-there')).toBeUndefined();
    await store.remove(b.id);
    await store.trash(c.id);
    await store.purge(c.id);
    await store.emptyTrash();
    await store.clear();

    expect(feed.events).toEqual([
      { docId: a.id, kind: 'trashed' },
      { docId: a.id, kind: 'restored' },
      { docId: b.id, kind: 'removed' },
      { docId: c.id, kind: 'trashed' },
      { kind: 'removed' },
      { kind: 'removed' },
      { kind: 'cleared' },
    ]);
  });

  it('announces a restore that came back under a new id (desktop, id live again) by that id', async () => {
    const feed = localFeed();
    const inner = new LocalStorageWorksheetStore();
    inner.restore = async () => 'copy-id';
    const store = withChangeFeed(inner, feed.emit);
    expect(await store.restore('old-id')).toBe('copy-id');
    expect(feed.events).toEqual([{ docId: 'copy-id', kind: 'restored' }]);
  });

  it('announces each document a backup restore saves, copies under their new ids', async () => {
    const { feed, store } = fed();
    const live = doc({ name: 'Live' });
    await store.save(live);
    const fresh = doc({ name: 'Fresh' });
    const changed = { ...live, name: 'Edited elsewhere' };
    const { worksheets } = await readBackup(await buildBackup([fresh, changed]));
    feed.events.length = 0;

    const report = await restoreBackup(store, worksheets, () => 'copy-1');
    expect(report.restored).toHaveLength(1);
    expect(report.copied).toHaveLength(1);
    expect(feed.events).toHaveLength(2);
    expect(feed.events).toEqual(
      expect.arrayContaining([
        { docId: fresh.id, kind: 'saved' },
        { docId: 'copy-1', kind: 'saved' },
      ]),
    );
  });

  it('announces nothing when the call fails, and rethrows its error', async () => {
    const feed = localFeed();
    const failing = new LocalStorageWorksheetStore();
    failing.save = () => Promise.reject(new Error('full'));
    const store = withChangeFeed(failing, feed.emit);
    await expect(store.save(doc())).rejects.toThrow('full');
    expect(feed.events).toEqual([]);
  });

  it('passes reads through untouched and survives a listener that throws', async () => {
    const worksheet = doc();
    const store = withChangeFeed(new LocalStorageWorksheetStore(), () => {
      throw new Error('listener bug');
    });
    await expect(store.save(worksheet)).resolves.toBeUndefined();
    const shared = withChangeFeed(new LocalStorageWorksheetStore());
    const off = onStoreChange(() => {
      throw new Error('listener bug');
    });
    await expect(shared.save(worksheet)).resolves.toBeUndefined();
    off();
    expect((await shared.list()).map((s) => s.id)).toEqual([worksheet.id]);
    expect((await shared.load(worksheet.id))?.id).toBe(worksheet.id);
    expect(await shared.listTrash()).toEqual([]);
  });

  it('is what the store singleton is', async () => {
    const heard: unknown[] = [];
    const off = onStoreChange((change) => heard.push(change));
    const worksheet = doc();
    await worksheetStore.save(worksheet);
    emitStoreChange({ kind: 'cleared' });
    off();
    await worksheetStore.save(doc());
    expect(heard).toEqual([{ docId: worksheet.id, kind: 'saved' }, { kind: 'cleared' }]);
  });
});
