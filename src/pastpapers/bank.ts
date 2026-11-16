import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { appSettings } from '@/settings/store';
import { cacheKey, createIdbCache, type PastPaperCache } from './cache';
import { fileUrl, PAST_PAPER_SETTINGS, sourceUrl } from './config';
import { fetchText as realFetch, type FetchResult, type FetchText } from './net';
import { parseManifest, parseTopic, type Manifest, type TopicData, type TopicEntry } from './pack';

/**
 * The Past paper bank, loaded on demand (k-0443): the list first, each topic when it is
 * opened, every download kept in `cache.ts`. Read-only by construction: nothing here writes
 * a document, and the topic documents never reach `worksheetStore`.
 */

export type LoadFailure = 'offline' | 'notFound' | 'http' | 'tooLarge' | 'format' | 'aborted';

export interface Deps {
  fetchText: FetchText;
  cache: PastPaperCache;
  /** Lower-case hex SHA-256 of the UTF-8 text, or undefined where it cannot be computed. */
  sha256(text: string): Promise<string | undefined>;
  now(): string;
}

export async function webSha256(text: string): Promise<string | undefined> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return undefined;
  try {
    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return undefined;
  }
}

const MANIFEST = 'manifest.json';

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

export type ManifestResult =
  | { ok: true; manifest: Manifest; offline: boolean }
  | { ok: false; reason: LoadFailure | 'disabled' };

/**
 * The list, fresh from the source; offline, the copy kept from last time. A list that says
 * `enabled: false` turns the bank off and drops every topic kept from that source (a
 * takedown reaches computers that had downloaded it, at their next opening).
 */
export async function loadManifest(base: string, deps: Deps): Promise<ManifestResult> {
  const key = cacheKey(base, MANIFEST);
  const fetched = await deps.fetchText(base + MANIFEST, { fresh: true });
  if (fetched.ok) {
    const manifest = parseManifest(parseJson(fetched.text));
    if ('error' in manifest) return { ok: false, reason: 'format' };
    if (!manifest.enabled) {
      await deps.cache.prune(base, new Set());
      return { ok: false, reason: 'disabled' };
    }
    await deps.cache.put(key, { text: fetched.text, savedAt: deps.now() });
    // Topics no longer listed are dropped; a listed one is replaced when its fingerprint changes.
    await deps.cache.prune(base, new Set([key, ...manifest.topics.map((t) => cacheKey(base, t.file))]));
    return { ok: true, manifest, offline: false };
  }
  if (fetched.reason === 'notFound' || fetched.reason === 'tooLarge' || fetched.reason === 'aborted') {
    return { ok: false, reason: fetched.reason };
  }
  const kept = await deps.cache.get(key);
  const manifest = kept ? parseManifest(parseJson(kept.text)) : undefined;
  if (manifest && !('error' in manifest) && manifest.enabled) return { ok: true, manifest, offline: true };
  return { ok: false, reason: fetched.reason };
}

export type TopicResult = { ok: true; topic: TopicData; offline: boolean } | { ok: false; reason: LoadFailure };

/**
 * One topic: the kept copy when its fingerprint matches the list's, else a download (kept
 * when it matches, or when the list names no fingerprint). Offline, a kept copy of another
 * fingerprint is still shown rather than nothing.
 */
export async function loadTopic(base: string, entry: TopicEntry, deps: Deps): Promise<TopicResult> {
  const url = fileUrl(base, entry.file);
  if (!url) return { ok: false, reason: 'format' };
  const key = cacheKey(base, entry.file);
  const kept = await deps.cache.get(key);
  const read = (text: string) => parseTopic(parseJson(text), entry);
  if (kept && (!entry.sha256 || kept.sha256 === entry.sha256)) {
    const topic = read(kept.text);
    if (topic) return { ok: true, topic, offline: false };
  }
  const fetched: FetchResult = await deps.fetchText(url, { fresh: false });
  if (!fetched.ok) {
    const topic = kept ? read(kept.text) : undefined;
    if (topic && fetched.reason === 'offline') return { ok: true, topic, offline: true };
    return { ok: false, reason: fetched.reason };
  }
  const topic = read(fetched.text);
  if (!topic) return { ok: false, reason: 'format' };
  const sha = await deps.sha256(fetched.text);
  // A file that does not match the list (a cache in between still serving the old one) is
  // shown but not kept, so the next opening asks again.
  if (!entry.sha256 || sha === entry.sha256) {
    await deps.cache.put(key, { text: fetched.text, ...(sha ? { sha256: sha } : {}), savedAt: deps.now() });
  }
  return { ok: true, topic, offline: false };
}

export type TopicState =
  | { state: 'loading' }
  | { state: 'ready'; data: TopicData; offline: boolean }
  | { state: 'error'; reason: LoadFailure };

export interface PastPaperState {
  /** The source the state below was read from; undefined = the bank is off here. */
  base: string | undefined;
  status: 'idle' | 'off' | 'loading' | 'ready' | 'disabled' | 'error';
  reason?: LoadFailure;
  /** The list came from this computer's copy (no connection). */
  offline: boolean;
  manifest?: Manifest;
  topics: Readonly<Record<string, TopicState>>;
  /** Read the list (again when `force`, else once per source). */
  open(force?: boolean): Promise<void>;
  /** Read a topic, once (again after an error). */
  topic(id: string): Promise<TopicState | undefined>;
  /** Every listed topic, a few at a time; for search across the bank. */
  loadAll(onProgress?: (done: number, total: number) => void): Promise<void>;
}

export interface BankOptions {
  deps?: Partial<Deps>;
  /** The source to read; default from Settings → Past paper bank. */
  source?: () => string | undefined;
}

/** Bytes kept on this computer, and a way to drop them (Settings). */
export const pastPaperCache = (() => {
  let cache: PastPaperCache | undefined;
  return () => (cache ??= createIdbCache());
})();

export function createPastPaperBank(options: BankOptions = {}): UseBoundStore<StoreApi<PastPaperState>> {
  const deps = (): Deps => ({
    fetchText: options.deps?.fetchText ?? realFetch,
    cache: options.deps?.cache ?? pastPaperCache(),
    sha256: options.deps?.sha256 ?? webSha256,
    now: options.deps?.now ?? (() => new Date().toISOString()),
  });
  const source = options.source ?? (() => sourceUrl(appSettings.read(PAST_PAPER_SETTINGS)));
  const pending = new Map<string, Promise<TopicState | undefined>>();

  return create<PastPaperState>((set, get) => {
    /** A new source (Settings changed) forgets everything read from the old one. */
    const sync = () => {
      const base = source();
      if (base !== get().base) {
        pending.clear();
        set({ base, status: base ? 'idle' : 'off', reason: undefined, offline: false, manifest: undefined, topics: {} });
      }
      return base;
    };
    return {
      base: undefined,
      status: 'idle',
      offline: false,
      topics: {},
      open: async (force = false) => {
        const base = sync();
        if (!base) return;
        const { status } = get();
        if (!force && (status === 'ready' || status === 'loading')) return;
        set({ status: 'loading', reason: undefined });
        const result = await loadManifest(base, deps());
        if (get().base !== base) return;
        if (result.ok) set({ status: 'ready', manifest: result.manifest, offline: result.offline, ...(force ? { topics: {} } : {}) });
        else if (result.reason === 'disabled') set({ status: 'disabled', manifest: undefined, topics: {} });
        else set({ status: 'error', reason: result.reason });
      },
      topic: (id) => {
        const base = sync();
        const entry = get().manifest?.topics.find((t) => t.id === id);
        if (!base || !entry) return Promise.resolve(undefined);
        const now = get().topics[id];
        if (now?.state === 'ready') return Promise.resolve(now);
        const running = pending.get(id);
        if (running) return running;
        set({ topics: { ...get().topics, [id]: { state: 'loading' } } });
        const job = loadTopic(base, entry, deps()).then((result): TopicState | undefined => {
          pending.delete(id);
          if (get().base !== base) return undefined;
          const next: TopicState = result.ok
            ? { state: 'ready', data: result.topic, offline: result.offline }
            : { state: 'error', reason: result.reason };
          set({ topics: { ...get().topics, [id]: next } });
          return next;
        });
        pending.set(id, job);
        return job;
      },
      loadAll: async (onProgress) => {
        const topics = get().manifest?.topics ?? [];
        let finished = 0;
        const queue = [...topics];
        const worker = async () => {
          for (let entry = queue.shift(); entry; entry = queue.shift()) {
            await get().topic(entry.id);
            finished += 1;
            onProgress?.(finished, topics.length);
          }
        };
        await Promise.all([worker(), worker(), worker()]);
      },
    };
  });
}

/** The app's one Past paper bank. */
export const usePastPaperBank = createPastPaperBank();
