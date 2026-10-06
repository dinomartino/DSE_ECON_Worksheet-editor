import { newId } from '@/model/factories';
import { isNewerThanBuild } from '@/model/migrations';
import type { Worksheet } from '@/model/types';
import { isDesktop } from '@/platform';
import { adoptRefused, NewerDocumentError, parseWorksheet, stringifyWorksheet, summarize } from './document';
import type { TrashedSummary, WorksheetStore, WorksheetSummary } from './types';
import { kindRepairs, usableSummaries, withKindRepairs, withSummaryFirst } from './summaries';
import { settleTrash, untrashed, usableTrash } from './trash';
import {
  copyAssignment,
  forgetDocuments,
  isEmptyFolders,
  parseFolders,
  serializeFolders,
  type FolderState,
} from './folders';
import type { PatternFile } from './patterns';
import { GRAPH_SUFFIX, GRAPHS_DIR, type GraphFiles } from './graphs';
import { sha256 } from '@/sync/hash';

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
/** The 題型 registry (§ patterns.ts), beside `folders.json` and for the same reasons. */
export const PATTERNS_FILE = `${DIR}/patterns.json`;

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

/** The question bank's derived index (§ src/library/bankBackend.ts), relative to `$APPDATA`. */
const LIBRARY_DIR = `${DIR}/library`;
/** One file per document: `<encoded docId>.json`. */
export const LIBRARY_DOCS_DIR = `${LIBRARY_DIR}/docs`;
/** The single file unreleased builds wrote; read once to migrate, then removed. */
export const LIBRARY_INDEX = `${LIBRARY_DIR}/index.json`;
const LIBRARY_DOC_SUFFIX = '.json';
const libraryDocPath = (id: string) => `${LIBRARY_DOCS_DIR}/${encodeURIComponent(id)}${LIBRARY_DOC_SUFFIX}`;

/**
 * The bank index's per-document files. A subdirectory, so no build's rebuild-by-scan or
 * `clear()` reads them as documents. Inert on the web. Errors propagate; the index treats
 * them as "rebuild".
 */
let libraryFsModule: Promise<Fs> | undefined;
/** The fs plugin, imported once for the library and sync files (dynamic: never in the web bundle). */
const libraryFs = (): Promise<Fs> => (libraryFsModule ??= import('@tauri-apps/plugin-fs'));

export const libraryDocFiles = {
  async ids(): Promise<string[]> {
    if (!isDesktop()) return [];
    const fs = await libraryFs();
    const opts = { baseDir: fs.BaseDirectory.AppData };
    if (!(await fs.exists(LIBRARY_DOCS_DIR, opts))) return [];
    return (await fs.readDir(LIBRARY_DOCS_DIR, opts))
      .map((entry) => entry.name ?? '')
      .filter((name) => name.endsWith(LIBRARY_DOC_SUFFIX))
      .flatMap((name) => {
        try {
          return [decodeURIComponent(name.slice(0, -LIBRARY_DOC_SUFFIX.length))];
        } catch {
          return [];
        }
      });
  },
  async read(id: string): Promise<string | undefined> {
    if (!isDesktop()) return undefined;
    const fs = await libraryFs();
    const opts = { baseDir: fs.BaseDirectory.AppData };
    // One call, not `exists` then a read: loading the index reads every file.
    return fs.readTextFile(libraryDocPath(id), opts).catch(() => undefined);
  },
  async write(id: string, text: string): Promise<void> {
    if (!isDesktop()) return;
    const fs = await libraryFs();
    const opts = { baseDir: fs.BaseDirectory.AppData };
    if (!(await fs.exists(LIBRARY_DOCS_DIR, opts))) await fs.mkdir(LIBRARY_DOCS_DIR, { ...opts, recursive: true });
    await fs.writeTextFile(libraryDocPath(id), text, opts);
  },
  async remove(id: string): Promise<void> {
    if (!isDesktop()) return;
    const fs = await libraryFs();
    const opts = { baseDir: fs.BaseDirectory.AppData };
    const path = libraryDocPath(id);
    if (await fs.exists(path, opts)) await fs.remove(path, opts);
  },
  async clear(): Promise<void> {
    if (!isDesktop()) return;
    const fs = await libraryFs();
    const opts = { baseDir: fs.BaseDirectory.AppData };
    if (!(await fs.exists(LIBRARY_DOCS_DIR, opts))) return;
    for (const entry of await fs.readDir(LIBRARY_DOCS_DIR, opts)) {
      if (!entry.name?.endsWith(LIBRARY_DOC_SUFFIX)) continue;
      // Keep going: one undeletable file must not keep the rest.
      await fs.remove(`${LIBRARY_DOCS_DIR}/${entry.name}`, opts).catch(() => undefined);
    }
  },
};

/** The legacy single file, `worksheets/library/index.json`. Inert on the web. */
export const libraryIndexFile = {
  async read(): Promise<string | undefined> {
    if (!isDesktop()) return undefined;
    const fs = await libraryFs();
    const opts = { baseDir: fs.BaseDirectory.AppData };
    if (!(await fs.exists(LIBRARY_INDEX, opts))) return undefined;
    return fs.readTextFile(LIBRARY_INDEX, opts);
  },
  async remove(): Promise<void> {
    if (!isDesktop()) return;
    const fs = await libraryFs();
    const opts = { baseDir: fs.BaseDirectory.AppData };
    if (await fs.exists(LIBRARY_INDEX, opts)) await fs.remove(LIBRARY_INDEX, opts);
  },
};

/** `worksheets/library/pack.json`: every document's rows in one file, a cache of `docs/` (§ bankBackend.ts). */
export const LIBRARY_PACK = `${LIBRARY_DIR}/pack.json`;
/** `worksheets/library/journal.json`: the documents whose `docs/` file changed since the pack was written. */
export const LIBRARY_JOURNAL = `${LIBRARY_DIR}/journal.json`;

/** One whole text file under `worksheets/library/`, written through a temp file and a rename. Inert on the web. */
function libraryTextFile(path: string) {
  return {
    async read(): Promise<string | undefined> {
      if (!isDesktop()) return undefined;
      const fs = await libraryFs();
      // No `exists` first: one call, and a missing file is `undefined` like any unreadable one.
      return fs.readTextFile(path, { baseDir: fs.BaseDirectory.AppData }).catch(() => undefined);
    },
    async write(text: string): Promise<void> {
      if (!isDesktop()) return;
      const fs = await libraryFs();
      const opts = { baseDir: fs.BaseDirectory.AppData };
      if (!(await fs.exists(LIBRARY_DIR, opts))) await fs.mkdir(LIBRARY_DIR, { ...opts, recursive: true });
      const temp = `${path}.tmp`;
      await fs.writeTextFile(temp, text, opts);
      try {
        await fs.rename(temp, path, { oldPathBaseDir: opts.baseDir, newPathBaseDir: opts.baseDir });
      } catch {
        await fs.writeTextFile(path, text, opts);
        await fs.remove(temp, opts).catch(() => undefined);
      }
    },
    async remove(): Promise<void> {
      if (!isDesktop()) return;
      const fs = await libraryFs();
      await fs.remove(path, { baseDir: fs.BaseDirectory.AppData }).catch(() => undefined);
    },
  };
}

export const libraryPackFile = libraryTextFile(LIBRARY_PACK);
export const libraryJournalFile = libraryTextFile(LIBRARY_JOURNAL);

/** Sync state, beside (never inside) `worksheets/`: no build's scan or `clear()` reaches it. */
export const SYNC_DIR = 'sync';

/** `sync/base-<hash of sourceId>.json`: a filename any source id maps to safely. */
export function syncBasePath(sourceId: string): string {
  return `${SYNC_DIR}/base-${sha256(sourceId).slice(0, 32)}.json`;
}

/**
 * One source's sync base (§ src/sync/persistentBase.ts), as whole text. Inert on the web.
 * A write goes to a temp file renamed over the old one, never in place: a crash leaves the
 * old base or the new, and a refused rename loses only this write (the base lags, which is safe).
 */
export function syncBaseFile(sourceId: string) {
  const path = syncBasePath(sourceId);
  const temp = `${path}.tmp`;
  return {
    async read(): Promise<string | undefined> {
      if (!isDesktop()) return undefined;
      const fs = await libraryFs();
      return fs.readTextFile(path, { baseDir: fs.BaseDirectory.AppData }).catch(() => undefined);
    },
    async write(text: string): Promise<void> {
      if (!isDesktop()) return;
      const fs = await libraryFs();
      const opts = { baseDir: fs.BaseDirectory.AppData };
      if (!(await fs.exists(SYNC_DIR, opts))) await fs.mkdir(SYNC_DIR, { ...opts, recursive: true });
      await fs.writeTextFile(temp, text, opts);
      try {
        await fs.rename(temp, path, { oldPathBaseDir: opts.baseDir, newPathBaseDir: opts.baseDir });
      } catch (error) {
        await fs.remove(temp, opts).catch(() => undefined);
        throw error;
      }
    },
    /** Throws if the file stays: a forgotten base must really be gone. */
    async remove(): Promise<void> {
      if (!isDesktop()) return;
      const fs = await libraryFs();
      const opts = { baseDir: fs.BaseDirectory.AppData };
      if (await fs.exists(path, opts)) await fs.remove(path, opts);
      await fs.remove(temp, opts).catch(() => undefined);
    },
  };
}

/**
 * Text access to `worksheets/patterns.json` (§ patterns.ts). Inert on the web. Written
 * through a temp file and a rename; an unreadable one is set aside beside it first. Neither
 * name is a `*.worksheet.json`, so no build's rebuild-by-scan reads them.
 */
export const patternsFile: PatternFile = {
  async read(): Promise<string | undefined> {
    if (!isDesktop()) return undefined;
    const fs = await import('@tauri-apps/plugin-fs');
    const opts = { baseDir: fs.BaseDirectory.AppData };
    if (!(await fs.exists(PATTERNS_FILE, opts))) return undefined;
    return fs.readTextFile(PATTERNS_FILE, opts);
  },
  async write(text: string | undefined): Promise<void> {
    if (!isDesktop()) return;
    const fs = await import('@tauri-apps/plugin-fs');
    const opts = { baseDir: fs.BaseDirectory.AppData };
    if (text === undefined) {
      if (await fs.exists(PATTERNS_FILE, opts)) await fs.remove(PATTERNS_FILE, opts);
      return;
    }
    if (!(await fs.exists(DIR, opts))) await fs.mkdir(DIR, { ...opts, recursive: true });
    // Whole or not at all: write beside it, then rename over it. Should the rename be
    // refused, write in place rather than lose the change.
    const temp = `${PATTERNS_FILE}.tmp`;
    await fs.writeTextFile(temp, text, opts);
    try {
      await fs.rename(temp, PATTERNS_FILE, { oldPathBaseDir: opts.baseDir, newPathBaseDir: opts.baseDir });
    } catch {
      await fs.writeTextFile(PATTERNS_FILE, text, opts);
      await fs.remove(temp, opts).catch(() => undefined);
    }
  },
  /** An unreadable registry is kept as `worksheets/patterns.corrupt-<time>.json`. */
  async setAside(text: string): Promise<void> {
    if (!isDesktop()) return;
    const fs = await import('@tauri-apps/plugin-fs');
    const opts = { baseDir: fs.BaseDirectory.AppData };
    if (!(await fs.exists(DIR, opts))) await fs.mkdir(DIR, { ...opts, recursive: true });
    await fs.writeTextFile(`${DIR}/patterns.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, text, opts);
  },
};

/**
 * Saved graphs (§ graphs.ts) as `worksheets/graphs/<id>.graph.json`: a subdirectory, so
 * no build's rebuild-by-scan or `clear()` of `worksheets/` reads them. Inert on the web.
 */
export const graphDirFiles: GraphFiles = {
  async ids(): Promise<string[]> {
    if (!isDesktop()) return [];
    const fs = await import('@tauri-apps/plugin-fs');
    const opts = { baseDir: fs.BaseDirectory.AppData };
    if (!(await fs.exists(GRAPHS_DIR, opts))) return [];
    return (await fs.readDir(GRAPHS_DIR, opts))
      .map((entry) => entry.name ?? '')
      .filter((name) => name.endsWith(GRAPH_SUFFIX))
      .map((name) => name.slice(0, -GRAPH_SUFFIX.length));
  },
  async read(id: string): Promise<string | undefined> {
    if (!isDesktop()) return undefined;
    const fs = await import('@tauri-apps/plugin-fs');
    const opts = { baseDir: fs.BaseDirectory.AppData };
    const path = `${GRAPHS_DIR}/${id}${GRAPH_SUFFIX}`;
    if (!(await fs.exists(path, opts))) return undefined;
    return fs.readTextFile(path, opts);
  },
  async write(id: string, text: string): Promise<void> {
    if (!isDesktop()) return;
    const fs = await import('@tauri-apps/plugin-fs');
    const opts = { baseDir: fs.BaseDirectory.AppData };
    if (!(await fs.exists(GRAPHS_DIR, opts))) await fs.mkdir(GRAPHS_DIR, { ...opts, recursive: true });
    await fs.writeTextFile(`${GRAPHS_DIR}/${id}${GRAPH_SUFFIX}`, text, opts);
  },
  async remove(id: string): Promise<void> {
    if (!isDesktop()) return;
    const fs = await import('@tauri-apps/plugin-fs');
    const opts = { baseDir: fs.BaseDirectory.AppData };
    const path = `${GRAPHS_DIR}/${id}${GRAPH_SUFFIX}`;
    if (await fs.exists(path, opts)) await fs.remove(path, opts);
  },
  async clear(): Promise<void> {
    if (!isDesktop()) return;
    const fs = await import('@tauri-apps/plugin-fs');
    const opts = { baseDir: fs.BaseDirectory.AppData };
    if (!(await fs.exists(GRAPHS_DIR, opts))) return;
    for (const entry of await fs.readDir(GRAPHS_DIR, opts)) {
      if (!entry.name?.endsWith(GRAPH_SUFFIX)) continue;
      try {
        await fs.remove(`${GRAPHS_DIR}/${entry.name}`, opts);
      } catch {
        // Keep going: one undeletable file must not keep the rest.
      }
    }
  },
};

export class FileWorksheetStore implements WorksheetStore {
  private fsModule: Promise<Fs> | undefined;
  private readonly now: () => number;
  /** Saves still writing: `clear` waits them out, or one lands after it and relists. */
  private readonly saving = new Set<Promise<void>>();

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
      if (index) return await this.repairKinds(index);
      return await this.rebuildIndex();
    } catch {
      return [];
    }
  }

  /**
   * A row an older build wrote (or v0.5.0 rebuilt) gets its `kind` from the document,
   * once, written back into a fresh read of the index (§ kindRepairs).
   */
  private async repairKinds(rows: WorksheetSummary[]): Promise<WorksheetSummary[]> {
    const repairs = await kindRepairs(rows, (id) => this.load(id));
    if (repairs.size === 0) return rows;
    const listed = rows.map((row) => repairs.get(row.id) ?? row);
    try {
      const fs = await this.fs();
      const opts = await this.base();
      const next = withKindRepairs(JSON.parse(await fs.readTextFile(INDEX, opts)), repairs);
      await fs.writeTextFile(INDEX, JSON.stringify(next, null, 2), opts);
      return usableSummaries(next);
    } catch {
      // Not written back: listed right anyway, and tried again next time.
      return listed;
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
    const write = this.write(worksheet);
    this.saving.add(write);
    try {
      await write;
    } finally {
      this.saving.delete(write);
    }
  }

  /** The trashed file, which `load` never reads (it is a separate file here). */
  async loadTrashed(id: string): Promise<Worksheet | undefined> {
    const fs = await this.fs();
    const opts = await this.base();
    try {
      if (!(await fs.exists(trashPath(id), opts))) return undefined;
      return parseWorksheet(await fs.readTextFile(trashPath(id), opts));
    } catch {
      return undefined;
    }
  }

  /** Only the live file is guarded (§ adoptRefused): a trashed copy is a separate file. */
  async adopt(worksheet: Worksheet): Promise<void> {
    const write = this.write(worksheet, true);
    this.saving.add(write);
    try {
      await write;
    } finally {
      this.saving.delete(write);
    }
  }

  private async write(worksheet: Worksheet, adopting = false): Promise<void> {
    const fs = await this.fs();
    const opts = await this.base();
    if (adopting) {
      const stored = (await fs.exists(docPath(worksheet.id), opts))
        ? await fs.readTextFile(docPath(worksheet.id), opts)
        : undefined;
      if (stored !== undefined && adoptRefused(stored, worksheet)) throw new NewerDocumentError();
    } else if (isNewerThanBuild(worksheet) && (await fs.exists(docPath(worksheet.id), opts))) {
      // A newer build's document is never overwritten by this one (§ NewerDocumentError).
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
   * Trash, folders, the 題型 registry and saved graphs included.
   */
  async clear(): Promise<void> {
    // Unlike `localStorage`, a file save spans many awaits and can straddle a clear.
    await Promise.allSettled(this.saving);
    const fs = await this.fs();
    const opts = await this.base();
    await this.clearTrashDir();
    await graphDirFiles.clear().catch(() => undefined);
    for (const file of [FOLDERS, PATTERNS_FILE]) {
      try {
        if (await fs.exists(file, opts)) await fs.remove(file, opts);
      } catch {
        // Keep going: the documents matter more than their filing.
      }
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
