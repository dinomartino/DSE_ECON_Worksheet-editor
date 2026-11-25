/**
 * Saved chats' pictures, kept outside localStorage (k-0551). A chat's reference questions carry
 * their pictures as `data:image/…` text (`SourceQuestion.figureBlocks`: the bank's diagrams, a
 * teacher's own questions' pictures), and a draft's request holds the same references again.
 * Kept in localStorage they filled the ~5 MB the worksheets also live in, and saving stopped.
 *
 * So a saved chat holds a short token, `studio-pic:<id>`, where each picture was, and the
 * picture itself goes to IndexedDB `econ-studio-pictures` (store `pictures`, one row per
 * picture: `{ id, dataUrl, savedAt }`). The id is the picture's own fingerprint, so the same
 * diagram in ten chats and their drafts is kept once. Both saved lists (the studio's and the ✦
 * Write panel's) share the one store; `prune` tidies the pictures neither list names.
 *
 * Every function here is pure except the store. Where IndexedDB cannot open, the store says so
 * (`putAll` → false, `getAll` → undefined) and the chats keep their pictures as before.
 */

/** What a saved chat holds where a picture was. */
export const PICTURE_TOKEN = 'studio-pic:';
/** Shorter pictures stay where they are: not worth a row. */
export const MIN_PICTURE_LENGTH = 512;

const PICTURE_URL = /^data:image\//;
const TOKEN = /^studio-pic:([0-9a-z]+-[0-9a-z]+)$/;
const TOKENS_IN_TEXT = /studio-pic:([0-9a-z]+-[0-9a-z]+)/g;

/** Two 53-bit string hashes (cyrb53, two seeds) and the length: a picture's id. */
export function pictureId(dataUrl: string): string {
  const hash = (seed: number) => {
    let h1 = 0xdeadbeef ^ seed;
    let h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < dataUrl.length; i += 1) {
      const ch = dataUrl.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  };
  return `${hash(1).toString(36)}${hash(2).toString(36)}-${dataUrl.length.toString(36)}`;
}

const isPicture = (x: string) => x.length >= MIN_PICTURE_LENGTH && PICTURE_URL.test(x);

/** `value` with `fn` applied to every string in it; unchanged parts keep their identity. */
function mapStrings<T>(value: T, fn: (s: string) => string): T {
  const walk = (x: unknown): unknown => {
    if (typeof x === 'string') return fn(x);
    if (Array.isArray(x)) {
      let changed = false;
      const out = x.map((each) => {
        const next = walk(each);
        if (next !== each) changed = true;
        return next;
      });
      return changed ? out : x;
    }
    if (typeof x === 'object' && x !== null) {
      let changed = false;
      const out: Record<string, unknown> = {};
      for (const [k, each] of Object.entries(x)) {
        const next = walk(each);
        if (next !== each) changed = true;
        out[k] = next;
      }
      return changed ? out : x;
    }
    return x;
  };
  return walk(value) as T;
}

/** `value` with each picture swapped for its token, and the pictures by id (added to `into`). */
export function takePictures<T>(value: T, into: Map<string, string> = new Map()): { value: T; pictures: Map<string, string> } {
  const out = mapStrings(value, (s) => {
    if (!isPicture(s)) return s;
    const id = pictureId(s);
    into.set(id, s);
    return `${PICTURE_TOKEN}${id}`;
  });
  return { value: out, pictures: into };
}

/** `value` with each token whose picture is in `found` swapped back; a token not found stays. */
export function putPicturesBack<T>(value: T, found: ReadonlyMap<string, string>): T {
  if (found.size === 0) return value;
  return mapStrings(value, (s) => {
    const id = TOKEN.exec(s)?.[1];
    return id && found.has(id) ? found.get(id)! : s;
  });
}

/** The picture ids `value` names by token. */
export function tokenIds(value: unknown, into: Set<string> = new Set()): Set<string> {
  mapStrings(value, (s) => {
    const id = TOKEN.exec(s)?.[1];
    if (id) into.add(id);
    return s;
  });
  return into;
}

/** The picture ids a saved list's raw text names (cheap: no parsing). */
export function tokenIdsInText(text: string | null | undefined, into: Set<string> = new Set()): Set<string> {
  if (!text) return into;
  for (const match of text.matchAll(TOKENS_IN_TEXT)) into.add(match[1]);
  return into;
}

/** Whether `value` still holds a picture inline (a chat saved before k-0551). */
export function hasInlinePictures(value: unknown): boolean {
  let found = false;
  mapStrings(value, (s) => {
    if (!found && isPicture(s)) found = true;
    return s;
  });
  return found;
}

export interface PictureStore {
  /** Keeps these pictures; false when they could not be kept (no IndexedDB, full, any error). */
  putAll(pictures: ReadonlyMap<string, string>): Promise<boolean>;
  /** The pictures of these ids that are kept; undefined when the store cannot be read at all. */
  getAll(ids: Iterable<string>): Promise<Map<string, string> | undefined>;
  /** Drops every picture not in `keep` saved before `before` (ms); the ids it dropped. */
  prune(keep: ReadonlySet<string>, before: number): Promise<string[]>;
  /** Pictures kept and their total length (tests, the proof). */
  usage(): Promise<{ pictures: number; length: number }>;
}

export function createMemoryPictureStore(now: () => number = Date.now): PictureStore & { rows: Map<string, { dataUrl: string; savedAt: number }> } {
  const rows = new Map<string, { dataUrl: string; savedAt: number }>();
  return {
    rows,
    putAll: async (pictures) => {
      for (const [id, dataUrl] of pictures) rows.set(id, { dataUrl, savedAt: now() });
      return true;
    },
    getAll: async (ids) => {
      const out = new Map<string, string>();
      for (const id of ids) {
        const row = rows.get(id);
        if (row) out.set(id, row.dataUrl);
      }
      return out;
    },
    prune: async (keep, before) => {
      const gone = [...rows].filter(([id, row]) => !keep.has(id) && row.savedAt < before).map(([id]) => id);
      for (const id of gone) rows.delete(id);
      return gone;
    },
    usage: async () => ({ pictures: rows.size, length: [...rows.values()].reduce((n, r) => n + r.dataUrl.length, 0) }),
  };
}

export const PICTURES_DB = 'econ-studio-pictures';
const STORE = 'pictures';

const done = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const finished = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('aborted'));
  });

interface Row {
  id: string;
  dataUrl: string;
  savedAt: number;
}
const isRow = (x: unknown): x is Row =>
  typeof x === 'object' && x !== null && typeof (x as Row).id === 'string' && typeof (x as Row).dataUrl === 'string';

/** The browser's store (the same pattern as the Past paper bank's `createIdbCache`). */
export function createIdbPictureStore(factory: IDBFactory | undefined = globalThis.indexedDB, now: () => number = Date.now): PictureStore {
  let opening: Promise<IDBDatabase | undefined> | undefined;
  const db = () =>
    (opening ??= new Promise<IDBDatabase | undefined>((resolve) => {
      if (!factory) return resolve(undefined);
      let request: IDBOpenDBRequest;
      try {
        request = factory.open(PICTURES_DB, 1);
      } catch {
        return resolve(undefined);
      }
      request.onupgradeneeded = () => {
        const opened = request.result;
        if (!opened.objectStoreNames.contains(STORE)) opened.createObjectStore(STORE, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(undefined);
      request.onblocked = () => resolve(undefined);
    }));
  const tx = async (mode: IDBTransactionMode): Promise<IDBTransaction | undefined> => {
    const opened = await db();
    return opened?.transaction(STORE, mode);
  };
  return {
    putAll: async (pictures) => {
      if (pictures.size === 0) return true;
      try {
        const t = await tx('readwrite');
        if (!t) return false;
        const store = t.objectStore(STORE);
        const at = now();
        for (const [id, dataUrl] of pictures) store.put({ id, dataUrl, savedAt: at } satisfies Row);
        // Kept only once the whole transaction is on disk: a quota failure aborts it.
        await finished(t);
        return true;
      } catch {
        return false;
      }
    },
    getAll: async (ids) => {
      try {
        const t = await tx('readonly');
        if (!t) return undefined;
        const store = t.objectStore(STORE);
        const out = new Map<string, string>();
        await Promise.all(
          [...new Set(ids)].map(async (id) => {
            const row = await done(store.get(id));
            if (isRow(row)) out.set(id, row.dataUrl);
          }),
        );
        return out;
      } catch {
        return undefined;
      }
    },
    prune: async (keep, before) => {
      try {
        const t = await tx('readwrite');
        if (!t) return [];
        const store = t.objectStore(STORE);
        // Keys first: only the pictures no list names are read (to see their age), never all.
        const keys = ((await done(store.getAllKeys())) as IDBValidKey[]).filter((k): k is string => typeof k === 'string' && !keep.has(k));
        const rows = await Promise.all(keys.map((k) => done(store.get(k))));
        const gone = rows.filter(isRow).filter((r) => !(r.savedAt >= before)).map((r) => r.id);
        for (const id of gone) store.delete(id);
        await finished(t);
        return gone;
      } catch {
        return [];
      }
    },
    usage: async () => {
      try {
        const t = await tx('readonly');
        if (!t) return { pictures: 0, length: 0 };
        const rows = ((await done(t.objectStore(STORE).getAll())) as unknown[]).filter(isRow);
        return { pictures: rows.length, length: rows.reduce((n, r) => n + r.dataUrl.length, 0) };
      } catch {
        return { pictures: 0, length: 0 };
      }
    },
  };
}

let shared: PictureStore | undefined;
/** The one store both saved lists use in this window. */
export const sharedPictureStore = (): PictureStore => (shared ??= createIdbPictureStore());
