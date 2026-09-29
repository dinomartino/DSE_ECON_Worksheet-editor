/**
 * The desktop path of the bank index: `worksheets/library/index.json` through
 * `libraryIndexFile`, beside a `FileWorksheetStore`, over an in-memory fake of
 * `@tauri-apps/plugin-fs` (the same shape `src/storage/fileStore.test.ts` fakes).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const files = new Map<string, string>();
const dirs = new Set<string>();

vi.mock('@/platform', async (original) => ({
  ...(await original<typeof import('@/platform')>()),
  isDesktop: () => true,
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: { AppData: 13 },
  exists: async (path: string) =>
    files.has(path) || dirs.has(path) || [...files.keys()].some((key) => key.startsWith(`${path}/`)),
  mkdir: async (path: string) => void dirs.add(path),
  readTextFile: async (path: string) => {
    const value = files.get(path);
    if (value === undefined) throw new Error(`ENOENT ${path}`);
    return value;
  },
  writeTextFile: async (path: string, contents: string) => void files.set(path, contents),
  remove: async (path: string) => {
    if (!files.delete(path)) throw new Error(`ENOENT ${path}`);
  },
  readDir: async (path: string) => {
    const names = new Map<string, boolean>();
    for (const key of [...files.keys(), ...dirs]) {
      if (!key.startsWith(`${path}/`)) continue;
      const rest = key.slice(path.length + 1);
      const [head] = rest.split('/');
      names.set(head, rest.includes('/') || dirs.has(`${path}/${head}`));
    }
    return [...names].map(([name, isDirectory]) => ({ name, isFile: !isDirectory, isDirectory }));
  },
}));

const { FileWorksheetStore, LIBRARY_INDEX, libraryIndexFile } = await import('@/storage/fileStore');
const { withChangeFeed } = await import('@/storage/changes');
const { createJsonFileBackend } = await import('./bankBackend');
const { createBankIndex } = await import('./bankIndex');
const { localFeed } = await import('./bankTestKit');
const { choiceQuestion, docWith } = await import('./testKit');

const noPause = () => Promise.resolve();

function desktop() {
  const feed = localFeed();
  const files = new FileWorksheetStore();
  const store = withChangeFeed(files, feed.emit);
  const index = createBankIndex(files, noPause, {
    backend: createJsonFileBackend(libraryIndexFile),
    changes: feed.subscribe,
  });
  return { store, index };
}

const stored = () => JSON.parse(files.get(LIBRARY_INDEX)!) as { docs: Record<string, { rows: unknown[] }> };

beforeEach(() => {
  files.clear();
  dirs.clear();
});

describe('bank index on desktop', () => {
  it('writes worksheets/library/index.json, and a new session reads it back', async () => {
    const { store, index } = desktop();
    const doc = docWith([choiceQuestion('On disk')]);
    await store.save(doc);
    await index.refresh();
    await index.settled();
    expect(LIBRARY_INDEX).toBe('worksheets/library/index.json');
    expect(stored().docs[doc.id].rows).toHaveLength(1);

    const next = desktop();
    next.index.subscribe(() => undefined);
    await next.index.settled();
    expect(next.index.getSnapshot().rows.map((r) => r.excerpt.en)).toEqual(['On disk']);
  });

  it('is never listed or cleared as a document by the file store', async () => {
    const { store, index } = desktop();
    await store.save(docWith([choiceQuestion('Stem')]));
    await index.refresh();
    await index.settled();
    files.delete('worksheets/index.json'); // force the store's rebuild-by-scan
    expect(await new FileWorksheetStore().list()).toHaveLength(1);
  });

  it('follows a trash (the file moves to worksheets/trash/) and a restore', async () => {
    const { store, index } = desktop();
    const doc = docWith([choiceQuestion('Moves')]);
    await store.save(doc);
    await index.refresh();
    await store.trash(doc.id);
    await index.settled();
    expect(index.getSnapshot().rows).toEqual([]);
    expect(stored().docs[doc.id]).toBeUndefined();
    await store.restore(doc.id);
    await index.settled();
    expect(index.getSnapshot().rows).toHaveLength(1);
  });

  it('rebuilds when the file is corrupt, and removes the file on clear', async () => {
    files.set(LIBRARY_INDEX, 'not json');
    const { store, index } = desktop();
    await store.save(docWith([choiceQuestion('Rebuilt')]));
    await index.refresh();
    await index.settled();
    expect(index.getSnapshot().rows.map((r) => r.excerpt.en)).toEqual(['Rebuilt']);
    expect(Object.keys(stored().docs)).toHaveLength(1);

    await store.clear();
    await index.settled();
    expect(files.has(LIBRARY_INDEX)).toBe(false);
  });
});
