/**
 * Paste-to-structure (D1), the public entry. Pure: no DOM, no store.
 *
 *   const read = readPaste({ plain, html });         // once per paste
 *   const analysis = analyseLines(read, { pins });   // again on every pin (fast)
 *   const batch = buildImport(analysis);             // → store.insertQuestionBatch(batch.builds, { worksheetId, lead: batch.lead })
 */
import { toSourceLines } from './lines';
import { readHtml } from './readHtml';
import { readPlain } from './readPlain';
import { pasteKind } from './scan';
import { solve } from './solve';
import type { AnalyseOptions, Analysis, PasteInput, SourceLine } from './types';

export { buildImport, previewFigure, type ImportBatch } from './build';
export type * from './types';

export interface ReadPaste {
  lines: SourceLine[];
  source: 'plain' | 'html';
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

/** Solve a read paste. Re-run with each new pin; the read is reused. */
export function analyseLines(read: ReadPaste, options: AnalyseOptions = {}): Analysis {
  const kind = pasteKind(read.lines, read.source);
  const solved = solve(read.lines, { ...options, source: read.source });
  return { kind, source: read.source, lines: read.lines, ...solved };
}

export function analysePaste(input: PasteInput, options: AnalyseOptions = {}): Analysis {
  return analyseLines(readPaste(input), options);
}
