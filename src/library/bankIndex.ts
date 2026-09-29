import type { StoreChangeListener } from '@/storage/changes';
import { summarize } from '@/storage/document';
import type { WorksheetStore } from '@/storage/types';
import { createMemoryBackend, type BankIndexBackend, type IndexedDocs, type StoredDoc } from './bankBackend';
import { groupRows } from './group';
import { rowsOf } from './indexer';
import type { BankGroup, BankRow, BankStatus } from './types';

/**
 * The persistent bank index behind `useBank` (§ docs/design/question-library.md, WP-B).
 *
 * 1. **First paint from the backend**: stored rows are published before anything is read
 *    from the store.
 * 2. **Reconcile**: `list()` against the freshness stamps (docId → `updatedAt`). A
 *    document whose stamp differs, or has none, is re-indexed — newest first, a few per
 *    idle slot, rows published as they land; a stamped document no longer listed
 *    (trashed, removed, gone in another tab) loses its rows. Follows `list()`, never
 *    storage keys: a trashed web document keeps its key.
 * 3. **Change feed**: saved/restored → re-index that document; trashed/removed → drop it;
 *    cleared → wipe; an event without an id (purge, Empty Trash) → reconcile.
 * 4. **Wake** (focus, tab shown): reconcile, for what another tab changed.
 *
 * Every change to one document bumps its counter; a load that finishes after a newer
 * change is discarded, so a slow scan never overwrites a fresher save.
 */

export interface BankSnapshot {
  status: BankStatus;
  rows: BankRow[];
  groups: BankGroup[];
}

export interface BankIndex {
  getSnapshot(): BankSnapshot;
  subscribe(listener: () => void): () => void;
  /** Reconcile with the store; resolves when this one finishes or a newer one supersedes it. */
  refresh(): Promise<void>;
  /** Resolves once every pending reconcile, change and backend write has finished. */
  settled(): Promise<void>;
}

export type BankSource = Pick<WorksheetStore, 'list' | 'load'>;

export interface BankIndexOptions {
  /** Where rows persist; in memory when omitted. */
  backend?: BankIndexBackend;
  /** The store's change feed (`onStoreChange`). */
  changes?: (listener: StoreChangeListener) => () => void;
  /** Calls back when the store may have changed elsewhere (another tab). */
  wake?: (listener: () => void) => () => void;
}

export const INITIAL_SNAPSHOT: BankSnapshot = {
  status: { state: 'scanning', done: 0, total: 0 },
  rows: [],
  groups: [],
};
const DOCS_PER_SLOT = 4;
const ignore = () => undefined;

/** Wait for the browser to be idle (or a macrotask where there is no idle callback). */
export function idle(): Promise<void> {
  return new Promise((resolve) => {
    const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void })
      .requestIdleCallback;
    if (ric) ric(() => resolve(), { timeout: 200 });
    else setTimeout(resolve, 0);
  });
}

/** Focus and a shown tab: when another tab may have saved. */
export function browserWake(listener: () => void): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return ignore;
  const onVisible = () => {
    if (document.visibilityState === 'visible') listener();
  };
  window.addEventListener('focus', listener);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    window.removeEventListener('focus', listener);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

/** Newest document first, then by id; rows keep their printed order within a document. */
function orderedRows(docs: IndexedDocs): BankRow[] {
  return [...docs.entries()]
    .sort(([a, x], [b, y]) =>
      x.updatedAt === y.updatedAt ? (a < b ? -1 : a > b ? 1 : 0) : x.updatedAt < y.updatedAt ? 1 : -1,
    )
    .flatMap(([, doc]) => doc.rows);
}

export function createBankIndex(
  source: BankSource,
  pause: () => Promise<void> = idle,
  options: BankIndexOptions = {},
): BankIndex {
  const backend = options.backend ?? createMemoryBackend();
  const docs: IndexedDocs = new Map();
  /** Per-document change counter; see the header. */
  const touched = new Map<string, number>();
  let epoch = 0;
  let snapshot = INITIAL_SNAPSHOT;
  let generation = 0;
  let running: Promise<void> | undefined;
  let loaded: Promise<void> | undefined;
  const listeners = new Set<() => void>();
  const tasks = new Set<Promise<unknown>>();

  // Backend writes: coalesced per document, applied in order, failures ignored (the
  // in-memory index is right; the next visit reconciles whatever did not persist).
  let pending = new Map<string, StoredDoc | null>();
  let flushQueued = false;
  let ticket = 0;
  let chain: Promise<void> = Promise.resolve();

  const track = <T>(task: Promise<T>): Promise<T> => {
    tasks.add(task);
    void task.finally(() => tasks.delete(task)).catch(ignore);
    return task;
  };

  function enqueue(op: () => Promise<void>) {
    chain = chain.then(op).catch(ignore);
  }

  function write(docId: string, doc: StoredDoc | null) {
    pending.set(docId, doc);
    if (flushQueued) return;
    flushQueued = true;
    const mine = ticket;
    enqueue(async () => {
      if (mine !== ticket) return;
      flushQueued = false;
      const batch = pending;
      pending = new Map();
      const put: [string, StoredDoc][] = [];
      const drop: string[] = [];
      for (const [id, entry] of batch) {
        if (entry) put.push([id, entry]);
        else drop.push(id);
      }
      await backend.commit(put, drop);
    });
  }

  const touch = (docId: string) => {
    const next = (touched.get(docId) ?? 0) + 1;
    touched.set(docId, next);
    return next;
  };

  function apply(docId: string, doc: StoredDoc) {
    docs.set(docId, doc);
    write(docId, doc);
  }

  function drop(docId: string) {
    if (!docs.has(docId)) return;
    docs.delete(docId);
    write(docId, null);
  }

  function publish(status?: BankStatus) {
    const rows = orderedRows(docs);
    snapshot = { status: status ?? snapshot.status, rows, groups: groupRows(rows) };
    for (const listener of listeners) listener();
  }

  function wipe() {
    generation++;
    epoch++;
    docs.clear();
    pending = new Map();
    ticket++;
    flushQueued = false;
    enqueue(() => backend.clear());
  }

  async function loadPersisted(): Promise<void> {
    try {
      const stored = await backend.load();
      if (stored) for (const [id, doc] of stored) if (!docs.has(id)) docs.set(id, doc);
    } catch {
      // Unreadable is empty: the reconcile rebuilds it.
      enqueue(() => backend.clear());
    }
    if (docs.size > 0) publish();
  }

  function start() {
    if (loaded) return;
    loaded = track(loadPersisted());
    options.changes?.(onChange);
    options.wake?.(() => {
      if (!running) void reconcile();
    });
  }

  function reconcile(): Promise<void> {
    start();
    const mine = ++generation;
    const run = track(
      (async () => {
        await loaded;
        if (mine !== generation) return;
        const seen = new Map(touched);
        const unchanged = (id: string) => touched.get(id) === seen.get(id);
        let summaries;
        try {
          summaries = await source.list();
        } catch (error) {
          if (mine === generation) publish({ state: 'error', done: 0, total: 0, error: String(error) });
          return;
        }
        if (mine !== generation) return;
        const listed = new Set(summaries.map((summary) => summary.id));
        for (const id of [...docs.keys()]) if (!listed.has(id) && unchanged(id)) drop(id);
        const work = summaries.filter((summary) => docs.get(summary.id)?.updatedAt !== (summary.updatedAt ?? ''));
        const total = summaries.length;
        let done = total - work.length;
        if (work.length > 0) publish({ state: 'scanning', done, total });
        for (let i = 0; i < work.length; i++) {
          if (i % DOCS_PER_SLOT === 0) await pause();
          if (mine !== generation) return;
          const summary = work[i];
          let worksheet;
          let failed = false;
          try {
            worksheet = await source.load(summary.id);
          } catch {
            // A document that will not open is skipped, and retried next time.
            failed = true;
          }
          if (mine !== generation) return;
          if (!failed && unchanged(summary.id)) {
            if (worksheet) {
              apply(summary.id, { updatedAt: summary.updatedAt ?? '', rows: rowsOf(worksheet, summary) });
            } else {
              drop(summary.id);
            }
          }
          done++;
          if ((i + 1) % DOCS_PER_SLOT === 0 && i + 1 < work.length) publish({ state: 'scanning', done, total });
        }
        publish({ state: 'ready', done: total, total });
      })(),
    );
    running = run;
    void run.finally(() => {
      if (running === run) running = undefined;
    });
    return run;
  }

  function onChange(change: Parameters<StoreChangeListener>[0], worksheet?: Parameters<StoreChangeListener>[1]) {
    const { docId, kind } = change;
    const mine = docId === undefined ? 0 : touch(docId);
    const myEpoch = epoch;
    const current = () => docId !== undefined && touched.get(docId) === mine && epoch === myEpoch;
    track(
      (async () => {
        await loaded;
        if (kind === 'cleared') {
          wipe();
          publish({ state: 'ready', done: 0, total: 0 });
          return;
        }
        if (docId === undefined) {
          await reconcile();
          return;
        }
        if (!current()) return;
        if (kind === 'trashed' || kind === 'removed') {
          drop(docId);
          publish();
          return;
        }
        await pause();
        if (!current()) return;
        let doc = worksheet;
        if (!doc) {
          doc = await source.load(docId).catch(() => undefined);
          if (!current()) return;
        }
        if (doc) {
          const summary = summarize(doc);
          apply(docId, { updatedAt: summary.updatedAt, rows: rowsOf(doc, summary) });
        } else {
          drop(docId);
        }
        publish();
      })(),
    );
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      if (!loaded) void reconcile();
      return () => listeners.delete(listener);
    },
    refresh: reconcile,
    async settled() {
      while (tasks.size > 0) await Promise.allSettled([...tasks]);
      await chain;
    },
  };
}
