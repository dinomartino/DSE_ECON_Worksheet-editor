import type { LanguageMode, VersionMode } from '@/model/types';

/**
 * What the Export dialog writes, and how the files reach disk. Pure, so the delivery
 * rule — one browser download per click — is tested without a DOM.
 */

export type ExportWhat = 'paper' | 'answerKey' | 'both';

export interface ExportChoice {
  what: ExportWhat;
  language: LanguageMode;
  /** The question paper's version; the answer key has none. */
  version: VersionMode;
}

export type ExportKind = 'paper' | 'answerKey';

export interface ExportFile {
  kind: ExportKind;
  name: string;
  blob: Blob;
}

/** The documents a choice produces, in delivery order. */
export function exportKinds(what: ExportWhat): ExportKind[] {
  if (what === 'both') return ['paper', 'answerKey'];
  return [what];
}

export interface ExportRun {
  /** Delivered files, with the path a desktop save sheet returned. */
  saved: Array<{ file: ExportFile; path?: string }>;
  /** Built but not delivered: on the web each further download waits for its own click. */
  pending: ExportFile[];
  /** A desktop save sheet was cancelled; nothing after it was offered. */
  cancelled: boolean;
}

/**
 * Deliver built files. Desktop: one save sheet each, in order, stopping at a cancel.
 * Web: only the first — a browser blocks (or prompts for) a second download started by
 * the same gesture, so the rest wait in `pending` for the next click.
 */
export async function deliverFiles(
  files: ExportFile[],
  options: { desktop: boolean; save: (file: ExportFile) => Promise<string | undefined> },
): Promise<ExportRun> {
  const run: ExportRun = { saved: [], pending: [], cancelled: false };
  const now = options.desktop ? files : files.slice(0, 1);
  for (const file of now) {
    const path = await options.save(file);
    if (options.desktop && path === undefined) {
      run.cancelled = true;
      return run;
    }
    run.saved.push({ file, path });
  }
  run.pending = files.slice(now.length);
  return run;
}
