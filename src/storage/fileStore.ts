import type { Worksheet } from '@/model/types';
import { parseWorksheet, stringifyWorksheet, summarize } from './document';
import type { WorksheetStore, WorksheetSummary } from './types';
import { usableSummaries, withSummaryFirst } from './summaries';

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

const DIR = 'worksheets';
const INDEX = `${DIR}/index.json`;
const SUFFIX = '.worksheet.json';
const docPath = (id: string) => `${DIR}/${id}${SUFFIX}`;

type Fs = typeof import('@tauri-apps/plugin-fs');

export class FileWorksheetStore implements WorksheetStore {
  private fsModule: Promise<Fs> | undefined;

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
  }

  /**
   * Forget every saved document — only this app's own worksheets directory, never the
   * wider app data tree, which other things (window state, settings) also live in.
   */
  async clear(): Promise<void> {
    const fs = await this.fs();
    const opts = await this.base();
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
