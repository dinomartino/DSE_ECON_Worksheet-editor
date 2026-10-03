import type { StoreChangeListener } from '@/storage/changes';
import { summarize } from '@/storage/document';
import type { WorksheetStore } from '@/storage/types';
import { createMemoryBackend, type BankIndexBackend, type IndexedDocs, type StoredDoc } from './bankBackend';
import { groupRows } from './group';
import { rowsOf } from './indexer';
import { withSharedTags } from './sharedTags';
import type { BankGroup, BankRow, BankStatus } from './types';
import type { Worksheet } from '@/model/types';

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
 * 3. **Change feed**: saved/restored → re-index that document (coalesced: § Saves below);
 *    trashed/removed → drop it;
 *    cleared → wipe; an event without an id (purge, Empty Trash) → reconcile.
 * 4. **Wake** (focus, tab shown): reconcile, for what another tab changed.
 *
 * Every change to one document bumps its counter; a load that finishes after a newer
 * change is discarded, so a slow scan never overwrites a fresher save.
 */

export interface BankSnapshot {
  status: BankStatus;
  /** Each row's `tags` and `tagsAt` are its question's shared set over every copy (`withSharedTags`). */
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
  /** Index and publish every save heard so far now, held ones included (a reader needs them). */
  flush(): Promise<void>;
  /**
   * The document open in the editor (`undefined`: none). Its autosaves are indexed late
   * (S8); a new value, or none, lets the held saves go at once.
   */
  hold(docId: string | undefined): void;
}

/** A save waiting to be indexed: the change counter and wipe epoch it was heard under. */
interface Queued {
  mine: number;
  epoch: number;
  worksheet?: Worksheet;
}

/** How long the open paper's autosaves may wait before they are indexed anyway. */
export const HOLD_MS = 15_000;
/** A pause in saves this long ends a burst: everything saved in it is indexed together. */
export const QUIET_MS = 150;
/** A burst that never pauses is indexed after this long anyway. */
const QUIET_MAX_MS = 1_000;

export type BankSource = Pick<WorksheetStore, 'list' | 'load'>;

export interface BankIndexOptions {
  /** Where rows persist; in memory when omitted. */
  backend?: BankIndexBackend;
  /** The store's change feed (`onStoreChange`). */
  changes?: (listener: StoreChangeListener) => () => void;
  /** Calls back when the store may have changed elsewhere (another tab). */
  wake?: (listener: () => void) => () => void;
  /** How long a held document's saves wait at most (`HOLD_MS`). */
  holdMs?: number;
  /** Saves are indexed once none has arrived for this long (`QUIET_MS` in the app; none when omitted). */
  quietMs?: number;
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

  /**
   * Index one document. One that cannot be read into rows (a shape this build does not
   * expect) is skipped and logged: it holds no rows and no stamp, so the next reconcile
   * tries it again, and every other document is indexed as usual.
   */
  function index(docId: string, derive: () => StoredDoc) {
    let doc: StoredDoc;
    try {
      doc = derive();
    } catch (error) {
      console.warn(`Question bank: skipped document ${docId}; it could not be indexed.`, error);
      drop(docId);
      return;
    }
    apply(docId, doc);
  }

  function publish(status?: BankStatus) {
    // Stored rows keep each copy's own tags; readers see one set per question.
    const rows = withSharedTags(orderedRows(docs));
    snapshot = { status: status ?? snapshot.status, rows, groups: groupRows(rows) };
    for (const listener of listeners) listener();
  }

  /** Publish after a change: a ready index stays ready, counting what it now holds. */
  function settle() {
    publish(snapshot.status.state === 'ready' ? { state: 'ready', done: docs.size, total: docs.size } : undefined);
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
            if (worksheet) index(summary.id, () => ({ updatedAt: summary.updatedAt ?? '', rows: rowsOf(worksheet, summary) }));
            else drop(summary.id);
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

  // --- Saves, coalesced (S8) ---------------------------------------------------------
  // A save is not indexed on its own: every save that lands before the next idle slot is
  // indexed in one pass, one backend commit and one publish (a tag write over 40 papers
  // publishes once, not 40 times). Saves of the held document (the one open in the
  // editor, `hold`) wait longer: the editor never shows that paper's own rows, so its
  // autosaves are indexed when it is let go, when a reader asks (`flush`), or after
  // `holdMs`, whichever comes first.
  const queued = new Map<string, Queued>();
  const held = new Map<string, Queued>();
  let heldId: string | undefined;
  let batching: Promise<void> | undefined;
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  const holdMs = options.holdMs ?? HOLD_MS;

  const isCurrent = (docId: string, entry: Queued) => touched.get(docId) === entry.mine && epoch === entry.epoch;

  const quietMs = options.quietMs ?? 0;
  let lastQueued = 0;

  function enqueueIndex(docId: string, entry: Queued) {
    queued.set(docId, entry);
    lastQueued = Date.now();
    batching ??= track(runBatch());
  }

  /** Until saves stop arriving for `quietMs` (a write over many files on desktop), at most `QUIET_MAX_MS`. */
  async function quiet(): Promise<void> {
    const started = Date.now();
    for (;;) {
      const wait = lastQueued + quietMs - Date.now();
      if (wait <= 0 || Date.now() - started >= QUIET_MAX_MS) return;
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }

  async function runBatch(): Promise<void> {
    await loaded;
    await quiet();
    await pause();
    const work = [...queued];
    queued.clear();
    batching = undefined;
    let changed = false;
    for (const [docId, entry] of work) {
      if (!isCurrent(docId, entry)) continue;
      let doc = entry.worksheet;
      if (!doc) {
        doc = await source.load(docId).catch(() => undefined);
        if (!isCurrent(docId, entry)) continue;
      }
      changed = true;
      if (doc) {
        const found = doc;
        index(docId, () => {
          const summary = summarize(found);
          return { updatedAt: summary.updatedAt, rows: rowsOf(found, summary) };
        });
      } else {
        drop(docId);
      }
    }
    if (changed) settle();
  }

  function releaseHeld() {
    if (holdTimer !== undefined) clearTimeout(holdTimer);
    holdTimer = undefined;
    for (const [docId, entry] of held) enqueueIndex(docId, entry);
    held.clear();
  }

  function holdSave(docId: string, entry: Queued) {
    held.set(docId, entry);
    if (holdTimer === undefined) holdTimer = setTimeout(releaseHeld, holdMs);
  }

  /** Every save so far indexed and published, held ones included. */
  async function flush(): Promise<void> {
    releaseHeld();
    while (batching) await batching;
  }

  function onChange(change: Parameters<StoreChangeListener>[0], worksheet?: Parameters<StoreChangeListener>[1]) {
    const { docId, kind } = change;
    const mine = docId === undefined ? 0 : touch(docId);
    const myEpoch = epoch;
    if (docId !== undefined && (kind === 'saved' || kind === 'restored')) {
      const entry: Queued = { mine, epoch: myEpoch, worksheet };
      if (docId === heldId && kind === 'saved') holdSave(docId, entry);
      else enqueueIndex(docId, entry);
      return;
    }
    if (docId !== undefined) held.delete(docId);
    const current = () => docId !== undefined && touched.get(docId) === mine && epoch === myEpoch;
    track(
      (async () => {
        await loaded;
        if (kind === 'cleared') {
          held.clear();
          wipe();
          publish({ state: 'ready', done: 0, total: 0 });
          return;
        }
        if (docId === undefined) {
          await reconcile();
          return;
        }
        if (!current()) return;
        drop(docId);
        settle();
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
    flush,
    hold(docId) {
      if (docId === heldId) return;
      heldId = docId;
      releaseHeld();
    },
    async settled() {
      releaseHeld();
      while (tasks.size > 0) await Promise.allSettled([...tasks]);
      await chain;
    },
  };
}
