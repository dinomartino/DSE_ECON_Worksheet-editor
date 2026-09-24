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
import type { WorksheetStore, WorksheetSummary } from './types';

export type { WorksheetStore, WorksheetSummary } from './types';
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

export class LocalStorageWorksheetStore implements WorksheetStore {
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
  }

  async clear(): Promise<void> {
    const storage = this.storage;
    if (!storage) return;
    // Only this app's own keys. `localStorage` is shared with everything else served
    // from the same origin, so clearing it wholesale — or reaching for the browser's
    // "clear site data" — destroys more than this app has any business touching.
    const mine = Object.keys(storage).filter(
      (key) => key === INDEX_KEY || key.startsWith(PREFIX),
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
