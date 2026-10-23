/**
 * The anonymised copy as the report dialog handles it: made once, previewed, saved.
 *
 * `makeAnonymisedCopy` serialises the copy once; the preview renders the document parsed
 * back from that very text, and `saveAnonymisedCopy` writes that same text. So the file
 * saved is byte for byte the one the teacher looked at: there is no second scramble.
 */
import { JSON_FILTERS, saveFile, type SavedTo } from '@/platform';
import { parseWorksheet, stringifyWorksheet } from '@/storage/document';
import type { Worksheet } from '@/model/types';
import { anonymiseWorksheet, type AnonymiseOptions } from './anonymise';

/** GitHub takes a `.json` attachment up to 25 MB (docs.github.com, Attaching files). */
export const GITHUB_FILE_LIMIT = 25 * 1024 * 1024;

export interface AnonymisedCopy {
  /** The file's text, exactly as it will be saved. */
  text: string;
  /** What the preview shows: `text`, parsed back as any opened file is. */
  worksheet: Worksheet;
  /** `report-2026-10-23.worksheet.json`. */
  fileName: string;
  /** The file's size in bytes (UTF-8). */
  bytes: number;
}

export function makeAnonymisedCopy(worksheet: Worksheet, options: AnonymiseOptions = {}): AnonymisedCopy {
  const copy = anonymiseWorksheet(worksheet, options);
  const text = stringifyWorksheet(copy);
  return {
    text,
    worksheet: parseWorksheet(text),
    fileName: `${copy.name}.worksheet.json`,
    bytes: new TextEncoder().encode(text).length,
  };
}

type Save = (data: string, suggestedName: string, filters: typeof JSON_FILTERS) => Promise<SavedTo | undefined>;

/** Write the previewed text, untouched. `undefined` when the teacher cancelled the save sheet. */
export function saveAnonymisedCopy(copy: AnonymisedCopy, save: Save = saveFile): Promise<SavedTo | undefined> {
  return save(copy.text, copy.fileName, JSON_FILTERS);
}
