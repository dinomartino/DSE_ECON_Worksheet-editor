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
export const INDEX_FORMAT = 7;

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

/** A row's `slots` entry as `rowsOf` writes it. */
function isBankSlot(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const slot = value as Record<string, unknown>;
  return (
    isString(slot.key) &&
    isString(slot.path) &&
    isString(slot.label) &&
    (slot.parent === undefined || isString(slot.parent)) &&
    typeof slot.leaf === 'boolean' &&
    (slot.own === undefined || isStringArray(slot.own)) &&
    isStringArray(slot.tags)
  );
}

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
    (row.slots === undefined || (Array.isArray(row.slots) && row.slots.every(isBankSlot))) &&
    (row.ownTags === undefined || isStringArray(row.ownTags)) &&
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

/** One text file: the single-file index older desktop builds wrote, read once to migrate it. */
export interface TextFilePort {
  read(): Promise<string | undefined>;
  remove(): Promise<void>;
}

/** One file per document: the desktop's `worksheets/library/docs/` (`libraryDocFiles`). */
export interface DocFilesPort {
  /** Every document with a file. */
  ids(): Promise<string[]>;
  read(docId: string): Promise<string | undefined>;
  write(docId: string, text: string): Promise<void>;
  remove(docId: string): Promise<void>;
  clear(): Promise<void>;
}

/** `{ format, docs: { [docId]: { updatedAt, rows } } }` → its valid entries; another format is `undefined`. */
export function readJsonIndex(text: string): IndexedDocs | undefined {
  try {
    const parsed = JSON.parse(text) as { format?: unknown; docs?: unknown };
    if (parsed?.format !== STORED_INDEX_FORMAT || !parsed.docs || typeof parsed.docs !== 'object') return undefined;
    const loaded: IndexedDocs = new Map();
    for (const [id, value] of Object.entries(parsed.docs)) {
      const doc = storedDoc(id, value);
      if (doc) loaded.set(id, doc);
    }
    return loaded;
  } catch {
    return undefined;
  }
}

/** One document's file, `{ format, updatedAt, rows }`; anything else is `undefined`. */
export function readDocFile(docId: string, text: string): StoredDoc | undefined {
  try {
    const parsed = JSON.parse(text) as { format?: unknown };
    return parsed?.format === STORED_INDEX_FORMAT ? storedDoc(docId, parsed) : undefined;
  } catch {
    return undefined;
  }
}

/** How many file calls are in flight at once. */
const PARALLEL = 32;
/** Each item through `each`, `PARALLEL` at a time (a pool, so one slow file holds up only its slot). */
async function inChunks<T>(items: readonly T[], each: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      await each(item).catch(() => undefined);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, items.length) }, worker));
}

/** One whole text file the backend rewrites (`worksheets/library/pack.json`, `journal.json`). */
export interface CacheFilePort {
  read(): Promise<string | undefined>;
  write(text: string): Promise<void>;
  remove(): Promise<void>;
}

/**
 * The pack: every document's rows in one file, so a launch reads one file rather than one
 * per document. A cache of `docs/`, never the truth: the journal names each document whose
 * file changed since the pack was written (it is written before the file), so a load reads
 * the pack plus those files. A missing or unreadable pack or journal falls back to reading
 * every file; anything stale that slips through is re-indexed by the reconcile, whose
 * stamps come from the documents.
 */
export interface PackPorts {
  pack: CacheFilePort;
  journal: CacheFilePort;
}

/** A journal this many documents long is folded into a new pack (in the background). */
const JOURNAL_LIMIT = 200;

/** The journal's ids, or `undefined` when it is unreadable (read everything). */
function readJournal(text: string | undefined): Set<string> | undefined {
  if (text === undefined) return new Set();
  try {
    const parsed = JSON.parse(text) as { format?: unknown; ids?: unknown };
    if (parsed?.format !== STORED_INDEX_FORMAT || !isStringArray(parsed.ids)) return undefined;
    return new Set(parsed.ids);
  } catch {
    return undefined;
  }
}

/**
 * A file per document, so an autosave rewrites only its own document's rows. A file that
 * fails to read or validate costs only its document (and is removed). `legacy`, the old
 * single file, is read once: entries newer than their document's file are written out as
 * files, then it is removed. With `cache`, a launch reads the pack and the journal's files
 * (§ PackPorts) instead of every file.
 */
export function createDocFilesBackend(files: DocFilesPort, legacy?: TextFilePort, cache?: PackPorts): BankIndexBackend {
  const writeDoc = (id: string, doc: StoredDoc) =>
    files.write(id, JSON.stringify({ format: STORED_INDEX_FORMAT, updatedAt: doc.updatedAt, rows: doc.rows }));

  /** What the files hold, once loaded: the pack is written from it. */
  let mirror: IndexedDocs | undefined;
  /** The journal as written (`undefined`: unknown, so the next commit rewrites it). */
  let journal: Set<string> | undefined;
  /** Pack and journal writes, one at a time, in order with commits. */
  let packChain: Promise<void> = Promise.resolve();
  const serial = (op: () => Promise<void>) => (packChain = packChain.then(op).catch(() => undefined));

  const writeJournal = (ids: ReadonlySet<string>) =>
    cache!.journal.write(JSON.stringify({ format: STORED_INDEX_FORMAT, ids: [...ids] }));

  /** Write the pack from the mirror, then empty the journal (a crash between costs a re-read). */
  function repack(): Promise<void> {
    return serial(async () => {
      if (!cache || !mirror) return;
      const docs = Object.fromEntries(mirror);
      await cache.pack.write(JSON.stringify({ format: STORED_INDEX_FORMAT, docs }));
      await cache.journal.remove();
      journal = new Set();
    });
  }

  /** The pack and the journal's files, or `undefined` when either cannot be trusted. */
  async function loadPacked(): Promise<{ loaded: IndexedDocs; reread: number } | undefined> {
    if (!cache) return undefined;
    const [packText, journalText] = await Promise.all([
      cache.pack.read().catch(() => undefined),
      cache.journal.read().catch(() => undefined),
    ]);
    const loaded = packText === undefined ? undefined : readJsonIndex(packText);
    const changed = readJournal(journalText);
    if (!loaded || !changed) return undefined;
    await inChunks([...changed], async (id) => {
      const text = await files.read(id).catch(() => undefined);
      const doc = text === undefined ? undefined : readDocFile(id, text);
      if (doc) loaded.set(id, doc);
      else loaded.delete(id);
    });
    journal = changed;
    return { loaded, reread: changed.size };
  }

  /** True when there was a legacy file to fold in. */
  async function migrate(loaded: IndexedDocs): Promise<boolean> {
    if (!legacy) return false;
    const text = await legacy.read().catch(() => undefined);
    if (text === undefined) return false;
    const old = readJsonIndex(text) ?? new Map<string, StoredDoc>();
    const newer = [...old].filter(([id, doc]) => {
      const mine = loaded.get(id);
      return !mine || mine.updatedAt < doc.updatedAt;
    });
    for (const [id, doc] of newer) loaded.set(id, doc);
    let failed = false;
    await inChunks(newer, ([id, doc]) => writeDoc(id, doc).catch(() => void (failed = true)));
    if (!failed) await legacy.remove().catch(() => undefined);
    return true;
  }

  /** Every document's file, read one by one: without a pack, or when it cannot be trusted. */
  async function loadEveryFile(): Promise<IndexedDocs> {
    const loaded: IndexedDocs = new Map();
    const ids = await files.ids().catch(() => [] as string[]);
    await inChunks(ids, async (id) => {
      const text = await files.read(id).catch(() => undefined);
      const doc = text === undefined ? undefined : readDocFile(id, text);
      if (doc) loaded.set(id, doc);
      else await files.remove(id);
    });
    return loaded;
  }

  return {
    async load() {
      await packChain;
      const packed = await loadPacked();
      const loaded = packed?.loaded ?? (await loadEveryFile());
      const hadLegacy = await migrate(loaded);
      mirror = new Map(loaded);
      // A pack that is missing, stale or behind the legacy file is written once, in the
      // background: the next launch reads one file.
      if (cache && (!packed || packed.reread > 0 || hadLegacy)) void repack();
      return loaded.size > 0 ? loaded : undefined;
    },
    commit(put, drop) {
      if (!cache) {
        return (async () => {
          await inChunks(drop, (id) => files.remove(id));
          await inChunks(put, ([id, doc]) => writeDoc(id, doc));
        })();
      }
      return serial(async () => {
        // The journal first: a file it does not name is never newer than the pack.
        const ids = [...drop, ...put.map(([id]) => id)];
        if (!journal || ids.some((id) => !journal!.has(id))) {
          const next = new Set([...(journal ?? []), ...ids]);
          try {
            await writeJournal(next);
            journal = next;
          } catch {
            journal = undefined;
          }
        }
        await inChunks(drop, (id) => files.remove(id));
        await inChunks(put, ([id, doc]) => writeDoc(id, doc));
        if (mirror) {
          for (const id of drop) mirror.delete(id);
          for (const [id, doc] of put) mirror.set(id, doc);
        }
        if (!journal || journal.size > JOURNAL_LIMIT) void repack();
      });
    },
    async clear() {
      await packChain;
      await files.clear();
      if (legacy) await legacy.remove().catch(() => undefined);
      if (cache) {
        await cache.pack.remove().catch(() => undefined);
        await cache.journal.remove().catch(() => undefined);
      }
      mirror = new Map();
      journal = new Set();
    },
  };
}
