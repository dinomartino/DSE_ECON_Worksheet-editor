import type { ImportSource } from './run';

/**
 * The files papers were imported from in this session, by paper id (k-0494): what ✦ AI →
 * Check import compares an open paper with, without asking for the file again. Memory
 * only — a file is never stored with the paper, and a reload forgets it (the check then
 * asks for the file).
 */
const sources = new Map<string, ImportSource>();
const LIMIT = 12;

export function rememberImport(worksheetId: string, source: ImportSource): void {
  sources.delete(worksheetId);
  sources.set(worksheetId, source);
  // The oldest go first: each holds its file's pictures.
  while (sources.size > LIMIT) sources.delete(sources.keys().next().value!);
}

export const importSourceFor = (worksheetId: string): ImportSource | undefined => sources.get(worksheetId);

/** Test seam. */
export function forgetImportsForTest(): void {
  sources.clear();
}
