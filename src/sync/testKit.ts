import { fakeLocalStorage, localFeed } from '@/library/bankTestKit';
import { createWorksheet } from '@/model/factories';
import { bi } from '@/model/text';
import type { Worksheet } from '@/model/types';
import { LocalStorageWorksheetStore } from '@/storage';
import { withChangeFeed } from '@/storage/changes';
import { memoryBaseStore } from './baseStore';
import { forgetOnWrite, memoryHashCache } from './hashCache';
import type { MemoryCloud } from './memorySource';
import { plainNamer } from './names';
import { runSync } from './run';
import type { SyncSource, SyncStore } from './types';

/** Test-only: simulated computers, each with its own store and base, on one cloud. */

export type Computer = ReturnType<typeof computer>;

/** How a computer reaches the cloud: directly, or through a folder (`folderTestKit.ts`). */
export type Connect = (cloud: MemoryCloud, name: string) => SyncSource;
export const memoryConnect: Connect = (cloud, name) => cloud.client(name);

export function computer(
  cloud: MemoryCloud,
  name: string,
  wrap: (source: SyncSource) => SyncSource = (s) => s,
  connect: Connect = memoryConnect,
) {
  const storage = fakeLocalStorage();
  const feed = localFeed();
  const hashCache = memoryHashCache();
  // As the app will: every write, the engine's and the teacher's, forgets its cached hash.
  const store = withChangeFeed(forgetOnWrite(new LocalStorageWorksheetStore(Date.now, () => storage), hashCache), feed.emit);
  const base = memoryBaseStore();
  const source = wrap(connect(cloud, name));
  /** Documents the engine loaded whole (`load` + `loadTrashed`). */
  const loads = { count: 0 };
  const engineStore: SyncStore = {
    ...store,
    load: (id) => ((loads.count += 1), store.load(id)),
    loadTrashed: (id) => ((loads.count += 1), store.loadTrashed(id)),
  };
  return {
    name,
    storage,
    store,
    base,
    feed,
    hashCache,
    loads,
    sync: () =>
      runSync({ store: engineStore, source, base, hashCache, namer: plainNamer(name), now: () => new Date(2026, 9, 5, 14, 32) }),
  };
}

/** A paper whose printed title is `title`: the tests' content marker. */
export function paper(title: string, extra: Partial<Worksheet> = {}): Worksheet {
  return { ...createWorksheet(), title: bi(title, ''), ...extra };
}

/** `updatedAt` is the edit's stamp: pass a fixed one to make every edit look the same to the hash cache. */
export async function edit(c: Computer, id: string, title: string, updatedAt = new Date().toISOString()): Promise<void> {
  const worksheet = await c.store.load(id);
  if (!worksheet) throw new Error(`${c.name} has no ${id}`);
  await c.store.save({ ...worksheet, title: bi(title, ''), updatedAt });
}

/** Every document on a computer: "live|trash  id  printed title  name", sorted. */
export async function library(c: Computer): Promise<string[]> {
  const rows: string[] = [];
  for (const row of await c.store.list()) {
    const doc = await c.store.load(row.id);
    rows.push(`live ${row.id} ${doc?.title.en.map((run) => run.text).join('')} ${doc?.name ?? ''}`.trim());
  }
  for (const row of await c.store.listTrash()) {
    const doc = await c.store.loadTrashed(row.id);
    rows.push(`trash ${row.id} ${doc?.title.en.map((run) => run.text).join('')} ${doc?.name ?? ''}`.trim());
  }
  return rows.sort();
}

/** Printed titles only, live then trash: what survives regardless of which id holds it. */
export async function titles(c: Computer): Promise<{ live: string[]; trash: string[] }> {
  const live: string[] = [];
  const trash: string[] = [];
  for (const row of await library(c)) {
    const [place, , title] = row.split(' ');
    (place === 'live' ? live : trash).push(title);
  }
  return { live: live.sort(), trash: trash.sort() };
}

/** Sync both, delivering between, until nothing moves. */
export async function settle(cloud: MemoryCloud, ...computers: Computer[]): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    for (const c of computers) {
      await c.sync();
      cloud.deliver();
    }
  }
}
