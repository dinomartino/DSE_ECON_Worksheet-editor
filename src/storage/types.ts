import type { Worksheet } from '@/model/types';

/**
 * Storage (§6). Deliberately an interface so a server-backed store can slot in
 * later without touching the editor. Two implementations ship: browser localStorage
 * and, on desktop, files under the app data directory.
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
