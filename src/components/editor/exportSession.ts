import type { AppFormat } from '@/export/csv/answerKeyCsv';
import type { LanguageMode, OutputMode, VersionMode, Worksheet } from '@/model/types';
import { renderAnswerKey } from '@/render/answerKey';
import { isWritingRoom } from '@/render/ir';
import { renderWorksheet } from '@/render/worksheet';
import { resolveMessages } from '@/i18n/catalogue';
import { uiLanguage } from '@/i18n/language';
import type { UiLanguage } from '@/settings/language';
import { EXPORT_MESSAGES } from './ExportDialog.messages';

/**
 * What the Export dialog writes, and how the files reach disk. Pure, so the delivery
 * rules (ask where before building, one folder for several files, one plain download
 * per click) are tested without a DOM.
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
export function skippedNote(skipped: KeyDocumentPick[], lang: UiLanguage = uiLanguage()): string {
  if (skipped.length === 0) return '';
  const m = resolveMessages(EXPORT_MESSAGES, lang);
  const names = skipped.map((pick) => m.quoted(pick.title)).join(m.listSeparator);
  return skipped.length === 1 ? m.skippedOne(names) : m.skippedMany(names);
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

/** A file named but not yet built: where it goes is asked first, inside the click. */
export type PlannedFile = Omit<ExportFile, 'blob'> & { build: () => Promise<Blob> };

/** An already built file, planned again (the next click of the download dance). */
export const planned = (file: ExportFile): PlannedFile => ({ ...file, build: async () => file.blob });

/** Where a delivered file or folder went: a path on desktop, a picked name on the web. */
export interface SavedPlace {
  path?: string;
  name?: string;
}

export interface ExportRun {
  /** Delivered files, with where each went. */
  saved: Array<{ file: ExportFile } & SavedPlace>;
  /** Built but not delivered: a plain download waits for its own click. */
  pending: ExportFile[];
  /** A picker was cancelled: nothing was written. */
  cancelled: boolean;
  /** The folder several files went to, when one was picked. */
  folder?: SavedPlace;
}

/** Where files can go (from `src/platform`), injected so the rules test without a DOM. */
export interface ExportSaver {
  /** Several files may go to one folder, asked for once. */
  folders: boolean;
  /** Ask where one file goes; `undefined` = cancelled. */
  chooseFile: (
    file: PlannedFile,
  ) => Promise<{ write: (blob: Blob) => Promise<SavedPlace> } | undefined>;
  chooseFolder: () => Promise<
    | (SavedPlace & { write: (name: string, blob: Blob) => Promise<SavedPlace> })
    | 'cancelled'
    | 'unavailable'
  >;
}

/**
 * Deliver files, asking where before anything is built: a browser picker needs the
 * click's activation, which the `.docx` build can outlast. Several files: one folder,
 * then every file into it. Otherwise the first file only; the rest wait in `pending`,
 * built, since a browser blocks a second download started by the same click.
 */
export async function deliverFiles(files: PlannedFile[], saver: ExportSaver): Promise<ExportRun> {
  const run: ExportRun = { saved: [], pending: [], cancelled: false };
  if (files.length === 0) return run;
  if (files.length > 1 && saver.folders) {
    const folder = await saver.chooseFolder();
    if (folder === 'cancelled') return { ...run, cancelled: true };
    if (folder !== 'unavailable') {
      for (const plan of files) {
        const file = await built(plan);
        run.saved.push({ file, ...(await folder.write(file.name, file.blob)) });
      }
      run.folder = { path: folder.path, name: folder.name };
      return run;
    }
  }
  const target = await saver.chooseFile(files[0]);
  if (!target) return { ...run, cancelled: true };
  const all: ExportFile[] = [];
  for (const plan of files) all.push(await built(plan));
  const [first, ...rest] = all;
  run.saved.push({ file: first, ...(await target.write(first.blob)) });
  run.pending = rest;
  return run;
}

async function built({ build, ...file }: PlannedFile): Promise<ExportFile> {
  return { ...file, blob: await build() };
}

/**
 * The status line, naming where the file went when a browser picker told us. A desktop
 * path is left to the reveal button beside the line.
 */
export function withPlace(
  message: string,
  saved: SavedPlace[],
  folder?: SavedPlace,
  lang: UiLanguage = uiLanguage(),
): string {
  const m = resolveMessages(EXPORT_MESSAGES, lang);
  if (saved.some((place) => place.path !== undefined)) return message;
  if (folder?.name) return m.toFolder(message, folder.name);
  if (saved.length === 1 && saved[0].name) return m.exportedNamed(saved[0].name);
  return message;
}

/**
 * Save the worksheet document itself (`.json`). What the status line should say, or
 * `undefined` when a picker was cancelled: nothing written, the dialog stays.
 */
export async function deliverWorksheetJson(options: {
  save: () => Promise<SavedPlace | undefined>;
}): Promise<({ message: string } & SavedPlace) | undefined> {
  const saved = await options.save();
  if (!saved) return undefined;
  return { message: resolveMessages(EXPORT_MESSAGES, uiLanguage()).exportedJson, ...saved };
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
