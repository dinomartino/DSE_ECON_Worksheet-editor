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
  };
}
