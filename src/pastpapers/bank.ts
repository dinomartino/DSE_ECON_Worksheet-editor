import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { appSettings } from '@/settings/store';
import { cacheKey, createIdbCache, type PastPaperCache } from './cache';
import { isDesktop } from '@/platform';
import { fileUrl, gitHubSource, isCommit, latestUrls, PAST_PAPER_SETTINGS, pinnedSource, sourceUrl, type GitHubSource } from './config';
import { fetchText as realFetch, type FetchText } from './net';
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
  /** Called after a topic is kept: ask the browser not to clear the store (`keepDownloads`). */
  persist?(): void;
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

/**
 * Asks the browser, once, to keep the downloads when the disk fills (`navigator.storage.persist`,
 * k-0447). Web only: the desktop app keeps its store anyway. Chrome decides silently; Firefox
 * may ask the teacher once. Refused or unsupported, the bank works as before.
 */
export const keepDownloads = (() => {
  let asked = false;
  return () => {
    if (asked || isDesktop()) return;
    asked = true;
    const storage = globalThis.navigator?.storage;
    if (typeof storage?.persist !== 'function') return;
    void Promise.resolve(typeof storage.persisted === 'function' ? storage.persisted() : false)
      .then((already) => already || storage.persist())
      .catch(() => undefined);
  };
})();

const MANIFEST = 'manifest.json';

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/** What `latest.json` says (k-0447): which published commit is current, and the off switch. */
export interface Latest {
  commit?: string;
  enabled: boolean;
  published?: string;
}

/**
 * `latest.json`: `{ "version": 1, "commit": "<40 hex>", "enabled": true, "published": "…" }`.
 * `enabled: false` is read whatever else it holds (the switch must always work). Anything this
 * build can't read (another version, no full commit id) is not a `latest.json`: the bank is then
 * read from the branch, as before k-0447.
 */
export function parseLatest(raw: unknown): Latest | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  if (r.enabled === false) return { enabled: false };
  if ((r.version !== undefined && r.version !== 1) || !isCommit(r.commit)) return undefined;
  return { commit: r.commit, enabled: true, ...(typeof r.published === 'string' ? { published: r.published } : {}) };
}

export type ManifestResult =
  | {
      ok: true;
      manifest: Manifest;
      offline: boolean;
      /** Where the list's topics are downloaded from, tried in order. */
      files: string[];
      /** The published commit the list belongs to; absent when read from the branch. */
      rev?: string;
    }
  | { ok: false; reason: LoadFailure | 'disabled' };

type Fetched = { ok: true; text: string } | { ok: false; reason: Exclude<LoadFailure, 'format'> };

/** `file` from the first of `bases` that answers; the last failure when none does. */
async function fetchFirst(bases: readonly string[], file: string, deps: Deps, fresh: boolean): Promise<Fetched | { ok: false; reason: 'format' }> {
  let failure: Fetched | undefined;
  for (const base of bases) {
    const url = fileUrl(base, file);
    if (!url) return { ok: false, reason: 'format' };
    const fetched = await deps.fetchText(url, { fresh });
    if (fetched.ok || fetched.reason === 'aborted') return fetched;
    failure = fetched;
  }
  return failure ?? { ok: false, reason: 'notFound' };
}

/** Where a kept list's topics come from: its commit's mirrors, or the branch it was read on. */
const filesFor = (base: string, rev: string | undefined) => {
  const github = rev ? gitHubSource(base) : undefined;
  return github && rev ? pinnedSource(github, rev) : [base];
};

/** The list kept on this computer, used when the source can't be reached. */
async function keptList(base: string, deps: Deps): Promise<ManifestResult | undefined> {
  const kept = await deps.cache.get(cacheKey(base, MANIFEST));
  const manifest = kept ? parseManifest(parseJson(kept.text)) : undefined;
  if (!kept || !manifest || 'error' in manifest || !manifest.enabled) return undefined;
  return { ok: true, manifest, offline: true, files: filesFor(base, kept.rev), ...(kept.rev ? { rev: kept.rev } : {}) };
}

/** A list just downloaded: checked, kept (with its commit), and what it no longer lists dropped. */
async function keepList(base: string, text: string, rev: string | undefined, deps: Deps): Promise<ManifestResult> {
  const manifest = parseManifest(parseJson(text));
  if ('error' in manifest) return { ok: false, reason: 'format' };
  if (!manifest.enabled) {
    await deps.cache.prune(base, new Set());
    return { ok: false, reason: 'disabled' };
  }
  const key = cacheKey(base, MANIFEST);
  await deps.cache.put(key, { text, ...(rev ? { rev } : {}), savedAt: deps.now() });
  // Topics no longer listed are dropped; a listed one is replaced when its fingerprint changes.
  await deps.cache.prune(base, new Set([key, ...manifest.topics.map((t) => cacheKey(base, t.file))]));
  return { ok: true, manifest, offline: false, files: filesFor(base, rev), ...(rev ? { rev } : {}) };
}

/**
 * The list. A GitHub repo that publishes `latest.json` (k-0447) is read at the commit it names
 * (`loadPublished`); any other source, or a repo without one, is read from its address as before:
 * fresh, and offline the copy kept from last time. A list (or `latest.json`) that says
 * `enabled: false` turns the bank off and drops every topic kept from that source (a takedown
 * reaches computers that had downloaded it, at their next opening).
 */
export async function loadManifest(base: string, deps: Deps): Promise<ManifestResult> {
  const github = gitHubSource(base);
  if (github) {
    const published = await loadPublished(base, github, deps);
    if (published) return published;
  }
  const fetched = await deps.fetchText(base + MANIFEST, { fresh: true });
  if (fetched.ok) return keepList(base, fetched.text, undefined, deps);
  if (fetched.reason === 'notFound' || fetched.reason === 'tooLarge' || fetched.reason === 'aborted') {
    return { ok: false, reason: fetched.reason };
  }
  return (await keptList(base, deps)) ?? { ok: false, reason: fetched.reason };
}

/**
 * The published list (k-0447). One request reaches GitHub at an opening: `latest.json`, fresh
 * (a revalidation, usually "unchanged"). When it names the commit whose list is kept, nothing
 * else is downloaded; a new commit's list comes once from jsDelivr (else GitHub at that commit).
 * GitHub unreachable (no connection, or it throttles this address): the kept list; with none
 * kept, jsDelivr's copy of `latest.json`. Undefined = this repo publishes no `latest.json` (or
 * one this build can't read): the caller reads the branch, as before.
 */
async function loadPublished(base: string, github: GitHubSource, deps: Deps): Promise<ManifestResult | undefined> {
  const [primary, mirror] = latestUrls(github);
  let fetched = await deps.fetchText(primary, { fresh: true });
  if (!fetched.ok) {
    if (fetched.reason === 'notFound') return undefined;
    if (fetched.reason === 'aborted') return { ok: false, reason: 'aborted' };
    // What is kept wins over jsDelivr's copy of the branch, which may be hours older.
    const kept = await keptList(base, deps);
    if (kept) return kept;
    const second = await deps.fetchText(mirror, { fresh: true });
    if (!second.ok) return second.reason === 'notFound' ? undefined : { ok: false, reason: fetched.reason };
    fetched = second;
  }
  const latest = parseLatest(parseJson(fetched.text));
  if (!latest) return undefined;
  if (!latest.enabled || !latest.commit) {
    await deps.cache.prune(base, new Set());
    return { ok: false, reason: 'disabled' };
  }
  const rev = latest.commit;
  const files = pinnedSource(github, rev);
  const kept = await deps.cache.get(cacheKey(base, MANIFEST));
  if (kept?.rev === rev) {
    const manifest = parseManifest(parseJson(kept.text));
    if (!('error' in manifest) && manifest.enabled) return { ok: true, manifest, offline: false, files, rev };
  }
  const list = await fetchFirst(files, MANIFEST, deps, false);
  if (list.ok) return keepList(base, list.text, rev, deps);
  if (list.reason === 'aborted' || list.reason === 'format') return { ok: false, reason: list.reason };
  return (await keptList(base, deps)) ?? { ok: false, reason: list.reason };
}

export type TopicResult = { ok: true; topic: TopicData; offline: boolean } | { ok: false; reason: LoadFailure };

/**
 * One topic: the kept copy when its fingerprint matches the list's (with no fingerprint listed:
 * when it was read at the list's commit), else a download from the first of `files` that
 * answers, kept when it matches. Kept under the bank's address and the file's name, never the
 * mirror's, so a publish re-downloads only changed topics. Offline, a kept copy of another
 * fingerprint is still shown rather than nothing.
 */
export async function loadTopic(
  base: string,
  entry: TopicEntry,
  deps: Deps,
  files: readonly string[] = [base],
  rev?: string,
): Promise<TopicResult> {
  if (!fileUrl(base, entry.file)) return { ok: false, reason: 'format' };
  const key = cacheKey(base, entry.file);
  const kept = await deps.cache.get(key);
  const read = (text: string) => parseTopic(parseJson(text), entry);
  if (kept && (entry.sha256 ? kept.sha256 === entry.sha256 : kept.rev === rev)) {
    const topic = read(kept.text);
    if (topic) return { ok: true, topic, offline: false };
  }
  const fetched = await fetchFirst(files, entry.file, deps, false);
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
    await deps.cache.put(key, { text: fetched.text, ...(sha ? { sha256: sha } : {}), ...(rev ? { rev } : {}), savedAt: deps.now() });
    deps.persist?.();
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
  /** Where the list's topics download from, in order (`ManifestResult.files`). */
  files?: readonly string[];
  /** The published commit of the list, when read through `latest.json`. */
  rev?: string;
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
    persist: options.deps?.persist ?? (options.deps ? undefined : keepDownloads),
  });
  const source = options.source ?? (() => sourceUrl(appSettings.read(PAST_PAPER_SETTINGS)));
  const pending = new Map<string, Promise<TopicState | undefined>>();

  return create<PastPaperState>((set, get) => {
    /** A new source (Settings changed) forgets everything read from the old one. */
    const sync = () => {
      const base = source();
      if (base !== get().base) {
        pending.clear();
        set({ base, status: base ? 'idle' : 'off', reason: undefined, offline: false, manifest: undefined, files: undefined, rev: undefined, topics: {} });
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
        if (result.ok) {
          // A list of another publish forgets the topics read for the old one.
          const fresh = force || result.rev !== get().rev;
          set({ status: 'ready', manifest: result.manifest, offline: result.offline, files: result.files, rev: result.rev, ...(fresh ? { topics: {} } : {}) });
        } else if (result.reason === 'disabled') set({ status: 'disabled', manifest: undefined, files: undefined, rev: undefined, topics: {} });
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
        const { files, rev } = get();
        const job = loadTopic(base, entry, deps(), files ?? [base], rev).then((result): TopicState | undefined => {
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
