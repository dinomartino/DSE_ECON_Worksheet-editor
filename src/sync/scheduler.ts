import type { StoreChangeListener } from '@/storage/changes';
import { runSync, type SyncReport } from './run';
import type { BaseStore, CopyNamer, HashCache, SyncSource, SyncStore } from './types';

/**
 * When the engine runs (`docs/design/sync-engine.md` § The scheduler). Source-agnostic: a
 * cloud folder today, a cloud API or an account server later. Every run is a full
 * comparison; triggers only say *when*, so a missed one costs a delay, never data.
 *
 * - Triggers: start; focus or visibility regained; a local save (debounced); the source's
 *   hint (`onHint`) when `changes()` names something this computer did not just write; a
 *   `reset`; a rescan every `rescanMs` while visible (a watcher is only a hint).
 * - One run at a time. Triggers during a run coalesce into exactly one follow-up.
 * - `unavailable` (or a run that throws) backs off, `backoffMs` stepping up; any trigger
 *   still runs at once. Never read as empty: the engine stops the run.
 * - The engine's own store writes (`origin: 'sync'`, and its Trash moves) trigger nothing.
 */

export interface SchedulerClock {
  now(): number;
  setTimeout(run: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

/** Where the app's own events come from; injected so tests drive them. */
export interface SchedulerEnv {
  /** In view now: the periodic rescan runs only then. */
  visible(): boolean;
  /** Focus or visibility regained. Returns the unsubscribe. */
  onShown(listener: () => void): () => void;
  /** Every local store change (`onStoreChange`). Returns the unsubscribe. */
  onStoreChange(listener: StoreChangeListener): () => void;
}

/** Runs one sync inside a lock (a web source: Web Locks, so one tab runs at a time). */
export type Exclusive = (work: () => Promise<void>) => Promise<void>;

export interface Timing {
  /** Focus, hints, a follow-up: soon, so a burst of them is one run. */
  soonMs: number;
  /** After the last local save. */
  saveDebounceMs: number;
  rescanMs: number;
  backoffMs: readonly number[];
  /** How long a write this computer made is remembered for skipping its own echo. */
  ownWriteMs: number;
  /** A hint naming more keys than this runs without checking them one by one. */
  maxEchoKeys: number;
}

export const DEFAULT_TIMING: Timing = {
  soonMs: 250,
  saveDebounceMs: 3000,
  rescanMs: 60_000,
  backoffMs: [5000, 30_000, 120_000],
  ownWriteMs: 30_000,
  maxEchoKeys: 20,
};

export interface SchedulerOptions {
  source: SyncSource & { close?(): void };
  /** The app's store (the change-fed, `forgetOnWrite` singleton). */
  store: SyncStore;
  base: BaseStore & { flush?(): Promise<void> };
  namer: CopyNamer;
  hashCache?: HashCache;
  isBusy?: (id: string) => boolean;
  env: SchedulerEnv;
  clock?: SchedulerClock;
  exclusive?: Exclusive;
  timing?: Partial<Timing>;
  /** Each finished run's report (an `unavailable` one too). */
  onReport?: (report: SyncReport) => void;
}

export interface SyncStatus {
  state: 'stopped' | 'idle' | 'running' | 'unavailable';
  /** With `unavailable`: the source's reason, or 'error' when the run threw. */
  reason?: string;
  /** The last finished run's report. */
  lastReport?: SyncReport;
  /** When the last `ok` run finished. */
  lastSyncedAt?: number;
  /** With `unavailable`: when the next try is due. */
  retryAt?: number;
}

export interface Scheduler {
  start(): void;
  /** A run soon (a "Sync now" button, the console). */
  trigger(): void;
  status(): SyncStatus;
  subscribe(listener: (status: SyncStatus) => void): () => void;
  /** Waits out a run in flight, holds new ones while `work` runs, then runs once. */
  suspend<T>(work: () => Promise<T>): Promise<T>;
  /** Unsubscribes, waits out a run in flight, flushes the base, closes the source. */
  stop(): Promise<void>;
}

/** What a pending timer is for: a debounce moves itself later; a rescan skips while hidden. */
type Due = 'soon' | 'debounce' | 'rescan' | 'retry';

const systemClock: SchedulerClock = {
  now: () => Date.now(),
  setTimeout: (run, ms) => setTimeout(run, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** One tab at a time, where the browser has Web Locks; for a future web source. */
export function webLock(name = 'econ-studio-sync'): Exclusive | undefined {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (!locks) return undefined;
  return async (work) => {
    await locks.request(name, async () => {
      await work();
    });
  };
}

export function createScheduler(options: SchedulerOptions): Scheduler {
  const timing = { ...DEFAULT_TIMING, ...options.timing };
  const clock = options.clock ?? systemClock;
  const { source, base, env } = options;

  let status: SyncStatus = { state: 'stopped' };
  const listeners = new Set<(status: SyncStatus) => void>();
  const setStatus = (next: SyncStatus) => {
    status = next;
    for (const listener of [...listeners]) {
      try {
        listener(status);
      } catch {
        // A listener's failure is its own.
      }
    }
  };

  let started = false;
  let stopped = false;
  let unsubscribes: (() => void)[] = [];
  /** The one pending timer: the next run, or the next rescan. */
  let timer: unknown;
  let dueAt = Infinity;
  let dueKind: Due = 'soon';
  let inFlight: Promise<void> | undefined;
  let again = false;
  let suspended = 0;
  let failures = 0;
  let cursor: string | null = null;
  let checking = false;
  let hintPending = false;

  /** Keys this computer wrote (revision) or removed (null), and when. */
  const ownWrites = new Map<string, { revision: string | null; at: number }>();
  /** Ids the engine is writing locally right now: their change events are its own. */
  const engineWriting = new Map<string, number>();

  const recording: SyncSource = {
    list: () => source.list(),
    read: (key) => source.read(key),
    changes: (from) => source.changes(from),
    async write(key, text, writeOptions) {
      const written = await source.write(key, text, writeOptions);
      if (written.status === 'ok') ownWrites.set(key, { revision: written.revision, at: clock.now() });
      return written;
    },
    async remove(key, removeOptions) {
      const removed = await source.remove(key, removeOptions);
      if (removed.status === 'ok' || removed.status === 'missing') ownWrites.set(key, { revision: null, at: clock.now() });
      return removed;
    },
  };

  const writing = async <T>(id: string, work: () => Promise<T>): Promise<T> => {
    engineWriting.set(id, (engineWriting.get(id) ?? 0) + 1);
    try {
      return await work();
    } finally {
      const left = (engineWriting.get(id) ?? 1) - 1;
      if (left > 0) engineWriting.set(id, left);
      else engineWriting.delete(id);
    }
  };
  const engineStore: SyncStore = {
    list: () => options.store.list(),
    listTrash: () => options.store.listTrash(),
    load: (id) => options.store.load(id),
    loadTrashed: (id) => options.store.loadTrashed(id),
    adopt: (worksheet) => writing(worksheet.id, () => options.store.adopt(worksheet)),
    trash: (id) => writing(id, () => options.store.trash(id)),
    restore: (id) => writing(id, () => options.store.restore(id)),
  };

  function clearTimer() {
    if (timer !== undefined) clock.clearTimeout(timer);
    timer = undefined;
    dueAt = Infinity;
  }

  /** A run at `now + ms`; the earliest pending one wins, except a debounce moves itself later. */
  function schedule(ms: number, kind: Due = 'soon') {
    if (stopped || !started) return;
    const at = clock.now() + ms;
    if (timer !== undefined && at >= dueAt && !(kind === 'debounce' && dueKind === 'debounce')) return;
    clearTimer();
    dueAt = at;
    dueKind = kind;
    timer = clock.setTimeout(() => {
      timer = undefined;
      dueAt = Infinity;
      // Hidden since: the next focus runs it instead.
      if (kind === 'rescan' && !env.visible()) return;
      request();
    }, Math.max(0, ms));
  }

  /** Now, or once the run in flight ends. */
  function request() {
    if (stopped || !started) return;
    if (inFlight || suspended > 0) {
      again = true;
      return;
    }
    inFlight = runOnce().finally(() => {
      inFlight = undefined;
      afterRun();
    });
  }

  async function runOnce(): Promise<void> {
    setStatus({ ...status, state: 'running', reason: undefined, retryAt: undefined });
    let report: SyncReport | undefined;
    let threw = false;
    const work = async () => {
      // Taken first, so what changes during the run is reported after it.
      const changed = await source.changes(cursor).catch(() => undefined);
      if (changed && changed.status !== 'unavailable') cursor = changed.cursor;
      try {
        report = await runSync({
          store: engineStore,
          source: recording,
          base,
          namer: options.namer,
          ...(options.hashCache ? { hashCache: options.hashCache } : {}),
          ...(options.isBusy ? { isBusy: options.isBusy } : {}),
        });
      } finally {
        await base.flush?.().catch(() => undefined);
      }
    };
    try {
      await (options.exclusive ? options.exclusive(work) : work());
    } catch {
      threw = true;
    }
    if (report) {
      try {
        options.onReport?.(report);
      } catch {
        // The report's reader fails on its own.
      }
    }
    const now = clock.now();
    if (threw || !report || report.status === 'unavailable') {
      failures += 1;
      const wait = timing.backoffMs[Math.min(failures, timing.backoffMs.length) - 1];
      setStatus({
        ...status,
        state: 'unavailable',
        reason: threw || !report ? 'error' : report.reason,
        ...(report ? { lastReport: report } : {}),
        retryAt: now + wait,
      });
      return;
    }
    failures = 0;
    setStatus({ state: 'idle', lastReport: report, lastSyncedAt: now });
  }

  function afterRun() {
    if (stopped) return;
    if (again && suspended === 0) {
      again = false;
      schedule(timing.soonMs);
    } else if (status.state === 'unavailable' && status.retryAt !== undefined) {
      schedule(status.retryAt - clock.now(), 'retry');
    } else if (env.visible()) {
      schedule(timing.rescanMs, 'rescan');
    }
    if (hintPending) {
      hintPending = false;
      void check();
    }
  }

  /** The source hinted: run unless all it names is this computer's own last writes. */
  async function check(): Promise<void> {
    if (stopped || !started) return;
    if (inFlight || checking) {
      hintPending = true;
      return;
    }
    checking = true;
    try {
      const changed = await source.changes(cursor);
      if (changed.status === 'unavailable') return schedule(timing.soonMs);
      cursor = changed.cursor;
      if (changed.status === 'reset') return schedule(timing.soonMs);
      if (changed.keys.length === 0 || (await ownEcho(changed.keys))) return;
      schedule(timing.soonMs);
    } catch {
      schedule(timing.soonMs);
    } finally {
      checking = false;
      if (hintPending && !inFlight) {
        hintPending = false;
        void check();
      }
    }
  }

  /** Every key is one this computer just wrote (or removed), and still holds exactly that. */
  async function ownEcho(keys: string[]): Promise<boolean> {
    const now = clock.now();
    for (const [key, write] of ownWrites) if (now - write.at > timing.ownWriteMs) ownWrites.delete(key);
    if (keys.length > timing.maxEchoKeys) return false;
    for (const key of keys) {
      const mine = ownWrites.get(key);
      if (!mine) return false;
      const read = await source.read(key);
      if (mine.revision === null ? read.status !== 'missing' : read.status !== 'ok' || read.revision !== mine.revision) return false;
    }
    return true;
  }

  const onChange: StoreChangeListener = (change) => {
    if (change.origin === 'sync') return;
    if (change.docId !== undefined && engineWriting.has(change.docId)) return;
    schedule(timing.saveDebounceMs, 'debounce');
  };

  return {
    start() {
      if (started || stopped) return;
      started = true;
      setStatus({ state: 'idle' });
      unsubscribes = [
        env.onStoreChange(onChange),
        env.onShown(() => schedule(timing.soonMs)),
        ...(source.onHint ? [source.onHint(() => void check())] : []),
      ];
      request();
    },
    trigger() {
      schedule(0);
    },
    status: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    async suspend(work) {
      suspended += 1;
      try {
        await inFlight;
        return await work();
      } finally {
        suspended -= 1;
        if (suspended === 0 && started && !stopped) {
          again = false;
          schedule(timing.soonMs);
        }
      }
    },
    async stop() {
      if (stopped) return;
      stopped = true;
      clearTimer();
      for (const unsubscribe of unsubscribes) unsubscribe();
      unsubscribes = [];
      await inFlight;
      await base.flush?.().catch(() => undefined);
      source.close?.();
      setStatus({ ...status, state: 'stopped', retryAt: undefined });
    },
  };
}
