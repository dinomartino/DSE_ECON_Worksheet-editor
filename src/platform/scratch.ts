import { isDesktop } from './index';

/**
 * Temporary files for one run of a job (k-0317: the syllabus coverage check writes each
 * question's AI result here, builds its report from them, then deletes them).
 *
 * Where they live:
 * - **desktop:** `$APPDATA/scratch/<job>/<run>/<name>` through plugin-fs (the shell's
 *   `$APPDATA/**` grant; nothing new in `capabilities/default.json`);
 * - **web:** the browser's origin-private file system (OPFS), never visible to the teacher
 *   and never synced or backed up, when the browser can write a file there; otherwise
 *   memory (an old Safari, jsdom).
 *
 * A run's folder is removed by `dispose()`, which callers run in a `finally`. A folder left
 * by a crash or a closed tab is removed by `sweepScratch` (the next run of the same job),
 * once it is older than `STALE_MS`, so two tabs running at once never delete each other's.
 */

export interface ScratchRun {
  /** Where the files are: 'desktop', 'browser' (OPFS) or 'memory'. */
  readonly medium: 'desktop' | 'browser' | 'memory';
  write(name: string, text: string): Promise<void>;
  /** Every file written, by name, sorted by name. */
  readAll(): Promise<Array<{ name: string; text: string }>>;
  /** Deletes the run's folder; safe to call twice. Never throws. */
  dispose(): Promise<void>;
}

export const SCRATCH_DIR = 'scratch';
/** A run folder older than this is a leftover. */
export const STALE_MS = 60 * 60 * 1000;

const runName = (now: number) => `${now}-${Math.random().toString(36).slice(2, 8)}`;
const runTime = (name: string) => Number(name.split('-')[0]);
const stale = (name: string, now: number) => {
  const at = runTime(name);
  return !Number.isFinite(at) || now - at > STALE_MS;
};
const safeName = (name: string) => {
  if (!/^[A-Za-z0-9._-]+$/.test(name)) throw new Error(`scratch: bad file name ${name}`);
  return name;
};

// ---- memory ----

function memoryRun(): ScratchRun {
  let files: Map<string, string> | null = new Map();
  return {
    medium: 'memory',
    async write(name, text) {
      files?.set(safeName(name), text);
    },
    async readAll() {
      return [...(files ?? new Map<string, string>())].sort(([a], [b]) => (a < b ? -1 : 1)).map(([name, text]) => ({ name, text }));
    },
    async dispose() {
      files = null;
    },
  };
}

// ---- desktop ----

async function desktopRun(job: string, now: number): Promise<ScratchRun> {
  const fs = await import('@tauri-apps/plugin-fs');
  const opts = { baseDir: fs.BaseDirectory.AppData };
  const dir = `${SCRATCH_DIR}/${safeName(job)}/${runName(now)}`;
  await fs.mkdir(dir, { ...opts, recursive: true });
  let gone = false;
  return {
    medium: 'desktop',
    async write(name, text) {
      await fs.writeTextFile(`${dir}/${safeName(name)}`, text, opts);
    },
    async readAll() {
      const entries = (await fs.readDir(dir, opts)).filter((e) => e.isFile).map((e) => e.name).sort();
      return Promise.all(entries.map(async (name) => ({ name, text: await fs.readTextFile(`${dir}/${name}`, opts) })));
    },
    async dispose() {
      if (gone) return;
      gone = true;
      await fs.remove(dir, { ...opts, recursive: true }).catch(() => undefined);
    },
  };
}

async function desktopSweep(job: string, now: number): Promise<number> {
  const fs = await import('@tauri-apps/plugin-fs');
  const opts = { baseDir: fs.BaseDirectory.AppData };
  const parent = `${SCRATCH_DIR}/${safeName(job)}`;
  if (!(await fs.exists(parent, opts))) return 0;
  let removed = 0;
  for (const entry of await fs.readDir(parent, opts)) {
    if (!entry.isDirectory || !stale(entry.name, now)) continue;
    await fs.remove(`${parent}/${entry.name}`, { ...opts, recursive: true }).then(() => removed++, () => undefined);
  }
  return removed;
}

// ---- browser (OPFS) ----

type Dir = FileSystemDirectoryHandle & { keys?(): AsyncIterableIterator<string> };

async function opfsRoot(): Promise<Dir | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) return null;
    const root = (await navigator.storage.getDirectory()) as Dir;
    // Safari before 26 has OPFS but no createWritable on the page: fall back to memory.
    const probe = await root.getFileHandle('.scratch-probe', { create: true });
    const writable = typeof (probe as { createWritable?: unknown }).createWritable === 'function';
    await root.removeEntry('.scratch-probe').catch(() => undefined);
    return writable ? root : null;
  } catch {
    return null;
  }
}

async function opfsJobDir(root: Dir, job: string): Promise<Dir> {
  const scratch = await root.getDirectoryHandle(SCRATCH_DIR, { create: true });
  return (await scratch.getDirectoryHandle(safeName(job), { create: true })) as Dir;
}

async function names(dir: Dir): Promise<string[]> {
  const out: string[] = [];
  if (!dir.keys) return out;
  for await (const name of dir.keys()) out.push(name);
  return out.sort();
}

async function browserRun(root: Dir, job: string, now: number): Promise<ScratchRun> {
  const jobDir = await opfsJobDir(root, job);
  const name = runName(now);
  const dir = (await jobDir.getDirectoryHandle(name, { create: true })) as Dir;
  let gone = false;
  return {
    medium: 'browser',
    async write(file, text) {
      const handle = await dir.getFileHandle(safeName(file), { create: true });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
    },
    async readAll() {
      return Promise.all(
        (await names(dir)).map(async (file) => ({ name: file, text: await (await (await dir.getFileHandle(file)).getFile()).text() })),
      );
    },
    async dispose() {
      if (gone) return;
      gone = true;
      await jobDir.removeEntry(name, { recursive: true }).catch(() => undefined);
    },
  };
}

async function browserSweep(root: Dir, job: string, now: number): Promise<number> {
  const jobDir = await opfsJobDir(root, job);
  let removed = 0;
  for (const name of await names(jobDir)) {
    if (!stale(name, now)) continue;
    await jobDir.removeEntry(name, { recursive: true }).then(() => removed++, () => undefined);
  }
  return removed;
}

// ---- public ----

/**
 * A fresh folder for one run of `job` ('coverage'). Falls back to memory when the medium
 * cannot be opened, so a run never fails for want of a temporary file.
 */
export async function openScratch(job: string, now = Date.now()): Promise<ScratchRun> {
  try {
    if (isDesktop()) return await desktopRun(job, now);
    const root = await opfsRoot();
    if (root) return await browserRun(root, job, now);
  } catch {
    // fall through
  }
  return memoryRun();
}

/** Removes `job`'s run folders older than `STALE_MS`. Returns how many; never throws. */
export async function sweepScratch(job: string, now = Date.now()): Promise<number> {
  try {
    if (isDesktop()) return await desktopSweep(job, now);
    const root = await opfsRoot();
    return root ? await browserSweep(root, job, now) : 0;
  } catch {
    return 0;
  }
}
