import { useSyncExternalStore } from 'react';
import type { LibraryLocation } from '@/platform/library';
import type { SyncStatus } from './scheduler';

/**
 * What the interface shows of sync: the folder, the scheduler's status, what needs the
 * teacher. Written only by the controller (`librarySync.ts`, loaded by `import()` on
 * desktop); this module is tiny and Tauri-free, so any screen may read it.
 */

export type AttentionKind = 'conflict' | 'unreadable' | 'unreadable-local' | 'newer-build' | 'error';

export interface AttentionItem {
  kind: AttentionKind;
  /** The document's (for a conflict: the copy's) id, when known. */
  id?: string;
  /** The document's name, or its file name when this computer has no copy. */
  name: string;
}

export interface SyncView {
  /** Undefined until the controller has read it (always, on the web). */
  location?: LibraryLocation;
  status: SyncStatus;
  /** An action under way: the folder picker is open, or this computer is stopping. */
  pending?: 'choose' | 'stop';
  /** Conflict copies made this session, then what the last run held or failed on. */
  attention: readonly AttentionItem[];
}

const INITIAL: SyncView = { status: { state: 'stopped' }, attention: [] };

let view: SyncView = INITIAL;
const listeners = new Set<() => void>();

export function syncView(): SyncView {
  return view;
}

export function setSyncView(patch: Partial<SyncView>): void {
  view = { ...view, ...patch };
  for (const listener of [...listeners]) listener();
}

export function subscribeSyncView(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function useSyncView(): SyncView {
  return useSyncExternalStore(subscribeSyncView, syncView, () => INITIAL);
}

/** A folder is chosen on this computer (reachable or not). Re-renders only when that changes. */
export function useSyncFolderChosen(): boolean {
  return useSyncExternalStore(subscribeSyncView, () => syncView().location?.root != null, () => false);
}

/** The controller has read that no folder is chosen on this computer (never on the web). */
export function useSyncNoFolder(): boolean {
  return useSyncExternalStore(subscribeSyncView, () => syncView().location?.status === 'none', () => false);
}

// Dev builds only (Next inlines NODE_ENV, so production drops it): screenshots of Settings →
// Storage location set a view (Needs attention) that needs no real folder or second computer.
if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  Object.assign(window, { __econSyncView: { set: setSyncView } });
}

/** Test seam. */
export function resetSyncViewForTest(): void {
  view = INITIAL;
}
