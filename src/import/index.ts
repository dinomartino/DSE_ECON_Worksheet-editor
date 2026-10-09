/**
 * Paste-to-structure (D1), the public entry. Pure: no DOM, no store.
 *
 *   const read = readPaste({ plain, html });         // once per paste
 *   const read = await readDocx(bytes);              // or a .docx file
 *   const read = await readPdf(bytes);               // or a .pdf file: pdf.js loads on first use
 *   const analysis = analyseLines(read, { pins });   // again on every pin (fast)
 *   const batch = buildImport(analysis);             // → store.insertQuestionBatch(batch.builds, { worksheetId, lead: batch.lead })
 *
 * Answers from another file: `classifyImport` each file, `suggestPairs`, then per paper
 * `matchAnswers(analysis, readAnswerSheet(answerRead))` → pins into `analyseLines`.
 */
import { toSourceLines } from './lines';
import { readDocxLines, type DocxOptions } from './readDocx';
import { readHtml } from './readHtml';
import { readPlain } from './readPlain';
import { pasteKind } from './scan';
import { solve } from './solve';
import type { PageChrome } from './pageChrome';
import type { AnalyseOptions, Analysis, PasteInput, SourceLine } from './types';

export { buildImport, previewFigure, type ImportBatch } from './build';
export {
  readAnswerSheet,
  type AnswerEntry,
  type AnswerLineUse,
  type AnswerNote,
  type AnswerPoint,
  type AnswerSection,
  type AnswerSheet,
} from './answerSheet';
export { classifyImport, splitAnswers, suggestPairs, type ClassifyReason, type FileClass, type FileRole } from './answerFiles';
export { matchAnswers, type AnswerMatch, type AnswerMatchResult, type AnswerSource, type MatchDetail, type MatchStatus } from './matchAnswers';
export { DocxReadError, type DocxErrorKind, type DocxOptions } from './readDocx';
export { isPdfReadError, readPdf, type PdfRead, type PdfReadError, type ReadPdfOptions } from './readPdf';
export { pictureHome } from './figures';
export * from './pageChrome';
export type * from './types';

export interface ReadPaste {
  lines: SourceLine[];
  source: Analysis['source'];
}

const inked = (lines: readonly SourceLine[]) => lines.reduce((n, l) => n + l.raw.replace(/\s/g, '').length, 0);

/** Read the clipboard: HTML when it carries at least as much as the plain text, else plain. */
export function readPaste(input: PasteInput): ReadPaste {
  const plain = toSourceLines(readPlain(input.plain ?? ''));
  if (!input.html?.trim()) return { lines: plain, source: 'plain' };
  const html = toSourceLines(readHtml(input.html));
  const htmlInk = inked(html);
  const plainInk = inked(plain);
  if (htmlInk === 0 && plainInk === 0 && html.some((l) => l.image)) return { lines: html, source: 'html' };
  return htmlInk > 0 && htmlInk >= plainInk * 0.6 ? { lines: html, source: 'html' } : { lines: plain, source: 'plain' };
}

/**
 * Read a `.docx` file. `title` is the document's title, or its first heading. Rejects with
 * a `DocxReadError` (`unreadable` · `encrypted` · `notDocx`) when the file cannot be read.
 */
export async function readDocx(bytes: ArrayBuffer, options?: DocxOptions): Promise<ReadPaste & { title?: string; chrome?: PageChrome }> {
  const read = await readDocxLines(bytes, options);
  return { lines: toSourceLines(read.lines), source: 'docx', ...(read.title ? { title: read.title } : {}), ...(read.chrome ? { chrome: read.chrome } : {}) };
}

/** Solve a read paste. Re-run with each new pin; the read is reused. */
export function analyseLines(read: ReadPaste, options: AnalyseOptions = {}): Analysis {
  const kind = pasteKind(read.lines, read.source);
  const solved = solve(read.lines, { ...options, source: read.source });
  return { kind, source: read.source, lines: read.lines, ...solved };
}

export function analysePaste(input: PasteInput, options: AnalyseOptions = {}): Analysis {
  return analyseLines(readPaste(input), options);
}
