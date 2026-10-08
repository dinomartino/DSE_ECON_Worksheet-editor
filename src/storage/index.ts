import type { Worksheet } from '@/model/types';
import { isDesktop, JSON_FILTERS, pickTextFile, saveFile, type SavedTo } from '@/platform';
import { isNewerThanBuild } from '@/model/migrations';
import {
  adoptRefused,
  holdsExpected,
  NewerDocumentError,
  parseWorksheet,
  stringifyWorksheet,
  summarize,
  worksheetTitle,
} from './document';
import { FileWorksheetStore } from './fileStore';
import { withChangeFeed } from './changes';
import { triggerDownload } from './download';
import { kindRepairs, usableSummaries, withKindRepairs, withSummaryFirst } from './summaries';
import { settleTrash, untrashed, usableTrash } from './trash';
import {
  forgetDocuments,
  isEmptyFolders,
  parseFolders,
  serializeFolders,
  type FolderState,
} from './folders';
import type { AdoptExpect, TrashedSummary, WorksheetStore, WorksheetSummary } from './types';
import { localPatternFile, PATTERNS_KEY, type PatternFile } from './patterns';
import { graphDirFiles, patternsFile } from './fileStore';
import { browserStorage, GRAPH_PREFIX, GraphStore, localGraphFiles } from './graphs';
import { forgetOnWrite, memoryHashCache } from '@/sync/hashCache';
import type { HashCache } from '@/sync/types';

export type { AdoptExpect, ListOptions, TrashedSummary, WorksheetStore, WorksheetSummary } from './types';
export {
  EMPTY_FOLDERS,
  FOLDER_NAME_MAX,
  folderCounts,
  folderNameProblem,
  folderOf,
  sortedFolders,
  updateFolders,
  type Folder,
  type FolderState,
} from './folders';
export { TRASH_RETENTION_DAYS, trashAge } from './trash';
export {
  duplicateWorksheet,
  editableCopy,
  NewerDocumentError,
  parseWorksheet,
  stringifyWorksheet,
  summarize,
  worksheetTitle,
} from './document';
export { onStoreChange, type StoreChangeListener } from './changes';
export { NewerGraphError, type GraphListing } from './graphs';
export {
  FileWorksheetStore,
  libraryDocFiles,
  libraryJournalFile,
  libraryPackFile,
  libraryIndexFile,
  savedWorksheetPath,
  savedWorksheetsFolder,
  WORKSHEET_SUFFIX,
  WORKSHEETS_DIR,
} from './fileStore';

const PREFIX = 'econ-worksheet:';
const INDEX_KEY = 'econ-worksheet-index';
/**
 * Trash rows. Never under `PREFIX` — that means "a document". A trashed document stays
 * at `PREFIX + id`; only its row moves here, so an older build sees it as deleted.
 */
const TRASH_KEY = 'econ-worksheet-trash';
/**
 * Folders and the document→folder map (§ folders.ts). Outside `PREFIX` for the same
 * reason as Trash, and never a field on an index row, which an older build would drop.
 */
const FOLDERS_KEY = 'econ-worksheet-folders';

export class LocalStorageWorksheetStore implements WorksheetStore {
  private readonly now: () => number;
  private readonly storageOverride: (() => Storage | undefined) | undefined;

  /** `storage` replaces `window.localStorage` (tests simulating two computers). */
  constructor(now: () => number = Date.now, storage?: () => Storage | undefined) {
    this.now = now;
    this.storageOverride = storage;
  }

  private get storage(): Storage | undefined {
    if (this.storageOverride) return this.storageOverride();
    if (typeof window === 'undefined') return undefined;
    try {
      return window.localStorage;
    } catch {
      // Private-mode Safari throws on access rather than returning null.
      return undefined;
    }
  }

  /**
   * Every document this build can name, newest first.
   *
   * **One damaged entry may not cost the whole list** — the per-row rule and the sort
   * live in `usableSummaries` (§ summaries.ts), shared with the desktop store so the
   * two cannot drift. A row an older build wrote gets its `kind` from the document once,
   * written back (§ kindRepairs).
   */
  async list(): Promise<WorksheetSummary[]> {
    const storage = this.storage;
    if (!storage) return [];
    const rows = this.readIndex(storage);
    if (rows.length === 0) return rows;
    const repairs = await kindRepairs(rows, (id) => this.load(id));
    if (repairs.size === 0) return rows;
    try {
      // A fresh read: a save that landed while the documents were read is kept.
      const next = withKindRepairs(JSON.parse(storage.getItem(INDEX_KEY) ?? '[]'), repairs);
      storage.setItem(INDEX_KEY, JSON.stringify(next));
      return usableSummaries(next);
    } catch {
      // Not written back (quota, say): listed right anyway, and tried again next time.
      return rows.map((row) => repairs.get(row.id) ?? row);
    }
  }

  private readIndex(storage: Storage): WorksheetSummary[] {
    const raw = storage.getItem(INDEX_KEY);
    if (!raw) return [];
    try {
      return usableSummaries(JSON.parse(raw));
    } catch {
      // The index itself is unreadable — nothing here can be salvaged per entry.
      return [];
    }
  }

  async load(id: string): Promise<Worksheet | undefined> {
    const storage = this.storage;
    if (!storage) return undefined;
    const raw = storage.getItem(PREFIX + id);
    if (!raw) return undefined;
    return parseWorksheet(raw);
  }

  /** On the web a trashed document keeps its key, so this is `load` gated on its Trash row. */
  async loadTrashed(id: string): Promise<Worksheet | undefined> {
    const storage = this.storage;
    if (!storage) return undefined;
    if (!this.readTrash(storage).some((row) => row.id === id)) return undefined;
    return this.load(id);
  }

  async save(worksheet: Worksheet): Promise<void> {
    const storage = this.storage;
    if (!storage) return;
    // A newer build's document is never overwritten by this one (§ NewerDocumentError).
    if (isNewerThanBuild(worksheet) && storage.getItem(PREFIX + worksheet.id) !== null) {
      throw new NewerDocumentError();
    }
    await this.write(storage, worksheet);
  }

  /**
   * The key is shared with a trashed copy, so the rule also guards Trash (§ adoptRefused).
   * `expect` is checked synchronously before the write: nothing else runs in between.
   */
  async adopt(worksheet: Worksheet, expect?: AdoptExpect): Promise<void | 'changed'> {
    const storage = this.storage;
    if (!storage) return;
    const stored = storage.getItem(PREFIX + worksheet.id);
    if (expect !== undefined) {
      const trashed =
        this.readTrash(storage).some((row) => row.id === worksheet.id) &&
        !this.readIndex(storage).some((row) => row.id === worksheet.id);
      const found = stored === null ? null : { place: trashed ? ('trash' as const) : ('live' as const), text: stored };
      if (!holdsExpected(found, expect)) return 'changed';
    }
    if (stored !== null && adoptRefused(stored, worksheet)) throw new NewerDocumentError();
    await this.write(storage, worksheet);
  }

  private async write(storage: Storage, worksheet: Worksheet): Promise<void> {
    storage.setItem(PREFIX + worksheet.id, stringifyWorksheet(worksheet));

    const next = withSummaryFirst(await this.list(), summarize(worksheet));
    storage.setItem(INDEX_KEY, JSON.stringify(next));
    // Saved means live: the trashed copy shared this key and has just been overwritten.
    const trash = this.readTrash(storage);
    if (trash.some((row) => row.id === worksheet.id)) {
      this.writeTrash(storage, trash.filter((row) => row.id !== worksheet.id));
    }
  }

  /**
   * Rename a saved document.
   *
   * A rename writes `worksheet.name` — what the document is *called* — and deliberately
   * leaves `worksheet.title`, the heading printed on page 1, alone. Renaming a file is a
   * filing decision; stamping the new name across the top of the paper is not part of
   * what it asks for, and that is precisely what happened while a rename wrote `title`.
   *
   * It stays a field on the document rather than a label in the index: the index is
   * *derived* from the document (§`summarize`), so writing only the entry would be
   * undone by the next autosave. Hence load-and-re-save rather than patching in place.
   */
  async rename(id: string, name: string): Promise<void> {
    const worksheet = await this.load(id);
    if (!worksheet) return;
    await this.save({
      ...worksheet,
      name,
      updatedAt: new Date().toISOString(),
    });
  }

  async remove(id: string): Promise<void> {
    const storage = this.storage;
    if (!storage) return;
    storage.removeItem(PREFIX + id);
    const summaries = await this.list();
    storage.setItem(INDEX_KEY, JSON.stringify(summaries.filter((entry) => entry.id !== id)));
    const trash = this.readTrash(storage);
    if (trash.some((row) => row.id === id)) {
      this.writeTrash(storage, trash.filter((row) => row.id !== id));
    }
    this.forgetFolders(storage, [id]);
  }

  async readFolders(): Promise<FolderState> {
    const storage = this.storage;
    if (!storage) return parseFolders(undefined);
    try {
      return parseFolders(storage.getItem(FOLDERS_KEY));
    } catch {
      return parseFolders(undefined);
    }
  }

  async writeFolders(state: FolderState): Promise<void> {
    const storage = this.storage;
    if (!storage) return;
    if (isEmptyFolders(state) && !state.__unknown) storage.removeItem(FOLDERS_KEY);
    else storage.setItem(FOLDERS_KEY, JSON.stringify(serializeFolders(state)));
  }

  /** Deleted for good: their folder assignments go too. Best effort — it is only filing. */
  private forgetFolders(storage: Storage, ids: string[]): void {
    if (ids.length === 0) return;
    try {
      const state = parseFolders(storage.getItem(FOLDERS_KEY));
      const next = forgetDocuments(state, ids);
      if (next !== state) storage.setItem(FOLDERS_KEY, JSON.stringify(serializeFolders(next)));
    } catch {
      // A stale assignment is harmless: it names a document that no longer lists.
    }
  }

  private readTrash(storage: Storage): TrashedSummary[] {
    const raw = storage.getItem(TRASH_KEY);
    if (!raw) return [];
    try {
      return usableTrash(JSON.parse(raw));
    } catch {
      return [];
    }
  }

  private writeTrash(storage: Storage, rows: TrashedSummary[]): void {
    if (rows.length === 0) storage.removeItem(TRASH_KEY);
    else storage.setItem(TRASH_KEY, JSON.stringify(rows));
  }

  /**
   * The Trash row is written before the index row goes: interrupted between the two, the
   * document shows in both lists and the live one wins (`listTrash`) — never in neither.
   */
  async trash(id: string): Promise<void> {
    const storage = this.storage;
    if (!storage) return;
    if (storage.getItem(PREFIX + id) === null) {
      await this.remove(id);
      return;
    }
    const live = await this.list();
    let summary = live.find((entry) => entry.id === id);
    if (!summary) {
      const worksheet = await this.load(id).catch(() => undefined);
      summary = worksheet
        ? summarize(worksheet)
        : { id, title: 'Untitled', updatedAt: new Date(this.now()).toISOString() };
    }
    const row: TrashedSummary = { ...summary, deletedAt: new Date(this.now()).toISOString() };
    this.writeTrash(storage, [row, ...this.readTrash(storage).filter((r) => r.id !== id)]);
    storage.setItem(INDEX_KEY, JSON.stringify(live.filter((entry) => entry.id !== id)));
  }

  /**
   * A row is only Trash while its document is still stored and not live again — the key
   * is shared, so a live row means it was saved or re-imported since, and live wins.
   * Expired documents are deleted here; no timer is needed.
   */
  async listTrash(): Promise<TrashedSummary[]> {
    const storage = this.storage;
    if (!storage) return [];
    const rows = this.readTrash(storage);
    if (rows.length === 0) return [];
    const live = new Set((await this.list()).map((entry) => entry.id));
    const present = rows.filter(
      (row) => !live.has(row.id) && storage.getItem(PREFIX + row.id) !== null,
    );
    const { kept, expired, changed } = settleTrash(present, this.now());
    for (const row of expired) storage.removeItem(PREFIX + row.id);
    this.forgetFolders(storage, expired.map((row) => row.id));
    if (changed || present.length !== rows.length) this.writeTrash(storage, kept);
    return kept;
  }

  async restore(id: string): Promise<string | undefined> {
    const storage = this.storage;
    if (!storage) return undefined;
    const trash = this.readTrash(storage);
    const row = trash.find((entry) => entry.id === id);
    if (!row) return undefined;
    if (storage.getItem(PREFIX + id) !== null) {
      // Same key live or trashed, so nothing moves: the index gets its row back.
      const live = await this.list();
      if (!live.some((entry) => entry.id === id)) {
        const worksheet = await this.load(id).catch(() => undefined);
        const summary = worksheet ? summarize(worksheet) : untrashed(row);
        storage.setItem(INDEX_KEY, JSON.stringify(withSummaryFirst(live, summary)));
      }
      this.writeTrash(storage, trash.filter((entry) => entry.id !== id));
      return id;
    }
    this.writeTrash(storage, trash.filter((entry) => entry.id !== id));
    return undefined;
  }

  async purge(id: string): Promise<void> {
    const storage = this.storage;
    if (!storage) return;
    const live = new Set((await this.list()).map((entry) => entry.id));
    if (!live.has(id)) {
      storage.removeItem(PREFIX + id);
      this.forgetFolders(storage, [id]);
    }
    this.writeTrash(storage, this.readTrash(storage).filter((row) => row.id !== id));
  }

  async emptyTrash(): Promise<void> {
    const storage = this.storage;
    if (!storage) return;
    const live = new Set((await this.list()).map((entry) => entry.id));
    const gone = this.readTrash(storage).filter((row) => !live.has(row.id));
    for (const row of gone) storage.removeItem(PREFIX + row.id);
    this.forgetFolders(storage, gone.map((row) => row.id));
    storage.removeItem(TRASH_KEY);
  }

  async clear(): Promise<void> {
    const storage = this.storage;
    if (!storage) return;
    // Only this app's own keys. `localStorage` is shared with everything else served
    // from the same origin, so clearing it wholesale — or reaching for the browser's
    // "clear site data" — destroys more than this app has any business touching.
    const mine = Object.keys(storage).filter(
      (key) =>
        key === INDEX_KEY ||
        key === TRASH_KEY ||
        key === FOLDERS_KEY ||
        key === PATTERNS_KEY ||
        key.startsWith(PREFIX) ||
        key.startsWith(GRAPH_PREFIX),
    );
    for (const key of mine) storage.removeItem(key);
  }
}

/**
 * Write the worksheet out as a portable .json file.
 *
 * Through `saveFile`: the desktop save sheet, the browser's Save As where it has one,
 * else the anchor download. `undefined` when the teacher cancelled.
 */
export async function downloadWorksheetFile(worksheet: Worksheet): Promise<SavedTo | undefined> {
  const fileName = `${worksheetTitle(worksheet).replace(/[\\/:*?"<>|]/g, '-')}.worksheet.json`;
  return saveFile(stringifyWorksheet(worksheet), fileName, JSON_FILTERS);
}

export { triggerDownload };

export async function readWorksheetFile(file: File): Promise<Worksheet> {
  const text = await file.text();
  return parseWorksheet(text);
}

/**
 * Desktop: pick a worksheet `.json` through the native open sheet and parse it —
 * throws on a bad file, like `readWorksheetFile`. `undefined` when cancelled, and
 * always on the web, where the caller keeps its `<input type="file">`.
 */
export async function pickWorksheetFile(): Promise<Worksheet | undefined> {
  const picked = await pickTextFile(JSON_FILTERS);
  if (!picked) return undefined;
  return parseWorksheet(picked.text);
}

/**
 * Local documents' content hashes, for the sync engine (`src/sync/hashCache.ts`). Sound only
 * because every write through `worksheetStore` forgets its id: no other writer may bypass it.
 */
export const worksheetHashCache: HashCache = memoryHashCache();

/**
 * The store this build uses.
 *
 * Chosen once, at module load, by where we are running: the desktop shell keeps
 * documents as files under its app data directory, the browser keeps them in
 * `localStorage`. Both implement the same interface and the same rules, so nothing
 * above this line knows which it has. Wrapped in the change feed (§ changes.ts), which
 * announces every successful mutation — the question bank's index listens to it — over
 * `forgetOnWrite`, which drops each written id's cached hash before that announcement.
 */
export const worksheetStore: WorksheetStore = withChangeFeed(
  forgetOnWrite(isDesktop() ? new FileWorksheetStore() : new LocalStorageWorksheetStore(), worksheetHashCache),
);

/**
 * Where the 題型 registry lives (§ patterns.ts): `worksheets/patterns.json` on desktop,
 * one `localStorage` key on the web. Chosen once, like the store.
 */
export const patternStorage: PatternFile = isDesktop()
  ? patternsFile
  : localPatternFile(() => {
      if (typeof window === 'undefined') return undefined;
      try {
        return window.localStorage;
      } catch {
        return undefined;
      }
    });

/** Saved graphs (§ graphs.ts): files on desktop, `econ-graph:<id>` keys on the web. */
export const graphStore = new GraphStore(isDesktop() ? graphDirFiles : localGraphFiles(browserStorage));

/**
 * A document another tab saved (the browser's `storage` event, which never fires in the
 * tab that wrote), parsed; a damaged or newer-build one is not reported. The open editor
 * takes the newer tags from it (S4). Web only: the desktop shell has one window.
 */
export function onDocumentSavedElsewhere(listener: (worksheet: Worksheet) => void): () => void {
  if (typeof window === 'undefined' || isDesktop()) return () => {};
  const onStorage = (event: StorageEvent) => {
    if (!event.key?.startsWith(PREFIX) || event.newValue === null) return;
    let worksheet: Worksheet;
    try {
      worksheet = parseWorksheet(event.newValue);
    } catch {
      return;
    }
    if (isNewerThanBuild(worksheet)) return;
    listener(worksheet);
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}
