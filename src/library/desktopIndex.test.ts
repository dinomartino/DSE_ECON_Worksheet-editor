/**
 * The desktop path of the bank index: a file per document in `worksheets/library/docs/`
 * through `libraryDocFiles` (and the old single file migrated), beside a `FileWorksheetStore`, over an in-memory fake of
 * `@tauri-apps/plugin-fs` (the same shape `src/storage/fileStore.test.ts` fakes).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const files = new Map<string, string>();
const dirs = new Set<string>();
const written: string[] = [];
const readPaths: string[] = [];

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
    readPaths.push(path);
    const value = files.get(path);
    if (value === undefined) throw new Error(`ENOENT ${path}`);
    return value;
  },
  writeTextFile: async (path: string, contents: string) => {
    written.push(path);
    files.set(path, contents);
  },
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

const { FileWorksheetStore, LIBRARY_DOCS_DIR, LIBRARY_INDEX, LIBRARY_PACK, libraryDocFiles, libraryIndexFile, libraryJournalFile, libraryPackFile } =
  await import('@/storage/fileStore');
const { withChangeFeed } = await import('@/storage/changes');
const { createDocFilesBackend, STORED_INDEX_FORMAT } = await import('./bankBackend');
const { createBankIndex } = await import('./bankIndex');
const { localFeed } = await import('./bankTestKit');
const { choiceQuestion, docWith } = await import('./testKit');

const noPause = () => Promise.resolve();

function desktop() {
  const feed = localFeed();
  const files = new FileWorksheetStore();
  const store = withChangeFeed(files, feed.emit);
  const index = createBankIndex(files, noPause, {
    backend: createDocFilesBackend(libraryDocFiles, libraryIndexFile, { pack: libraryPackFile, journal: libraryJournalFile }),
    changes: feed.subscribe,
  });
  return { store, index };
}

const docFile = (id: string) => `${LIBRARY_DOCS_DIR}/${id}.json`;
const stored = (id: string) => {
  const text = files.get(docFile(id));
  return text === undefined ? undefined : (JSON.parse(text) as { rows: unknown[] });
};

beforeEach(() => {
  files.clear();
  dirs.clear();
  written.length = 0;
  readPaths.length = 0;
});

describe('bank index on desktop', () => {
  it('writes worksheets/library/docs/<id>.json, and a new session reads it back', async () => {
    const { store, index } = desktop();
    const doc = docWith([choiceQuestion('On disk')]);
    await store.save(doc);
    await index.refresh();
    await index.settled();
    expect(LIBRARY_DOCS_DIR).toBe('worksheets/library/docs');
    expect(stored(doc.id)?.rows).toHaveLength(1);

    const next = desktop();
    next.index.subscribe(() => undefined);
    await next.index.settled();
    expect(next.index.getSnapshot().rows.map((r) => r.excerpt.en)).toEqual(['On disk']);
  });

  it('a new session reads the pack and the files changed since, not one file per document', async () => {
    const { store, index } = desktop();
    const docs = Array.from({ length: 12 }, (_, i) => docWith([choiceQuestion(`Paper ${i}`)]));
    for (const doc of docs) await store.save(doc);
    await index.refresh();
    await index.settled();

    // Second session: no pack yet worth trusting, so it reads every file and writes one.
    const second = desktop();
    second.index.subscribe(() => undefined);
    await second.index.settled();
    await second.index.refresh();
    await second.index.settled();
    expect(files.has(LIBRARY_PACK)).toBe(true);
    await second.store.save({ ...docs[3], name: 'Edited' });
    await second.index.settled();

    readPaths.length = 0;
    const third = desktop();
    third.index.subscribe(() => undefined);
    await third.index.settled();
    const libraryReads = readPaths.filter((path) => path.startsWith('worksheets/library/'));
    expect(libraryReads.sort()).toEqual([LIBRARY_PACK, 'worksheets/library/journal.json', docFile(docs[3].id)].sort());
    expect(third.index.getSnapshot().rows).toHaveLength(12);
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
    expect(stored(doc.id)).toBeUndefined();
    await store.restore(doc.id);
    await index.settled();
    expect(index.getSnapshot().rows).toHaveLength(1);
  });

  it("an autosave rewrites only its own document's file", async () => {
    const { store, index } = desktop();
    const a = docWith([choiceQuestion('A')]);
    const b = docWith([choiceQuestion('B')]);
    await store.save(a);
    await store.save(b);
    await index.refresh();
    await index.settled();
    written.length = 0;
    await store.save({ ...b, name: 'Renamed' });
    await index.settled();
    expect(written.filter((path) => path.startsWith('worksheets/library/'))).toEqual([docFile(b.id)]);
  });

  it('migrates the single-file index an earlier build wrote, then removes it', async () => {
    const { store, index: first } = desktop();
    const doc = docWith([choiceQuestion('Migrated')]);
    await store.save(doc);
    await first.refresh();
    await first.settled();
    // What the single-file build left: the same rows, in one file, and no per-document files.
    const rows = stored(doc.id)!.rows;
    files.delete(docFile(doc.id));
    files.set(LIBRARY_INDEX, JSON.stringify({ format: STORED_INDEX_FORMAT, docs: { [doc.id]: { updatedAt: doc.updatedAt, rows } } }));

    const next = desktop();
    next.index.subscribe(() => undefined);
    await next.index.settled();
    expect(next.index.getSnapshot().rows.map((r) => r.excerpt.en)).toEqual(['Migrated']);
    expect(stored(doc.id)?.rows).toHaveLength(1);
    expect(files.has(LIBRARY_INDEX)).toBe(false);
  });

  it('rebuilds a corrupt file, and removes every file on clear', async () => {
    const { store, index } = desktop();
    const doc = docWith([choiceQuestion('Rebuilt')]);
    await store.save(doc);
    files.set(docFile(doc.id), 'not json');
    files.set(LIBRARY_INDEX, 'not json');
    await index.refresh();
    await index.settled();
    expect(index.getSnapshot().rows.map((r) => r.excerpt.en)).toEqual(['Rebuilt']);
    expect(stored(doc.id)?.rows).toHaveLength(1);

    await store.clear();
    await index.settled();
    expect([...files.keys()].filter((key) => key.startsWith('worksheets/library/'))).toEqual([]);
  });
});
