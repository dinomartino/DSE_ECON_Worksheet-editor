import type { AppFormat } from '@/export/csv/answerKeyCsv';
import type { LanguageMode, OutputMode, VersionMode, Worksheet } from '@/model/types';
import { renderAnswerKey } from '@/render/answerKey';
import { isWritingRoom } from '@/render/ir';
import { renderWorksheet } from '@/render/worksheet';

/**
 * What the Export dialog writes, and how the files reach disk. Pure, so the delivery
 * rule — one browser download per click — is tested without a DOM.
 */

/** The file the dialog writes: Word, a print of the sheets, or the worksheet document. */
export type ExportFormat = 'docx' | 'pdf' | 'json';

/**
 * The one paper version a PDF prints: the version chosen, or — on "All", which a single
 * print cannot be — the one the editor shows (`undefined` there is the first). No
 * versions, no letter.
 */
export function pdfVariant(
  letters: string[],
  choice: string,
  shown: string | undefined,
): string | undefined {
  if (letters.length === 0) return undefined;
  if (letters.includes(choice)) return choice;
  return shown && letters.includes(shown) ? shown : letters[0];
}

/** `apps`: one file for another app — a bubble-sheet key or a quiz set (`AppFormat`). */
export type ExportWhat = 'paper' | 'answerKey' | 'both' | 'apps';

export interface ExportChoice {
  what: ExportWhat;
  language: LanguageMode;
  /** The question paper's version; the answer key has none. */
  version: VersionMode;
  /** Question paper only; absent = included. */
  includeCover?: boolean;
  includeAnswerSpace?: boolean;
  /** Which app's file, when `what` is `apps`. */
  app?: AppFormat;
  /** Paper version letters, one file each; absent = the one paper. */
  variants?: string[];
  /**
   * Other saved documents whose answer keys follow this one's in the same file, in
   * this order. Export-time only, never stored on the document.
   */
  alsoInclude?: KeyDocumentPick[];
}

/** A saved document picked for a combined answer key, named as the file list names it. */
export interface KeyDocumentPick {
  id: string;
  title: string;
}

/**
 * Load the documents picked for a combined key, in order, read-only. One that is gone,
 * will not parse or will not render is skipped and named — never fatal, never resaved.
 * Loading goes through the store, so an old schema is migrated in memory first.
 */
export async function loadKeyDocuments(
  picks: KeyDocumentPick[],
  load: (id: string) => Promise<Worksheet | undefined>,
  language: LanguageMode,
): Promise<{ worksheets: Worksheet[]; skipped: KeyDocumentPick[] }> {
  const worksheets: Worksheet[] = [];
  const skipped: KeyDocumentPick[] = [];
  for (const pick of picks) {
    try {
      const worksheet = await load(pick.id);
      if (!worksheet) throw new Error('missing');
      renderAnswerKey(worksheet, language);
      worksheets.push(worksheet);
    } catch {
      skipped.push(pick);
    }
  }
  return { worksheets, skipped };
}

/** The dialog's sentence for documents left out of a combined key; empty when none. */
export function skippedNote(skipped: KeyDocumentPick[]): string {
  if (skipped.length === 0) return '';
  const names = skipped.map((pick) => `“${pick.title}”`).join(', ');
  return skipped.length === 1
    ? `${names} could not be opened and was left out`
    : `${names} could not be opened and were left out`;
}

/** Move one entry of an ordered pick list up (-1) or down (+1); out of range is a no-op. */
export function movePick<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** The question paper's output mode. An omit flag is set only when on, so the default is unchanged. */
export function paperMode(choice: ExportChoice): OutputMode {
  return {
    language: choice.language,
    version: choice.version,
    ...(choice.includeCover === false ? { omitCover: true } : {}),
    ...(choice.includeAnswerSpace === false ? { omitAnswerSpace: true } : {}),
  };
}

/** What this document has for the "Include" toggles to leave out, read off its IR. */
export function omittableParts(
  worksheet: Worksheet,
  mode: OutputMode,
): { cover: boolean; answerSpace: boolean } {
  const rendered = renderWorksheet(worksheet, mode);
  return {
    cover: rendered.cover !== undefined,
    answerSpace: rendered.items.some((item) =>
      (item.type === 'question' ? item.question.nodes : item.layout.nodes).some(isWritingRoom),
    ),
  };
}

export type ExportKind = 'paper' | 'answerKey' | 'apps';

export interface ExportFile {
  kind: ExportKind;
  name: string;
  blob: Blob;
  /** The paper version letter, when the document has versions. */
  variant?: string;
  /** What a combined key had to leave out (`skippedNote`), said in the dialog after the save. */
  note?: string;
  /** How many documents that was, for the status line, which has one short line. */
  leftOut?: number;
}

/** The documents a choice produces, in delivery order. */
export function exportKinds(what: ExportWhat): ExportKind[] {
  if (what === 'both') return ['paper', 'answerKey'];
  return [what];
}

/** How many files a choice writes: one paper per version, one answer key. */
export function exportFileCount(choice: Pick<ExportChoice, 'what' | 'variants'>): number {
  return exportKinds(choice.what).reduce(
    (sum, kind) => sum + (kind === 'paper' ? Math.max(1, choice.variants?.length ?? 1) : 1),
    0,
  );
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

/**
 * Save the worksheet document itself (`.json`). What the status line should say, or
 * `undefined` when a desktop save sheet was cancelled — nothing written, dialog stays.
 */
export async function deliverWorksheetJson(options: {
  desktop: boolean;
  save: () => Promise<string | undefined>;
}): Promise<{ message: string; path?: string } | undefined> {
  const path = await options.save();
  if (path === undefined && options.desktop) return undefined;
  return { message: 'Exported .json', path };
}

/**
 * Where a PDF goes. Desktop: the file the save sheet chose — `undefined` when it was
 * cancelled, so the dialog stays as it does for `.json`. Web: no file (`{}`); the print
 * dialog decides.
 */
export async function pdfDestination(options: {
  desktop: boolean;
  choose: () => Promise<string | undefined>;
}): Promise<{ file?: string } | undefined> {
  if (!options.desktop) return {};
  const file = await options.choose();
  return file === undefined ? undefined : { file };
}
