/**
 * The 題型 registry on desktop (`worksheets/patterns.json`, § fileStore.ts:patternsFile)
 * must behave exactly like the web's `localStorage` key: the same reads, writes, per-row
 * validation, read-before-write merging, backup restore (adds only) and clear. One suite
 * runs against both. The filesystem is faked in memory; `@tauri-apps/plugin-fs` is never
 * really loaded, and the shell is faked by the global it injects.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PatternFile } from './patterns';

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

// The shell injects this before any app code runs (§ src/platform:isDesktop).
const memory = new Map<string, string>();
const webStorage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => void memory.set(key, value),
  removeItem: (key: string) => void memory.delete(key),
} as unknown as Storage;
vi.stubGlobal('window', { __TAURI_INTERNALS__: {}, addEventListener: () => undefined, removeEventListener: () => undefined });

const { FileWorksheetStore, PATTERNS_FILE, patternsFile } = await import('./fileStore');
const { localPatternFile, PATTERNS_KEY, readPatternRegistry, updatePatternRegistry, addPatternEntries } = await import('./patterns');
const { restorePatterns } = await import('./backup');
const { patternStorage } = await import('./index');

const entry = (name: string, typeId = 'mcq') => ({ topic: 'C.ped', typeId, name });
const names = async (file: PatternFile) => (await readPatternRegistry(file)).patterns.map((p) => `${p.typeId}:${p.name}`);

beforeEach(() => {
  files.clear();
  dirs.clear();
  memory.clear();
});

describe('the desktop app stores the 題型 registry in worksheets/patterns.json', () => {
  it('is the registry the app uses on desktop', () => {
    expect(patternStorage).toBe(patternsFile);
    expect(PATTERNS_FILE).toBe('worksheets/patterns.json');
  });

  it('creates the folder on first write, and removes the file when the registry empties', async () => {
    expect(await patternsFile.read()).toBeUndefined();
    await updatePatternRegistry(patternsFile, (state) => addPatternEntries(state, [entry('Calculate PED')]));
    expect(dirs.has('worksheets')).toBe(true);
    expect(JSON.parse(files.get(PATTERNS_FILE)!)).toMatchObject({ format: 1, patterns: [entry('Calculate PED')] });
    await updatePatternRegistry(patternsFile, () => ({ patterns: [] }));
    expect(files.has(PATTERNS_FILE)).toBe(false);
  });

  it('is cleared with the store', async () => {
    await updatePatternRegistry(patternsFile, (state) => addPatternEntries(state, [entry('A')]));
    await new FileWorksheetStore().clear();
    expect(files.has(PATTERNS_FILE)).toBe(false);
  });
});

type Case = [string, () => PatternFile, (text: string) => void];
const cases: Case[] = [
  ['desktop file', () => patternsFile, (text) => void (dirs.add('worksheets'), files.set(PATTERNS_FILE, text))],
  ['web key', () => localPatternFile(() => webStorage), (text) => void memory.set(PATTERNS_KEY, text)],
];

describe.each(cases)('the 題型 registry, %s', (_, fileOf, putRaw) => {
  it('judges every row alone and keeps a newer build’s fields through a rewrite', async () => {
    putRaw(
      JSON.stringify({
        format: 1,
        future: { kept: true },
        patterns: [42, { topic: 'C', typeId: 'mcq', name: 'coarse' }, entry('Calculate PED'), { ...entry('calculate  ped') }, entry('Graph', 'lq')],
      }),
    );
    const file = fileOf();
    expect(await names(file)).toEqual(['mcq:Calculate PED', 'lq:Graph']);
    await updatePatternRegistry(file, (state) => addPatternEntries(state, [entry('Factors')]));
    const stored = JSON.parse((await file.read())!);
    expect(stored.future).toEqual({ kept: true });
    expect(await names(file)).toEqual(['mcq:Calculate PED', 'lq:Graph', 'mcq:Factors']);
  });

  it('reads an unreadable file as empty', async () => {
    putRaw('{ not json');
    expect(await names(fileOf())).toEqual([]);
  });

  it('writes from what is stored now, so another window’s addition survives', async () => {
    const file = fileOf();
    await updatePatternRegistry(file, (state) => addPatternEntries(state, [entry('A')]));
    putRaw(JSON.stringify({ format: 1, patterns: [entry('A'), entry('From elsewhere')] }));
    await updatePatternRegistry(file, (state) => addPatternEntries(state, [entry('B')]));
    expect(await names(file)).toEqual(['mcq:A', 'mcq:From elsewhere', 'mcq:B']);
  });

  it('restoring a backup adds its 題型 and never removes or renames one', async () => {
    const file = fileOf();
    await updatePatternRegistry(file, (state) => addPatternEntries(state, [entry('Mine'), entry('Shared')]));
    await restorePatterns(file, { patterns: [entry('shared'), entry('From backup', 'lq')] });
    expect(await names(file)).toEqual(['mcq:Mine', 'mcq:Shared', 'lq:From backup']);
  });
});
