import { migrate, serializeWorksheet } from '@/model/migrations';
import { documentName } from '@/model/text';
import type { Worksheet } from '@/model/types';

/**
 * Storage (§6). Deliberately an interface so a server-backed store can slot in
 * later without touching the editor. v1 ships two implementations: browser
 * localStorage (for autosave and reopening) and file download/upload (for
 * portability), per the PRD's recommendation to make one reliable and portable.
 */

export interface WorksheetSummary {
  id: string;
  title: string;
  updatedAt: string;
  /**
   * How much is in the document, for the file list.
   *
   * Stored in the index rather than derived on demand: the list shows every saved
   * document at once, and deriving these would mean parsing and migrating every
   * worksheet in storage on every visit to the start screen — the one screen that has
   * to be instant, since it is what the app opens on.
   *
   * Optional because an index written by an earlier build has neither, and a file list
   * that refuses to show those documents would look like the work had been lost.
   */
  questionCount?: number;
  hasCover?: boolean;
}

export interface WorksheetStore {
  list(): Promise<WorksheetSummary[]>;
  load(id: string): Promise<Worksheet | undefined>;
  save(worksheet: Worksheet): Promise<void>;
  /** Give a saved document a new name, without opening it. Never touches its title. */
  rename(id: string, name: string): Promise<void>;
  remove(id: string): Promise<void>;
  /**
   * Forget every saved document.
   *
   * Distinct from `remove` per id because the editor reopens the most recently saved
   * worksheet on load, so "start completely fresh" is a statement about the *store*,
   * not about one document — deleting them one at a time would need the caller to
   * enumerate what it is trying to forget.
   */
  clear(): Promise<void>;
}

const PREFIX = 'econ-worksheet:';
const INDEX_KEY = 'econ-worksheet-index';

/** Round-trip through the migration chain so a load always yields a current doc. */
export function parseWorksheet(json: string): Worksheet {
  return migrate(JSON.parse(json));
}

export function stringifyWorksheet(worksheet: Worksheet): string {
  return JSON.stringify(serializeWorksheet(worksheet), null, 2);
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

export class LocalStorageWorksheetStore implements WorksheetStore {
  private get storage(): Storage | undefined {
    if (typeof window === 'undefined') return undefined;
    try {
      return window.localStorage;
    } catch {
      // Private-mode Safari throws on access rather than returning null.
      return undefined;
    }
  }

  /**
   * Every document this build can name, newest first.
   *
   * **One damaged entry may not cost the whole list.** The index is the only route to a
   * saved worksheet (§ the start screen), so an empty list reads as "all your work is
   * gone" — and it used to be one keystroke away: entries were cast unvalidated and
   * sorted on `updatedAt`, so a single row missing that field threw inside the sort,
   * hit the catch, and returned `[]` while every document sat intact in storage.
   *
   * So each entry is judged on its own. A row is shown when it carries the two fields
   * the list cannot work without — an `id` to open and a `title` to print; anything
   * else it holds is passed through untouched (a newer build's fields survive an older
   * build's read, as `__unknown` does for documents). An undated row sorts last rather
   * than being dropped: a document with a missing timestamp is still a document.
   */
  async list(): Promise<WorksheetSummary[]> {
    const storage = this.storage;
    if (!storage) return [];
    const raw = storage.getItem(INDEX_KEY);
    if (!raw) return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // The index itself is unreadable — nothing here can be salvaged per entry.
      return [];
    }
    if (!Array.isArray(parsed)) return [];

    const usable = parsed.filter(
      (entry): entry is WorksheetSummary =>
        !!entry &&
        typeof entry === 'object' &&
        typeof (entry as WorksheetSummary).id === 'string' &&
        typeof (entry as WorksheetSummary).title === 'string',
    );

    return usable.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  }

  async load(id: string): Promise<Worksheet | undefined> {
    const storage = this.storage;
    if (!storage) return undefined;
    const raw = storage.getItem(PREFIX + id);
    if (!raw) return undefined;
    return parseWorksheet(raw);
  }

  async save(worksheet: Worksheet): Promise<void> {
    const storage = this.storage;
    if (!storage) return;
    storage.setItem(PREFIX + worksheet.id, stringifyWorksheet(worksheet));

    const summaries = await this.list();
    const next = [
      summarize(worksheet),
      ...summaries.filter((entry) => entry.id !== worksheet.id),
    ];
    storage.setItem(INDEX_KEY, JSON.stringify(next));
  }

  /**
   * Rename a saved document.
   *
   * A rename writes `worksheet.name` — what the document is *called* — and deliberately
   * leaves `worksheet.title`, the heading printed on page 1, alone. Renaming a file is a
   * filing decision; stamping the new name across the top of the paper is not part of
   * what it asks for, and that is precisely what happened while a rename wrote `title`.
   *
   * It stays a field on the document rather than a label in the index: the index is
   * *derived* from the document (§`summarize`), so writing only the entry would be
   * undone by the next autosave. Hence load-and-re-save rather than patching in place.
   */
  async rename(id: string, name: string): Promise<void> {
    const worksheet = await this.load(id);
    if (!worksheet) return;
    await this.save({
      ...worksheet,
      name,
      updatedAt: new Date().toISOString(),
    });
  }

  async remove(id: string): Promise<void> {
    const storage = this.storage;
    if (!storage) return;
    storage.removeItem(PREFIX + id);
    const summaries = await this.list();
    storage.setItem(INDEX_KEY, JSON.stringify(summaries.filter((entry) => entry.id !== id)));
  }

  async clear(): Promise<void> {
    const storage = this.storage;
    if (!storage) return;
    // Only this app's own keys. `localStorage` is shared with everything else served
    // from the same origin, so clearing it wholesale — or reaching for the browser's
    // "clear site data" — destroys more than this app has any business touching.
    const mine = Object.keys(storage).filter(
      (key) => key === INDEX_KEY || key.startsWith(PREFIX),
    );
    for (const key of mine) storage.removeItem(key);
  }
}

/** Download the worksheet as a .json file (portable across machines). */
export function downloadWorksheetFile(worksheet: Worksheet): void {
  const fileName = `${worksheetTitle(worksheet).replace(/[\\/:*?"<>|]/g, '-')}.worksheet.json`;
  const blob = new Blob([stringifyWorksheet(worksheet)], { type: 'application/json' });
  triggerDownload(blob, fileName);
}

export function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke on the next tick; revoking synchronously cancels the download in Safari.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readWorksheetFile(file: File): Promise<Worksheet> {
  const text = await file.text();
  return parseWorksheet(text);
}

export const worksheetStore = new LocalStorageWorksheetStore();
