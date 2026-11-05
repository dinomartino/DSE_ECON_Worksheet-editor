/**
 * Temporary files (k-0317): each medium writes, reads back in name order, deletes its run
 * folder once, and the sweep removes only leftovers older than an hour. The desktop's
 * plugin-fs and the browser's OPFS are faked in memory.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const files = new Map<string, string>();
const dirs = new Set<string>();

vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: { AppData: 13 },
  exists: async (path: string) => dirs.has(path) || [...files.keys()].some((k) => k.startsWith(`${path}/`)),
  mkdir: async (path: string) => {
    const parts = path.split('/');
    for (let i = 1; i <= parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
  },
  writeTextFile: async (path: string, text: string) => void files.set(path, text),
  readTextFile: async (path: string) => files.get(path) ?? Promise.reject(new Error('ENOENT')),
  readDir: async (path: string) => {
    const names = new Map<string, boolean>();
    for (const key of [...files.keys(), ...dirs]) {
      if (!key.startsWith(`${path}/`)) continue;
      const [head, ...rest] = key.slice(path.length + 1).split('/');
      names.set(head, rest.length > 0 || dirs.has(`${path}/${head}`));
    }
    return [...names].map(([name, isDirectory]) => ({ name, isFile: !isDirectory, isDirectory }));
  },
  remove: async (path: string, opts?: { recursive?: boolean }) => {
    if (!opts?.recursive) throw new Error('not recursive');
    for (const key of [...files.keys()]) if (key.startsWith(`${path}/`)) files.delete(key);
    for (const key of [...dirs]) if (key === path || key.startsWith(`${path}/`)) dirs.delete(key);
  },
}));

const { openScratch, sweepScratch, STALE_MS } = await import('./scratch');

/** A minimal OPFS directory handle. */
class FakeDir {
  entries = new Map<string, FakeDir | FakeFile>();
  async getDirectoryHandle(name: string, opts?: { create?: boolean }) {
    let dir = this.entries.get(name);
    if (!dir && opts?.create) this.entries.set(name, (dir = new FakeDir()));
    if (!(dir instanceof FakeDir)) throw new DOMException('NotFound', 'NotFoundError');
    return dir;
  }
  async getFileHandle(name: string, opts?: { create?: boolean }) {
    let file = this.entries.get(name);
    if (!file && opts?.create) this.entries.set(name, (file = new FakeFile(this.writable)));
    if (!(file instanceof FakeFile)) throw new DOMException('NotFound', 'NotFoundError');
    return file;
  }
  async removeEntry(name: string, opts?: { recursive?: boolean }) {
    const entry = this.entries.get(name);
    if (entry instanceof FakeDir && entry.entries.size && !opts?.recursive) throw new Error('not empty');
    this.entries.delete(name);
  }
  async *keys() {
    yield* this.entries.keys();
  }
  constructor(public writable = true) {}
}
class FakeFile {
  text = '';
  constructor(writable: boolean) {
    if (!writable) (this as { createWritable?: unknown }).createWritable = undefined;
  }
  async createWritable() {
    let next = '';
    return { write: async (t: string) => void (next += t), close: async () => void (this.text = next) };
  }
  async getFile() {
    return { text: async () => this.text };
  }
}

function withOpfs(root: FakeDir) {
  vi.stubGlobal('navigator', { storage: { getDirectory: async () => root } });
}

afterEach(() => {
  files.clear();
  dirs.clear();
  vi.unstubAllGlobals();
});

async function roundTrip(medium: string) {
  const run = await openScratch('coverage');
  expect(run.medium).toBe(medium);
  await run.write('q002.json', 'two');
  await run.write('q001.json', 'one');
  expect(await run.readAll()).toEqual([{ name: 'q001.json', text: 'one' }, { name: 'q002.json', text: 'two' }]);
  await expect(run.write('../escape', 'x')).rejects.toThrow();
  return run;
}

describe('temporary files', () => {
  it('in memory when the browser has no writable OPFS', async () => {
    const run = await roundTrip('memory');
    await run.dispose();
    expect(await run.readAll()).toEqual([]);
    withOpfs(new FakeDir(false));
    expect((await openScratch('coverage')).medium).toBe('memory');
  });

  it('in the browser\'s private file system: the run folder goes on dispose, leftovers on the next sweep', async () => {
    const root = new FakeDir();
    withOpfs(root);
    const job = async () => (await (await root.getDirectoryHandle('scratch')).getDirectoryHandle('coverage'));
    const old = await openScratch('coverage', Date.now() - STALE_MS - 1000);
    await old.write('q001.json', 'left by a closed tab');
    const fresh = await openScratch('coverage', Date.now() - 1000);
    await fresh.write('q001.json', 'another tab, still running');
    const run = await roundTrip('browser');
    expect((await job()).entries.size).toBe(3);
    await run.dispose();
    await run.dispose();
    expect((await job()).entries.size).toBe(2);
    expect(await sweepScratch('coverage')).toBe(1);
    expect((await job()).entries.size).toBe(1);
    expect(await fresh.readAll()).toEqual([{ name: 'q001.json', text: 'another tab, still running' }]);
  });

  it('on desktop under $APPDATA/scratch, removed recursively', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    const old = await openScratch('coverage', Date.now() - STALE_MS - 1000);
    await old.write('q001.json', 'crash');
    const run = await roundTrip('desktop');
    expect([...files.keys()].every((k) => k.startsWith('scratch/coverage/'))).toBe(true);
    expect(files.size).toBe(3);
    await run.dispose();
    expect(files.size).toBe(1);
    expect(await sweepScratch('coverage')).toBe(1);
    expect(files.size).toBe(0);
    expect([...dirs].filter((d) => d.startsWith('scratch/coverage/'))).toEqual([]);
  });
});
