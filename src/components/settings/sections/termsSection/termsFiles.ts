import type { TermPreferences } from '@/glossary/types';
import { CSV_FILTERS, pickFile, saveFile, type SavedTo } from '@/platform';
import { decodeTermsCsv, termsToCsv } from '@/settings/termsCsv';

/**
 * Translation terms' file I/O: Export through the save sheet (desktop) or Save As /
 * download (web); Import read as bytes, so a CSV that Excel saved in Big5 still reads.
 */

export const TERMS_FILE_NAME = 'translation-terms.csv';

export interface PickedCsv {
  name: string;
  text: string;
}

/** `undefined` when the teacher cancelled, so nothing was written. */
export const exportTermsCsv = (prefs: TermPreferences): Promise<SavedTo | undefined> =>
  saveFile(termsToCsv(prefs), TERMS_FILE_NAME, CSV_FILTERS);

/** Desktop's open sheet; `undefined` when cancelled (and always on the web). */
export async function pickTermsCsv(): Promise<PickedCsv | undefined> {
  const picked = await pickFile(CSV_FILTERS);
  return picked && { name: picked.name, text: decodeTermsCsv(picked.bytes) };
}

/** The web's `<input type="file">` pick. */
export async function readTermsFile(file: File): Promise<PickedCsv> {
  return { name: file.name, text: decodeTermsCsv(new Uint8Array(await file.arrayBuffer())) };
}
