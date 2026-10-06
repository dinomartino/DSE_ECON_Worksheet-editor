import type { WorksheetStore } from '@/storage/types';

/**
 * The sync engine (`docs/design/sync-engine.md`): the local store stays the teacher's
 * library; the engine mirrors it to a `SyncSource`. Every source — a cloud folder, a
 * cloud API, an account server — implements only this interface.
 */

/** One stored entry. `key` is a logical name, never a path; `revision` is opaque. */
export interface SourceEntry {
  key: string;
  revision: string;
  size: number;
}

/** The source cannot be reached now. Sync pauses; nothing is read as deleted. */
export interface Unavailable {
  status: 'unavailable';
}

export type ListResult = { status: 'ok'; entries: SourceEntry[] } | Unavailable;

export type ReadResult =
  | { status: 'ok'; text: string; revision: string }
  | { status: 'missing' }
  | Unavailable;

/** `conflict`: the entry's revision is not the one expected; nothing was written. */
export type WriteResult = { status: 'ok'; revision: string } | { status: 'conflict' } | Unavailable;

export type RemoveResult = { status: 'ok' } | { status: 'missing' } | { status: 'conflict' } | Unavailable;

/** Keys changed since `cursor`, or `reset`: the cursor is no good, rescan everything. */
export type ChangesResult =
  | { status: 'ok'; keys: string[]; cursor: string }
  | { status: 'reset'; cursor: string }
  | Unavailable;

export interface SyncSource {
  list(): Promise<ListResult>;
  read(key: string): Promise<ReadResult>;
  /** Compare-and-swap. `expectRevision: null` means the key must not exist yet. */
  write(key: string, text: string, options: { expectRevision: string | null }): Promise<WriteResult>;
  /** Compare-and-swap delete. A source sends it to its own trash where it has one. */
  remove(key: string, options: { expectRevision: string }): Promise<RemoveResult>;
  /** Only says *when* to run; what to do is always decided from a full comparison. */
  changes(cursor: string | null): Promise<ChangesResult>;
}

/** Where a document is, on either side. */
export type Place = 'live' | 'trash';

/**
 * What both sides held at the last sync of a document: the base of the three-way
 * comparison. Kept outside documents (`BaseStore`), never in them.
 */
export interface BaseEntry {
  id: string;
  /** Room for graphs and the small files later; v1 syncs documents only. */
  kind: 'worksheet';
  place: Place;
  /** SHA-256 of the local copy as `stringifyWorksheet` writes it. */
  hash: string;
  /** The source's revision of the entry at `place`; '' when the source holds none. */
  revision: string;
  /** Of the agreed content: says whether an unread remote copy is a newer build's. */
  schemaVersion: number;
}

/**
 * Where the base lives: one per (computer, source). `createBaseStore` (`persistentBase.ts`)
 * persists it (desktop: a file under `$APPDATA`; web: IndexedDB); `memoryBaseStore` serves tests.
 * An empty base is always safe (first-sync rules); a wrong one is not, so `load` drops what it
 * cannot read and `clear` throws rather than leave a base behind.
 */
export interface BaseStore {
  load(): Promise<Map<string, BaseEntry>>;
  put(entry: BaseEntry): Promise<void>;
  remove(id: string): Promise<void>;
  /** Forget the whole base for this source. */
  clear(): Promise<void>;
}

/**
 * A local document's hash as of its own `updatedAt` (`hashCache.ts`). Plain JSON, so a
 * cache could be persisted; tickets are per process and are not.
 */
export interface HashEntry {
  id: string;
  place: Place;
  updatedAt: string;
  hash: string;
  schemaVersion: number;
  newer: boolean;
}

/**
 * Saves `readLocal` loading and hashing a document whose list row says it is unchanged.
 * Sound only while every local write calls `forget` (`forgetOnWrite`): `updatedAt` is the
 * document's own field, not a store stamp.
 */
export interface HashCache {
  get(id: string): HashEntry | undefined;
  /** Taken before loading `id`; a `put` under a ticket older than its last `forget` is dropped. */
  ticket(id: string): number;
  put(entry: HashEntry, ticket: number): void;
  /** A local write to `id` (every id when absent) happened or is under way. */
  forget(id?: string): void;
}

/**
 * Names for the copies sync makes. Injected so the interface layer can localise them;
 * the engine itself holds no interface text.
 */
export interface CopyNamer {
  /** This computer's version of a document changed on both sides, last edited `at`. */
  conflictCopy(name: string, at: Date): string;
  /** A conflict copy the cloud provider made. Deterministic: no clock, no computer. */
  providerCopy(name: string): string;
}

/** The store calls the engine makes. */
export type SyncStore = Pick<
  WorksheetStore,
  'list' | 'listTrash' | 'load' | 'loadTrashed' | 'adopt' | 'trash' | 'restore'
>;
