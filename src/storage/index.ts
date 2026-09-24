import type { Worksheet } from '@/model/types';
import { isDesktop, JSON_FILTERS, pickTextFile, saveFile } from '@/platform';
import {
  parseWorksheet,
  stringifyWorksheet,
  summarize,
  worksheetTitle,
} from './document';
import { FileWorksheetStore } from './fileStore';
import { triggerDownload } from './download';
import { usableSummaries, withSummaryFirst } from './summaries';
import { settleTrash, untrashed, usableTrash } from './trash';
import type { TrashedSummary, WorksheetStore, WorksheetSummary } from './types';

export type { TrashedSummary, WorksheetStore, WorksheetSummary } from './types';
export { TRASH_RETENTION_DAYS, trashAge } from './trash';
export {
  duplicateWorksheet,
  parseWorksheet,
  stringifyWorksheet,
  summarize,
  worksheetTitle,
} from './document';
export {
  FileWorksheetStore,
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

export class LocalStorageWorksheetStore implements WorksheetStore {
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  private get storage(): Storage | undefined {
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
   * two cannot drift.
   */
  async list(): Promise<WorksheetSummary[]> {
    const storage = this.storage;
    if (!storage) return [];
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

  async save(worksheet: Worksheet): Promise<void> {
    const storage = this.storage;
    if (!storage) return;
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
    if (!live.has(id)) storage.removeItem(PREFIX + id);
    this.writeTrash(storage, this.readTrash(storage).filter((row) => row.id !== id));
  }

  async emptyTrash(): Promise<void> {
    const storage = this.storage;
    if (!storage) return;
    const live = new Set((await this.list()).map((entry) => entry.id));
    for (const row of this.readTrash(storage)) {
      if (!live.has(row.id)) storage.removeItem(PREFIX + row.id);
    }
    storage.removeItem(TRASH_KEY);
  }

  async clear(): Promise<void> {
    const storage = this.storage;
    if (!storage) return;
    // Only this app's own keys. `localStorage` is shared with everything else served
    // from the same origin, so clearing it wholesale — or reaching for the browser's
    // "clear site data" — destroys more than this app has any business touching.
    const mine = Object.keys(storage).filter(
      (key) => key === INDEX_KEY || key === TRASH_KEY || key.startsWith(PREFIX),
    );
    for (const key of mine) storage.removeItem(key);
  }
}

/**
 * Write the worksheet out as a portable .json file.
 *
 * Through `saveFile`, so the web keeps its anchor download and the desktop build gets a
 * native save sheet and a real path. Returns that path on desktop, `undefined` on the
 * web or when the sheet was cancelled.
 */
export async function downloadWorksheetFile(worksheet: Worksheet): Promise<string | undefined> {
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
 * The store this build uses.
 *
 * Chosen once, at module load, by where we are running: the desktop shell keeps
 * documents as files under its app data directory, the browser keeps them in
 * `localStorage`. Both implement the same interface and the same rules, so nothing
 * above this line knows which it has.
 */
export const worksheetStore: WorksheetStore = isDesktop()
  ? new FileWorksheetStore()
  : new LocalStorageWorksheetStore();
