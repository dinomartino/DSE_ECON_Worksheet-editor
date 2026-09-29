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
 * A `DB_VERSION` bump deletes and recreates every store; an `INDEX_FORMAT` mismatch, an
 * unreadable record or a failed read clears them. A database this build cannot open (a
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

  async function read(handle: IDBDatabase): Promise<IndexedDocs | undefined> {
    const tx = handle.transaction(STORES, 'readonly');
    const [format, stamps, records] = await Promise.all([
      done(tx.objectStore(META).get('format')),
      done(tx.objectStore(STAMPS).getAll()),
      done(tx.objectStore(ROWS).getAll()),
    ]);
    if ((format as { value?: unknown } | undefined)?.value !== INDEX_FORMAT) return undefined;
    const docs: IndexedDocs = new Map();
    for (const stamp of stamps as { docId?: unknown; updatedAt?: unknown }[]) {
      if (typeof stamp?.docId !== 'string' || typeof stamp.updatedAt !== 'string') return undefined;
      docs.set(stamp.docId, { updatedAt: stamp.updatedAt, rows: [] });
    }
    const seqs = new Map<BankRow, number>();
    for (const record of records as Partial<RowRecord>[]) {
      const row = record?.row;
      if (!isBankRow(row) || row.docId !== record.docId || typeof record.seq !== 'number') return undefined;
      const doc = docs.get(row.docId);
      if (!doc) return undefined;
      doc.rows.push(row);
      seqs.set(row, record.seq);
    }
    for (const doc of docs.values()) doc.rows.sort((a, b) => seqs.get(a)! - seqs.get(b)!);
    return docs;
  }

  /** Every row of `docId`: the compound keys `[docId, *]` sort between these two. */
  const docRange = (docId: string) => IDBKeyRange.bound([docId], [docId, []]);

  return {
    async load() {
      const handle = await database();
      if (!handle) return undefined;
      try {
        const docs = await read(handle);
        if (docs) return docs.size > 0 ? docs : undefined;
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
