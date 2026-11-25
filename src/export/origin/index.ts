import pkg from '../../../package.json';
import { isOriginId } from '@/model/origin';
import { plain } from '@/model/text';
import type { LanguageMode, Worksheet } from '@/model/types';

/**
 * Where an exported file came from (k-0558, user u-kioy): the app, its version, when the
 * file was made and the document's random id, written only into the file's own metadata —
 * `.docx` document properties (`docxProps.ts`), the PDF Info dictionary and XMP
 * (`pdf.ts`), `.xlsx` document properties. Never on the page, never in the page's text.
 *
 * Anonymous by construction: nothing here comes from the teacher, their account, licence,
 * machine or file paths. `scripts/origin.mjs <file>` prints it back.
 */
export interface ExportOrigin {
  /** The product name, as the desktop app is called. */
  app: string;
  /** The app's version, e.g. `0.10.0`. */
  version: string;
  /** When the file was made, ISO 8601 UTC to the second (`2026-11-25T09:30:00Z`). */
  exportedAt: string;
  /** The document's origin id (`Worksheet.originId`); absent when the document has none. */
  docId?: string;
}

export const APP_NAME = 'Econ Studio';

/** The names the custom properties carry in every format, so one reader finds them all. */
export const ORIGIN_KEYS = {
  app: 'DSEconApp',
  version: 'DSEconVersion',
  exportedAt: 'DSEconExported',
  docId: 'DSEconDocId',
} as const;

/** `2026-11-25T09:30:00Z`: the form `docProps/core.xml` already used. */
export function originTimestamp(now: Date = new Date()): string {
  return now.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** The origin of a file made now from `worksheet` (the first, for a file of several). */
export function exportOrigin(worksheet: Pick<Worksheet, 'originId'> | undefined, now: Date | string = new Date()): ExportOrigin {
  return {
    app: APP_NAME,
    version: pkg.version,
    exportedAt: typeof now === 'string' ? now : originTimestamp(now),
    ...(worksheet && isOriginId(worksheet.originId) ? { docId: worksheet.originId } : {}),
  };
}

/**
 * What a PDF of `worksheet` carries (`platform.savePdf`): its origin, and its printed title
 * in the print's language (the other side's when that one is empty), as the `.docx`
 * properties have it.
 */
export function pdfStamp(
  worksheet: Pick<Worksheet, 'originId' | 'title'>,
  language: LanguageMode,
): { origin: ExportOrigin; title?: string } {
  const title =
    plain(language === 'zh' ? worksheet.title.zh : worksheet.title.en) ||
    plain(worksheet.title.en) ||
    plain(worksheet.title.zh);
  return { origin: exportOrigin(worksheet), ...(title ? { title } : {}) };
}
