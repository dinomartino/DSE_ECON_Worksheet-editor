import JSZip from 'jszip';
import pkg from '../../package.json';
import { newId } from '@/model/factories';
import { CURRENT_SCHEMA_VERSION } from '@/model/migrations';
import type { Worksheet } from '@/model/types';
import { parseGraph, stringifyGraph, type SavedGraph } from '@/model/graph';
import { parseWorksheet, stringifyWorksheet, summarize, worksheetTitle } from './document';
import type { WorksheetStore } from './types';
import {
  foldersForBackup,
  isEmptyFolders,
  mergeBackupFolders,
  serializeFolders,
  updateFolders,
  usableFolders,
  type FolderState,
} from './folders';
import type { GraphRestoreReport } from './graphs';
import {
  addPatternEntries,
  addUnusableRows,
  isEmptyPatterns,
  serializePatterns,
  updatePatternRegistry,
  usablePatterns,
  type PatternFile,
  type PatternRegistry,
} from './patterns';

/**
 * "Back up all" and "Restore from backup": every saved document in one `.zip`.
 *
 * Each entry is exactly what "Download .json" writes, so a backup can also be unzipped
 * and opened a file at a time. Trash is left out: a backup is what the teacher keeps,
 * and restoring it would bring deleted work back as live documents.
 *
 * Folders ride **inside `manifest.json`**, never as an entry of their own: every shipped
 * build's `readBackup` parses each `.json` entry except the manifest as a worksheet, so
 * a `folders.json` entry would restore there as an unreadable (or blank) document. The
 * 題型 registry rides there too, for the same reason: it is not rebuildable (§ patterns.ts).
 *
 * Saved graphs are entries under `graphs/`, named `.graph` rather than `.json` for the same
 * reason: a shipped build would restore a `.json` graph as an empty worksheet.
 */

export const MANIFEST_NAME = 'manifest.json';

export interface BackupManifest {
  app: 'econ-worksheet';
  format: 1;
  appVersion: string;
  createdAt: string;
  count: number;
  schemaVersion: number;
  /** The folders and the assignments of the documents in this backup; absent if none. */
  folders?: Record<string, unknown>;
  /** The 題型 registry (§ patterns.ts); absent if empty. */
  patterns?: Record<string, unknown>;
}

export interface BackupEntry {
  /** The entry's path inside the zip — how a failure is named. */
  name: string;
  worksheet: Worksheet;
}

export interface BackupContents {
  worksheets: BackupEntry[];
  /** Entries that did not parse as a worksheet; the rest still restore. */
  failures: { name: string; reason: string }[];
  /** From the manifest; empty for an older backup, or an unreadable manifest. */
  folders: FolderState;
  /** The 題型 registry from the manifest, validated per row; empty when absent. */
  patterns: PatternRegistry;
  /** Saved graphs (`graphs/*.graph`), each through the migration chain. */
  graphs: SavedGraph[];
  /** Translation terms CSV (`terms/translation-terms.csv`), merged into Settings on restore. */
  terms?: string;
}

export class BackupError extends Error {}

const UNSAFE = /[\\/:*?"<>|\u0000-\u001f]/g;

function safeName(text: string): string {
  return text.replace(UNSAFE, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Untitled';
}

export const GRAPHS_FOLDER = 'graphs/';
/** Settings → Translation terms as CSV: a `.csv`, so a shipped build's restore ignores it. */
export const TERMS_ENTRY = 'terms/translation-terms.csv';
export const GRAPH_ENTRY_SUFFIX = '.graph';

/** `graphs/<name> (<id>).graph`. */
export function graphEntryName(graph: SavedGraph): string {
  return `${GRAPHS_FOLDER}${safeName(graph.name)} (${safeName(graph.id)})${GRAPH_ENTRY_SUFFIX}`;
}

/** `<title> (<id>).worksheet.json` — readable, and unique because the id is. */
export function backupEntryName(worksheet: Worksheet): string {
  return `${safeName(worksheetTitle(worksheet))} (${safeName(worksheet.id)}).worksheet.json`;
}

export { backupFileName } from './backupName';

export async function buildBackup(
  worksheets: Worksheet[],
  createdAt = new Date().toISOString(),
  folders?: FolderState,
  patterns?: PatternRegistry,
  graphs: SavedGraph[] = [],
  /** The teacher's translation terms (`src/settings/termsCsv.ts`), when they have any. */
  terms?: string,
): Promise<Uint8Array> {
  const zip = new JSZip();
  const manifest: BackupManifest = {
    app: 'econ-worksheet',
    format: 1,
    appVersion: pkg.version,
    createdAt,
    count: worksheets.length,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
  const filed = folders && foldersForBackup(folders, worksheets.map((worksheet) => worksheet.id));
  if (filed && !isEmptyFolders(filed)) manifest.folders = serializeFolders(filed);
  if (patterns && !isEmptyPatterns(patterns)) manifest.patterns = serializePatterns(patterns);
  zip.file(MANIFEST_NAME, JSON.stringify(manifest, null, 2));
  for (const worksheet of worksheets) {
    zip.file(backupEntryName(worksheet), stringifyWorksheet(worksheet));
  }
  for (const graph of graphs) zip.file(graphEntryName(graph), stringifyGraph(graph));
  if (terms) zip.file(TERMS_ENTRY, terms);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

/**
 * Every worksheet in a backup, each through `parseWorksheet` (the migration chain), so
 * an old-schema backup restores as a current document. One bad entry is reported and
 * skipped — it never costs the rest. Throws `BackupError` only if this is not a zip.
 */
export async function readBackup(data: Uint8Array | ArrayBuffer | Blob): Promise<BackupContents> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new BackupError('That file is not a .zip backup.');
  }
  const worksheets: BackupEntry[] = [];
  const failures: BackupContents['failures'] = [];
  let folders = usableFolders(undefined);
  let patterns = usablePatterns(undefined);
  try {
    const manifest = await zip.file(MANIFEST_NAME)?.async('string');
    if (manifest) {
      const parsed = JSON.parse(manifest);
      folders = usableFolders(parsed?.folders);
      patterns = usablePatterns(parsed?.patterns);
    }
  } catch {
    // An unreadable manifest costs the filing, never a document.
  }
  const entries = Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .filter((entry) => {
      const base = entry.name.split('/').pop() ?? '';
      // Finder's resource forks and dotfiles ride along when a folder is re-zipped.
      if (entry.name.startsWith('__MACOSX/') || base.startsWith('.')) return false;
      return base.toLowerCase().endsWith('.json') && entry.name !== MANIFEST_NAME;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    try {
      worksheets.push(worksheetEntry(entry.name, await entry.async('string')));
    } catch (cause) {
      failures.push({ name: entry.name, reason: entryFailure(cause) });
    }
  }
  const graphs: SavedGraph[] = [];
  const graphEntries = Object.values(zip.files)
    .filter((entry) => !entry.dir && !entry.name.startsWith('__MACOSX/'))
    .filter((entry) => entry.name.toLowerCase().endsWith(GRAPH_ENTRY_SUFFIX))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of graphEntries) {
    try {
      graphs.push(parseGraph(await entry.async('string')));
    } catch (cause) {
      failures.push({ name: entry.name, reason: cause instanceof SyntaxError ? 'not valid JSON' : 'not a graph' });
    }
  }
  const terms = await zip.file(TERMS_ENTRY)?.async('string').catch(() => undefined);
  return { worksheets, failures, folders, patterns, graphs, ...(terms ? { terms } : {}) };
}

/**
 * One `.json` as a restorable entry, through `parseWorksheet` (the migration chain).
 * Throws when it is not a worksheet — `entryFailure` names why. Shared by backups and
 * loose files dropped on the start screen.
 */
export function worksheetEntry(name: string, text: string): BackupEntry {
  const worksheet = parseWorksheet(text);
  summarize(worksheet); // a JSON object that is not a worksheet fails here
  return {
    name,
    worksheet: typeof worksheet.id === 'string' && worksheet.id ? worksheet : { ...worksheet, id: newId() },
  };
}

export function entryFailure(cause: unknown): string {
  return cause instanceof SyntaxError ? 'not valid JSON' : 'not a worksheet';
}

export interface RestoreReport {
  /** Titles restored under their own id. */
  restored: string[];
  /** Titles restored beside a different document of the same id, under a new one. */
  copied: string[];
  /** Titles already here, identical. */
  skipped: string[];
  /** Titles that could not be saved — most often storage is full. */
  failed: { name: string; reason: string }[];
}

function isQuotaError(cause: unknown): boolean {
  if (!cause || typeof cause !== 'object') return false;
  const { name, code } = cause as { name?: string; code?: number };
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || code === 22;
}

/**
 * Save a backup's worksheets into `store`, **never overwriting**: an id already live is
 * skipped when identical and otherwise restored as a copy under a new id, named
 * "… (restored)" (the filing name — the printed title is untouched). An id in the Trash
 * also becomes a copy; the Trash's own Restore is how that one comes back. Each save is
 * caught on its own, so a full `localStorage` reports which ones did not fit.
 *
 * `folders` (from the manifest) merge in the same spirit: a restored document is filed
 * as the backup had it only if it has no folder here; existing folders are reused.
 */
export async function restoreBackup(
  store: WorksheetStore,
  entries: BackupEntry[],
  makeId: () => string = newId,
  folders?: FolderState,
): Promise<RestoreReport> {
  const report: RestoreReport = { restored: [], copied: [], skipped: [], failed: [] };
  const live = new Set((await store.list()).map((entry) => entry.id));
  const trashed = new Set((await store.listTrash()).map((entry) => entry.id));
  /** Backup document id → the id it was saved under here. */
  const placed = new Map<string, string>();

  for (const { worksheet } of entries) {
    const title = worksheetTitle(worksheet);
    // The web store reads a trashed or orphaned document from the same key as a live one.
    const existing = await store.load(worksheet.id).catch(() => undefined);
    const same = !!existing && stringifyWorksheet(existing) === stringifyWorksheet(worksheet);
    if (live.has(worksheet.id) && same) {
      report.skipped.push(title);
      continue;
    }
    const asCopy = live.has(worksheet.id) || trashed.has(worksheet.id) || (!!existing && !same);
    const toSave = asCopy ? { ...worksheet, id: makeId(), name: `${title} (restored)` } : worksheet;
    try {
      await store.save(toSave);
      live.add(toSave.id);
      placed.set(worksheet.id, toSave.id);
      (asCopy ? report.copied : report.restored).push(title);
    } catch (cause) {
      report.failed.push({
        name: title,
        reason: isQuotaError(cause) ? 'storage is full' : 'could not be saved',
      });
      // A half-written save (document without its row) would only eat quota. Only ever
      // for an id that held nothing before.
      if (asCopy || !existing) await store.remove(toSave.id).catch(() => undefined);
    }
  }
  if (folders && !isEmptyFolders(folders)) {
    // The documents are in; losing their filing is not worth failing the restore over.
    await updateFolders(store, (state) => mergeBackupFolders(state, folders, placed)).catch(
      () => undefined,
    );
  }
  return report;
}

/**
 * A backup's 題型 joined into the registry here: every entry not already present is added,
 * none is removed or renamed. Best effort, like the folders: never fails the restore.
 */
export async function restorePatterns(file: PatternFile, patterns: PatternRegistry): Promise<void> {
  if (isEmptyPatterns(patterns)) return;
  await updatePatternRegistry(file, (state) => addUnusableRows(addPatternEntries(state, patterns.patterns), patterns.__rows)).catch(
    () => undefined,
  );
}

/** "Restored 12 · skipped 3 already here · 1 unreadable" — the sentence the screen shows. */
export function restoreSummary(report: RestoreReport, unreadable: number, graphs?: GraphRestoreReport): string {
  const parts: string[] = [];
  const restored = report.restored.length + report.copied.length;
  if (restored > 0) {
    parts.push(
      report.copied.length > 0
        ? `Restored ${restored} (${report.copied.length} as ${report.copied.length === 1 ? 'a copy' : 'copies'})`
        : `Restored ${restored}`,
    );
  }
  if (report.skipped.length > 0) parts.push(`skipped ${report.skipped.length} already here`);
  if (unreadable > 0) parts.push(`${unreadable} unreadable`);
  if (report.failed.length > 0) parts.push(`${report.failed.length} could not be saved`);
  if (graphs) {
    const back = graphs.restored + graphs.copied;
    if (back > 0) parts.push(`${back} ${back === 1 ? 'graph' : 'graphs'} restored`);
    if (graphs.skipped > 0) parts.push(`${graphs.skipped} ${graphs.skipped === 1 ? 'graph' : 'graphs'} already here`);
    if (graphs.failed > 0) parts.push(`${graphs.failed} ${graphs.failed === 1 ? 'graph' : 'graphs'} could not be saved`);
  }
  if (parts.length === 0) return 'That backup has no worksheets in it.';
  const sentence = parts.join(' · ');
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}
