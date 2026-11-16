import { beforeEach, describe, expect, it } from 'vitest';
import { choiceQuestion } from '@/library/testKit';
import { createParagraphBlock, createWorksheet } from '@/model/factories';
import { createStimulusElement } from '@/model/flow';
import { bi } from '@/model/text';
import type { LayoutElement, Question, Worksheet } from '@/model/types';
import type { WorksheetStore } from '@/storage';
import { useWorksheetStore } from '@/store/worksheetStore';
import { useBankSession } from '@/components/bank/bankSession';
import { copyIntoMyBank, insertIntoOpen } from './actions';
import { loadManifest, loadTopic, type Deps } from './bank';
import { createMemoryCache, cacheKey } from './cache';
import { fileUrl, PAST_PAPER_SETTINGS, sourceAddress, sourceUrl } from './config';
import { planCopies } from './copy';
import { liftStimulusLead, matchItem, parseManifest, parseTopic, sourceOf, type TopicEntry } from './pack';
import type { FetchResult } from './net';

/**
 * The Past paper bank (k-0443) on synthetic data: the real bank lives in its own public
 * repo and never in this one.
 */

type Stimulus = Extract<LayoutElement, { kind: 'stimulus' }>;

function pastQuestion(tag: string, en: string, zh = `${en}（中）`): Question {
  const q = choiceQuestion(en, zh, ['C.intervention', tag]);
  return {
    ...q,
    id: `kp-${tag.replaceAll('/', '_')}`,
    answerIndex: 1,
    provenance: bi(`Source ${tag}`, `出處 ${tag}`),
    lineage: { rootId: `kp:${tag}` },
  } as Question;
}

function stimulus(id: string, lead: [string, string] | undefined, body = 'A table of prices.'): Stimulus {
  const element = createStimulusElement();
  return {
    ...element,
    id,
    blocks: [...(lead ? [createParagraphBlock(bi(lead[0], lead[1]))] : []), createParagraphBlock(bi(body, '價格表。'))],
  };
}

/** A topic file: Q8 alone, then a stimulus serving Q2 and Q3 of CE1997, then a question of a type from the future. */
function topicFile(lead: [string, string] | undefined = ['Answer Questions 2 and 3 by referring to the following table:', '參閱下表，回答第 2 及 3 題：']) {
  const q8 = pastQuestion('CE2011/P2/Q8', 'Shortage occurs when a price ceiling is set.');
  const q2 = pastQuestion('CE1997/P2/Q2', 'Which good is scarce?');
  const q3 = pastQuestion('CE1997/P2/Q3', 'Then the queue shows that');
  const future = { ...pastQuestion('DSE2020/P1/Q1', 'Four diagrams'), type: 'diagramChoice', id: 'kp-future' } as unknown as Question;
  const stim = stimulus('kp-stim-CE1997_P2_Q2-3', lead);
  const doc: Worksheet = {
    ...createWorksheet(),
    id: 'kp-bank-intervention',
    kind: 'bank',
    questions: [q8, q2, q3, future],
    layout: [stim],
    flow: [
      { type: 'question', id: q8.id },
      { type: 'layout', id: stim.id },
      { type: 'question', id: q2.id },
      { type: 'question', id: q3.id },
      { type: 'question', id: future.id },
    ],
  };
  return { doc, q8, q2, q3, stim };
}

const ENTRY: TopicEntry = { id: 'intervention', title: { en: 'Intervention', zh: '干預' }, order: 1, file: 'topics/intervention.json' };

describe('config: the switch and the source', () => {
  const settings = (mode: 'builtIn' | 'off' | 'custom', url = '') => ({ mode, url });

  it('reads the built-in source, nothing when off, and a custom address with a trailing slash', () => {
    expect(sourceUrl(settings('builtIn'), 'https://example.org/bank')).toBe('https://example.org/bank/');
    expect(sourceUrl(settings('off'), 'https://example.org/bank/')).toBeUndefined();
    expect(sourceUrl(settings('custom', '/pastpaper-bank'), 'https://example.org/bank/')).toBe('/pastpaper-bank/');
    expect(sourceUrl(settings('custom', ''), 'https://example.org/bank/')).toBeUndefined();
  });

  it('an empty built-in source removes the feature, a stored custom address included', () => {
    expect(sourceUrl(settings('builtIn'), '')).toBeUndefined();
    expect(sourceUrl(settings('custom', 'https://mirror.example/'), '')).toBeUndefined();
  });

  it('accepts https, this computer over http, or a path here; nothing else', () => {
    expect(sourceAddress('https://raw.githubusercontent.com/x/y/main/')).toBeDefined();
    expect(sourceAddress('http://localhost:3000/pastpaper-bank/')).toBeDefined();
    expect(sourceAddress('/pastpaper-bank/')).toBeDefined();
    for (const bad of ['http://evil.example/', '//evil.example/', 'https://u:p@x.example/', 'https://x.example/?k=1', 'ftp://x/', 'not a url']) {
      expect(sourceAddress(bad)).toBeUndefined();
    }
    expect(PAST_PAPER_SETTINGS.defaults({ desktop: false })).toEqual({ mode: 'builtIn', url: '' });
  });

  it('never reads a file outside the source', () => {
    expect(fileUrl('https://a.example/b/', 'topics/x.json')).toBe('https://a.example/b/topics/x.json');
    for (const bad of ['../x.json', 'topics/../../x.json', '/etc/x', 'https://evil.example/x.json', 'topics\\x.json', '']) {
      expect(fileUrl('https://a.example/b/', bad)).toBeUndefined();
    }
  });
});

describe('pack: tolerant reading of the export', () => {
  it('reads a manifest, dropping malformed entries and keeping unknown fields out', () => {
    const manifest = parseManifest({
      format: 'kp-editor-pack',
      version: 1,
      enabled: true,
      somethingNew: 42,
      topics: [
        { id: 'b', title: { en: 'B', zh: '乙' }, syllabusOrder: 2, questions: 3, file: 'topics/b.json', sha256: 'A'.repeat(64) },
        { id: 'a', title: { en: 'A' }, syllabusOrder: 1, file: 'topics/a.json', extra: true },
        { id: 'a', file: 'topics/dupe.json' },
        { title: 'no id', file: 'x.json' },
        'junk',
      ],
    });
    if ('error' in manifest) throw new Error('should read');
    expect(manifest.topics.map((t) => t.id)).toEqual(['a', 'b']);
    expect(manifest.topics[0].title).toEqual({ en: 'A', zh: 'A' });
    expect(manifest.topics[1].sha256).toBe('a'.repeat(64));
    expect(manifest.questions).toBe(3);
  });

  it('refuses another format, and reads enabled: false as off', () => {
    expect(parseManifest({ format: 'something-else', topics: [] })).toEqual({ error: 'format' });
    expect(parseManifest(null)).toEqual({ error: 'format' });
    const off = parseManifest({ topics: [], enabled: false });
    expect('error' in off ? undefined : off.enabled).toBe(false);
  });

  it('reads the source off the tag', () => {
    expect(sourceOf({ tags: ['C.x', 'CE2011/P2/Q8'] })).toMatchObject({ exam: 'HKCEE', year: 2011, paper: 2, number: 8 });
    expect(sourceOf({ tags: ['AL2004/P1/Q20'] })).toMatchObject({ exam: 'HKALE', year: 2004 });
    expect(sourceOf({ tags: ['DSESP/P1/Q4'] })).toMatchObject({ exam: 'HKDSE', special: 'SP', number: 4 });
    expect(sourceOf({ tags: ['C.x'] })).toEqual({ exam: 'other', tag: '' });
  });

  it('opens a topic with the editor loader: questions in order, a future type left out and counted, the stimulus on its questions', () => {
    const { doc, q2, q3, q8 } = topicFile();
    const topic = parseTopic(JSON.parse(JSON.stringify(doc)), ENTRY)!;
    expect(topic.items.map((i) => i.question.id)).toEqual([q8.id, q2.id, q3.id]);
    expect(topic.skipped).toBe(1);
    expect(topic.items[0].stimulus).toBeUndefined();
    expect(topic.items[1].stimulus?.id).toBe('kp-stim-CE1997_P2_Q2-3');
    expect(topic.items[2].stimulus?.id).toBe('kp-stim-CE1997_P2_Q2-3');
    expect(topic.items[0].provenance).toEqual({ en: 'Source CE2011/P2/Q8', zh: '出處 CE2011/P2/Q8' });
    expect(topic.items[1].searchText).toContain('a table of prices');
  });

  it('is not a document: undefined, never a throw', () => {
    expect(parseTopic('nonsense', ENTRY)).toBeUndefined();
    expect(parseTopic({ schemaVersion: 0 }, ENTRY)).toBeUndefined();
  });

  it('lifts a lead sentence naming the following questions into the stimulus wording, word for word', () => {
    const { doc } = topicFile();
    const lifted = parseTopic(doc, ENTRY)!.items[1].stimulus!;
    expect(lifted.prefix).toEqual({ en: [{ text: 'Answer ' }], zh: [{ text: '參閱下表，回答' }] });
    expect(lifted.suffix).toEqual({ en: [{ text: ' by referring to the following table:' }], zh: [{ text: '：' }] });
    expect(lifted.span).toBe(2);
    expect(lifted.blocks).toHaveLength(1);
  });

  it('leaves a stimulus alone when its sentence names other numbers, one language only, or formatting', () => {
    const following = [sourceOf({ tags: ['CE1997/P2/Q2'] }), sourceOf({ tags: ['CE1997/P2/Q3'] })];
    const wrong = stimulus('s', ['Answer Questions 5 and 6 by referring to it:', '參閱下表，回答第 5 及 6 題：']);
    expect(liftStimulusLead(wrong, following)).toBe(wrong);
    const oneSide = stimulus('s', ['Answer Questions 2 and 3 by referring to it:', '下表顯示物品 M 的市場。']);
    expect(liftStimulusLead(oneSide, following)).toBe(oneSide);
    const bold = stimulus('s', ['x', 'y']);
    (bold.blocks[0] as { text: unknown }).text = { en: [{ text: 'Answer Questions 2 and 3:', bold: true }], zh: [{ text: '回答第 2 及 3 題：' }] };
    expect(liftStimulusLead(bold, following)).toBe(bold);
    const none = stimulus('s', undefined);
    expect(liftStimulusLead(none, following)).toBe(none);
  });

  it('filters by words, exam and years', () => {
    const items = parseTopic(topicFile().doc, ENTRY)!.items;
    expect(items.filter((i) => matchItem(i, { words: 'shortage' })).length).toBe(1);
    expect(items.filter((i) => matchItem(i, { words: 'ce1997' })).length).toBe(2);
    expect(items.filter((i) => matchItem(i, { exams: ['HKDSE'] })).length).toBe(0);
    expect(items.filter((i) => matchItem(i, { from: 2000 })).length).toBe(1);
  });
});

describe('bank: on demand, cached, switchable', () => {
  const BASE = 'https://bank.example/';
  const manifest = (extra: object = {}) => JSON.stringify({ format: 'kp-editor-pack', topics: [{ ...ENTRY, ...extra }], ...extra });
  function deps(files: Record<string, FetchResult>, cache = createMemoryCache()): Deps & { asked: string[] } {
    const asked: string[] = [];
    return {
      asked,
      cache,
      fetchText: async (url) => {
        asked.push(url);
        return files[url] ?? { ok: false, reason: 'notFound' };
      },
      sha256: async (text) => `sha-of-${text.length}`.padEnd(64, '0').replace(/[^0-9a-f]/g, '0'),
      now: () => '2026-11-16T00:00:00.000Z',
    };
  }

  it('reads the list fresh, keeps it, and uses the kept one offline', async () => {
    const d = deps({ [`${BASE}manifest.json`]: { ok: true, text: manifest() } });
    const first = await loadManifest(BASE, d);
    expect(first).toMatchObject({ ok: true, offline: false });
    const offline = deps({ [`${BASE}manifest.json`]: { ok: false, reason: 'offline' } }, d.cache);
    expect(await loadManifest(BASE, offline)).toMatchObject({ ok: true, offline: true });
  });

  it('a list that says enabled: false turns the bank off and drops what was kept', async () => {
    const cache = createMemoryCache();
    await cache.put(cacheKey(BASE, ENTRY.file), { text: '{}', savedAt: 'x' });
    const d = deps({ [`${BASE}manifest.json`]: { ok: true, text: JSON.stringify({ topics: [], enabled: false }) } }, cache);
    expect(await loadManifest(BASE, d)).toEqual({ ok: false, reason: 'disabled' });
    expect((await cache.usage()).files).toBe(0);
  });

  it('downloads a topic once, then reads it from the cache while its fingerprint matches', async () => {
    const text = JSON.stringify(topicFile().doc);
    const d = deps({ [`${BASE}${ENTRY.file}`]: { ok: true, text } });
    const sha = await d.sha256(text);
    const entry = { ...ENTRY, sha256: sha };
    expect(await loadTopic(BASE, entry, d)).toMatchObject({ ok: true, offline: false });
    expect(await loadTopic(BASE, entry, d)).toMatchObject({ ok: true });
    expect(d.asked).toHaveLength(1);
    // A new fingerprint in the list: downloaded again.
    await loadTopic(BASE, { ...entry, sha256: 'f'.repeat(64) }, d);
    expect(d.asked).toHaveLength(2);
  });

  it('a download that does not match the list is shown but not kept; offline, an old copy still shows', async () => {
    const text = JSON.stringify(topicFile().doc);
    const d = deps({ [`${BASE}${ENTRY.file}`]: { ok: true, text } });
    const entry = { ...ENTRY, sha256: 'e'.repeat(64) };
    expect(await loadTopic(BASE, entry, d)).toMatchObject({ ok: true });
    expect((await d.cache.usage()).files).toBe(0);
    await d.cache.put(cacheKey(BASE, ENTRY.file), { text, sha256: 'old', savedAt: 'x' });
    const offline = deps({ [`${BASE}${ENTRY.file}`]: { ok: false, reason: 'offline' } }, d.cache);
    expect(await loadTopic(BASE, entry, offline)).toMatchObject({ ok: true, offline: true });
  });

  it('a file that is not a topic is an error, not a crash', async () => {
    const d = deps({ [`${BASE}${ENTRY.file}`]: { ok: true, text: 'not json' } });
    expect(await loadTopic(BASE, ENTRY, d)).toEqual({ ok: false, reason: 'format' });
  });
});

describe('copies: a stimulus travels with its questions', () => {
  it('groups picks under their stimulus in paper order, once, with the span they fill', () => {
    const items = parseTopic(topicFile().doc, ENTRY)!.items;
    const [q8, q2, q3] = items;
    const plan = planCopies([q3, q8, q2, q3]);
    expect(plan.questions.map((q) => q.id)).toEqual([q2.question.id, q3.question.id, q8.question.id]);
    expect(plan.leads.map((l) => l?.span)).toEqual([2, undefined, undefined]);
    expect(plan.leads[0]?.id).not.toBe(q2.stimulus!.id);
    expect(plan.repeats).toBe(1);
    const alone = planCopies([q3]);
    expect(alone.leads[0]?.span).toBe(1);
  });

  it('skips questions the paper holds (by root)', () => {
    const items = parseTopic(topicFile().doc, ENTRY)!.items;
    const plan = planCopies(items, new Set(['kp:CE2011/P2/Q8']));
    expect(plan.questions).toHaveLength(2);
  });
});

describe('into the open paper and into my bank', () => {
  beforeEach(() => {
    useWorksheetStore.getState().replaceWorksheet(createWorksheet());
    useBankSession.setState({ review: null });
  });

  it('inserts copies with the stimulus before them in one commit; one undo takes all out; a second insert skips what is there', () => {
    const items = parseTopic(topicFile().doc, ENTRY)!.items;
    const before = useWorksheetStore.getState().worksheet;
    const done = insertIntoOpen([items[1], items[2]], (n, skipped) => `${n}/${skipped}`);
    expect(done.inserted).toHaveLength(2);
    const after = useWorksheetStore.getState().worksheet;
    const stim = after.layout.find((e) => e.kind === 'stimulus') as Stimulus;
    expect(stim.span).toBe(2);
    const flow = after.flow.map((f) => f.id);
    expect(flow.indexOf(stim.id)).toBe(flow.indexOf(done.inserted[0]) - 1);
    expect(after.questions.find((q) => q.id === done.inserted[0])?.lineage).toMatchObject({ rootId: 'kp:CE1997/P2/Q2', fromDocId: 'kp-bank-intervention' });
    expect(useBankSession.getState().review?.summary).toBe('2/0');

    const again = insertIntoOpen(items, (n, skipped) => `${n}/${skipped}`);
    expect(again).toMatchObject({ skipped: 2 });
    expect(again.inserted).toHaveLength(1);

    useWorksheetStore.getState().undo();
    useWorksheetStore.getState().undo();
    expect(useWorksheetStore.getState().worksheet.questions).toEqual(before.questions);
    expect(useWorksheetStore.getState().worksheet.layout).toEqual(before.layout);
  });

  it('copies into the one bank, making it once, never twice the same question', async () => {
    const map = new Map<string, Worksheet>();
    const store = {
      list: async () => [...map.values()].map((d) => ({ id: d.id, title: 'Bank', updatedAt: d.updatedAt, kind: d.kind })),
      load: async (id: string) => structuredClone(map.get(id)),
      save: async (w: Worksheet) => void map.set(w.id, structuredClone(w)),
    } as unknown as WorksheetStore;
    const items = parseTopic(topicFile().doc, ENTRY)!.items;
    const other = parseTopic({ ...topicFile().doc, id: 'kp-bank-other' }, { ...ENTRY, id: 'other' })!.items;
    const first = await copyIntoMyBank([items[0], items[1]], { store });
    expect(first).toEqual({ copied: 2, already: 0, withoutStimulus: 1 });
    expect(map.size).toBe(1);
    const second = await copyIntoMyBank([other[0], items[2]], { store });
    expect(second).toMatchObject({ copied: 1, already: 1 });
    expect(map.size).toBe(1);
    expect([...map.values()][0].questions).toHaveLength(3);
  });
});
