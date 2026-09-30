import { INDEX_FORMAT, isBankRow, type BankIndexBackend, type IndexedDocs } from './bankBackend';
import type { BankRow } from './types';

/**
 * The web's bank index: IndexedDB `econ-worksheet-library`, beside (never inside) the
 * documents' `localStorage`. Object stores:
 *  - `rows`   `{ docId, questionId, seq, row }`, keyed `[docId, questionId]`, index `docId`
 *             (`seq` keeps printed order, which the key order would lose; a document's
 *             rows are deleted by key range, in order before its puts);
 *  - `stamps` `{ docId, updatedAt }`, keyed `docId` — the freshness stamps;
 *  - `meta`   `{ key: 'format', value: INDEX_FORMAT }`.
 * A `DB_VERSION` bump deletes and recreates every store; an `INDEX_FORMAT` mismatch or a
 * failed read clears them; an unreadable record drops only its own document. A database this build cannot open (a
 * newer build's version, IndexedDB disabled) leaves the backend inert: the index still
 * works, in memory.
 */

export const LIBRARY_DB = 'econ-worksheet-library';
const DB_VERSION = 1;
const ROWS = 'rows';
const STAMPS = 'stamps';
const META = 'meta';
const STORES = [ROWS, STAMPS, META];

interface RowRecord {
  docId: string;
  questionId: string;
  seq: number;
  row: BankRow;
}

/** What the stores held, judged per document: `bad` names documents dropped for a bad record. */
export interface StoredRecords {
  docs: IndexedDocs;
  bad: string[];
}

/**
 * The stores' contents → stored documents. Only another `INDEX_FORMAT` (or no format)
 * rejects everything. Otherwise each document stands alone: a malformed stamp or row, a
 * row filed under another document or a row without a stamp drops that document's rows
 * and stamp, and the rest load. A record naming no document at all is ignored.
 */
export function docsFromRecords(format: unknown, stamps: unknown, records: unknown): StoredRecords | undefined {
  if ((format as { value?: unknown } | undefined)?.value !== INDEX_FORMAT) return undefined;
  const docs: IndexedDocs = new Map();
  const bad = new Set<string>();
  for (const stamp of Array.isArray(stamps) ? (stamps as { docId?: unknown; updatedAt?: unknown }[]) : []) {
    if (typeof stamp?.docId !== 'string') continue;
    if (typeof stamp.updatedAt !== 'string') bad.add(stamp.docId);
    else docs.set(stamp.docId, { updatedAt: stamp.updatedAt, rows: [] });
  }
  const seqs = new Map<BankRow, number>();
  for (const record of Array.isArray(records) ? (records as Partial<RowRecord>[]) : []) {
    const docId = record?.docId;
    if (typeof docId !== 'string') continue;
    const row = record.row;
    const doc = docs.get(docId);
    if (!doc || !isBankRow(row) || row.docId !== docId || typeof record.seq !== 'number') {
      bad.add(docId);
      continue;
    }
    doc.rows.push(row);
    seqs.set(row, record.seq);
  }
  for (const id of bad) docs.delete(id);
  for (const doc of docs.values()) doc.rows.sort((a, b) => seqs.get(a)! - seqs.get(b)!);
  return { docs, bad: [...bad] };
}

const done = (request: IDBRequest) =>
  new Promise<unknown>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const finished = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('aborted'));
  });

function open(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(LIBRARY_DB, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      // Derived data: an upgrade never migrates, it starts over.
      for (const name of [...db.objectStoreNames]) db.deleteObjectStore(name);
      db.createObjectStore(ROWS, { keyPath: ['docId', 'questionId'] }).createIndex('docId', 'docId');
      db.createObjectStore(STAMPS, { keyPath: 'docId' });
      db.createObjectStore(META, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('blocked'));
  });
}

/** `undefined` when there is no IndexedDB here at all. */
export function createIdbBackend(
  factory: IDBFactory | undefined = globalThis.indexedDB,
): BankIndexBackend | undefined {
  if (!factory) return undefined;
  let db: Promise<IDBDatabase | undefined> | undefined;

  const database = () =>
    (db ??= open(factory).then(
      (opened) => {
        // Another tab upgrading: let go, and stop persisting here.
        opened.onversionchange = () => {
          opened.close();
          db = Promise.resolve(undefined);
        };
        return opened;
      },
      () => undefined,
    ));

  async function wipe(handle: IDBDatabase): Promise<void> {
    const tx = handle.transaction(STORES, 'readwrite');
    for (const name of STORES) tx.objectStore(name).clear();
    tx.objectStore(META).put({ key: 'format', value: INDEX_FORMAT });
    await finished(tx);
  }

  async function read(handle: IDBDatabase): Promise<StoredRecords | undefined> {
    const tx = handle.transaction(STORES, 'readonly');
    const [format, stamps, records] = await Promise.all([
      done(tx.objectStore(META).get('format')),
      done(tx.objectStore(STAMPS).getAll()),
      done(tx.objectStore(ROWS).getAll()),
    ]);
    return docsFromRecords(format, stamps, records);
  }

  /** Every row of `docId`: the compound keys `[docId, *]` sort between these two. */
  const docRange = (docId: string) => IDBKeyRange.bound([docId], [docId, []]);

  async function forget(handle: IDBDatabase, ids: readonly string[]): Promise<void> {
    const tx = handle.transaction([ROWS, STAMPS], 'readwrite');
    for (const id of ids) {
      tx.objectStore(ROWS).delete(docRange(id));
      tx.objectStore(STAMPS).delete(id);
    }
    await finished(tx);
  }

  return {
    async load() {
      const handle = await database();
      if (!handle) return undefined;
      try {
        const stored = await read(handle);
        if (stored) {
          const { docs, bad } = stored;
          // Forget what could not be read (best effort); the reconcile re-indexes it.
          if (bad.length > 0) await forget(handle, bad).catch(() => undefined);
          return docs.size > 0 ? docs : undefined;
        }
      } catch {
        // Unreadable: fall through and start over.
      }
      await wipe(handle).catch(() => undefined);
      return undefined;
    },
    async commit(put, drop) {
      const handle = await database();
      if (!handle) return;
      const tx = handle.transaction([ROWS, STAMPS], 'readwrite');
      const rows = tx.objectStore(ROWS);
      const stamps = tx.objectStore(STAMPS);
      // Requests in one transaction run in order: each document's old rows go first.
      for (const id of [...drop, ...put.map(([id]) => id)]) {
        rows.delete(docRange(id));
        stamps.delete(id);
      }
      for (const [docId, doc] of put) {
        stamps.put({ docId, updatedAt: doc.updatedAt });
        doc.rows.forEach((row, seq) => rows.put({ docId, questionId: row.questionId, seq, row } satisfies RowRecord));
      }
      await finished(tx);
    },
    async clear() {
      const handle = await database();
      if (handle) await wipe(handle);
    },
  };
}
