/**
 * Files dropped on the start screen — the decision's pure half.
 *
 * Two sources feed it: the browser's HTML5 `drop` (`File`s) and, on desktop, Tauri's
 * native `DragDrop` event (paths — the webview delivers no HTML5 file drops there). Both
 * go through `planDrop`, so a drop means the same thing on either platform.
 */

import { resolveMessages } from '@/i18n/catalogue';
import { uiLanguage } from '@/i18n/language';
import type { FileDragEvent } from '@/platform';
import type { UiLanguage } from '@/settings/language';
import { START_SCREEN_MESSAGES } from './screen.messages';

/** `paper`: a Word or PDF file, or a picture of a paper, to import questions from (a `.doc` too, to say how). */
export type DropKind = 'worksheet' | 'backup' | 'paper';

const PAPER_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'image/png',
  'image/jpeg',
  'image/heic',
  'image/heif',
]);

/** Pictures of a paper: read by text recognition in the desktop app. */
export const PICTURE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'heic', 'heif'];

/** What the Import from Word or PDF chooser offers (scans and photos of a paper too). */
export const PAPER_ACCEPT =
  '.docx,.pdf,.doc,.png,.jpg,.jpeg,.heic,.heif,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,image/png,image/jpeg,image/heic,image/heif';

/** What a dropped file is, by name (and MIME type, when the browser gives one). */
export function droppedKind(name: string, type = ''): DropKind | undefined {
  const lower = name.toLowerCase();
  if (lower.endsWith('.zip') || type === 'application/zip' || type === 'application/x-zip-compressed') {
    return 'backup';
  }
  if (lower.endsWith('.json') || type === 'application/json') return 'worksheet';
  if (/\.(docx?|pdf|png|jpe?g|heic|heif)$/.test(lower) || PAPER_TYPES.has(type)) return 'paper';
  return undefined;
}

/** The last segment of a native path, on either separator. */
export function fileNameOf(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

/**
 * One file opens (a worksheet) or restores (a backup); Word and PDF files and pictures of
 * papers, one or several, are imported from (papers and their answers). Several worksheets and backups are
 * imported into the library, none opened; a paper among them is left out. Nothing usable
 * is rejected.
 */
export type DropPlan<T> =
  | { kind: 'open'; file: T }
  | { kind: 'restore'; file: T }
  | { kind: 'papers'; files: T[] }
  | { kind: 'import'; worksheets: T[]; backups: T[]; ignored: number }
  | { kind: 'reject' };

export function planDrop<T>(
  files: readonly T[],
  kindOf: (file: T) => DropKind | undefined,
): DropPlan<T> {
  const worksheets: T[] = [];
  const backups: T[] = [];
  if (files.length > 0 && files.every((file) => kindOf(file) === 'paper')) return { kind: 'papers', files: [...files] };
  for (const file of files) {
    const kind = kindOf(file);
    if (kind === 'worksheet') worksheets.push(file);
    else if (kind === 'backup') backups.push(file);
  }
  const usable = worksheets.length + backups.length;
  if (usable === 0) return { kind: 'reject' };
  if (files.length === 1 && worksheets[0]) return { kind: 'open', file: worksheets[0] };
  if (files.length === 1 && backups[0]) return { kind: 'restore', file: backups[0] };
  return { kind: 'import', worksheets, backups, ignored: files.length - usable };
}

/** The overlay's line while hovering, and briefly after a drop nothing could use. */
export const DROP_HINT = START_SCREEN_MESSAGES.dropHint.en;
export const DROP_REJECTED = START_SCREEN_MESSAGES.dropRejected.en;

/** How long the rejection stays up after the drop. */
export const DROP_REJECTED_MS = 2200;

export interface ImportCounts {
  /** Saved under their own id. */
  imported: number;
  /** Saved as a copy — the id was taken, or in the Trash. Restore never overwrites. */
  copied: number;
  /** Already here, byte for byte. */
  skipped: number;
  /** Not a worksheet, or a backup that would not open. */
  unreadable: number;
  /** Read, but the store refused the save. */
  failed: number;
  /** Neither .json nor .zip. */
  ignored: number;
}

/** "Imported 3 worksheets · skipped 1 already here" — the status line after a multi-drop. */
export function importSummary(counts: ImportCounts, lang: UiLanguage = uiLanguage()): string {
  const m = resolveMessages(START_SCREEN_MESSAGES, lang);
  const saved = counts.imported + counts.copied;
  const parts: string[] = [];
  if (saved > 0) parts.push(m.importImported(saved, counts.copied));
  if (counts.skipped > 0) parts.push(m.importSkipped(counts.skipped));
  if (counts.unreadable > 0) parts.push(m.importUnreadable(counts.unreadable));
  if (counts.failed > 0) parts.push(m.importFailed(counts.failed));
  if (counts.ignored > 0) parts.push(m.importIgnored(counts.ignored));
  if (parts.length === 0) return m.importNothing;
  const sentence = parts.join(' · ');
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/** What the overlay shows: nothing, the hint, or the rejection. */
export type DropOverlay = 'hint' | 'rejected' | undefined;

/**
 * The overlay a native drag event leaves up. `enter` carries the paths, so an unusable
 * drag says so before it lands; `over` keeps what `enter` decided.
 */
export function overlayFor(event: FileDragEvent, current: DropOverlay): DropOverlay {
  switch (event.type) {
    case 'enter':
      return planDrop(event.paths, (path) => droppedKind(fileNameOf(path))).kind === 'reject'
        ? 'rejected'
        : 'hint';
    case 'over':
      return current ?? 'hint';
    case 'leave':
    case 'drop':
      return undefined;
  }
}
