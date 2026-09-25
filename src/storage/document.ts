import { CURRENT_SCHEMA_VERSION, migrate, serializeWorksheet } from '@/model/migrations';
import { documentName } from '@/model/text';
import type { Worksheet } from '@/model/types';
import type { WorksheetSummary } from './types';

/** Reading, writing and naming a document — the parts no store implementation owns. */

/** Round-trip through the migration chain so a load always yields a current doc. */
export function parseWorksheet(json: string): Worksheet {
  return migrate(JSON.parse(json));
}

export function stringifyWorksheet(worksheet: Worksheet): string {
  return JSON.stringify(serializeWorksheet(worksheet), null, 2);
}

/**
 * Refused: overwriting a document a newer build saved (§ `isNewerThanBuild`).
 *
 * Both stores throw it from `save()` when the incoming worksheet is newer than this
 * build and something is already stored under its id. A newer document may still be
 * written where nothing is — an import, a duplicate — because that destroys nothing.
 */
export class NewerDocumentError extends Error {
  constructor() {
    super('This worksheet was saved by a newer version of Econ Worksheet. Update to change it.');
    this.name = 'NewerDocumentError';
  }
}

/**
 * What to call this document when something other than the page has to name it.
 *
 * The chain itself is `documentName` (`model/text.ts`), shared with the `.docx`
 * filename — the file list and the download must agree, or renaming a document appears
 * not to have taken effect. This adds only the list's own fallback word.
 */
export function worksheetTitle(worksheet: Worksheet): string {
  return documentName(worksheet) ?? 'Untitled';
}

/** The index entry for a document — the shape the file list reads. */
export function summarize(worksheet: Worksheet): WorksheetSummary {
  return {
    id: worksheet.id,
    title: worksheetTitle(worksheet),
    updatedAt: worksheet.updatedAt,
    questionCount: worksheet.questions.length,
    hasCover: Boolean(worksheet.cover),
  };
}

/**
 * A copy of a document, saved beside the original.
 *
 * Only the **document** id changes. Every id *inside* it addresses something within
 * this one document — questions, blocks, flow entries, band fields — so they stay
 * unique after the copy and re-iding them would be work with no observable effect.
 * (This is the opposite of duplicating a question *inside* a document, where the clone
 * lands in the same id space as its original and must be re-idded.)
 *
 * `createdAt` is reset because the copy is new; `updatedAt` is what the list sorts on,
 * so a fresh one puts the copy where the teacher is looking for it.
 */
export function duplicateWorksheet(worksheet: Worksheet, id: string): Worksheet {
  const now = new Date().toISOString();
  return {
    ...worksheet,
    id,
    title: {
      en: worksheet.title.en.length > 0 ? appendCopy(worksheet.title.en) : worksheet.title.en,
      zh: worksheet.title.zh,
    },
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * An editable copy of a document a newer build saved: a duplicate under a new id,
 * downgraded to this build's schema.
 *
 * The top-level fields this build does not know (`__unknown`) are left out of the copy:
 * spliced back into a document labelled with the older version, a newer build would
 * migrate them a second time. The original, and everything in it, is never touched.
 */
export function editableCopy(worksheet: Worksheet, id: string): Worksheet {
  const copy: Worksheet = {
    ...duplicateWorksheet(worksheet, id),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    // Named apart in the file list, which shows `name` before the printed title.
    ...(worksheet.name ? { name: `${worksheet.name} (copy)` } : {}),
  };
  delete copy.__unknown;
  return copy;
}

/**
 * Mark a title as a copy, on the last run so it inherits that run's formatting.
 *
 * Appending a bare run would leave " (copy)" unformatted beside a bolded title, which
 * prints as a visibly different suffix on the page rather than as part of the name.
 */
function appendCopy(runs: Worksheet['title']['en']): Worksheet['title']['en'] {
  const last = runs.at(-1);
  if (!last) return runs;
  return [...runs.slice(0, -1), { ...last, text: `${last.text} (copy)` }];
}
