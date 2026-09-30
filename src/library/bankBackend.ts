import { TOPICS } from '@/model/topics';
import { hash } from './contentKey';
import type { BankRow } from './types';

/**
 * Where the bank index persists between visits. Derived data only: every backend may
 * lose everything at any time, and anything it cannot read back is dropped and rebuilt
 * from the documents — never an error at the UI. Judged per document: one entry that
 * fails validation drops only that document's rows and stamp, never the whole index.
 */

/** One document's rows and the `updatedAt` they were derived from (its freshness stamp). */
export interface StoredDoc {
  updatedAt: string;
  rows: BankRow[];
}

/** docId → its stored rows. A document with no rows (hidden, empty) still has a stamp. */
export type IndexedDocs = Map<string, StoredDoc>;

export interface BankIndexBackend {
  /** What was stored, or `undefined` if nothing usable was (anything unreadable is dropped). */
  load(): Promise<IndexedDocs | undefined>;
  /** Replace the listed documents' rows, and forget `drop`'s, as one write. */
  commit(put: [string, StoredDoc][], drop: string[]): Promise<void>;
  clear(): Promise<void>;
}

/**
 * The rows logic's version. Bump when `rowsOf`'s output changes (shape, excerpt, search
 * text, `contentKey`), and every persisted index is dropped and rebuilt on next use. The
 * golden test in `indexer.test.ts` fails when the output moves, to say so.
 */
export const INDEX_FORMAT = 6;

/**
 * What a stored index is stamped with and checked against: the rows version plus a hash of
 * every topic code and label, since rows bake labels into `searchText`. Renaming a topic
 * rebuilds the index without anyone remembering to bump.
 */
export const STORED_INDEX_FORMAT = `${INDEX_FORMAT}.${hash(
  TOPICS.flatMap((topic) => [topic, ...topic.children])
    .map((topic) => `${topic.code}\u0000${topic.en}\u0000${topic.zh}`)
    .join('\n'),
)}`;

const isString = (value: unknown): value is string => typeof value === 'string';
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(isString);

/** A row as the current `rowsOf` writes it; anything else means the store is not ours. */
export function isBankRow(value: unknown): value is BankRow {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  const excerpt = row.excerpt as Record<string, unknown> | undefined;
  return (
    isString(row.docId) &&
    isString(row.docTitle) &&
    isString(row.docUpdatedAt) &&
    (row.docKind === 'paper' || row.docKind === 'bank') &&
    isString(row.usedOn) &&
    (row.classes === undefined || isStringArray(row.classes)) &&
    isString(row.questionId) &&
    isString(row.rootId) &&
    isString(row.typeId) &&
    typeof row.marks === 'number' &&
    isStringArray(row.tags) &&
    (row.tagsAt === undefined || isString(row.tagsAt)) &&
    !!excerpt &&
    isString(excerpt.en) &&
    isString(excerpt.zh) &&
    isString(row.searchText) &&
    typeof row.hasDiagram === 'boolean' &&
    isStringArray(row.languages) &&
    (row.missing === undefined || isStringArray(row.missing)) &&
    (row.missingTeacher === undefined || isStringArray(row.missingTeacher)) &&
    isString(row.contentKey) &&
    (row.number === undefined || typeof row.number === 'number')
  );
}

/** A stored document entry, validated: every row must be a row of that document. */
export function storedDoc(docId: string, value: unknown): StoredDoc | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const { updatedAt, rows } = value as Record<string, unknown>;
  if (!isString(updatedAt) || !Array.isArray(rows)) return undefined;
  if (!rows.every((row) => isBankRow(row) && row.docId === docId)) return undefined;
  return { updatedAt, rows: rows as BankRow[] };
}

/** Held in memory only: the test backend, and the fallback where nothing persists. */
export function createMemoryBackend(): BankIndexBackend & { docs: IndexedDocs } {
  const docs: IndexedDocs = new Map();
  return {
    docs,
    load: async () => (docs.size > 0 ? new Map(docs) : undefined),
    async commit(put, drop) {
      for (const id of drop) docs.delete(id);
      for (const [id, doc] of put) docs.set(id, doc);
    },
    async clear() {
      docs.clear();
    },
  };
}

/** One text file: the desktop's `worksheets/library/index.json` (`libraryIndexFile`). */
export interface TextFilePort {
  read(): Promise<string | undefined>;
  write(text: string): Promise<void>;
  remove(): Promise<void>;
}

/**
 * The whole index as one JSON file, `{ format, docs: { [docId]: { updatedAt, rows } } }`.
 * Held in memory; writes coalesce, so a burst of commits costs one or two file writes.
 */
export function createJsonFileBackend(port: TextFilePort): BankIndexBackend {
  let docs: IndexedDocs = new Map();
  let writing: Promise<void> | undefined;
  let again = false;

  const serialize = () =>
    JSON.stringify({ format: STORED_INDEX_FORMAT, docs: Object.fromEntries(docs) });

  function flush(): Promise<void> {
    if (writing) {
      again = true;
      return writing;
    }
    writing = (async () => {
      try {
        do {
          again = false;
          await port.write(serialize());
        } while (again);
      } finally {
        writing = undefined;
      }
    })();
    return writing;
  }

  async function drop(): Promise<undefined> {
    docs = new Map();
    await port.remove().catch(() => undefined);
    return undefined;
  }

  return {
    async load() {
      let text: string | undefined;
      try {
        text = await port.read();
      } catch {
        return drop();
      }
      if (text === undefined) return undefined;
      try {
        const parsed = JSON.parse(text) as { format?: unknown; docs?: unknown };
        if (parsed?.format !== STORED_INDEX_FORMAT || !parsed.docs || typeof parsed.docs !== 'object') {
          return drop();
        }
        const loaded: IndexedDocs = new Map();
        for (const [id, value] of Object.entries(parsed.docs)) {
          // A bad entry costs only its own document, which the reconcile re-indexes.
          const doc = storedDoc(id, value);
          if (doc) loaded.set(id, doc);
        }
        docs = loaded;
        return new Map(docs);
      } catch {
        return drop();
      }
    },
    commit(put, dropIds) {
      for (const id of dropIds) docs.delete(id);
      for (const [id, doc] of put) docs.set(id, doc);
      return flush();
    },
    async clear() {
      docs = new Map();
      if (writing) await writing.catch(() => undefined);
      await port.remove();
    },
  };
}
