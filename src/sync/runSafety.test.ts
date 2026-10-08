import { describe, expect, it } from 'vitest';
import { bi } from '@/model/text';
import { folderConnect } from './folderTestKit';
import { documentKey } from './keys';
import { MemoryCloud } from './memorySource';
import { plainNamer } from './names';
import { runSync } from './run';
import { computer, edit, library, memoryConnect, paper, settle, titles, type Computer, type Connect } from './testKit';
import type { CopyNamer, SyncSource, SyncStore } from './types';

/**
 * Pre-release review findings (2026-10-08), each a way a teacher's version could be lost:
 * a base recorded that the sides never agreed on, a download over a document a failed or
 * partial listing missed, and a provider copy named two ways by two computers.
 */

const SOURCES: [string, Connect][] = [
  ['memory', memoryConnect],
  ['folder', folderConnect],
];

/** One run of `c` through another store view, namer or source (a failing listing, an older build). */
const runAs = (
  c: Computer,
  connect: Connect,
  cloud: MemoryCloud,
  store: SyncStore,
  namer: CopyNamer = plainNamer(c.name),
  wrap: (source: SyncSource) => SyncSource = (source) => source,
) => runSync({ store, source: wrap(connect(cloud, c.name)), base: c.base, namer, now: () => new Date(2026, 9, 5, 14, 32) });

describe.each(SOURCES)('%s source', (_source, connect) => {
  async function synced(...names: string[]) {
    const cloud = new MemoryCloud();
    const a = computer(cloud, 'A', undefined, connect);
    const b = computer(cloud, 'B', undefined, connect);
    const docs = names.map((name) => paper(name));
    for (const doc of docs) await a.store.save(doc);
    await settle(cloud, a, b);
    return { cloud, a, b, docs };
  }

  it('a save not from the editor landing right after a download keeps both versions', async () => {
    const { cloud, a, b, docs } = await synced('One');
    const [doc] = docs;
    await edit(a, doc.id, 'FromA');
    await a.sync();
    // B: an outgoing document's save (based on "One") lands right after the engine's adopt.
    const old = (await b.store.load(doc.id))!;
    b.hooks.afterAdopt = async (id) => {
      if (id !== doc.id) return;
      b.hooks.afterAdopt = undefined;
      await b.store.save({ ...old, title: bi('FromB', ''), updatedAt: new Date().toISOString() });
    };
    await b.sync();
    await settle(cloud, a, b);
    expect(await titles(a)).toEqual({ live: ['FromA', 'FromB'], trash: [] });
    expect(await library(a)).toEqual(await library(b));
  });

  it('a library that will not list stops the run: nothing is downloaded over or trashed', async () => {
    const { cloud, a, docs } = await synced('Synced', 'Other');
    await edit(a, docs[0].id, 'UnsyncedEdit');
    await a.store.trash(docs[1].id);
    const failing: SyncStore = { ...a.store, list: async () => [], listTrash: async () => [] };
    const report = await runAs(a, connect, cloud, failing);
    expect(report.status).toBe('unavailable');
    expect(report.counts.downloaded + report.counts.purgedRemote).toBe(0);
    expect(await titles(a)).toEqual({ live: ['UnsyncedEdit'], trash: ['Other'] });
    // Listing again: the edit goes up.
    expect((await a.sync()).counts.uploaded).toBe(1);
  });

  it('a listing that throws stops the run too', async () => {
    const { cloud, a, docs } = await synced('Synced');
    await edit(a, docs[0].id, 'UnsyncedEdit');
    const failing: SyncStore = {
      ...a.store,
      list: async () => {
        throw new Error('EIO');
      },
    };
    expect((await runAs(a, connect, cloud, failing)).status).toBe('unavailable');
    expect(await titles(a)).toEqual({ live: ['UnsyncedEdit'], trash: [] });
  });

  it('a document missing from the listing but still stored is never downloaded over', async () => {
    const { cloud, a, b, docs } = await synced('Kept', 'Listed');
    const [doc] = docs;
    await edit(a, doc.id, 'UnsyncedEdit');
    // A dangling index: the row is gone, the document is not.
    const partial: SyncStore = { ...a.store, list: async () => (await a.store.list()).filter((row) => row.id !== doc.id) };
    const report = await runAs(a, connect, cloud, partial);
    expect(report.counts.downloaded).toBe(0);
    expect(report.errors.map((error) => error.key)).toEqual([documentKey(doc.id, 'live')]);
    expect(await titles(a)).toEqual({ live: ['Listed', 'UnsyncedEdit'], trash: [] });
    await settle(cloud, a, b);
    expect(await titles(b)).toEqual({ live: ['Listed', 'UnsyncedEdit'], trash: [] });
  });

  it('a trashed document missing from the Trash listing is never purged from the cloud', async () => {
    const { cloud, a, b, docs } = await synced('Binned', 'Live');
    await a.store.trash(docs[0].id);
    await settle(cloud, a, b);
    const partial: SyncStore = { ...b.store, listTrash: async () => [] };
    const report = await runAs(b, connect, cloud, partial);
    expect(report.counts.purgedRemote).toBe(0);
    expect(cloud.files.has(documentKey(docs[0].id, 'trash'))).toBe(true);
  });

  it('a provider copy is one copy, even when the computers named it in different languages', async () => {
    const cloud = new MemoryCloud();
    const a = computer(cloud, 'A', undefined, connect);
    const b = computer(cloud, 'B', undefined, connect);
    const doc = paper('Base');
    await a.store.save(doc);
    await settle(cloud, a, b);
    cloud.delayed = true;
    await edit(a, doc.id, 'FromA');
    await edit(b, doc.id, 'FromB');
    await a.sync();
    await b.sync();
    cloud.deliver();
    // A runs an older build, which named the copy in Chinese only. It wrote its copy, then
    // went offline before removing the provider's file.
    const older: CopyNamer = { ...plainNamer('A'), providerCopy: (name) => `${name}（來自另一部電腦）` };
    const report = await runAs(a, connect, cloud, a.store, older, (source) => ({
      ...source,
      list: () => source.list(),
      read: (key) => source.read(key),
      write: (key, text, options) => source.write(key, text, options),
      changes: (cursor) => source.changes(cursor),
      remove: async () => ({ status: 'unavailable' }),
    }));
    expect(report).toMatchObject({ status: 'unavailable', counts: { providerCopies: 0 } });
    cloud.deliver();
    // B meets the provider's file and the old-named copy: it takes that name, one copy.
    expect((await b.sync()).counts.providerCopies).toBe(1);
    await settle(cloud, a, b);
    expect(await titles(a)).toEqual({ live: ['FromA', 'FromB'], trash: [] });
    expect((await library(b)).filter((row) => row.includes('來自另一部電腦'))).toHaveLength(1);
    expect(await library(a)).toEqual(await library(b));
  });
});

describe('the provider copy name', () => {
  it('is one bilingual name, the same on every computer', () => {
    expect(plainNamer('A').providerCopy('Mock')).toBe(plainNamer('B').providerCopy('Mock'));
    expect(plainNamer('A').providerCopy('Mock')).toBe('Mock (from another computer / 來自另一部電腦)');
  });
});
