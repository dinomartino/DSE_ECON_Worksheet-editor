import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeLocalStorage, localFeed } from '@/library/bankTestKit';
import { LocalStorageWorksheetStore } from '@/storage';
import { withChangeFeed } from '@/storage/changes';
import { memoryBaseStore } from './baseStore';
import { folderSource } from './folderSource';
import { FakeLibrary } from './folderTestKit';
import { forgetOnWrite, memoryHashCache } from './hashCache';
import { documentKey } from './keys';
import { MemoryCloud } from './memorySource';
import { plainNamer } from './names';
import type { SyncReport } from './run';
import { createScheduler, DEFAULT_TIMING, type Scheduler } from './scheduler';
import { computer, paper, settle } from './testKit';
import type { SyncSource } from './types';

/** The scheduler over fake timers: when runs happen, never what they do (`run.test.ts`). */

const { soonMs, saveDebounceMs, rescanMs } = DEFAULT_TIMING;

/** Lets every pending promise chain finish; no timer moves. */
async function flush() {
  for (let i = 0; i < 300; i += 1) await Promise.resolve();
}

async function advance(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
  await flush();
}

type Wrap = (source: SyncSource & { close?(): void }) => SyncSource & { close?(): void };

function setup(options: { cloud?: MemoryCloud; folder?: boolean; wrap?: Wrap; visible?: boolean } = {}) {
  const cloud = options.cloud ?? new MemoryCloud();
  const fake = new FakeLibrary(cloud, 'B');
  const raw = options.folder ? folderSource(fake) : cloud.client('B');
  const source = options.wrap ? options.wrap(raw) : raw;
  const storage = fakeLocalStorage();
  const feed = localFeed();
  const cache = memoryHashCache();
  const store = withChangeFeed(forgetOnWrite(new LocalStorageWorksheetStore(Date.now, () => storage), cache), feed.emit);
  const base = { ...memoryBaseStore(), flush: vi.fn(async () => {}) };
  const shown = new Set<() => void>();
  const env = {
    visible: () => options.visible ?? true,
    onShown: (listener: () => void) => (shown.add(listener), () => void shown.delete(listener)),
    onStoreChange: feed.subscribe,
  };
  const reports: SyncReport[] = [];
  const scheduler = createScheduler({
    source,
    store,
    base,
    namer: plainNamer('B'),
    hashCache: cache,
    env,
    onReport: (report) => reports.push(report),
  });
  return { cloud, fake, source, store, base, feed, scheduler, reports, show: () => shown.forEach((listener) => listener()) };
}

/** The first `list` waits until `release`: a run held in flight. */
function gated() {
  let release: (() => void) | undefined;
  const opened = new Promise<void>((resolve) => (release = resolve));
  let first = true;
  const wrap: Wrap = (source) => ({
    list: async () => {
      if (first) {
        first = false;
        await opened;
      }
      return source.list();
    },
    read: (key) => source.read(key),
    write: (key, text, options) => source.write(key, text, options),
    remove: (key, options) => source.remove(key, options),
    changes: (cursor) => source.changes(cursor),
  });
  return { wrap, release: () => release!() };
}

let running: Scheduler | undefined;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(async () => {
  await running?.stop();
  running = undefined;
  vi.useRealTimers();
});

async function started(options: Parameters<typeof setup>[0] = {}) {
  const s = setup(options);
  running = s.scheduler;
  s.scheduler.start();
  await flush();
  return s;
}

describe('the sync scheduler', () => {
  it('runs on start, then rescans every minute while visible', async () => {
    const { reports, scheduler, base } = await started();
    expect(reports).toHaveLength(1);
    expect(scheduler.status()).toMatchObject({ state: 'idle', lastReport: reports[0] });
    expect(base.flush).toHaveBeenCalledTimes(1);
    await advance(rescanMs - 1);
    expect(reports).toHaveLength(1);
    await advance(1);
    expect(reports).toHaveLength(2);
    expect(base.flush).toHaveBeenCalledTimes(2);
  });

  it('does not rescan while hidden; coming back into view runs, once for a burst of events', async () => {
    const { reports, show } = await started({ visible: false });
    await advance(rescanMs * 3);
    expect(reports).toHaveLength(1);
    show();
    show();
    await advance(soonMs);
    expect(reports).toHaveLength(2);
    await advance(soonMs * 4);
    expect(reports).toHaveLength(2);
  });

  it('runs after a local save, debounced', async () => {
    const { reports, store } = await started();
    const doc = paper('Mine');
    for (let i = 0; i < 3; i += 1) {
      await store.save({ ...doc, updatedAt: new Date().toISOString() });
      await advance(1000);
    }
    expect(reports).toHaveLength(1);
    await advance(saveDebounceMs - 1000);
    expect(reports).toHaveLength(2);
    expect(reports[1].counts.uploaded).toBe(1);
  });

  it("ignores the engine's own writes: downloads (origin sync) and its Trash moves", async () => {
    const cloud = new MemoryCloud();
    const a = computer(cloud, 'A');
    const doc = paper('Theirs');
    await a.store.save(doc);
    await a.sync();
    const { reports, feed, scheduler } = await started({ cloud });
    expect(reports[0].counts.downloaded).toBe(1);
    await a.store.trash(doc.id);
    await a.sync();
    scheduler.trigger();
    await advance(0);
    expect(reports[1].counts.movedLocal).toBe(1);
    expect(feed.events.map((event) => event.kind)).toEqual(['saved', 'trashed']);
    await advance(saveDebounceMs * 2);
    expect(reports).toHaveLength(2);
  });

  it('coalesces every trigger during a run into exactly one follow-up', async () => {
    const gate = gated();
    const { reports, store, show, scheduler } = await started({ wrap: gate.wrap });
    expect(scheduler.status().state).toBe('running');
    show();
    scheduler.trigger();
    await store.save(paper('During'));
    await advance(saveDebounceMs);
    expect(reports).toHaveLength(0);
    gate.release();
    await flush();
    expect(reports).toHaveLength(1);
    await advance(soonMs);
    // The run read the library after the save, so it took it; the follow-up is still owed.
    expect(reports).toHaveLength(2);
    expect(reports[0].counts.uploaded + reports[1].counts.uploaded).toBe(1);
    await advance(saveDebounceMs * 2);
    expect(reports).toHaveLength(2);
  });

  it('backs off while unavailable, steps up to the cap, and any trigger still runs at once', async () => {
    const cloud = new MemoryCloud();
    cloud.setUnavailable('B', true);
    const { reports, scheduler, show } = await started({ cloud });
    expect(scheduler.status()).toMatchObject({ state: 'unavailable', retryAt: Date.now() + 5000 });
    for (const wait of [5000, 30_000, 120_000, 120_000]) {
      const before = reports.length;
      await advance(wait - 1);
      expect(reports).toHaveLength(before);
      await advance(1);
      expect(reports).toHaveLength(before + 1);
    }
    show();
    await advance(soonMs);
    expect(reports).toHaveLength(6);
    expect(reports.every((report) => report.status === 'unavailable')).toBe(true);
    cloud.setUnavailable('B', false);
    show();
    await advance(soonMs);
    expect(scheduler.status()).toMatchObject({ state: 'idle' });
    // Recovered: the next unavailable starts from the first step again.
    cloud.setUnavailable('B', true);
    await advance(rescanMs);
    expect(scheduler.status()).toMatchObject({ state: 'unavailable', retryAt: Date.now() + 5000 });
  });

  it("carries the folder's reason, and a run that throws backs off as an error", async () => {
    const { fake, scheduler, reports } = await started({ folder: true });
    fake.root = 'no-marker';
    scheduler.trigger();
    await advance(0);
    expect(scheduler.status()).toMatchObject({ state: 'unavailable', reason: 'no-marker' });
    expect(reports.at(-1)?.reason).toBe('no-marker');
    fake.root = null;
    fake.list = async () => {
      throw new Error('bridge down');
    };
    scheduler.trigger();
    await advance(0);
    expect(scheduler.status()).toMatchObject({ state: 'unavailable', reason: 'error' });
  });

  it("skips a watcher burst naming only what this computer just wrote; another computer's write runs", async () => {
    const { fake, store, reports, cloud } = await started({ folder: true });
    const doc = paper('Mine');
    await store.save(doc);
    await advance(saveDebounceMs);
    expect(reports.at(-1)?.counts.uploaded).toBe(1);
    const key = documentKey(doc.id, 'live');
    fake.emit([key]);
    await advance(soonMs * 4);
    expect(reports).toHaveLength(2);
    // The same path, now holding other bytes: not an echo.
    const other = new FakeLibrary(cloud, 'A');
    const theirs = paper('Theirs');
    await folderSource(other).write(documentKey(theirs.id, 'live'), JSON.stringify(theirs), { expectRevision: null });
    fake.emit([key, documentKey(theirs.id, 'live')]);
    await advance(soonMs);
    expect(reports).toHaveLength(3);
    expect(reports[2].counts.downloaded).toBe(1);
  });

  it('a reset (the watcher lost events) runs', async () => {
    const { fake, reports } = await started({ folder: true });
    fake.emit([], { rescan: true });
    await advance(soonMs);
    expect(reports).toHaveLength(2);
  });

  it('suspend waits out a run in flight, holds new ones, then runs once', async () => {
    const gate = gated();
    const { reports, scheduler, show } = await started({ wrap: gate.wrap });
    const order: string[] = [];
    const suspended = scheduler.suspend(async () => {
      order.push(`work after ${reports.length} runs`);
      show();
      await advance(soonMs * 2);
      order.push(`still ${reports.length}`);
    });
    gate.release();
    await suspended;
    expect(order).toEqual(['work after 1 runs', 'still 1']);
    await advance(soonMs);
    expect(reports).toHaveLength(2);
  });

  it('stop waits out a run, flushes the base, closes the source, and nothing runs after', async () => {
    const { fake, scheduler, reports, base, show, store } = await started({ folder: true });
    expect(fake.watching).toBe(true);
    await scheduler.stop();
    running = undefined;
    expect(fake.watching).toBe(false);
    expect(base.flush).toHaveBeenCalledTimes(2);
    expect(scheduler.status().state).toBe('stopped');
    show();
    scheduler.trigger();
    await store.save(paper('Late'));
    await advance(rescanMs * 2);
    expect(reports).toHaveLength(1);
  });

  it('passes isBusy through: unsaved edits are held', async () => {
    const cloud = new MemoryCloud();
    const a = computer(cloud, 'A');
    const doc = paper('Shared');
    await a.store.save(doc);
    await a.sync();
    const s = setup({ cloud });
    await settle(cloud, a);
    const busy = createScheduler({
      source: s.source,
      store: s.store,
      base: s.base,
      namer: plainNamer('B'),
      env: { visible: () => true, onShown: () => () => {}, onStoreChange: s.feed.subscribe },
      isBusy: (id) => id === doc.id,
      onReport: (report) => s.reports.push(report),
    });
    running = busy;
    busy.start();
    await flush();
    expect(s.reports[0].held).toEqual([{ id: doc.id, reason: 'busy' }]);
  });
});
