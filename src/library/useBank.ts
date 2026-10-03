'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { isDesktop } from '@/platform';
import { libraryDocFiles, libraryIndexFile, onStoreChange, worksheetStore } from '@/storage';
import { createDocFilesBackend, createMemoryBackend, type BankIndexBackend } from './bankBackend';
import { browserWake, createBankIndex, idle, INITIAL_SNAPSHOT, QUIET_MS, type BankIndex, type BankSnapshot } from './bankIndex';
import { createIdbBackend } from './idbBackend';
import type { BankRow } from './types';

/**
 * The one read both bank surfaces use. Backed by the persistent index (§ bankIndex.ts):
 * stored rows first, then a reconcile against the store, then the store's change feed.
 * No provider needed.
 */

export { createBankIndex, type BankIndex, type BankSnapshot } from './bankIndex';

export interface UseBank extends BankSnapshot {
  /** Reconcile with the store now; the current rows stay while it runs. */
  refresh(): void;
}

/** Desktop: a file per document in `worksheets/library/docs/`. Web: IndexedDB, else memory only. */
function defaultBackend(): BankIndexBackend {
  if (isDesktop()) return createDocFilesBackend(libraryDocFiles, libraryIndexFile);
  return createIdbBackend() ?? createMemoryBackend();
}

let shared: BankIndex | undefined;
/** `holdBankDocument`'s value, for an index made after it was set. */
let heldDoc: string | undefined;
function sharedIndex(): BankIndex {
  if (shared) return shared;
  shared = createBankIndex(worksheetStore, idle, {
    backend: defaultBackend(),
    changes: onStoreChange,
    wake: browserWake,
    quietMs: QUIET_MS,
  });
  shared.hold(heldDoc);
  return shared;
}

const subscribe = (listener: () => void) => sharedIndex().subscribe(listener);
const getSnapshot = () => sharedIndex().getSnapshot();
const getServerSnapshot = () => INITIAL_SNAPSHOT;

/** Every indexed row and group of the saved documents, plus scan status and `refresh()`. */
export function useBank(): UseBank {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const refresh = useCallback(() => void sharedIndex().refresh(), []);
  return { ...snapshot, refresh };
}

/**
 * The published rows outside React (the editor's Topic row). An index nothing has read
 * yet, or one still scanning, is reconciled first so a copy is not missed for that.
 */
export async function bankRowsNow(): Promise<readonly BankRow[]> {
  const index = sharedIndex();
  if (index.getSnapshot().status.state !== 'ready') await index.refresh();
  await index.flush();
  return index.getSnapshot().rows;
}

/**
 * The paper open in the editor (`undefined` when it closes): its autosaves are indexed
 * late, since the editor never shows that paper's own rows (S8, `BankIndex.hold`).
 */
export function holdBankDocument(docId: string | undefined): void {
  heldDoc = docId;
  // No index made just for this: one made later starts holding it.
  shared?.hold(docId);
}
