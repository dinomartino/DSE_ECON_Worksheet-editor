import type { ChatNotes, TurnTrace } from './types';

/**
 * Where the review records and the teacher's notes are kept (k-0598): IndexedDB
 * `econ-studio-review`, beside the chat pictures (`chatPictures.ts`) and never in localStorage
 * (the chats and the worksheets already share its ~5 MB, k-0551). Three stores:
 *  - `turns`: one row per reply, `TurnTrace`, key `${chatId}:${turnId}`, index `chatId`;
 *  - `prompts`: long texts kept once (a system prompt sent with every call), `{ id, text }`;
 *  - `notes`: one row per chat, `ChatNotes`.
 * Where IndexedDB cannot open, every call says so (false, [] or undefined) and the studio runs
 * as before: a record that cannot be kept never takes a run down.
 */
export interface ReviewStore {
  putTurn(trace: TurnTrace, prompts: ReadonlyMap<string, string>): Promise<boolean>;
  /** The replies' records of these chats (every chat when absent). */
  turnsOf(chatIds?: readonly string[]): Promise<TurnTrace[]>;
  prompts(ids: Iterable<string>): Promise<Map<string, string>>;
  notesOf(chatId: string): Promise<ChatNotes | undefined>;
  putNotes(notes: ChatNotes): Promise<boolean>;
  /** A deleted chat: its records and notes go too. */
  forget(chatId: string): Promise<void>;
}

export function createMemoryReviewStore(): ReviewStore & { turns: Map<string, TurnTrace>; texts: Map<string, string>; notes: Map<string, ChatNotes> } {
  const turns = new Map<string, TurnTrace>();
  const texts = new Map<string, string>();
  const notes = new Map<string, ChatNotes>();
  const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
  return {
    turns,
    texts,
    notes,
    putTurn: async (trace, prompts) => {
      turns.set(trace.id, copy(trace));
      for (const [id, text] of prompts) texts.set(id, text);
      return true;
    },
    turnsOf: async (chatIds) => [...turns.values()].filter((t) => !chatIds || chatIds.includes(t.chatId)).map(copy),
    prompts: async (ids) => new Map([...new Set(ids)].filter((id) => texts.has(id)).map((id) => [id, texts.get(id) as string])),
    notesOf: async (chatId) => (notes.has(chatId) ? copy(notes.get(chatId) as ChatNotes) : undefined),
    putNotes: async (n) => {
      notes.set(n.chatId, copy(n));
      return true;
    },
    forget: async (chatId) => {
      for (const [id, t] of turns) if (t.chatId === chatId) turns.delete(id);
      notes.delete(chatId);
    },
  };
}

export const REVIEW_DB = 'econ-studio-review';
const TURNS = 'turns';
const PROMPTS = 'prompts';
const NOTES = 'notes';

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

const isTrace = (x: unknown): x is TurnTrace => typeof x === 'object' && x !== null && typeof (x as TurnTrace).id === 'string' && typeof (x as TurnTrace).chatId === 'string' && Array.isArray((x as TurnTrace).events);
const isNotes = (x: unknown): x is ChatNotes => typeof x === 'object' && x !== null && typeof (x as ChatNotes).chatId === 'string' && typeof (x as ChatNotes).turns === 'object' && (x as ChatNotes).turns !== null;

export function createIdbReviewStore(factory: IDBFactory | undefined = globalThis.indexedDB): ReviewStore {
  let opening: Promise<IDBDatabase | undefined> | undefined;
  const db = () =>
    (opening ??= new Promise<IDBDatabase | undefined>((resolve) => {
      if (!factory) return resolve(undefined);
      let request: IDBOpenDBRequest;
      try {
        request = factory.open(REVIEW_DB, 1);
      } catch {
        return resolve(undefined);
      }
      request.onupgradeneeded = () => {
        const opened = request.result;
        if (!opened.objectStoreNames.contains(TURNS)) opened.createObjectStore(TURNS, { keyPath: 'id' }).createIndex('chatId', 'chatId');
        if (!opened.objectStoreNames.contains(PROMPTS)) opened.createObjectStore(PROMPTS, { keyPath: 'id' });
        if (!opened.objectStoreNames.contains(NOTES)) opened.createObjectStore(NOTES, { keyPath: 'chatId' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(undefined);
      request.onblocked = () => resolve(undefined);
    }));
  const tx = async (stores: string[], mode: IDBTransactionMode) => (await db())?.transaction(stores, mode);

  return {
    putTurn: async (trace, prompts) => {
      try {
        const t = await tx([TURNS, PROMPTS], 'readwrite');
        if (!t) return false;
        t.objectStore(TURNS).put(trace);
        const store = t.objectStore(PROMPTS);
        for (const [id, text] of prompts) store.put({ id, text });
        await finished(t);
        return true;
      } catch {
        return false;
      }
    },
    turnsOf: async (chatIds) => {
      try {
        const t = await tx([TURNS], 'readonly');
        if (!t) return [];
        const store = t.objectStore(TURNS);
        if (!chatIds) return ((await done(store.getAll())) as unknown[]).filter(isTrace);
        const index = store.index('chatId');
        const lists = await Promise.all(chatIds.map((id) => done(index.getAll(id))));
        return lists.flat().filter(isTrace);
      } catch {
        return [];
      }
    },
    prompts: async (ids) => {
      const out = new Map<string, string>();
      try {
        const t = await tx([PROMPTS], 'readonly');
        if (!t) return out;
        const store = t.objectStore(PROMPTS);
        await Promise.all(
          [...new Set(ids)].map(async (id) => {
            const row = (await done(store.get(id))) as { id?: unknown; text?: unknown } | undefined;
            if (row && typeof row.text === 'string') out.set(id, row.text);
          }),
        );
      } catch {
        // What could be read is returned.
      }
      return out;
    },
    notesOf: async (chatId) => {
      try {
        const t = await tx([NOTES], 'readonly');
        if (!t) return undefined;
        const row = await done(t.objectStore(NOTES).get(chatId));
        return isNotes(row) ? row : undefined;
      } catch {
        return undefined;
      }
    },
    putNotes: async (notes) => {
      try {
        const t = await tx([NOTES], 'readwrite');
        if (!t) return false;
        t.objectStore(NOTES).put(notes);
        await finished(t);
        return true;
      } catch {
        return false;
      }
    },
    forget: async (chatId) => {
      try {
        const t = await tx([TURNS, NOTES], 'readwrite');
        if (!t) return;
        const keys = (await done(t.objectStore(TURNS).index('chatId').getAllKeys(chatId))) as IDBValidKey[];
        for (const key of keys) t.objectStore(TURNS).delete(key);
        t.objectStore(NOTES).delete(chatId);
        await finished(t);
      } catch {
        // Left behind: an export only reads the chats that exist.
      }
    },
  };
}

let shared: ReviewStore | undefined;
/** The one store of this window (both chat lists, the notes, the export). */
export const sharedReviewStore = (): ReviewStore => (shared ??= createIdbReviewStore());
