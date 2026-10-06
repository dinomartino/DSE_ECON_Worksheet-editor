import { describe, expect, it } from 'vitest';
import { bi } from '@/model/text';
import { stringifyWorksheet } from '@/storage/document';
import { folderSource } from './folderSource';
import { FakeLibrary, libraryPath, MARKER } from './folderTestKit';
import { sha256 } from './hash';
import { documentKey } from './keys';
import { MemoryCloud } from './memorySource';
import { computer, library, paper, settle, titles } from './testKit';

/**
 * The folder source over a fake of the shell's commands. The engine's own scenarios run
 * through it too (`run.test.ts`, `property.test.ts`); these are what only a folder does.
 */

function folder() {
  const cloud = new MemoryCloud();
  const fakes = new Map<string, FakeLibrary>();
  const through = (name: string) =>
    computer(cloud, name, undefined, (c, n) => {
      const fake = new FakeLibrary(c, n);
      fakes.set(n, fake);
      return folderSource(fake);
    });
  const a = through('A');
  const b = through('B');
  return { cloud, a, b, fakeA: fakes.get('A')!, fakeB: fakes.get('B')! };
}

describe('folderSource', () => {
  it('lists paths as keys with content hashes as revisions, the marker and temp files left out', async () => {
    const cloud = new MemoryCloud();
    for (const key of ['a.worksheet.json', 'trash/b.worksheet.json', MARKER, '.a.worksheet.json.econ-ff.tmp', 'notes.txt']) cloud.put(key, key);
    const source = folderSource(new FakeLibrary(cloud, 'A'));
    expect(await source.list()).toEqual({
      status: 'ok',
      entries: [
        { key: 'a.worksheet.json', revision: sha256('a.worksheet.json'), size: 16 },
        { key: 'trash/b.worksheet.json', revision: sha256('trash/b.worksheet.json'), size: 22 },
      ],
    });
  });

  it('compare-and-swaps on the hash, and writes nothing for identical bytes', async () => {
    const cloud = new MemoryCloud();
    const source = folderSource(new FakeLibrary(cloud, 'A'));
    expect(await source.write('k.json', 'one', { expectRevision: null })).toEqual({ status: 'ok', revision: sha256('one') });
    expect(await source.write('k.json', 'two', { expectRevision: null })).toEqual({ status: 'conflict' });
    expect(await source.write('k.json', 'two', { expectRevision: sha256('other') })).toEqual({ status: 'conflict' });
    const stored = cloud.files.get('k.json');
    expect(await source.write('k.json', 'one', { expectRevision: sha256('one') })).toEqual({ status: 'ok', revision: sha256('one') });
    expect(cloud.files.get('k.json')).toBe(stored); // untouched: no upload, no mtime bump
    expect(await source.remove('k.json', { expectRevision: sha256('two') })).toEqual({ status: 'conflict' });
    expect(await source.remove('k.json', { expectRevision: sha256('one') })).toEqual({ status: 'ok' });
    expect(await source.remove('k.json', { expectRevision: sha256('one') })).toEqual({ status: 'missing' });
    expect(cloud.recycled).toEqual([{ key: 'k.json', text: 'one' }]);
  });

  it('a bad path rejects, as the shell refuses it', async () => {
    const source = folderSource(new FakeLibrary(new MemoryCloud(), 'A'));
    for (const path of ['../x.json', '/abs.json', 'a/../b.json', '.hidden.json', MARKER, 'x.json.tmp']) {
      expect(libraryPath(path), path).toBe(false);
      await expect(source.read(path)).rejects.toThrow();
    }
  });

  it('an unusable root is unavailable, never an empty folder', async () => {
    const { a, fakeA, cloud } = folder();
    await a.store.save(paper('Kept'));
    await a.sync();
    for (const reason of ['root-missing', 'no-marker', 'newer-format'] as const) {
      fakeA.root = reason;
      expect(await folderSource(fakeA).list()).toEqual({ status: 'unavailable' });
      expect((await a.sync()).status).toBe('unavailable');
    }
    fakeA.root = null;
    expect(await titles(a)).toEqual({ live: ['Kept'], trash: [] });
    expect(cloud.recycled).toEqual([]);
  });

  it('a file that will not read is held, never read as deleted or written over', async () => {
    const { cloud, a, b, fakeB } = folder();
    const doc = paper('Synced');
    await a.store.save(doc);
    await settle(cloud, a, b);
    const key = documentKey(doc.id, 'live');
    fakeB.placeholders.set(key, 'stuck');
    const report = await b.sync();
    expect(report.held).toEqual([{ id: doc.id, key, reason: 'unreadable' }]);
    expect(await library(b)).toEqual([`live ${doc.id} Synced`]);
    // An edit here waits too: its upload would have to write over the unread file.
    const edited = { ...(await b.store.load(doc.id))!, title: bi('Edited', '') };
    await b.store.save(edited);
    expect((await b.sync()).held).toHaveLength(1);
    expect(cloud.files.get(key)?.text).toBe(stringifyWorksheet(doc));
    fakeB.placeholders.delete(key);
    await settle(cloud, a, b);
    expect(await titles(a)).toEqual({ live: ['Edited'], trash: [] });
  });

  it('a placeholder not yet downloaded is read (so downloaded) and found unchanged', async () => {
    const { cloud, a, b, fakeB } = folder();
    const doc = paper('Evicted');
    await a.store.save(doc);
    await settle(cloud, a, b);
    const key = documentKey(doc.id, 'live');
    fakeB.placeholders.set(key, 'evicted');
    expect((await folderSource(fakeB).list()).status).toBe('ok');
    const report = await b.sync();
    expect(report.errors).toEqual([]);
    expect(Object.values(report.counts).every((n) => n === 0)).toBe(true);
    expect(fakeB.placeholders.has(key)).toBe(false);
    expect(await library(b)).toEqual([`live ${doc.id} Evicted`]);
  });

  it.each([
    'x.worksheet-DESKTOP-1.json', // OneDrive
    'x.worksheet (1).json', // Google Drive
    'x.worksheet 2.json', // iCloud
    "x.worksheet (Tino's conflicted copy 2026-10-05).json", // Dropbox
    'trash/x.worksheet (1).json',
  ])('a provider conflict copy named %s becomes its own paper, once', async (name) => {
    const { cloud, a, b } = folder();
    const doc = paper('Base');
    await a.store.save(doc);
    await settle(cloud, a, b);
    cloud.put(name, stringifyWorksheet({ ...doc, title: bi('Theirs', '') }));
    await settle(cloud, a, b);
    const trashed = name.startsWith('trash/');
    expect(await titles(a)).toEqual({ live: trashed ? ['Base'] : ['Base', 'Theirs'], trash: trashed ? ['Theirs'] : [] });
    expect(await library(a)).toEqual(await library(b));
    expect(cloud.files.has(name)).toBe(false);
  });

  it('a copy that dropped ".worksheet" from its name is listed, and left to the planner', async () => {
    const { cloud, a } = folder();
    cloud.put('x-PC.json', stringifyWorksheet(paper('Odd')));
    const listed = await folderSource(new FakeLibrary(cloud, 'A')).list();
    expect(listed.status === 'ok' && listed.entries.map((entry) => entry.key)).toEqual(['x-PC.json']);
    // `classifyKey` takes only names holding ".worksheet": this one is not synced.
    expect((await a.sync()).counts.providerCopies).toBe(0);
  });

  it('the root going away mid-run stops the run; nothing is trashed', async () => {
    const { cloud, a, b } = folder();
    const docs = [paper('One'), paper('Two'), paper('Three')];
    for (const doc of docs) await a.store.save(doc);
    await settle(cloud, a, b);
    for (const doc of docs) await a.store.trash(doc.id);
    cloud.failAfter('A', 3);
    expect((await a.sync()).status).toBe('unavailable');
    cloud.setUnavailable('A', false);
    await settle(cloud, a, b);
    expect(await titles(b)).toEqual({ live: [], trash: ['One', 'Three', 'Two'] });
  });
});

describe('folderSource changes', () => {
  async function watched() {
    const fake = new FakeLibrary(new MemoryCloud(), 'A');
    const source = folderSource(fake, { maxLog: 3 });
    const first = await source.changes(null);
    if (first.status === 'unavailable') throw new Error('unavailable');
    return { fake, source, cursor: first.cursor, first };
  }

  it('starts with a reset, then reports the paths each burst named', async () => {
    const { fake, source, cursor, first } = await watched();
    expect(first.status).toBe('reset');
    expect(fake.watching).toBe(true);
    expect(await source.changes(cursor)).toEqual({ status: 'ok', keys: [], cursor });
    fake.emit(['a.worksheet.json']);
    fake.emit(['a.worksheet.json', 'trash/b.worksheet.json']);
    const next = await source.changes(cursor);
    expect(next).toEqual({ status: 'ok', keys: ['a.worksheet.json', 'trash/b.worksheet.json'], cursor: expect.any(String) });
    expect(await source.changes(next.status === 'ok' ? next.cursor : '')).toMatchObject({ status: 'ok', keys: [] });
  });

  it('resets after a rescan, too many bursts, or a cursor from another run', async () => {
    const { fake, source, cursor } = await watched();
    fake.emit([], { rescan: true });
    expect((await source.changes(cursor)).status).toBe('reset');
    const after = await source.changes(null);
    for (let i = 0; i < 4; i += 1) fake.emit([`k${i}.worksheet.json`]);
    expect((await source.changes(after.status === 'reset' ? after.cursor : '')).status).toBe('reset');
    expect((await source.changes('elsewhere.0:0')).status).toBe('reset');
    expect((await folderSource(fake).changes(cursor)).status).toBe('reset');
  });

  it('ignores an old watcher session, and restarts the watcher after the root comes back', async () => {
    const { fake, source, cursor } = await watched();
    fake.emit(['stale.worksheet.json'], { session: 0 });
    expect(await source.changes(cursor)).toEqual({ status: 'ok', keys: [], cursor });
    fake.root = 'root-missing';
    expect(await source.list()).toEqual({ status: 'unavailable' });
    expect(fake.watching).toBe(false);
    expect(await source.changes(cursor)).toEqual({ status: 'unavailable' });
    fake.root = null;
    expect((await source.changes(cursor)).status).toBe('reset');
    expect(fake.watching).toBe(true);
  });

  it('a watcher that will not start means rescan every time, and is retried', async () => {
    const fake = new FakeLibrary(new MemoryCloud(), 'A');
    fake.watchFails = true;
    const source = folderSource(fake);
    const first = await source.changes(null);
    expect((await source.changes(first.status === 'reset' ? first.cursor : '')).status).toBe('reset');
    fake.watchFails = false;
    const started = await source.changes(null);
    expect(fake.watching).toBe(true);
    expect((await source.changes(started.status === 'reset' ? started.cursor : '')).status).toBe('ok');
    source.close();
    expect(fake.watching).toBe(false);
  });
});
