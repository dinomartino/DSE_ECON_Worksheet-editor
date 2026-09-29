'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { isDesktop } from '@/platform';
import { libraryIndexFile, onStoreChange, worksheetStore } from '@/storage';
import { createJsonFileBackend, createMemoryBackend, type BankIndexBackend } from './bankBackend';
import { browserWake, createBankIndex, idle, INITIAL_SNAPSHOT, type BankIndex, type BankSnapshot } from './bankIndex';
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

/** Desktop: `worksheets/library/index.json`. Web: IndexedDB, else memory only. */
function defaultBackend(): BankIndexBackend {
  if (isDesktop()) return createJsonFileBackend(libraryIndexFile);
  return createIdbBackend() ?? createMemoryBackend();
}

let shared: BankIndex | undefined;
const sharedIndex = () =>
  (shared ??= createBankIndex(worksheetStore, idle, {
    backend: defaultBackend(),
    changes: onStoreChange,
    wake: browserWake,
  }));

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
  return index.getSnapshot().rows;
}
