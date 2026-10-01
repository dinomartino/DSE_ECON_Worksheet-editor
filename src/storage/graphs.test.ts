/**
 * Saved graphs: one record per graph, the same rules on the web (`econ-graph:<id>`) and
 * on desktop (`worksheets/graphs/<id>.graph.json`). One suite runs against both. The
 * filesystem is faked in memory and the shell by the global it injects.
 */
import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorksheet } from '@/model/factories';
import { CURRENT_SCHEMA_VERSION } from '@/model/migrations';
import { createGraph, serializeGraph, stringifyGraph, type SavedGraph } from '@/model/graph';
import type { GraphFiles } from './graphs';

const files = new Map<string, string>();
const dirs = new Set<string>();

vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: { AppData: 13 },
  exists: async (path: string) => files.has(path) || dirs.has(path) || [...files.keys()].some((key) => key.startsWith(`${path}/`)),
  mkdir: async (path: string) => {
    dirs.add(path);
  },
  readTextFile: async (path: string) => {
    const value = files.get(path);
    if (value === undefined) throw new Error(`ENOENT ${path}`);
    return value;
  },
  writeTextFile: async (path: string, contents: string) => {
    if (!dirs.has(path.slice(0, path.lastIndexOf('/')))) throw new Error(`ENOENT dir of ${path}`);
    files.set(path, contents);
  },
  remove: async (path: string) => {
    if (!files.delete(path)) throw new Error(`ENOENT ${path}`);
  },
  readDir: async (path: string) =>
    [...new Set([...files.keys()].filter((key) => key.startsWith(`${path}/`)).map((key) => key.slice(path.length + 1).split('/')[0]))].map(
      (name) => ({ name, isFile: !dirs.has(`${path}/${name}`), isDirectory: dirs.has(`${path}/${name}`) }),
    ),
}));

/** `localStorage` with enumerable keys, as the real one has. */
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return new Proxy(
    {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, String(v)),
      removeItem: (k: string) => void map.delete(k),
    } as unknown as Storage,
    {
      ownKeys: () => [...map.keys()],
      getOwnPropertyDescriptor: (_t, p) =>
        map.has(String(p)) ? { configurable: true, enumerable: true, value: map.get(String(p)) } : undefined,
    },
  );
}

let web = memoryStorage();
vi.stubGlobal('window', {
  __TAURI_INTERNALS__: {},
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  get localStorage() {
    return web;
  },
});

const { FileWorksheetStore, graphDirFiles } = await import('./fileStore');
const { GRAPH_PREFIX, GraphStore, localGraphFiles, NewerGraphError, restoreGraphs } = await import('./graphs');
const { LocalStorageWorksheetStore } = await import('./index');
const { buildBackup, readBackup, restoreSummary } = await import('./backup');

beforeEach(() => {
  files.clear();
  dirs.clear();
  web = memoryStorage();
});

const graph = (id: string, updatedAt: string, name = `Graph ${id}`): SavedGraph => ({
  ...createGraph('supply-demand'),
  id,
  name,
  updatedAt,
});

const backends: Array<[string, () => GraphFiles, (id: string, text: string) => void]> = [
  ['web', () => localGraphFiles(() => web), (id, text) => web.setItem(`${GRAPH_PREFIX}${id}`, text)],
  [
    'desktop',
    () => graphDirFiles,
    (id, text) => {
      dirs.add('worksheets/graphs');
      files.set(`worksheets/graphs/${id}.graph.json`, text);
    },
  ],
];

describe.each(backends)('graphs on the %s', (_name, filesFor, plant) => {
  const store = () => new GraphStore(filesFor());

  it('saves, lists newest first, and loads back what was saved', async () => {
    const a = graph('a', '2026-01-01T00:00:00.000Z');
    await store().save(a);
    await store().save(graph('b', '2026-02-01T00:00:00.000Z'));
    const { graphs, unreadable } = await store().list();
    expect(graphs.map((g) => g.id)).toEqual(['b', 'a']);
    expect(unreadable).toBe(0);
    expect(stringifyGraph((await store().load('a'))!)).toBe(stringifyGraph(a));
  });

  it('one bad record costs only itself', async () => {
    await store().save(graph('a', '2026-01-01T00:00:00.000Z'));
    plant('broken', '{not json');
    plant('alien', JSON.stringify({ id: 'alien', block: { kind: 'paragraph' } }));
    const { graphs, unreadable } = await store().list();
    expect(graphs.map((g) => g.id)).toEqual(['a']);
    expect(unreadable).toBe(2);
  });

  it('renames, duplicates beside the original, and removes', async () => {
    await store().save(graph('a', '2026-01-01T00:00:00.000Z', 'Tariff'));
    await store().rename('a', '  Tariff on rice ', '2026-03-01T00:00:00.000Z');
    expect((await store().load('a'))?.name).toBe('Tariff on rice');
    const copy = await store().duplicate('a', () => 'a2');
    expect(copy?.name).toBe('Tariff on rice (copy)');
    expect((await store().list()).graphs.map((g) => g.id).sort()).toEqual(['a', 'a2']);
    await store().remove('a');
    expect((await store().list()).graphs.map((g) => g.id)).toEqual(['a2']);
  });

  it('never overwrites a newer build’s graph', async () => {
    const newer = { ...graph('n', '2026-01-01T00:00:00.000Z'), schemaVersion: CURRENT_SCHEMA_VERSION + 1 };
    plant('n', stringifyGraph(newer));
    const loaded = (await store().load('n'))!;
    expect(loaded.schemaVersion).toBe(CURRENT_SCHEMA_VERSION + 1);
    await expect(store().save({ ...loaded, name: 'changed' })).rejects.toBeInstanceOf(NewerGraphError);
    expect((await store().load('n'))?.name).toBe('Graph n');
  });

  it('restore never overwrites: identical skipped, a clash copied under a fresh id', async () => {
    const here = graph('a', '2026-01-01T00:00:00.000Z');
    await store().save(here);
    plant('junk', 'not a graph');
    const report = await restoreGraphs(
      store(),
      [here, { ...here, name: 'Other' }, graph('new', '2026-01-02T00:00:00.000Z'), graph('junk', '2026-01-03T00:00:00.000Z')],
      (() => {
        let n = 0;
        return () => `fresh-${++n}`;
      })(),
    );
    expect(report).toEqual({ restored: 1, copied: 2, skipped: 1, failed: 0 });
    expect((await store().load('a'))?.name).toBe('Graph a');
    expect((await store().load('fresh-1'))?.name).toBe('Other');
    expect(await store().load('new')).toBeDefined();
  });
});

describe('clearing saved documents', () => {
  it('takes graphs on the web, and no other key', async () => {
    web.setItem('someone-else', 'keep');
    await new GraphStore(localGraphFiles(() => web)).save(graph('a', '2026-01-01T00:00:00.000Z'));
    await new LocalStorageWorksheetStore().clear();
    expect(Object.keys(web)).toEqual(['someone-else']);
  });

  it('takes graphs on desktop, and nothing else in their folder', async () => {
    await new GraphStore(graphDirFiles).save(graph('a', '2026-01-01T00:00:00.000Z'));
    files.set('worksheets/graphs/notes.txt', 'mine');
    await new FileWorksheetStore().clear();
    expect([...files.keys()]).toEqual(['worksheets/graphs/notes.txt']);
  });
});

describe('graphs in a backup', () => {
  it('ride as graphs/*.graph entries and read back', async () => {
    const saved = graph('a', '2026-01-01T00:00:00.000Z', 'Rice: tariff');
    const bytes = await buildBackup([{ ...createWorksheet(), id: 'w' }], undefined, undefined, undefined, [saved]);
    const zip = await JSZip.loadAsync(bytes);
    expect(Object.keys(zip.files)).toContain('graphs/Rice- tariff (a).graph');
    const contents = await readBackup(bytes);
    expect(contents.graphs).toEqual([saved]);
    expect(contents.worksheets.map((entry) => entry.worksheet.id)).toEqual(['w']);
    expect(contents.failures).toEqual([]);
  });

  it('no graph entry ends in .json, which every shipped build restores as a worksheet', async () => {
    const bytes = await buildBackup([], undefined, undefined, undefined, [graph('a', '2026-01-01T00:00:00.000Z')]);
    const zip = await JSZip.loadAsync(bytes);
    // The filter every shipped `readBackup` applies to entries.
    const readAsWorksheets = Object.keys(zip.files).filter((name) => name.toLowerCase().endsWith('.json') && name !== 'manifest.json');
    expect(readAsWorksheets).toEqual([]);
  });

  it('a bad graph entry is reported and costs only itself', async () => {
    const zip = new JSZip();
    zip.file('graphs/bad (x).graph', '{nope');
    zip.file('graphs/good (g).graph', JSON.stringify(serializeGraph(graph('g', '2026-01-01T00:00:00.000Z'))));
    const contents = await readBackup(await zip.generateAsync({ type: 'uint8array' }));
    expect(contents.graphs.map((g) => g.id)).toEqual(['g']);
    expect(contents.failures).toEqual([{ name: 'graphs/bad (x).graph', reason: 'not valid JSON' }]);
  });

  it('the summary names restored graphs', () => {
    const none = { restored: [], copied: [], skipped: [], failed: [] };
    expect(restoreSummary(none, 0, { restored: 2, copied: 1, skipped: 1, failed: 0 })).toBe(
      '3 graphs restored · 1 graph already here',
    );
    expect(restoreSummary(none, 0)).toBe('That backup has no worksheets in it.');
  });
});
