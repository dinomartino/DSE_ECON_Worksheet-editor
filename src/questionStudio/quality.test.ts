import { describe, expect, it } from 'vitest';
import { presetFor } from '@/ai/providers';
import { rt } from '@/model/text';
import type { McqQuestion } from '@/model/types';
import { sourceOf, type PastPaperItem, type SearchRow, type TopicEntry } from '@/pastpapers/pack';
import { scriptedClient } from '@/translate/testKit';
import { briefPayload, makeBrief, normalizeRequest, referenceMode, sentSummary, type Brief } from './brief';
import { EXAMPLE, INVENTED, REQUEST, solver, writeReply } from './fixtures';
import { countOf, keyPointCounts, keyPointsOfCode } from './frequency';
import { buildCorpusIndex, checkNearCopy, EMPTY_CORPUS } from './nearCopy';
import { STUDIO_SYSTEM_PROMPT } from './prompt';
import { chooseReferenceRows, findReferences, isCombinationRow, referenceOf, referencesWanted, rowWeight, type ReferenceBank } from './references';
import { writeDrafts } from './run';
import { createStudioSession, withReferences, type StudioEnv } from './session';
import { corpusDocOfSource } from './source';
import { MAX_AUTO_EXAMPLES, MAX_EXAMPLES, type SourceQuestion, type StudioDeps, type StudioRequest } from './types';

const seeded = (seed = 7) => {
  let n = seed;
  return () => {
    n = (n * 9301 + 49297) % 233280;
    return n / 233280;
  };
};
const [A, B, C] = INVENTED;
const auto = (id: string): SourceQuestion => ({ ...EXAMPLE, id, auto: true });

describe('how a request uses its examples', () => {
  it('none, a style reference, or close to each on purpose (picked examples only)', () => {
    expect(referenceMode(REQUEST)).toBe('none');
    expect(referenceMode({ examples: [EXAMPLE] })).toBe('style');
    expect(referenceMode({ examples: [EXAMPLE], strict: false })).toBe('style');
    expect(referenceMode({ examples: [EXAMPLE], strict: true })).toBe('pattern');
    expect(referenceMode({ examples: [auto('a'), auto('b')], strict: true })).toBe('style');
  });

  it('lets the studio add five references of its own, and the teacher pick three', () => {
    const picked = normalizeRequest({ ...REQUEST, examples: [EXAMPLE, EXAMPLE, EXAMPLE, EXAMPLE, EXAMPLE] });
    expect(picked.examples).toHaveLength(MAX_EXAMPLES);
    const made = normalizeRequest({ ...REQUEST, examples: ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(auto) });
    expect(made.examples).toHaveLength(MAX_AUTO_EXAMPLES);
  });

  it('tells the model which, in the payload, and says so in the lines the form lists', () => {
    const brief = (request: StudioRequest) => makeBrief(request, seeded()) as Brief;
    const payloadOf = (request: StudioRequest) => briefPayload(brief(request), null, false) as { make: Record<string, unknown> };
    expect(payloadOf(REQUEST).make.reference).toBeUndefined();
    expect(payloadOf({ ...REQUEST, examples: [EXAMPLE], strict: true }).make.reference).toBe('pattern');
    expect(payloadOf({ ...REQUEST, examples: [auto('a')], strict: true }).make.reference).toBe('style');
    expect(sentSummary({ ...REQUEST, examples: [EXAMPLE], strict: true })).toMatchObject({ examples: 1, reference: 'pattern' });
    expect(sentSummary(REQUEST)).toMatchObject({ examples: 0, reference: 'none' });
  });

  it('the prompt has both modes, and still bars copying in the style one', () => {
    expect(STUDIO_SYSTEM_PROMPT).toContain('"make.reference"');
    expect(STUDIO_SYSTEM_PROMPT).toMatch(/"style":.*never reuse a sentence, an option or a number/);
    expect(STUDIO_SYSTEM_PROMPT).toMatch(/"pattern":.*question n follows example n/);
  });
});

describe('strict mode and the near-copy check', () => {
  const copy = { ...A, stem: EXAMPLE.stem, options: EXAMPLE.options, statements: [], answer: 1 };
  const deps = (corpus = EMPTY_CORPUS): { client: ReturnType<typeof scriptedClient>; deps: StudioDeps } => {
    const client = scriptedClient([writeReply([copy, B, C]), solver()]);
    return { client, deps: { client, preset: presetFor('gemini'), glossary: null, corpus, random: seeded() } };
  };
  const hooks = { signal: new AbortController().signal };
  const copyRow = async (request: StudioRequest, corpus = EMPTY_CORPUS) => {
    const out = await writeDrafts(request, deps(corpus).deps, hooks);
    if (!out.ok) throw new Error('not ok');
    return { out, row: out.drafts[0].checks.find((c) => c.id === 'copy')! };
  };

  it('a draft that repeats its picked reference passes, and is told it is close on purpose', async () => {
    const { out, row } = await copyRow({ ...REQUEST, examples: [EXAMPLE], strict: true });
    expect(row.state).toBe('pass');
    expect(row.findings).toEqual([{ id: 'copy.reference', params: { percent: expect.any(Number) } }]);
    expect(out.drafts[0].attempt).toBe(1);
    expect(out.drafts[0].status).not.toBe('failed');
  });

  it('unlimited also where the bank holds the same question: it is left out by its id, or by its words', async () => {
    const words = { en: [EXAMPLE.stem.en, ...EXAMPLE.options.map((o) => o.en)].join(' '), zh: [EXAMPLE.stem.zh, ...EXAMPLE.options.map((o) => o.zh)].join(' ') };
    const byId = buildCorpusIndex([{ id: 'BANK/ex1', kind: 'bank', en: `${words.en} as the bank prints it, a little differently`, zh: '' }]);
    expect((await copyRow({ ...REQUEST, examples: [EXAMPLE], strict: true }, byId)).row.state).toBe('pass');
    const byWords = buildCorpusIndex([{ id: 'DSE2099/P1/Q99', kind: 'bank', ...words }]);
    expect((await copyRow({ ...REQUEST, examples: [EXAMPLE], strict: true }, byWords)).row.state).toBe('pass');
    const mine = buildCorpusIndex([{ id: 'docA/q7', kind: 'mine', en: words.en, zh: '' }]);
    expect((await copyRow({ ...REQUEST, examples: [{ ...EXAMPLE, id: 'mine:docA/q7' }], strict: true }, mine)).row.state).toBe('pass');
  });

  it('is still held to the rest of the bank', async () => {
    const other = buildCorpusIndex([{ id: 'other', kind: 'bank', en: [EXAMPLE.stem.en, ...EXAMPLE.options.map((o) => o.en)].join(' '), zh: '' }]);
    // The reference is a different question, so the same words in the bank count against the draft.
    const reference: SourceQuestion = { ...EXAMPLE, stem: { en: 'A completely different stem about wheat farmers and rain', zh: '' }, options: [{ en: 'a', zh: '' }, { en: 'b', zh: '' }, { en: 'c', zh: '' }, { en: 'd', zh: '' }] };
    const { row } = await copyRow({ ...REQUEST, examples: [reference], strict: true }, other);
    expect(row.state).toBe('fail');
  });

  it('a style reference, picked without strict, keeps the limit; an automatic one never gets the exemption', async () => {
    expect((await copyRow({ ...REQUEST, examples: [EXAMPLE], strict: false })).row.state).toBe('fail');
    expect((await copyRow({ ...REQUEST, examples: [{ ...EXAMPLE, auto: true }], strict: true })).row.state).toBe('fail');
  });

  it('leaves a named question out of the comparison, by its words, wherever it sits', () => {
    const text = { en: [EXAMPLE.stem.en, ...EXAMPLE.options.map((o) => o.en)].join(' '), zh: '' };
    const doc = corpusDocOfSource(EXAMPLE);
    const base = buildCorpusIndex([{ ...doc, id: 'elsewhere', kind: 'bank' }]);
    expect(checkNearCopy(text, base).tooClose).toBe(true);
    expect(checkNearCopy(text, base, [], [doc]).tooClose).toBe(false);
  });
});

// ---- the bank, as data ----

const topic = (id: string, syllabus: string[]): TopicEntry => ({ id, title: { en: id, zh: id }, order: 1, file: `topics/${id}.json`, syllabus });
const row = (topicId: string, tag: string, over: Partial<SearchRow> = {}): SearchRow => ({ topicId, source: sourceOf({ tags: [tag] }), en: 'Which of the following is correct?', zh: '以下哪項正確？', pictures: 0, searchText: tag, ...over });
const TOPICS = [topic('elasticity', ['C.ped', 'C.pes']), topic('tax', ['C.intervention']), topic('adas', ['G']), topic('misc', [])];

describe('how often HKDSE asks each key point', () => {
  it('counts HKDSE questions only, shares a topic among its key points, and spreads a whole topic code', () => {
    const rows = [
      row('elasticity', 'DSE2019/P1/Q1'),
      row('elasticity', 'DSE2020/P1/Q2'),
      row('tax', 'DSE2021/P1/Q3'),
      row('tax', 'CE2005/P1/Q4'),
      row('tax', 'DSESP/P1/Q5'),
      row('adas', 'DSE2022/P1/Q6'),
      row('misc', 'DSE2022/P1/Q7'),
    ];
    const found = keyPointCounts({ topics: TOPICS, search: rows })!;
    expect(found.questions).toBe(5);
    expect(found.years).toEqual([2019, 2022]);
    expect(found.counts.get('C.ped')).toBe(1);
    expect(found.counts.get('C.pes')).toBe(1);
    expect(countOf(found, 'C.intervention')).toBe(1);
    expect(found.counts.get('G.ad')).toBeCloseTo(1 / 3);
    expect(countOf(found, 'G.as')).toBe(0);
    expect(countOf(found, 'A.scarcity')).toBe(0);
  });

  it('has nothing to say without the bank’s index', () => {
    expect(keyPointCounts(undefined)).toBeUndefined();
    expect(keyPointCounts({ topics: TOPICS, search: [] })).toBeUndefined();
    expect(keyPointCounts({ topics: TOPICS, search: [row('tax', 'CE2005/P1/Q4')] })).toBeUndefined();
  });

  it('reads a syllabus code as a key point, a point or a whole topic', () => {
    expect(keyPointsOfCode('C.ped')).toEqual(['C.ped']);
    expect(keyPointsOfCode('C.ped#arc')).toEqual(['C.ped']);
    expect(keyPointsOfCode('G')).toEqual(['G.ad', 'G.as', 'G.equilibrium']);
    expect(keyPointsOfCode('nonsense')).toEqual([]);
  });
});

describe('choosing the real questions to write like', () => {
  const rows: SearchRow[] = [
    ...[2013, 2016, 2019, 2022, 2025].map((y, i) => row('elasticity', `DSE${y}/P1/Q${i + 1}`, i % 2 ? { en: 'Which of the following statements is/are correct? (1) A (2) B (3) C', zh: '' } : {})),
    row('elasticity', 'CE2001/P1/Q9'),
    row('tax', 'DSE2024/P1/Q20'),
  ];

  it('asks for 3, 4 or 5 by how many questions are being written', () => {
    expect([1, 3, 5].map(referencesWanted)).toEqual([3, 4, 5]);
  });

  it('weights recent HKDSE above older papers, a picture it cannot see below words, and the shape asked', () => {
    const dse = (y: number, over: Partial<SearchRow> = {}) => row('x', `DSE${y}/P1/Q1`, over);
    expect(rowWeight(dse(2025), 'any', true)).toBeGreaterThan(rowWeight(dse(2013), 'any', true));
    expect(rowWeight(row('x', 'CE2001/P1/Q1'), 'any', true)).toBeLessThan(rowWeight(dse(2013), 'any', true));
    expect(rowWeight(dse(2020, { pictures: 1 }), 'any', true)).toBeLessThan(rowWeight(dse(2020), 'any', true));
    expect(rowWeight(dse(2020), 'combination', true)).toBeLessThan(rowWeight(dse(2020, { en: '(1) a (2) b' }), 'combination', true));
    expect(isCombinationRow({ en: 'Which? (1) a (2) b', zh: '' })).toBe(true);
    expect(isCombinationRow({ en: 'Which is correct?', zh: '' })).toBe(false);
  });

  it('picks only questions of the key point, never twice, and a mix of plain and combination for any shape', () => {
    const picks = chooseReferenceRows(rows, TOPICS, { keyPoint: 'C.ped', shape: 'any', sides: ['en'], want: 4, random: seeded(3) });
    expect(picks).toHaveLength(4);
    expect(new Set(picks.map((p) => p.source.tag)).size).toBe(4);
    expect(picks.every((p) => p.topicId === 'elasticity')).toBe(true);
    expect(new Set(picks.map(isCombinationRow)).size).toBe(2);
  });

  it('gives what there is when the key point has fewer, and nothing for a key point no topic names', () => {
    expect(chooseReferenceRows(rows, TOPICS, { keyPoint: 'C.intervention', shape: 'any', sides: ['en'], want: 5, random: seeded() })).toHaveLength(1);
    expect(chooseReferenceRows(rows, TOPICS, { keyPoint: 'A.scarcity', shape: 'any', sides: ['en'], want: 5, random: seeded() })).toEqual([]);
  });

  it('a topic that names a whole syllabus topic serves each key point of it', () => {
    const adas = [row('adas', 'DSE2021/P1/Q5'), row('adas', 'DSE2022/P1/Q6')];
    expect(chooseReferenceRows(adas, TOPICS, { keyPoint: 'G.as', shape: 'any', sides: ['en'], want: 3, random: seeded() })).toHaveLength(2);
  });

  const mcq = (id: string, over: Partial<McqQuestion> = {}): McqQuestion => ({
    id,
    type: 'mcq',
    blocks: [{ id: `${id}b`, kind: 'paragraph', text: { en: rt(`Stem ${id}`), zh: rt('題幹') } }],
    options: [1, 2, 3, 4].map((n) => ({ id: `${id}o${n}`, text: { en: rt(`opt ${n}`), zh: rt(`選項${n}`) } })),
    answerIndex: 1,
    marks: 1,
    tags: [],
    ...over,
  });
  const item = (tag: string, question: McqQuestion = mcq(tag)): PastPaperItem => ({
    topicId: 'elasticity',
    docId: 'doc',
    question,
    source: sourceOf({ tags: [tag] }),
    provenance: { en: `Paper ${tag}`, zh: tag },
    excerpt: { en: '', zh: '' },
    searchText: tag,
  });
  const bank = (topicItems: Record<string, PastPaperItem[] | undefined>, search: SearchRow[] | undefined = rows): ReferenceBank & { opened: number; loaded: string[] } => {
    const state = { opened: 0, loaded: [] as string[] };
    return Object.assign(state, {
      open: async () => void (state.opened += 1),
      manifest: () => (search ? { topics: TOPICS, search } : undefined),
      items: async (id: string) => {
        state.loaded.push(id);
        return topicItems[id];
      },
    });
  };

  it('makes a reference of a keyed multiple-choice question, marked as the studio’s own pick', () => {
    expect(referenceOf(item('DSE2019/P1/Q1'))).toMatchObject({ id: 'DSE2019/P1/Q1', auto: true, answerIndex: 1, label: 'Paper DSE2019/P1/Q1' });
    expect(referenceOf(item('x', mcq('x', { answerIndex: -1 })))).toBeUndefined();
    expect(referenceOf(item('x', { ...mcq('x'), type: 'essay' } as never))).toBeUndefined();
  });

  it('finds the references: opens the bank, loads only the topics it picked, and keeps the bank’s own order of words', async () => {
    const items = Object.fromEntries(['DSE2013/P1/Q1', 'DSE2016/P1/Q2', 'DSE2019/P1/Q3', 'DSE2022/P1/Q4', 'DSE2025/P1/Q5', 'CE2001/P1/Q9'].map((t) => [t, item(t)]));
    const fake = bank({ elasticity: Object.values(items), tax: [item('DSE2024/P1/Q20')] });
    const found = await findReferences({ keyPoint: 'C.ped', shape: 'any', sides: ['en'], count: 3 }, fake, { random: seeded(11) });
    expect(found).toHaveLength(4);
    expect(found.every((f) => f.auto === true)).toBe(true);
    expect(fake.opened).toBe(1);
    expect(fake.loaded).toEqual(['elasticity']);
  });

  it('replaces a pick the bank could not give, and gives [] when there is no bank, no index or nothing readable', async () => {
    const items = ['DSE2013/P1/Q1', 'DSE2016/P1/Q2', 'DSE2019/P1/Q3', 'DSE2022/P1/Q4', 'DSE2025/P1/Q5'].map((t) => item(t));
    items[0] = item('DSE2013/P1/Q1', mcq('bad', { answerIndex: -1 }));
    const found = await findReferences({ keyPoint: 'C.ped', shape: 'any', sides: ['en'], count: 3 }, bank({ elasticity: items }), { random: seeded(2) });
    expect(found).toHaveLength(4);
    expect(found.map((f) => f.id)).not.toContain('DSE2013/P1/Q1');
    expect(await findReferences({ keyPoint: 'C.ped', shape: 'any', sides: ['en'], count: 1 }, bank({}, undefined))).toEqual([]);
    expect(await findReferences({ keyPoint: 'C.ped', shape: 'any', sides: ['en'], count: 1 }, bank({}, []))).toEqual([]);
    expect(await findReferences({ keyPoint: 'C.ped', shape: 'any', sides: ['en'], count: 1 }, bank({ elasticity: undefined }))).toEqual([]);
    const broken: ReferenceBank = { open: async () => Promise.reject(new Error('offline')), manifest: () => undefined, items: async () => undefined };
    expect(await findReferences({ keyPoint: 'C.ped', shape: 'any', sides: ['en'], count: 1 }, broken)).toEqual([]);
  });
});

describe('the session adds the references, once, to what it writes', () => {
  const live = () => new AbortController().signal;
  const refs = [auto('r1'), auto('r2'), auto('r3')];

  it('only when none was picked, and a failing finder just means none', async () => {
    const env: Pick<StudioEnv, 'references'> = { references: async () => refs };
    const stages: string[] = [];
    const hooks = { signal: live(), progress: (_d: number, _t: number, stage: string) => stages.push(stage) };
    const added = await withReferences(REQUEST, env, hooks as never);
    expect(added.examples.map((e) => e.id)).toEqual(['r1', 'r2', 'r3']);
    expect(stages).toEqual(['references']);
    const picked = await withReferences({ ...REQUEST, examples: [EXAMPLE] }, env, hooks as never);
    expect(picked.examples).toEqual([EXAMPLE]);
    expect(await withReferences(REQUEST, {}, hooks as never)).toBe(REQUEST);
    expect((await withReferences(REQUEST, { references: async () => [] }, hooks as never)).examples).toEqual([]);
    expect((await withReferences(REQUEST, { references: async () => Promise.reject(new Error('x')) }, hooks as never)).examples).toEqual([]);
  });

  it('Write sends them, the drafts keep them for Another and Harder, and the record counts them', async () => {
    const client = scriptedClient([writeReply([A, B, C]), solver(), writeReply([A]), solver()]);
    const infos: Array<{ examples: number; auto: boolean }> = [];
    const env: StudioEnv = {
      resolve: async () => ({ ok: true, deps: { client, preset: presetFor('gemini'), glossary: null, corpus: EMPTY_CORPUS, random: seeded() }, compared: { past: 1, mine: 0 } }),
      references: async () => refs,
    };
    const session = createStudioSession(env, 'bilingual', { onRun: (info) => infos.push({ examples: info.request.examples.length, auto: info.request.examples.every((e) => e.auto === true) }) });
    session.getState().setForm({ keyPoint: 'C.ped', count: 3 });
    await session.getState().write();
    const sent = JSON.parse(client.requests[0].turns.at(-1)!.content) as { examples: unknown[]; make: { reference: string } };
    expect(sent.examples).toHaveLength(3);
    expect(sent.make.reference).toBe('style');
    expect(session.getState().entries[0].request.examples).toHaveLength(3);
    expect(infos).toEqual([{ examples: 3, auto: true }]);
    expect(session.getState().form.examples).toEqual([]);
    await session.getState().refine(session.getState().entries[0].draft.id, { kind: 'another' });
    expect(JSON.parse(client.requests[2].turns.at(-1)!.content).examples).toHaveLength(3);
  });

  it('with an example picked, nothing is added and strict mode reaches the model', async () => {
    const client = scriptedClient([writeReply([A, B, C]), solver()]);
    let asked = 0;
    const env: StudioEnv = {
      resolve: async () => ({ ok: true, deps: { client, preset: presetFor('gemini'), glossary: null, corpus: EMPTY_CORPUS, random: seeded() }, compared: { past: 1, mine: 0 } }),
      references: async () => {
        asked += 1;
        return refs;
      },
    };
    const session = createStudioSession(env, 'bilingual');
    session.getState().setForm({ keyPoint: 'C.ped', count: 3 });
    session.getState().addExample(EXAMPLE);
    await session.getState().write();
    expect(asked).toBe(0);
    const sent = JSON.parse(client.requests[0].turns.at(-1)!.content) as { examples: unknown[]; make: { reference: string } };
    expect(sent.examples).toHaveLength(1);
    expect(sent.make.reference).toBe('pattern');
  });
});
