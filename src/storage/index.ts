import { migrate, serializeWorksheet } from '@/model/migrations';
import { plain } from '@/model/text';
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
}

export interface WorksheetStore {
  list(): Promise<WorksheetSummary[]>;
  load(id: string): Promise<Worksheet | undefined>;
  save(worksheet: Worksheet): Promise<void>;
  remove(id: string): Promise<void>;
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

  async list(): Promise<WorksheetSummary[]> {
    const storage = this.storage;
    if (!storage) return [];
    const raw = storage.getItem(INDEX_KEY);
    if (!raw) return [];
    try {
      const entries = JSON.parse(raw) as WorksheetSummary[];
      return entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    } catch {
      return [];
    }
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
    const summary: WorksheetSummary = {
      id: worksheet.id,
      title: plain(worksheet.title.en) || plain(worksheet.title.zh) || 'Untitled',
      updatedAt: worksheet.updatedAt,
    };
    const next = [summary, ...summaries.filter((entry) => entry.id !== worksheet.id)];
    storage.setItem(INDEX_KEY, JSON.stringify(next));
  }

  async remove(id: string): Promise<void> {
    const storage = this.storage;
    if (!storage) return;
    storage.removeItem(PREFIX + id);
    const summaries = await this.list();
    storage.setItem(INDEX_KEY, JSON.stringify(summaries.filter((entry) => entry.id !== id)));
  }
}

/** Download the worksheet as a .json file (portable across machines). */
export function downloadWorksheetFile(worksheet: Worksheet): void {
  const title = plain(worksheet.title.en) || plain(worksheet.title.zh) || 'worksheet';
  const fileName = `${title.replace(/[\\/:*?"<>|]/g, '-')}.worksheet.json`;
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
