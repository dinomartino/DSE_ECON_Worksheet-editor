'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { worksheetStore, type WorksheetStore } from '@/storage';
import { groupRows } from './group';
import { rowsOf } from './indexer';
import type { BankGroup, BankRow, BankStatus } from './types';

/**
 * The one read both bank surfaces use. **Naive on purpose (WP-0):** every scan lists the
 * store and loads each document, in memory, a few per idle slot. WP-B replaces the internals
 * (persistent index + change feed) without changing `useBank`'s API. No provider needed.
 */

export interface BankSnapshot {
  status: BankStatus;
  rows: BankRow[];
  groups: BankGroup[];
}

export interface UseBank extends BankSnapshot {
  /** Rescan the store; the current rows stay until the new scan completes. */
  refresh(): void;
}

export interface BankIndex {
  getSnapshot(): BankSnapshot;
  subscribe(listener: () => void): () => void;
  /** Rescan; resolves when this scan finishes or a newer one supersedes it. */
  refresh(): Promise<void>;
}

type BankSource = Pick<WorksheetStore, 'list' | 'load'>;

const INITIAL: BankSnapshot = { status: { state: 'scanning', done: 0, total: 0 }, rows: [], groups: [] };
const DOCS_PER_SLOT = 4;

/** Wait for the browser to be idle (or a macrotask where there is no idle callback). */
function idle(): Promise<void> {
  return new Promise((resolve) => {
    const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void })
      .requestIdleCallback;
    if (ric) ric(() => resolve(), { timeout: 200 });
    else setTimeout(resolve, 0);
  });
}

/** An in-memory index over any store; scans on first subscribe. Exported for tests. */
export function createBankIndex(source: BankSource, pause: () => Promise<void> = idle): BankIndex {
  let snapshot = INITIAL;
  let generation = 0;
  let started = false;
  const listeners = new Set<() => void>();

  const publish = (next: Partial<BankSnapshot>) => {
    snapshot = { ...snapshot, ...next };
    for (const listener of listeners) listener();
  };

  async function scan(): Promise<void> {
    const mine = ++generation;
    started = true;
    try {
      const summaries = await source.list();
      if (mine !== generation) return;
      publish({ status: { state: 'scanning', done: 0, total: summaries.length } });
      const rows: BankRow[] = [];
      for (let i = 0; i < summaries.length; i++) {
        if (i % DOCS_PER_SLOT === 0) await pause();
        if (mine !== generation) return;
        const summary = summaries[i];
        try {
          const worksheet = await source.load(summary.id);
          if (worksheet) rows.push(...rowsOf(worksheet, summary));
        } catch {
          // A document that will not open is skipped here; the start screen reports it.
        }
        if (mine !== generation) return;
        if ((i + 1) % DOCS_PER_SLOT === 0) {
          publish({ status: { state: 'scanning', done: i + 1, total: summaries.length } });
        }
      }
      publish({
        status: { state: 'ready', done: summaries.length, total: summaries.length },
        rows,
        groups: groupRows(rows),
      });
    } catch (error) {
      if (mine !== generation) return;
      publish({ status: { state: 'error', done: 0, total: 0, error: String(error) } });
    }
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      if (!started) void scan();
      return () => listeners.delete(listener);
    },
    refresh: scan,
  };
}

let shared: BankIndex | undefined;
const sharedIndex = () => (shared ??= createBankIndex(worksheetStore));

const subscribe = (listener: () => void) => sharedIndex().subscribe(listener);
const getSnapshot = () => sharedIndex().getSnapshot();
const getServerSnapshot = () => INITIAL;

/** Every indexed row and group of the saved documents, plus scan status and `refresh()`. */
export function useBank(): UseBank {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const refresh = useCallback(() => void sharedIndex().refresh(), []);
  return { ...snapshot, refresh };
}
