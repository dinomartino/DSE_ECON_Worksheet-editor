import { newId } from '@/model/factories';
import {
  duplicateGraph,
  isGraphNewerThanBuild,
  parseGraph,
  stringifyGraph,
  type SavedGraph,
} from '@/model/graph';

/**
 * Saved graphs (Graphs 圖表庫, § `model/graph.ts`): one record per graph, so one bad
 * record costs one graph. Web: `localStorage` `econ-graph:<id>`, deliberately outside
 * `econ-worksheet:` (every key there is a document to the web store and to `clear()`).
 * Desktop: `worksheets/graphs/<id>.graph.json` (`storage/fileStore.ts:graphDirFiles`),
 * a subdirectory no build's rebuild-by-scan reads.
 */

export const GRAPH_PREFIX = 'econ-graph:';
export const GRAPHS_DIR = 'worksheets/graphs';
export const GRAPH_SUFFIX = '.graph.json';

/** Text access to wherever graph records live. */
export interface GraphFiles {
  /** Every stored record's id; unreadable storage lists none. */
  ids(): Promise<string[]>;
  read(id: string): Promise<string | undefined>;
  write(id: string, text: string): Promise<void>;
  remove(id: string): Promise<void>;
  /** Every graph record, and nothing else. */
  clear(): Promise<void>;
}

/** Refused: overwriting a graph a newer build saved. */
export class NewerGraphError extends Error {
  constructor() {
    super('This graph was saved by a newer version of Econ Studio. Update to change it.');
    this.name = 'NewerGraphError';
  }
}

/** The web's records: one `localStorage` key per graph. Blocked storage lists none; writes throw. */
export function localGraphFiles(storage: () => Storage | undefined): GraphFiles {
  const need = () => {
    const store = storage();
    if (!store) throw new Error('storage is not available');
    return store;
  };
  const keys = (): string[] => {
    try {
      const store = storage();
      return store ? Object.keys(store).filter((key) => key.startsWith(GRAPH_PREFIX)) : [];
    } catch {
      return [];
    }
  };
  return {
    async ids() {
      return keys().map((key) => key.slice(GRAPH_PREFIX.length));
    },
    async read(id) {
      try {
        return storage()?.getItem(GRAPH_PREFIX + id) ?? undefined;
      } catch {
        return undefined;
      }
    },
    async write(id, text) {
      need().setItem(GRAPH_PREFIX + id, text);
    },
    async remove(id) {
      need().removeItem(GRAPH_PREFIX + id);
    },
    async clear() {
      const store = storage();
      if (!store) return;
      for (const key of keys()) store.removeItem(key);
    },
  };
}

/** The browser's `localStorage`, or nothing (SSR, private-mode Safari). */
export function browserStorage(): Storage | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export interface GraphListing {
  /** Newest first. */
  graphs: SavedGraph[];
  /** Records that would not read as a graph; left where they are. */
  unreadable: number;
}

/** The graphs' store: the same rules on either medium. */
export class GraphStore {
  constructor(private readonly files: GraphFiles) {}

  /** Every readable graph, newest first. One bad record never empties the list. */
  async list(): Promise<GraphListing> {
    const graphs: SavedGraph[] = [];
    let unreadable = 0;
    let ids: string[];
    try {
      ids = await this.files.ids();
    } catch {
      return { graphs, unreadable };
    }
    for (const id of ids) {
      const graph = await this.load(id);
      if (graph) graphs.push(graph);
      else unreadable += 1;
    }
    graphs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return { graphs, unreadable };
  }

  /** `undefined` when absent or unreadable. The record's own id wins over a renamed key. */
  async load(id: string): Promise<SavedGraph | undefined> {
    try {
      const text = await this.files.read(id);
      if (!text) return undefined;
      const graph = parseGraph(text);
      return graph.id === id ? graph : { ...graph, id };
    } catch {
      return undefined;
    }
  }

  /** Is anything stored under this id, readable or not? */
  async has(id: string): Promise<boolean> {
    return (await this.files.read(id).catch(() => undefined)) !== undefined;
  }

  /** Throws `NewerGraphError`, writing nothing, over a newer build's graph. */
  async save(graph: SavedGraph): Promise<void> {
    if (isGraphNewerThanBuild(graph) && (await this.has(graph.id))) {
      throw new NewerGraphError();
    }
    await this.files.write(graph.id, stringifyGraph(graph));
  }

  async rename(id: string, name: string, now = new Date().toISOString()): Promise<SavedGraph | undefined> {
    const graph = await this.load(id);
    const trimmed = name.trim();
    if (!graph || !trimmed) return graph;
    const renamed = { ...graph, name: trimmed, updatedAt: now };
    await this.save(renamed);
    return renamed;
  }

  /** A copy beside the original, saved; a newer graph's copy is written as it is (nothing is overwritten). */
  async duplicate(id: string, makeId: () => string = newId): Promise<SavedGraph | undefined> {
    const graph = await this.load(id);
    if (!graph) return undefined;
    const copy = duplicateGraph(graph, makeId());
    await this.files.write(copy.id, stringifyGraph(copy));
    return copy;
  }

  async remove(id: string): Promise<void> {
    await this.files.remove(id);
  }

  async clear(): Promise<void> {
    await this.files.clear();
  }
}

export interface GraphRestoreReport {
  restored: number;
  /** Restored beside a different graph of the same id, under a new one. */
  copied: number;
  /** Already here, identical. */
  skipped: number;
  failed: number;
}

/**
 * A backup's graphs into `store`, never overwriting: an identical one is skipped, a
 * clashing id becomes a copy under a fresh id. Each save is caught alone.
 */
export async function restoreGraphs(
  store: GraphStore,
  graphs: SavedGraph[],
  makeId: () => string = newId,
): Promise<GraphRestoreReport> {
  const report: GraphRestoreReport = { restored: 0, copied: 0, skipped: 0, failed: 0 };
  for (const graph of graphs) {
    // An unreadable record under the id is still something not to overwrite.
    const taken = await store.has(graph.id);
    const existing = taken ? await store.load(graph.id) : undefined;
    if (existing && stringifyGraph(existing) === stringifyGraph(graph)) {
      report.skipped += 1;
      continue;
    }
    const toSave = taken ? { ...graph, id: makeId() } : graph;
    try {
      await store.save(toSave);
      if (taken) report.copied += 1;
      else report.restored += 1;
    } catch {
      report.failed += 1;
    }
  }
  return report;
}
