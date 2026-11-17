import { describe, expect, it } from 'vitest';
import { choiceQuestion } from '@/library/testKit';
import { createWorksheet } from '@/model/factories';
import { bi } from '@/model/text';
import type { Question, Worksheet } from '@/model/types';
import { createPastPaperBank, loadManifest, loadTopic, parseLatest, type Deps } from './bank';
import { cacheKey, createMemoryCache, type PastPaperCache } from './cache';
import { BUILT_IN_SOURCE, gitHubSource, isCommit, latestUrls, pinnedSource } from './config';
import type { FetchResult } from './net';

/**
 * The bank's caching through `latest.json` (k-0447): the list and topics of the commit it names,
 * from jsDelivr first, GitHub raw at that commit as the fallback; topics kept by name and checked
 * by fingerprint; a repo without `latest.json` read from its branch, as before. Synthetic data:
 * the real bank lives in its own public repo.
 */

const BASE = 'https://raw.githubusercontent.com/owner/bank/main/';
const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const CDN = (commit: string) => `https://cdn.jsdelivr.net/gh/owner/bank@${commit}/`;
const RAW = (commit: string) => `https://raw.githubusercontent.com/owner/bank/${commit}/`;
const LATEST = `${BASE}latest.json`;
const CDN_LATEST = 'https://cdn.jsdelivr.net/gh/owner/bank@main/latest.json';

function topicText(id: string, words: string): string {
  const q = { ...choiceQuestion(words, `${words}（中）`, ['C.intervention', `CE2011/P2/Q${id.length}`]), id: `pp-${id}`, provenance: bi('Source', '出處'), lineage: { rootId: `pp:${id}` } } as Question;
  const doc: Worksheet = { ...createWorksheet(), id: `pp-bank-${id}`, kind: 'bank', questions: [q], flow: [{ type: 'question', id: q.id }] };
  return JSON.stringify(doc);
}

const sha = (text: string) => [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(16).padStart(64, '0');

const TOPICS = { gdp: topicText('gdp', 'GDP measures output.'), tax: topicText('tax', 'A tax shifts supply.') };
const manifestOf = (topics: Record<string, string>, extra: object = {}) =>
  JSON.stringify({
    ...extra,
    topics: Object.entries(topics).map(([id, text], i) => ({ id, title: { en: id, zh: id }, syllabusOrder: i + 1, file: `topics/${id}.json`, sha256: sha(text) })),
  });
const latest = (commit: string, extra: object = {}) => JSON.stringify({ version: 1, commit, enabled: true, published: '2026-11-20', ...extra });

/** A publish of `topics` at `commit`, on both mirrors. */
const publish = (commit: string, topics: Record<string, string>): Record<string, FetchResult> => {
  const files: Record<string, FetchResult> = {};
  for (const base of [CDN(commit), RAW(commit)]) {
    files[`${base}manifest.json`] = { ok: true, text: manifestOf(topics) };
    for (const [id, text] of Object.entries(topics)) files[`${base}topics/${id}.json`] = { ok: true, text };
  }
  return files;
};

function world(files: Record<string, FetchResult>, cache: PastPaperCache = createMemoryCache(), down: (url: string) => FetchResult | undefined = () => undefined) {
  const asked: string[] = [];
  const deps: Deps = {
    cache,
    fetchText: async (url) => {
      asked.push(url);
      return down(url) ?? files[url] ?? { ok: false, reason: 'notFound' };
    },
    sha256: async (text) => sha(text),
    now: () => '2026-11-17T00:00:00.000Z',
  };
  return { deps, asked, cache };
}

const entry = (topics: Record<string, string>, id: string) => {
  const list = JSON.parse(manifestOf(topics)) as { topics: { id: string; file: string; sha256: string }[] };
  const found = list.topics.find((t) => t.id === id)!;
  return { id, title: { en: id, zh: id }, order: 1, file: found.file, sha256: found.sha256 };
};

describe('k-0447 addresses', () => {
  it('knows the built-in repo and its two mirrors at a commit', () => {
    expect(gitHubSource(BUILT_IN_SOURCE)).toEqual({ repo: 'dinomartino/dse-econ-question-bank', branch: 'main' });
    expect(gitHubSource('https://bank.example/')).toBeUndefined();
    expect(gitHubSource('https://raw.githubusercontent.com/owner/bank/main/sub/')).toBeUndefined();
    expect(pinnedSource({ repo: 'owner/bank', branch: 'main' }, A)).toEqual([CDN(A), RAW(A)]);
    expect(latestUrls({ repo: 'owner/bank', branch: 'main' })).toEqual([LATEST, CDN_LATEST]);
    expect(isCommit(A)).toBe(true);
    expect(isCommit('abc1234')).toBe(false);
  });

  it('reads latest.json: version 1 and a full commit, or the off switch whatever else it says', () => {
    expect(parseLatest(JSON.parse(latest(A)))).toEqual({ commit: A, enabled: true, published: '2026-11-20' });
    expect(parseLatest({ commit: A })).toEqual({ commit: A, enabled: true });
    expect(parseLatest({ enabled: false })).toEqual({ enabled: false });
    expect(parseLatest({ version: 2, enabled: false })).toEqual({ enabled: false });
    expect(parseLatest({ version: 2, commit: A })).toBeUndefined();
    expect(parseLatest({ commit: 'main' })).toBeUndefined();
    expect(parseLatest([A])).toBeUndefined();
    expect(parseLatest(undefined)).toBeUndefined();
  });
});

describe('k-0447 caching through latest.json', () => {
  it('first visit: latest.json from GitHub, the list and topic from jsDelivr at that commit', async () => {
    const w = world({ [LATEST]: { ok: true, text: latest(A) }, ...publish(A, TOPICS) });
    const list = await loadManifest(BASE, w.deps);
    expect(list).toMatchObject({ ok: true, offline: false, rev: A, files: [CDN(A), RAW(A)] });
    if (!list.ok) return;
    expect(await loadTopic(BASE, entry(TOPICS, 'gdp'), w.deps, list.files, list.rev)).toMatchObject({ ok: true, offline: false });
    expect(w.asked).toEqual([LATEST, `${CDN(A)}manifest.json`, `${CDN(A)}topics/gdp.json`]);
    // Kept under the bank's own address, not the commit's.
    expect(await w.cache.get(cacheKey(BASE, 'topics/gdp.json'))).toMatchObject({ sha256: sha(TOPICS.gdp), rev: A });
    expect(await w.cache.get(cacheKey(BASE, 'manifest.json'))).toMatchObject({ rev: A });
  });

  it('second visit: only latest.json is asked for; the list and topic come from this computer', async () => {
    const first = world({ [LATEST]: { ok: true, text: latest(A) }, ...publish(A, TOPICS) });
    const one = await loadManifest(BASE, first.deps);
    if (!one.ok) throw new Error('first visit failed');
    await loadTopic(BASE, entry(TOPICS, 'gdp'), first.deps, one.files, one.rev);

    const again = world({ [LATEST]: { ok: true, text: latest(A) } }, first.cache);
    const two = await loadManifest(BASE, again.deps);
    expect(two).toMatchObject({ ok: true, offline: false, rev: A });
    if (!two.ok) return;
    expect(await loadTopic(BASE, entry(TOPICS, 'gdp'), again.deps, two.files, two.rev)).toMatchObject({ ok: true, offline: false });
    expect(again.asked).toEqual([LATEST]);
  });

  it('a publish that changed one topic downloads the new list and that topic only', async () => {
    const first = world({ [LATEST]: { ok: true, text: latest(A) }, ...publish(A, TOPICS) });
    const one = await loadManifest(BASE, first.deps);
    if (!one.ok) throw new Error('first visit failed');
    for (const id of ['gdp', 'tax']) await loadTopic(BASE, entry(TOPICS, id), first.deps, one.files, one.rev);

    const changed = { ...TOPICS, tax: topicText('tax', 'A tax shifts supply to the left.') };
    const after = world({ [LATEST]: { ok: true, text: latest(B) }, ...publish(B, changed) }, first.cache);
    const two = await loadManifest(BASE, after.deps);
    expect(two).toMatchObject({ ok: true, rev: B });
    if (!two.ok) return;
    for (const id of ['gdp', 'tax']) {
      expect(await loadTopic(BASE, entry(changed, id), after.deps, two.files, two.rev)).toMatchObject({ ok: true, offline: false });
    }
    expect(after.asked).toEqual([LATEST, `${CDN(B)}manifest.json`, `${CDN(B)}topics/tax.json`]);
    expect((await after.cache.usage()).files).toBe(3);
  });

  it('jsDelivr down: the same commit from GitHub raw', async () => {
    const w = world({ [LATEST]: { ok: true, text: latest(A) }, ...publish(A, TOPICS) }, undefined, (url) =>
      url.startsWith('https://cdn.jsdelivr.net/') ? { ok: false, reason: 'offline' } : undefined,
    );
    const list = await loadManifest(BASE, w.deps);
    expect(list).toMatchObject({ ok: true, offline: false, rev: A });
    if (!list.ok) return;
    expect(await loadTopic(BASE, entry(TOPICS, 'tax'), w.deps, list.files, list.rev)).toMatchObject({ ok: true, offline: false });
    expect(w.asked).toEqual([LATEST, `${CDN(A)}manifest.json`, `${RAW(A)}manifest.json`, `${CDN(A)}topics/tax.json`, `${RAW(A)}topics/tax.json`]);
  });

  it('GitHub unreachable: the kept list (no jsDelivr call); with nothing kept, jsDelivr\'s latest.json', async () => {
    const first = world({ [LATEST]: { ok: true, text: latest(A) }, ...publish(A, TOPICS) });
    await loadManifest(BASE, first.deps);
    const throttled = (url: string): FetchResult | undefined => (url.startsWith('https://raw.') ? { ok: false, reason: 'http' } : undefined);

    const kept = world({ ...publish(A, TOPICS) }, first.cache, throttled);
    expect(await loadManifest(BASE, kept.deps)).toMatchObject({ ok: true, offline: true, rev: A, files: [CDN(A), RAW(A)] });
    expect(kept.asked).toEqual([LATEST]);

    const fresh = world({ [CDN_LATEST]: { ok: true, text: latest(A) }, ...publish(A, TOPICS) }, undefined, throttled);
    expect(await loadManifest(BASE, fresh.deps)).toMatchObject({ ok: true, offline: false, rev: A });
    expect(fresh.asked).toEqual([LATEST, CDN_LATEST, `${CDN(A)}manifest.json`]);
  });

  it('no connection at all: the kept list and every topic opened before', async () => {
    const first = world({ [LATEST]: { ok: true, text: latest(A) }, ...publish(A, TOPICS) });
    const one = await loadManifest(BASE, first.deps);
    if (!one.ok) throw new Error('first visit failed');
    await loadTopic(BASE, entry(TOPICS, 'gdp'), first.deps, one.files, one.rev);

    const offline = world({}, first.cache, () => ({ ok: false, reason: 'offline' }));
    const list = await loadManifest(BASE, offline.deps);
    expect(list).toMatchObject({ ok: true, offline: true });
    if (!list.ok) return;
    expect(await loadTopic(BASE, entry(TOPICS, 'gdp'), offline.deps, list.files, list.rev)).toMatchObject({ ok: true });
    expect(await loadTopic(BASE, entry(TOPICS, 'tax'), offline.deps, list.files, list.rev)).toEqual({ ok: false, reason: 'offline' });
  });

  it('latest.json with enabled: false turns the bank off and drops what was kept', async () => {
    const first = world({ [LATEST]: { ok: true, text: latest(A) }, ...publish(A, TOPICS) });
    await loadManifest(BASE, first.deps);
    const off = world({ [LATEST]: { ok: true, text: JSON.stringify({ version: 1, enabled: false }) } }, first.cache);
    expect(await loadManifest(BASE, off.deps)).toEqual({ ok: false, reason: 'disabled' });
    expect((await off.cache.usage()).files).toBe(0);
  });

  it('a repo without latest.json (today\'s published bank) is read from its branch, as before', async () => {
    const w = world({ [`${BASE}manifest.json`]: { ok: true, text: manifestOf(TOPICS) }, [`${BASE}topics/gdp.json`]: { ok: true, text: TOPICS.gdp } });
    const list = await loadManifest(BASE, w.deps);
    expect(list).toMatchObject({ ok: true, offline: false, files: [BASE] });
    if (!list.ok) return;
    expect(list.rev).toBeUndefined();
    expect(await loadTopic(BASE, entry(TOPICS, 'gdp'), w.deps, list.files, list.rev)).toMatchObject({ ok: true });
    expect(w.asked).toEqual([LATEST, `${BASE}manifest.json`, `${BASE}topics/gdp.json`]);
  });

  it('topics kept from the branch stay valid once latest.json appears: only the list downloads', async () => {
    const before = world({ [`${BASE}manifest.json`]: { ok: true, text: manifestOf(TOPICS) }, [`${BASE}topics/gdp.json`]: { ok: true, text: TOPICS.gdp } });
    const old = await loadManifest(BASE, before.deps);
    if (!old.ok) throw new Error('branch read failed');
    await loadTopic(BASE, entry(TOPICS, 'gdp'), before.deps, old.files, old.rev);

    const after = world({ [LATEST]: { ok: true, text: latest(A) }, ...publish(A, TOPICS) }, before.cache);
    const list = await loadManifest(BASE, after.deps);
    if (!list.ok) throw new Error('published read failed');
    expect(await loadTopic(BASE, entry(TOPICS, 'gdp'), after.deps, list.files, list.rev)).toMatchObject({ ok: true, offline: false });
    expect(after.asked).toEqual([LATEST, `${CDN(A)}manifest.json`]);
  });

  it('a latest.json this build cannot read falls back to the branch', async () => {
    const w = world({ [LATEST]: { ok: true, text: JSON.stringify({ version: 2, commit: A }) }, [`${BASE}manifest.json`]: { ok: true, text: manifestOf(TOPICS) } });
    expect(await loadManifest(BASE, w.deps)).toMatchObject({ ok: true, files: [BASE] });
  });

  it('a topic the list names without a fingerprint is kept per commit', async () => {
    const bare = { id: 'gdp', title: { en: 'gdp', zh: 'gdp' }, order: 1, file: 'topics/gdp.json' };
    const w = world({ ...publish(A, TOPICS), ...publish(B, TOPICS) });
    await loadTopic(BASE, bare, w.deps, [CDN(A)], A);
    await loadTopic(BASE, bare, w.deps, [CDN(A)], A);
    await loadTopic(BASE, bare, w.deps, [CDN(B)], B);
    expect(w.asked).toEqual([`${CDN(A)}topics/gdp.json`, `${CDN(B)}topics/gdp.json`]);
  });

  it('a plain address (another source) never asks for latest.json', async () => {
    const plain = 'https://bank.example/';
    const w = world({ [`${plain}manifest.json`]: { ok: true, text: manifestOf(TOPICS) } });
    expect(await loadManifest(plain, w.deps)).toMatchObject({ ok: true, files: [plain] });
    expect(w.asked).toEqual([`${plain}manifest.json`]);
  });

  it('the bank store downloads topics from the list\'s commit and asks to keep them once stored', async () => {
    let persisted = 0;
    const w = world({ [LATEST]: { ok: true, text: latest(A) }, ...publish(A, TOPICS) });
    const bank = createPastPaperBank({ source: () => BASE, deps: { ...w.deps, persist: () => void (persisted += 1) } });
    await bank.getState().open();
    expect(bank.getState()).toMatchObject({ status: 'ready', rev: A });
    await bank.getState().topic('tax');
    expect(bank.getState().topics.tax).toMatchObject({ state: 'ready', offline: false });
    expect(w.asked).toEqual([LATEST, `${CDN(A)}manifest.json`, `${CDN(A)}topics/tax.json`]);
    expect(persisted).toBe(1);
  });
});
