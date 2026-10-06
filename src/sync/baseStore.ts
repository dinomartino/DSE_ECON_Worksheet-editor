import type { BaseEntry, BaseStore } from './types';

/** The base in memory: tests, and the shape real persistence must keep. */
export function memoryBaseStore(initial: BaseEntry[] = []): BaseStore & { entries: Map<string, BaseEntry> } {
  const entries = new Map(initial.map((entry) => [entry.id, { ...entry }]));
  return {
    entries,
    async load() {
      return new Map([...entries].map(([id, entry]) => [id, { ...entry }]));
    },
    async put(entry) {
      entries.set(entry.id, { ...entry });
    },
    async remove(id) {
      entries.delete(id);
    },
    async clear() {
      entries.clear();
    },
  };
}

/**
 * One stored base row → a `BaseEntry`, or `undefined` when any field is off. A row that
 * fails is treated as absent (that document is compared with no base), never repaired.
 * Unknown fields are dropped.
 */
export function baseEntryFrom(value: unknown): BaseEntry | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const { id, kind, place, hash, revision, schemaVersion } = value as Record<string, unknown>;
  if (typeof id !== 'string' || id === '') return undefined;
  if (kind !== 'worksheet' || (place !== 'live' && place !== 'trash')) return undefined;
  if (typeof hash !== 'string' || hash === '' || typeof revision !== 'string') return undefined;
  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion) || schemaVersion < 0) return undefined;
  return { id, kind, place, hash, revision, schemaVersion };
}
