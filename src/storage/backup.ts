import JSZip from 'jszip';
import pkg from '../../package.json';
import { newId } from '@/model/factories';
import { CURRENT_SCHEMA_VERSION } from '@/model/migrations';
import type { Worksheet } from '@/model/types';
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

/**
 * "Back up all" and "Restore from backup": every saved document in one `.zip`.
 *
 * Each entry is exactly what "Download .json" writes, so a backup can also be unzipped
 * and opened a file at a time. Trash is left out: a backup is what the teacher keeps,
 * and restoring it would bring deleted work back as live documents.
 *
 * Folders ride **inside `manifest.json`**, never as an entry of their own: every shipped
 * build's `readBackup` parses each `.json` entry except the manifest as a worksheet, so
 * a `folders.json` entry would restore there as an unreadable (or blank) document.
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
}

export class BackupError extends Error {}

const UNSAFE = /[\\/:*?"<>|\u0000-\u001f]/g;

function safeName(text: string): string {
  return text.replace(UNSAFE, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Untitled';
}

/** `<title> (<id>).worksheet.json` — readable, and unique because the id is. */
export function backupEntryName(worksheet: Worksheet): string {
  return `${safeName(worksheetTitle(worksheet))} (${safeName(worksheet.id)}).worksheet.json`;
}

export function backupFileName(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `Worksheets backup ${day}.zip`;
}

export async function buildBackup(
  worksheets: Worksheet[],
  createdAt = new Date().toISOString(),
  folders?: FolderState,
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
  zip.file(MANIFEST_NAME, JSON.stringify(manifest, null, 2));
  for (const worksheet of worksheets) {
    zip.file(backupEntryName(worksheet), stringifyWorksheet(worksheet));
  }
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
  try {
    const manifest = await zip.file(MANIFEST_NAME)?.async('string');
    if (manifest) folders = usableFolders(JSON.parse(manifest).folders);
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
      const worksheet = parseWorksheet(await entry.async('string'));
      summarize(worksheet); // a JSON object that is not a worksheet fails here
      worksheets.push({
        name: entry.name,
        worksheet: typeof worksheet.id === 'string' && worksheet.id ? worksheet : { ...worksheet, id: newId() },
      });
    } catch (cause) {
      failures.push({
        name: entry.name,
        reason: cause instanceof SyntaxError ? 'not valid JSON' : 'not a worksheet',
      });
    }
  }
  return { worksheets, failures, folders };
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

/** "Restored 12 · skipped 3 already here · 1 unreadable" — the sentence the screen shows. */
export function restoreSummary(report: RestoreReport, unreadable: number): string {
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
  if (parts.length === 0) return 'That backup has no worksheets in it.';
  const sentence = parts.join(' · ');
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}
