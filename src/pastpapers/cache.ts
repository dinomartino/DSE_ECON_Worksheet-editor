/**
 * Downloaded Past paper bank files, kept on this computer (k-0443): IndexedDB
 * `econ-pastpaper-bank`, beside (never inside) the documents' storage, so the web build's
 * ~5 MB for documents is untouched and the bank is never one of the teacher's documents or
 * in a backup. On desktop the webview keeps IndexedDB on disk, so an opened topic works
 * offline after the first download.
 *
 * One store, `files`: `{ key: "<base>|<file>", text, sha256?, savedAt }`. Keys carry the
 * source address, so pointing Settings at another source never mixes two banks. Inert
 * (every read a miss, every write dropped) where IndexedDB cannot open.
 */

export interface CachedFile {
  text: string;
  sha256?: string;
  savedAt: string;
}

export interface PastPaperCache {
  get(key: string): Promise<CachedFile | undefined>;
  put(key: string, file: CachedFile): Promise<void>;
  /** Drop every file of `base` except `keep` (keys). */
  prune(base: string, keep: ReadonlySet<string>): Promise<void>;
  /** Bytes held (UTF-16 length of the texts, roughly what they take) and files. */
  usage(): Promise<{ bytes: number; files: number }>;
  clear(): Promise<void>;
}

export const cacheKey = (base: string, file: string) => `${base}|${file}`;

export function createMemoryCache(): PastPaperCache {
  const files = new Map<string, CachedFile>();
  return {
    get: async (key) => files.get(key),
    put: async (key, file) => void files.set(key, file),
    prune: async (base, keep) => {
      for (const key of [...files.keys()]) if (key.startsWith(`${base}|`) && !keep.has(key)) files.delete(key);
    },
    usage: async () => ({ bytes: [...files.values()].reduce((n, f) => n + f.text.length, 0), files: files.size }),
    clear: async () => files.clear(),
  };
}

export const PASTPAPER_DB = 'econ-pastpaper-bank';
const STORE = 'files';

const done = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

export function createIdbCache(factory: IDBFactory | undefined = globalThis.indexedDB): PastPaperCache {
  let opening: Promise<IDBDatabase | undefined> | undefined;
  const db = () =>
    (opening ??= new Promise<IDBDatabase | undefined>((resolve) => {
      if (!factory) return resolve(undefined);
      let request: IDBOpenDBRequest;
      try {
        request = factory.open(PASTPAPER_DB, 1);
      } catch {
        return resolve(undefined);
      }
      request.onupgradeneeded = () => {
        const opened = request.result;
        if (!opened.objectStoreNames.contains(STORE)) opened.createObjectStore(STORE, { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(undefined);
      request.onblocked = () => resolve(undefined);
    }));
  const run = async <T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => Promise<T>, fallback: T): Promise<T> => {
    try {
      const opened = await db();
      if (!opened) return fallback;
      return await work(opened.transaction(STORE, mode).objectStore(STORE));
    } catch {
      return fallback;
    }
  };
  const isFile = (x: unknown): x is CachedFile & { key: string } =>
    typeof x === 'object' && x !== null && typeof (x as CachedFile).text === 'string';
  return {
    get: (key) =>
      run('readonly', async (store) => {
        const record = await done(store.get(key));
        return isFile(record) ? { text: record.text, ...(record.sha256 ? { sha256: record.sha256 } : {}), savedAt: record.savedAt } : undefined;
      }, undefined),
    put: (key, file) => run('readwrite', async (store) => void (await done(store.put({ key, ...file }))), undefined),
    prune: (base, keep) =>
      run('readwrite', async (store) => {
        const keys = (await done(store.getAllKeys())) as IDBValidKey[];
        await Promise.all(
          keys
            .filter((key): key is string => typeof key === 'string' && key.startsWith(`${base}|`) && !keep.has(key))
            .map((key) => done(store.delete(key))),
        );
      }, undefined),
    usage: () =>
      run('readonly', async (store) => {
        const all = (await done(store.getAll())) as unknown[];
        const files = all.filter(isFile);
        return { bytes: files.reduce((n, f) => n + f.text.length, 0), files: files.length };
      }, { bytes: 0, files: 0 }),
    clear: () => run('readwrite', async (store) => void (await done(store.clear())), undefined),
  };
}
