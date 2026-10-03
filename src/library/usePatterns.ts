'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { onStoreChange, patternStorage } from '@/storage';
import {
  addPatternEntries,
  EMPTY_PATTERNS,
  PATTERNS_KEY,
  readPatternRegistry,
  removePatternEntry,
  renamePatternEntry,
  updatePatternRegistry,
  type PatternEntry,
  type PatternFile,
  type PatternRegistry,
} from '@/storage/patterns';
import { patternNames, type PatternId } from './patterns';
import type { BankRow } from './types';

/**
 * The 題型 registry in memory (§ src/storage/patterns.ts): read when its first reader
 * mounts, re-read when another tab writes it or the store is cleared. Every change reads
 * what is stored first, then writes, one at a time. Blocked storage keeps the change for
 * the visit.
 */
export interface PatternStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): PatternRegistry;
  reload(): Promise<void>;
  update(recipe: (state: PatternRegistry) => PatternRegistry): Promise<PatternRegistry>;
}

export function createPatternStore(
  file: PatternFile,
  watch: (reload: () => void) => () => void = () => () => undefined,
): PatternStore {
  let state: PatternRegistry = EMPTY_PATTERNS;
  const listeners = new Set<() => void>();
  let unwatch: (() => void) | undefined;
  let queue: Promise<unknown> = Promise.resolve();
  const set = (next: PatternRegistry) => {
    if (next === state) return;
    state = next;
    for (const listener of [...listeners]) listener();
  };
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const next = queue.then(task, task);
    queue = next.catch(() => undefined);
    return next;
  };
  const reload = () =>
    serial(async () => {
      const read = await readPatternRegistry(file);
      // Unchanged content keeps its identity, so readers do not re-render for nothing.
      if (JSON.stringify(read) !== JSON.stringify(state)) set(read);
    });
  return {
    subscribe(listener) {
      if (listeners.size === 0) {
        void reload();
        unwatch = watch(() => void reload());
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          unwatch?.();
          unwatch = undefined;
        }
      };
    },
    getSnapshot: () => state,
    reload,
    update: (recipe) =>
      serial(async () => {
        try {
          const next = await updatePatternRegistry(file, recipe);
          set(next);
          return next;
        } catch {
          // Storage refused the write (blocked, or a newer registry: `isReadOnlyRegistry`): keep the change for this visit.
          const next = recipe(state);
          set(next);
          return next;
        }
      }),
  };
}

function browserWatch(reload: () => void): () => void {
  const offStore = onStoreChange((change) => {
    if (change.kind === 'cleared') reload();
  });
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return offStore;
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === PATTERNS_KEY) reload();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    offStore();
    window.removeEventListener('storage', onStorage);
  };
}

let shared: PatternStore | undefined;
const sharedStore = () => (shared ??= createPatternStore(patternStorage, browserWatch));

const subscribe = (listener: () => void) => sharedStore().subscribe(listener);
const getSnapshot = () => sharedStore().getSnapshot();
const getServerSnapshot = () => EMPTY_PATTERNS;

/** The registry, live. */
export function usePatternRegistry(): PatternRegistry {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Stored in a newer `format`: read, never written (§ src/storage/patterns.ts). Changes made
 * here last only for the visit, so the screens that make them say so.
 */
export const isReadOnlyRegistry = (registry: PatternRegistry): boolean => registry.__newer !== undefined;

/** The names offered for one sub-topic and question type: the registry and the bank's rows. */
export function usePatternNames(rows: readonly BankRow[], topic: string, typeId: string): string[] {
  const registry = usePatternRegistry();
  return useMemo(() => patternNames(rows, registry, topic, typeId), [rows, registry, topic, typeId]);
}

/** Re-read after something wrote the registry behind this store (a restored backup). */
export function reloadPatterns(): void {
  void sharedStore().reload();
}

/** Define 題型 (new names only; an existing one is left as it is). */
export function registerPatterns(entries: readonly PatternId[]): Promise<PatternRegistry> {
  if (entries.length === 0) return Promise.resolve(sharedStore().getSnapshot());
  return sharedStore().update((state) => addPatternEntries(state, entries as PatternEntry[]));
}

/** Rename in the registry, or (onto an existing name) merge. Questions are written elsewhere. */
export function renameRegisteredPattern(from: PatternId, to: string): Promise<PatternRegistry> {
  return sharedStore().update((state) => renamePatternEntry(state, from, to));
}

export function unregisterPattern(pattern: PatternId): Promise<PatternRegistry> {
  return sharedStore().update((state) => removePatternEntry(state, pattern));
}
