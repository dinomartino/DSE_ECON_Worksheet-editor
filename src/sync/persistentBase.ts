import { isDesktop } from '@/platform';
import { syncBaseFile } from '@/storage/fileStore';
import { baseEntryFrom } from './baseStore';
import type { BaseEntry, BaseStore } from './types';

/**
 * The base, persisted per (computer, source): desktop a file under `$APPDATA`, the web
 * IndexedDB. Losing it is safe (the next run applies first-sync rules); a wrong one is not.
 * So a row or file that will not read is dropped, never guessed, and `load` never throws.
 */
export interface PersistentBaseStore extends BaseStore {
  /** Settles the writes made so far (desktop coalesces them). */
  flush(): Promise<void>;
}

const stores = new Map<string, PersistentBaseStore>();

/** The base for `sourceId` on this computer: one instance per source, shared by its callers. */
export function createBaseStore(sourceId: string): PersistentBaseStore {
  if (!sourceId) throw new Error('A sync base needs a source id.');
  const key = `${isDesktop() ? 'file' : 'idb'}:${sourceId}`;
  let store = stores.get(key);
  if (!store) {
    store = isDesktop() ? fileBaseStore(sourceId, syncBaseFile(sourceId)) : idbBaseStore(sourceId);
    stores.set(key, store);
  }
  return store;
}

const copy = (entries: Map<string, BaseEntry>) => new Map([...entries].map(([id, entry]) => [id, { ...entry }]));

// ── Web: IndexedDB ────────────────────────────────────────────────────────────────

/**
 * Its own database, never `econ-worksheet-library`. Store `base`: one row per document,
 * `{ sourceId, ...BaseEntry }` keyed `[sourceId, id]`, index `sourceId`. An upgrade only
 * adds missing stores; a row this build cannot read is skipped.
 */
export const SYNC_DB = 'econ-worksheet-sync';
const DB_VERSION = 1;
const BASE = 'base';
const BY_SOURCE = 'sourceId';

const done = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const finished = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('aborted'));
  });

function openSyncDb(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(SYNC_DB, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(BASE)) {
        db.createObjectStore(BASE, { keyPath: [BY_SOURCE, 'id'] }).createIndex(BY_SOURCE, BY_SOURCE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('blocked'));
  });
}

/**
 * Where IndexedDB cannot be opened (private mode, disabled, a newer build's version), the
 * base lives in memory for the session. A failed put or remove is dropped: the base then
 * lags, the same as a crash before that step.
 */
export function idbBaseStore(
  sourceId: string,
  factory: IDBFactory | undefined = globalThis.indexedDB,
): PersistentBaseStore {
  const session = new Map<string, BaseEntry>();
  let db: Promise<IDBDatabase | undefined> | undefined;

  const database = () =>
    (db ??= (async () => {
      if (!factory) return undefined;
      try {
        const opened = await openSyncDb(factory);
        // Another tab upgrading: let go, and carry on in memory.
        opened.onversionchange = () => {
          opened.close();
          db = Promise.resolve(undefined);
        };
        return opened;
      } catch {
        return undefined;
      }
    })());

  async function write(change: (rows: IDBObjectStore) => void): Promise<boolean> {
    const handle = await database();
    if (!handle) return false;
    try {
      const tx = handle.transaction(BASE, 'readwrite');
      change(tx.objectStore(BASE));
      await finished(tx);
    } catch {
      // Dropped: the base lags.
    }
    return true;
  }

  return {
    async load() {
      const handle = await database();
      if (!handle) return copy(session);
      const entries = new Map<string, BaseEntry>();
      try {
        const tx = handle.transaction(BASE, 'readonly');
        const rows = await done(tx.objectStore(BASE).index(BY_SOURCE).getAll(sourceId));
        for (const row of rows as unknown[]) {
          const entry = (row as { sourceId?: unknown } | null)?.sourceId === sourceId ? baseEntryFrom(row) : undefined;
          if (entry) entries.set(entry.id, entry);
        }
      } catch {
        return new Map();
      }
      return entries;
    },
    async put(entry) {
      const row = baseEntryFrom(entry);
      if (!row) return;
      if (!(await write((rows) => rows.put({ ...row, sourceId })))) session.set(row.id, row);
    },
    async remove(id) {
      if (!(await write((rows) => rows.delete([sourceId, id])))) session.delete(id);
    },
    async clear() {
      session.clear();
      const handle = await database();
      if (!handle) {
        // Nothing was written this session, but an earlier one may have: say so.
        if (factory) throw new Error('The sync base could not be cleared.');
        return;
      }
      const tx = handle.transaction(BASE, 'readwrite');
      const rows = tx.objectStore(BASE);
      const keys = rows.index(BY_SOURCE).getAllKeys(sourceId);
      keys.onsuccess = () => {
        for (const key of keys.result) rows.delete(key);
      };
      await finished(tx);
    },
    async flush() {},
  };
}

// ── Desktop: one file per source ──────────────────────────────────────────────────

/** Whole-file text access; `fileStore.ts:syncBaseFile` on desktop. */
export interface BaseFile {
  read(): Promise<string | undefined>;
  /** Atomic: the old text or the new, never a torn mix. */
  write(text: string): Promise<void>;
  remove(): Promise<void>;
}

const FILE_FORMAT = 1;

/**
 * The file's text → entries. Anything off (not JSON, another format, another source's
 * file) is an empty base. A bad row drops only itself; an id listed twice drops both.
 */
export function parseBaseFile(sourceId: string, text: string | undefined): Map<string, BaseEntry> {
  const entries = new Map<string, BaseEntry>();
  if (text === undefined) return entries;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return entries;
  }
  const file = parsed as { format?: unknown; sourceId?: unknown; entries?: unknown } | null;
  if (file?.format !== FILE_FORMAT || file.sourceId !== sourceId || !Array.isArray(file.entries)) return entries;
  const twice = new Set<string>();
  for (const row of file.entries) {
    const entry = baseEntryFrom(row);
    if (!entry) continue;
    if (entries.has(entry.id)) twice.add(entry.id);
    entries.set(entry.id, entry);
  }
  for (const id of twice) entries.delete(id);
  return entries;
}

export function serializeBaseFile(sourceId: string, entries: Map<string, BaseEntry>): string {
  return JSON.stringify({ format: FILE_FORMAT, sourceId, entries: [...entries.values()] });
}

/**
 * The file is read once; memory is then the truth for this process. Writes coalesce:
 * the whole file is rewritten at most once per `delayMs` (and on `flush`), one at a time.
 * The file may lag the engine by its last few puts but never runs ahead of it: a lagging
 * row is an earlier real agreement, exactly what a crash before the put leaves.
 */
export function fileBaseStore(sourceId: string, file: BaseFile, delayMs = 1000): PersistentBaseStore {
  let state: Promise<Map<string, BaseEntry>> | undefined;
  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** File operations, one at a time and in order. */
  let queue: Promise<void> = Promise.resolve();

  const ready = () =>
    (state ??= file.read().then(
      (text) => parseBaseFile(sourceId, text),
      () => new Map<string, BaseEntry>(),
    ));

  const enqueue = (task: () => Promise<void>) => {
    const next = queue.then(task);
    queue = next.catch(() => undefined);
    return next;
  };

  const save = () =>
    enqueue(async () => {
      if (!dirty) return;
      dirty = false;
      const text = serializeBaseFile(sourceId, await ready());
      try {
        await file.write(text);
      } catch {
        dirty = true; // The next put or flush tries again; until then the file lags.
      }
    });

  const stopTimer = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  const changed = () => {
    dirty = true;
    timer ??= setTimeout(() => {
      timer = undefined;
      void save();
    }, delayMs);
  };

  return {
    async load() {
      return copy(await ready());
    },
    async put(entry) {
      const row = baseEntryFrom(entry);
      if (!row) return;
      (await ready()).set(row.id, row);
      changed();
    },
    async remove(id) {
      if ((await ready()).delete(id)) changed();
    },
    async clear() {
      stopTimer();
      dirty = false;
      // Never re-read: the file is going, and a read still in flight must not bring it back.
      state = Promise.resolve(new Map());
      await enqueue(() => file.remove());
    },
    async flush() {
      stopTimer();
      await save();
    },
  };
}
