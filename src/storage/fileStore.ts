import { newId } from '@/model/factories';
import { isNewerThanBuild } from '@/model/migrations';
import type { Worksheet } from '@/model/types';
import { isDesktop } from '@/platform';
import { NewerDocumentError, parseWorksheet, stringifyWorksheet, summarize } from './document';
import type { TrashedSummary, WorksheetStore, WorksheetSummary } from './types';
import { usableSummaries, withSummaryFirst } from './summaries';
import { settleTrash, untrashed, usableTrash } from './trash';
import {
  copyAssignment,
  forgetDocuments,
  isEmptyFolders,
  parseFolders,
  serializeFolders,
  type FolderState,
} from './folders';

/**
 * The desktop store: real files under the app's data directory.
 *
 * Mirrors `LocalStorageWorksheetStore` exactly — same two halves (a document per id,
 * plus an index the start screen reads), same per-row validation, same ordering, same
 * rename-by-re-save. Only the medium differs, so a behaviour that holds on the web
 * holds here.
 *
 * Paths are relative and resolved against `BaseDirectory.AppData`, which is the only
 * tree the shell grants (`$APPDATA/**`). Everything in `@tauri-apps/plugin-fs` is
 * reached through a dynamic import so the web bundle never loads it.
 */

/** The worksheets directory, relative to `$APPDATA`. */
export const WORKSHEETS_DIR = 'worksheets';
/** Every stored document is `<id>` plus this. */
export const WORKSHEET_SUFFIX = '.worksheet.json';
const DIR = WORKSHEETS_DIR;
const SUFFIX = WORKSHEET_SUFFIX;
const INDEX = `${DIR}/index.json`;
const docPath = (id: string) => `${DIR}/${id}${SUFFIX}`;
/**
 * Trash is a subdirectory with its own index. Every build's index rebuild scans only
 * `worksheets/` itself and its `clear()` only removes `*.worksheet.json` + `index.json`
 * there, so no build — older ones included — can list or clear a trashed file.
 */
const TRASH_DIR = `${DIR}/trash`;
const TRASH_INDEX = `${TRASH_DIR}/index.json`;
const trashPath = (id: string) => `${TRASH_DIR}/${id}${SUFFIX}`;
/**
 * Folders and the document→folder map (§ folders.ts), beside `index.json`. Not a
 * `*.worksheet.json`, so no build's rebuild-by-scan reads it as a document, and not
 * `index.json`, so an older build's `clear()` leaves it (harmless: it names no file).
 */
const FOLDERS = `${DIR}/folders.json`;

/** Absolute path of `$APPDATA/worksheets` on desktop; `undefined` on the web. */
export async function savedWorksheetsFolder(): Promise<string | undefined> {
  if (!isDesktop()) return undefined;
  const { appDataDir, join } = await import('@tauri-apps/api/path');
  return join(await appDataDir(), DIR);
}

/** Absolute path of a stored document's file on desktop; `undefined` on the web. */
export async function savedWorksheetPath(id: string): Promise<string | undefined> {
  if (!isDesktop()) return undefined;
  const { appDataDir, join } = await import('@tauri-apps/api/path');
  return join(await appDataDir(), DIR, `${id}${SUFFIX}`);
}

type Fs = typeof import('@tauri-apps/plugin-fs');

export class FileWorksheetStore implements WorksheetStore {
  private fsModule: Promise<Fs> | undefined;
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  private fs(): Promise<Fs> {
    this.fsModule ??= import('@tauri-apps/plugin-fs');
    return this.fsModule;
  }

  /** The options every call passes: relative path, resolved under the app data dir. */
  private async base(): Promise<{ baseDir: number }> {
    const fs = await this.fs();
    return { baseDir: fs.BaseDirectory.AppData };
  }

  /** The worksheets directory exists before anything tries to write into it. */
  private async ensureDir(): Promise<void> {
    const fs = await this.fs();
    const opts = await this.base();
    if (!(await fs.exists(DIR, opts))) {
      await fs.mkdir(DIR, { ...opts, recursive: true });
    }
  }

  private async readIndex(): Promise<WorksheetSummary[] | undefined> {
    const fs = await this.fs();
    const opts = await this.base();
    if (!(await fs.exists(INDEX, opts))) return undefined;
    try {
      return usableSummaries(JSON.parse(await fs.readTextFile(INDEX, opts)));
    } catch {
      // The index file itself is unreadable — nothing here can be salvaged per entry,
      // but unlike the web the documents are still findable by name (§ rebuild).
      return undefined;
    }
  }

  private async writeIndex(summaries: WorksheetSummary[]): Promise<void> {
    const fs = await this.fs();
    await this.ensureDir();
    await fs.writeTextFile(INDEX, JSON.stringify(summaries, null, 2), await this.base());
  }

  /**
   * The desktop store's advantage over `localStorage`: a lost index is recoverable.
   *
   * On the web the index is the only list of what exists — a browser cannot enumerate
   * its own keys by meaning, and a document whose summary is gone is unreachable. Here
   * the documents are *files with names*, so when `index.json` is missing or corrupt we
   * scan the directory, re-derive a summary from each document (through the migration
   * chain, so old files rebuild correctly), and write the index back. A file the parser
   * rejects is skipped rather than aborting the scan — one bad document must not hide
   * the rest, the same rule as one bad index row.
   */
  private async rebuildIndex(): Promise<WorksheetSummary[]> {
    const fs = await this.fs();
    const opts = await this.base();
    if (!(await fs.exists(DIR, opts))) return [];
    const entries = await fs.readDir(DIR, opts);
    const rebuilt: WorksheetSummary[] = [];
    for (const entry of entries) {
      if (!entry.name?.endsWith(SUFFIX)) continue;
      try {
        const raw = await fs.readTextFile(`${DIR}/${entry.name}`, opts);
        rebuilt.push(summarize(parseWorksheet(raw)));
      } catch {
        // Unreadable or unmigratable — leave it on disk, just out of the list.
      }
    }
    const sorted = usableSummaries(rebuilt);
    if (sorted.length > 0) await this.writeIndex(sorted);
    return sorted;
  }

  async list(): Promise<WorksheetSummary[]> {
    try {
      const index = await this.readIndex();
      if (index) return index;
      return await this.rebuildIndex();
    } catch {
      return [];
    }
  }

  async load(id: string): Promise<Worksheet | undefined> {
    const fs = await this.fs();
    const opts = await this.base();
    try {
      if (!(await fs.exists(docPath(id), opts))) return undefined;
      return parseWorksheet(await fs.readTextFile(docPath(id), opts));
    } catch {
      return undefined;
    }
  }

  async save(worksheet: Worksheet): Promise<void> {
    const fs = await this.fs();
    // A newer build's document is never overwritten by this one (§ NewerDocumentError).
    if (isNewerThanBuild(worksheet) && (await fs.exists(docPath(worksheet.id), await this.base()))) {
      throw new NewerDocumentError();
    }
    await this.ensureDir();
    // The document first: an index row naming a file that is not there yet is the one
    // ordering that can show a row which cannot open.
    await fs.writeTextFile(
      docPath(worksheet.id),
      stringifyWorksheet(worksheet),
      await this.base(),
    );
    await this.writeIndex(withSummaryFirst(await this.list(), summarize(worksheet)));
  }

  /**
   * Rename a saved document — `worksheet.name`, never the printed `title`, and through
   * the document rather than the index row, which the next autosave would overwrite.
   */
  async rename(id: string, name: string): Promise<void> {
    const worksheet = await this.load(id);
    if (!worksheet) return;
    await this.save({ ...worksheet, name, updatedAt: new Date().toISOString() });
  }

  /** Delete the live document for good. A trashed copy is a separate file, left alone. */
  async remove(id: string): Promise<void> {
    const fs = await this.fs();
    const opts = await this.base();
    const summaries = await this.list();
    try {
      if (await fs.exists(docPath(id), opts)) await fs.remove(docPath(id), opts);
    } catch {
      // Already gone; the row still has to go.
    }
    await this.writeIndex(summaries.filter((entry) => entry.id !== id));
    // A trashed copy of the same id keeps its folder, to come back to on Restore.
    if (!(await fs.exists(trashPath(id), opts).catch(() => false))) await this.forgetFolders([id]);
  }

  async readFolders(): Promise<FolderState> {
    try {
      const fs = await this.fs();
      const opts = await this.base();
      if (!(await fs.exists(FOLDERS, opts))) return parseFolders(undefined);
      return parseFolders(await fs.readTextFile(FOLDERS, opts));
    } catch {
      return parseFolders(undefined);
    }
  }

  async writeFolders(state: FolderState): Promise<void> {
    const fs = await this.fs();
    const opts = await this.base();
    if (isEmptyFolders(state) && !state.__unknown) {
      if (await fs.exists(FOLDERS, opts)) await fs.remove(FOLDERS, opts);
      return;
    }
    await this.ensureDir();
    await fs.writeTextFile(FOLDERS, JSON.stringify(serializeFolders(state), null, 2), opts);
  }

  /** Change the folders file only if it holds something to change. Best effort. */
  private async editFolders(recipe: (state: FolderState) => FolderState): Promise<void> {
    try {
      const state = await this.readFolders();
      const next = recipe(state);
      if (next !== state) await this.writeFolders(next);
    } catch {
      // Filing only: a stale assignment names a document that no longer lists.
    }
  }

  private forgetFolders(ids: string[]): Promise<void> {
    if (ids.length === 0) return Promise.resolve();
    return this.editFolders((state) => forgetDocuments(state, ids));
  }

  /**
   * Copy then delete, not `rename`: the text calls are the ones already proven in the
   * shell, and a failure between the two leaves a copy behind, never nothing.
   */
  private async moveFile(from: string, to: string): Promise<string> {
    const fs = await this.fs();
    const opts = await this.base();
    const text = await fs.readTextFile(from, opts);
    await fs.writeTextFile(to, text, opts);
    await fs.remove(from, opts);
    return text;
  }

  private async readTrashIndex(): Promise<TrashedSummary[] | undefined> {
    const fs = await this.fs();
    const opts = await this.base();
    if (!(await fs.exists(TRASH_INDEX, opts))) return undefined;
    try {
      return usableTrash(JSON.parse(await fs.readTextFile(TRASH_INDEX, opts)));
    } catch {
      return undefined;
    }
  }

  private async writeTrashIndex(rows: TrashedSummary[]): Promise<void> {
    const fs = await this.fs();
    const opts = await this.base();
    if (!(await fs.exists(TRASH_DIR, opts))) await fs.mkdir(TRASH_DIR, { ...opts, recursive: true });
    await fs.writeTextFile(TRASH_INDEX, JSON.stringify(rows, null, 2), opts);
  }

  /** A lost Trash index is rebuilt from the files, each given a fresh retention window. */
  private async trashRows(): Promise<TrashedSummary[]> {
    const index = await this.readTrashIndex();
    if (index) return index;
    const fs = await this.fs();
    const opts = await this.base();
    if (!(await fs.exists(TRASH_DIR, opts))) return [];
    const deletedAt = new Date(this.now()).toISOString();
    const rebuilt: TrashedSummary[] = [];
    for (const entry of await fs.readDir(TRASH_DIR, opts)) {
      if (!entry.name?.endsWith(SUFFIX)) continue;
      try {
        const raw = await fs.readTextFile(`${TRASH_DIR}/${entry.name}`, opts);
        rebuilt.push({ ...summarize(parseWorksheet(raw)), deletedAt });
      } catch {
        // Unreadable — left on disk until the Trash is emptied.
      }
    }
    if (rebuilt.length > 0) await this.writeTrashIndex(rebuilt);
    return rebuilt;
  }

  /**
   * Row, then file, then index: interrupted after the row, `listTrash` drops a row whose
   * file never arrived; after the move, the dangling index row is dropped on open.
   */
  async trash(id: string): Promise<void> {
    const fs = await this.fs();
    const opts = await this.base();
    if (!(await fs.exists(docPath(id), opts))) {
      await this.remove(id);
      return;
    }
    const live = await this.list();
    const summary =
      live.find((entry) => entry.id === id) ??
      (await this.load(id).then((worksheet) => worksheet && summarize(worksheet))) ??
      { id, title: 'Untitled', updatedAt: new Date(this.now()).toISOString() };
    const row: TrashedSummary = { ...summary, deletedAt: new Date(this.now()).toISOString() };
    await this.writeTrashIndex([row, ...(await this.trashRows()).filter((r) => r.id !== id)]);
    await this.moveFile(docPath(id), trashPath(id));
    await this.writeIndex(live.filter((entry) => entry.id !== id));
  }

  /** Rows whose file is gone are dropped; expired ones are deleted here — no timer. */
  async listTrash(): Promise<TrashedSummary[]> {
    try {
      const fs = await this.fs();
      const opts = await this.base();
      const rows = await this.trashRows();
      const present: TrashedSummary[] = [];
      for (const row of rows) {
        if (await fs.exists(trashPath(row.id), opts)) present.push(row);
      }
      const { kept, expired, changed } = settleTrash(present, this.now());
      for (const row of expired) {
        try {
          await fs.remove(trashPath(row.id), opts);
        } catch {
          // Already gone.
        }
      }
      await this.forgetUnlessLive(expired.map((row) => row.id));
      if (changed || present.length !== rows.length) await this.writeTrashIndex(kept);
      return kept;
    } catch {
      return [];
    }
  }

  /**
   * Unlike the web, the trashed copy is its own file, so the id can be live again (an
   * older build re-imported it). Then it comes back beside that one under a new id —
   * a restore never overwrites.
   */
  async restore(id: string): Promise<string | undefined> {
    const fs = await this.fs();
    const opts = await this.base();
    const rows = await this.trashRows();
    const row = rows.find((entry) => entry.id === id);
    const rest = rows.filter((entry) => entry.id !== id);
    if (!(await fs.exists(trashPath(id), opts))) {
      if (row) await this.writeTrashIndex(rest);
      return undefined;
    }
    const live = await this.list();
    if (live.some((entry) => entry.id === id) || (await fs.exists(docPath(id), opts))) {
      const worksheet = parseWorksheet(await fs.readTextFile(trashPath(id), opts));
      const copyId = newId();
      await this.save({ ...worksheet, id: copyId });
      await this.editFolders((state) => copyAssignment(state, id, copyId));
      await fs.remove(trashPath(id), opts);
      await this.writeTrashIndex(rest);
      return copyId;
    }
    await this.ensureDir();
    const text = await this.moveFile(trashPath(id), docPath(id));
    let summary: WorksheetSummary;
    try {
      summary = summarize(parseWorksheet(text));
    } catch {
      summary = row ? untrashed(row) : { id, title: 'Untitled', updatedAt: '' };
    }
    await this.writeIndex(withSummaryFirst(live, summary));
    await this.writeTrashIndex(rest);
    return id;
  }

  async purge(id: string): Promise<void> {
    const fs = await this.fs();
    const opts = await this.base();
    try {
      if (await fs.exists(trashPath(id), opts)) await fs.remove(trashPath(id), opts);
    } catch {
      // Already gone; the row still has to go.
    }
    await this.writeTrashIndex((await this.trashRows()).filter((row) => row.id !== id));
    await this.forgetUnlessLive([id]);
  }

  /** Purged from Trash: forget the folder, unless the same id is also live. */
  private async forgetUnlessLive(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const fs = await this.fs();
    const opts = await this.base();
    const gone: string[] = [];
    for (const id of ids) {
      if (!(await fs.exists(docPath(id), opts).catch(() => true))) gone.push(id);
    }
    await this.forgetFolders(gone);
  }

  async emptyTrash(): Promise<void> {
    const trashed = (await this.trashRows().catch(() => [] as TrashedSummary[])).map((r) => r.id);
    await this.clearTrashDir();
    await this.forgetUnlessLive(trashed);
    const fs = await this.fs();
    if (await fs.exists(TRASH_DIR, await this.base())) await this.writeTrashIndex([]);
  }

  /** Every trashed file and the Trash index; anything else in there is not ours. */
  private async clearTrashDir(): Promise<void> {
    const fs = await this.fs();
    const opts = await this.base();
    if (!(await fs.exists(TRASH_DIR, opts))) return;
    for (const entry of await fs.readDir(TRASH_DIR, opts)) {
      if (!entry.name) continue;
      if (!entry.name.endsWith(SUFFIX) && entry.name !== 'index.json') continue;
      try {
        await fs.remove(`${TRASH_DIR}/${entry.name}`, opts);
      } catch {
        // Keep going: one undeletable file must not keep the rest.
      }
    }
  }

  /**
   * Forget every saved document — only this app's own worksheets directory, never the
   * wider app data tree, which other things (window state, settings) also live in.
   * Trash and folders included.
   */
  async clear(): Promise<void> {
    const fs = await this.fs();
    const opts = await this.base();
    await this.clearTrashDir();
    try {
      if (await fs.exists(FOLDERS, opts)) await fs.remove(FOLDERS, opts);
    } catch {
      // Keep going: the documents matter more than their filing.
    }
    if (!(await fs.exists(DIR, opts))) return;
    for (const entry of await fs.readDir(DIR, opts)) {
      if (!entry.name) continue;
      if (!entry.name.endsWith(SUFFIX) && entry.name !== 'index.json') continue;
      try {
        await fs.remove(`${DIR}/${entry.name}`, opts);
      } catch {
        // Keep going: one undeletable file must not leave the rest listed.
      }
    }
  }
}
