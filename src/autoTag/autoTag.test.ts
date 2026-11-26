import { describe, expect, it } from 'vitest';
import { tagJob } from '@/ai/credits';
import { presetFor } from '@/ai/providers';
import { AiError, type CompletionRequest } from '@/ai/types';
import { choiceQuestion, docWith, partedQuestion } from '@/library/testKit';
import { VIEW_SECTIONS } from '@/model/mcqView';
import { MCQ_SCHEME } from '@/model/topicSchemes';
import { TOPICS } from '@/model/topics';
import type { McqQuestion } from '@/model/types';
import { scriptedClient } from '@/translate/testKit';
import { buildPayload, cleanSuggestion, guideTopicsInTree, itemKey, knownCode, listPatterns, parseTagReply, suggestionOf, TAG_MARKER, TAG_SCHEMA, topicList, type RawTag } from './prompt';
import { tagQuestionOf } from './questions';
import { chunkQuestions, runTagging } from './run';
import type { TagQuestion } from './types';

const preset = { ...presetFor('deepseek'), concurrency: 1 };

const question = (n: number, patterns?: TagQuestion['patterns']): TagQuestion => ({
  key: `q${n}`,
  rootId: `root-${n}`,
  format: 'multiple-choice question',
  entries: [{ role: 'stem', text: `Question ${n} about price elasticity.` }],
  ...(patterns ? { patterns } : {}),
});

const raw = (over: Partial<RawTag> = {}): RawTag => ({ key: 'q1', main: 'elasticity', also: '', pattern: '', conf: 'high', why: 'Reads PED from revenue.', ...over });

/** The keys of the questions in a request, from its payload. */
const keysOf = (req: CompletionRequest): string[] => (JSON.parse(req.turns[req.turns.length - 1].content) as { questions: Array<{ key: string }> }).questions.map((q) => q.key);
const answerAll = (main = 'elasticity') => (req: CompletionRequest) => JSON.stringify({ items: keysOf(req).map((key) => ({ key, main, also: '', pattern: '', conf: 'high', why: 'x' })) });

describe('the topic list (the bank tree)', () => {
  it('lists Mentor’s sections with every MCQ topic under its section, then the electives as EDB codes, and nothing else', () => {
    const list = topicList();
    for (const section of VIEW_SECTIONS) {
      expect(list).toContain(`# ${section.code} ${section.en}`);
      if (section.code.startsWith('EL')) {
        for (const topic of TOPICS.find((t) => t.code === section.code)!.children) expect(list).toMatch(new RegExp(`^${topic.code.replace('.', '\\.')}  `, 'm'));
      } else {
        for (const node of section.children) expect(list).toMatch(new RegExp(`^${node.key}  `, 'm'));
      }
    }
    const codes = list.split('\n').filter((line) => !line.startsWith('#')).map((line) => line.split('  ')[0]);
    const electives = TOPICS.filter((t) => t.code.startsWith('EL')).reduce((n, part) => n + part.children.length, 0);
    expect(codes).toHaveLength(MCQ_SCHEME.topics.length + electives);
    expect(new Set(codes).size).toBe(codes.length);
    // The old EDB lines are gone: the model is offered MCQ keys, not 'C.ped'.
    expect(list).not.toMatch(/^C\.ped {2}/m);
    expect(list).toMatch(/^per-unit-tax {2}Per-unit Tax: /m);
    expect(list).toMatch(/^EL1\.pricing {2}/m);
  });

  it('every guide key point is a topic of the bank (the points it lists lean on it)', () => {
    expect(guideTopicsInTree()).toBe(true);
  });
});

describe('reading a reply', () => {
  it('takes the items of a fenced or wrapped JSON object', () => {
    expect(parseTagReply('```json\n{"items":[{"key":"q1","main":"C.ped","also":"C.pes","pattern":"","conf":"medium","why":" w "}]}\n```')).toEqual([
      { key: 'q1', main: 'C.ped', also: 'C.pes', pattern: '', conf: 'medium', why: 'w' },
    ]);
    expect(parseTagReply('no json')).toBeNull();
    expect(parseTagReply('{"items": 3}')).toBeNull();
  });

  it('reads an "also" list given as an array, and an unknown confidence as low', () => {
    expect(parseTagReply('{"items":[{"key":"q1","main":"C","also":["C.ped","C.pes"],"conf":"sure"}]}')?.[0]).toMatchObject({ also: 'C.ped,C.pes', conf: 'low', pattern: '', why: '' });
  });

  it('knows a code however it is written, and only codes in the tree', () => {
    // An MCQ key, any case, with or without "@mcq:", is the view code.
    expect(knownCode('per-unit-tax')).toBe('@mcq:per-unit-tax');
    expect(knownCode('@mcq:per-unit-tax')).toBe('@mcq:per-unit-tax');
    expect(knownCode(' @MCQ:PER-unit-tax ')).toBe('@mcq:per-unit-tax');
    expect(knownCode('Elasticity')).toBe('@mcq:elasticity');
    // A section and an elective code stand as they are; a section with one topic (G) reads as that topic.
    expect(knownCode('g')).toBe('@mcq:adas');
    expect(knownCode('C')).toBe('C');
    expect(knownCode('EL1.pricing')).toBe('EL1.pricing');
    expect(knownCode(' el1.PRICING ')).toBe('EL1.pricing');
    // An EDB code from an older habit reads as the one view code it falls under.
    expect(knownCode('C.ped')).toBe('@mcq:elasticity');
    expect(knownCode(' c.PED ')).toBe('@mcq:elasticity');
    expect(knownCode('C.ped#arc')).toBe('@mcq:elasticity');
    expect(knownCode('C.intervention')).toBe('C.intervention');
    expect(knownCode('C.elasticity')).toBeUndefined();
    expect(knownCode('Price elasticity of demand')).toBeUndefined();
    expect(knownCode('')).toBeUndefined();
  });
});

describe('a suggestion, checked against the tree', () => {
  it('keeps the main topic first, drops unknown codes, repeats and a part beside its own topic', () => {
    const s = cleanSuggestion(raw({ main: 'elasticity', also: 'C, @mcq:elasticity, Z.nothing, free text, per-unit-tax' }), question(1));
    expect(s?.topics).toEqual(['@mcq:elasticity', '@mcq:per-unit-tax']);
    expect(s?.rootId).toBe('root-1');
  });

  it('never more than three topics', () => {
    expect(cleanSuggestion(raw({ also: 'quota, per-unit-tax, price-ceiling' }), question(1))?.topics).toEqual(['@mcq:elasticity', '@mcq:quota', '@mcq:per-unit-tax']);
  });

  it('moves up an "also" code when the main one is unknown, and gives nothing when no code is usable', () => {
    expect(cleanSuggestion(raw({ main: 'C.elasticity', also: 'per-unit-tax' }), question(1))?.topics).toEqual(['@mcq:per-unit-tax']);
    expect(cleanSuggestion(raw({ main: 'C.elasticity', also: 'unknown' }), question(1))).toBeUndefined();
  });

  it('takes a 題型 only from the teacher’s own names under the main topic, as stored (under its EDB sub-topic)', () => {
    const q = question(1, { 'C.ped': ['Calculate PED from TR'], 'C.pes': ['PES and time'], 'C.intervention': ['Tax incidence'] });
    expect(cleanSuggestion(raw({ pattern: 'calculate  PED from TR' }), q)?.pattern).toEqual({ topic: 'C.ped', name: 'Calculate PED from TR' });
    // 'elasticity' stands for both C.ped and C.pes.
    expect(cleanSuggestion(raw({ pattern: 'PES and time' }), q)?.pattern).toEqual({ topic: 'C.pes', name: 'PES and time' });
    // A name under another topic is not taken.
    expect(cleanSuggestion(raw({ pattern: 'Tax incidence' }), q)?.pattern).toBeUndefined();
    expect(cleanSuggestion(raw({ main: 'per-unit-tax', pattern: 'Calculate PED from TR' }), q)?.pattern).toBeUndefined();
    // A name under 'C.intervention' is taken under 'per-unit-tax' and stored back under 'C.intervention'.
    expect(cleanSuggestion(raw({ main: 'per-unit-tax', pattern: 'tax incidence' }), q)?.pattern).toEqual({ topic: 'C.intervention', name: 'Tax incidence' });
    expect(cleanSuggestion(raw({ pattern: 'A brand new kind' }), q)?.pattern).toBeUndefined();
    expect(cleanSuggestion(raw({ pattern: 'Calculate PED from TR' }), question(1))?.pattern).toBeUndefined();
  });

  it('offers the teacher’s 題型 under LIST codes: a name under C.intervention under each of its MCQ topics, C.ped under elasticity', () => {
    const offered = listPatterns({ 'C.intervention': ['Tax incidence'], 'C.ped': ['Calculate PED from TR'], 'EL1.pricing': ['Kinked demand'] });
    for (const key of ['per-unit-tax', 'per-unit-subsidy', 'price-ceiling', 'price-floor', 'quota']) expect(offered[key]).toEqual(['Tax incidence']);
    expect(offered.elasticity).toEqual(['Calculate PED from TR']);
    expect(offered['EL1.pricing']).toEqual(['Kinked demand']);
    expect(offered['C.ped']).toBeUndefined();
    expect(offered['C.intervention']).toBeUndefined();
    const payload = buildPayload([question(1, { 'C.intervention': ['Tax incidence'] })]);
    expect(payload.questions[0].patterns?.['per-unit-tax']).toEqual(['Tax incidence']);
  });
});

describe('what a question sends', () => {
  it('reads the printed words of the question, the keyed option marked, never its tags', () => {
    const q = choiceQuestion('Which of the following raises the demand for rice?', '', ['C.ped', 'DSE2020/P1/Q4']);
    const doc = docWith([q]);
    const sent = tagQuestionOf(doc, q.id, 'root', 'q1');
    expect(sent?.entries[0]).toEqual({ role: 'stem', text: 'Which of the following raises the demand for rice?' });
    expect(sent?.entries.filter((e) => e.role === 'option')).toHaveLength(4);
    expect(JSON.stringify(sent)).not.toContain('C.ped');
    expect(JSON.stringify(sent)).not.toContain('DSE2020');
  });

  it('sends 中文 for a question written in 中文, and nothing for a question with no words', () => {
    const zh = choiceQuestion('', '下列哪項會增加對米的需求？');
    const doc = docWith([zh]);
    expect(tagQuestionOf(doc, zh.id, 'r', 'q1')?.entries[0].text).toBe('下列哪項會增加對米的需求？');
    const blank = choiceQuestion('') as McqQuestion;
    blank.options = blank.options.map((o) => ({ ...o, text: { en: [], zh: [] } }));
    expect(tagQuestionOf(docWith([blank]), blank.id, 'r', 'q1')).toBeUndefined();
  });
});

describe('the run', () => {
  it('sends ten questions a request, tagged `tag`, with the schema and the topic list', async () => {
    const client = scriptedClient([answerAll()]);
    const questions = Array.from({ length: 25 }, (_, i) => question(i + 1));
    const progress: number[] = [];
    const arrived: string[] = [];
    const outcome = await runTagging(questions, { client, preset }, {
      whyLanguage: 'en',
      signal: new AbortController().signal,
      onProgress: (done) => progress.push(done),
      onSuggestions: (s) => arrived.push(...s.map((x) => x.rootId)),
    });
    expect(client.requests.map(keysOf).map((keys) => keys.length)).toEqual([10, 10, 5]);
    expect(client.requests[0].feature).toBe('tag');
    expect(client.requests[0].schema).toBe(TAG_SCHEMA);
    expect(client.requests[0].system).toContain(TAG_MARKER);
    expect(client.requests[0].system).toMatch(/^elasticity {2}Elasticity: /m);
    expect(outcome.suggestions).toHaveLength(25);
    expect(outcome.failed).toEqual([]);
    expect(progress).toEqual([0, 10, 20, 25]);
    expect(arrived).toHaveLength(25);
  });

  it('asks again, on their own, for questions a reply left out; a second miss is a failure', async () => {
    const client = scriptedClient([
      (req) => JSON.stringify({ items: keysOf(req).slice(0, 2).map((key) => ({ key, main: 'C.ped', also: '', pattern: '', conf: 'high', why: '' })) }),
      '{"items":[]}',
    ]);
    const outcome = await runTagging([question(1), question(2), question(3)], { client, preset }, { whyLanguage: 'en', signal: new AbortController().signal });
    expect(client.requests.map(keysOf)).toEqual([['q1', 'q2', 'q3'], ['q3']]);
    expect(outcome.suggestions.map((s) => s.rootId)).toEqual(['root-1', 'root-2']);
    expect(outcome.failed).toEqual(['root-3']);
  });

  it('splits a cut-off reply in two', async () => {
    const client = scriptedClient([{ text: '{"items":[', finish: 'length', dialect: 'openai-jsonSchema', model: 'f', ms: 1 }, answerAll(), answerAll()]);
    const outcome = await runTagging([question(1), question(2), question(3), question(4)], { client, preset }, { whyLanguage: 'en', signal: new AbortController().signal });
    expect(client.requests.map(keysOf)).toEqual([['q1', 'q2', 'q3', 'q4'], ['q1', 'q2'], ['q3', 'q4']]);
    expect(outcome.suggestions).toHaveLength(4);
  });

  it('stops at a run-ending error (no credits) and keeps what came back', async () => {
    const noCredits = new AiError({ kind: 'noCredits', provider: 'mentor', message: 'Out of credits.', fatal: true, actions: ['buyCredits'] });
    const client = scriptedClient([answerAll(), noCredits]);
    const questions = Array.from({ length: 15 }, (_, i) => question(i + 1));
    const outcome = await runTagging(questions, { client, preset }, { whyLanguage: 'en', signal: new AbortController().signal });
    expect(outcome.fatal?.kind).toBe('noCredits');
    expect(outcome.suggestions).toHaveLength(10);
  });

  it('Stop keeps what came back and sends nothing more', async () => {
    const controller = new AbortController();
    const client = scriptedClient([
      (req) => {
        controller.abort();
        return answerAll()(req);
      },
    ]);
    const questions = Array.from({ length: 30 }, (_, i) => question(i + 1));
    const outcome = await runTagging(questions, { client, preset }, { whyLanguage: 'en', signal: controller.signal });
    expect(client.requests).toHaveLength(1);
    expect(outcome.stopped).toBe(true);
    expect(outcome.suggestions).toHaveLength(10);
  });

  it('chunks by size too', () => {
    const big = (n: number): TagQuestion => ({ ...question(n), entries: [{ role: 'stem', text: 'x'.repeat(4000) }] });
    expect(chunkQuestions([big(1), big(2), big(3)]).map((c) => c.length)).toEqual([2, 1]);
  });
});

describe('the estimate', () => {
  it('prices tagging as `tag`, one system prompt per ten questions', () => {
    const one = tagJob(10, 'x'.repeat(4000));
    const two = tagJob(11, 'x'.repeat(4000));
    expect(one.feature).toBe('tag');
    expect(two.inputTokens - one.inputTokens).toBe(3000);
  });

  it('the system prompt is about the size the estimate counts', () => {
    const tokens = Math.ceil(topicList().length / 4) + 500;
    expect(tokens).toBeLessThanOrEqual(3000);
  });
});

describe('part by part (u-g13t)', () => {
  /** A question with parts (a), (b) and (c)(i)/(c)(ii), as a request carries it. */
  const parted = (n: number): TagQuestion => ({
    ...question(n),
    format: 'structured',
    entries: [
      { role: 'stem', text: 'A city sets a rent ceiling.' },
      { role: 'part', label: '(a)', text: 'Explain why a shortage appears.' },
      { role: 'part', label: '(b)', text: 'Explain one effect on efficiency.' },
    ],
    parts: [
      { label: '(a)', slot: `a-${n}` },
      { label: '(b)', slot: `b-${n}` },
    ],
  });
  /** Answers every part key of a request ("q1(a)") with `main` by label. */
  const answerParts = (byLabel: Record<string, string>) => (req: CompletionRequest) => {
    const questions = (JSON.parse(req.turns[req.turns.length - 1].content) as { questions: Array<{ key: string; parts?: string[] }> }).questions;
    const items = questions.flatMap((q) => (q.parts ?? []).filter((label) => byLabel[label]).map((label) => ({ key: `${q.key}${label}`, main: byLabel[label], also: '', pattern: '', conf: label === '(b)' ? 'medium' : 'high', why: `Part ${label}.` })));
    return JSON.stringify({ items });
  };

  it('a structured question with two or more parts sends them; one part, MC or no parts do not', () => {
    const two = partedQuestion([{}, { subs: [undefined, undefined] }]);
    const sent = tagQuestionOf(docWith([two]), two.id, 'r', 'q1');
    expect(sent?.parts?.map((p) => p.label)).toEqual(['(a)', '(b)(i)', '(b)(ii)']);
    expect(sent?.parts?.map((p) => p.slot)).toEqual([two.parts[0].id, two.parts[1].subParts![0].id, two.parts[1].subParts![1].id]);
    const one = partedQuestion([{}]);
    expect(tagQuestionOf(docWith([one]), one.id, 'r', 'q1')?.parts).toBeUndefined();
    const mc = choiceQuestion('Which raises demand?');
    expect(tagQuestionOf(docWith([mc]), mc.id, 'r', 'q1')?.parts).toBeUndefined();
  });

  it('leaves out a part with no words, and never sends a part’s own tags', () => {
    const q = partedQuestion([{ tags: ['C.ped'] }, {}, {}]);
    q.parts[2].blocks = [];
    const sent = tagQuestionOf(docWith([q]), q.id, 'r', 'q1');
    expect(sent?.parts?.map((p) => p.label)).toEqual(['(a)', '(b)']);
    expect(JSON.stringify(sent)).not.toContain('C.ped');
  });

  it('the request lists the parts and asks for one item per part', () => {
    const client = scriptedClient([answerParts({ '(a)': 'price-ceiling', '(b)': 'efficiency' })]);
    return runTagging([parted(1)], { client, preset }, { whyLanguage: 'en', signal: new AbortController().signal }).then((outcome) => {
      const payload = JSON.parse(client.requests[0].turns[0].content) as { questions: Array<{ parts?: string[] }> };
      expect(payload.questions[0].parts).toEqual(['(a)', '(b)']);
      expect(client.requests[0].system).toContain('"q3(b)(ii)"');
      const s = outcome.suggestions[0];
      expect(s.parts?.map((p) => [p.label, p.slot, p.topics, p.conf, p.why])).toEqual([
        ['(a)', 'a-1', ['@mcq:price-ceiling'], 'high', 'Part (a).'],
        ['(b)', 'b-1', ['@mcq:efficiency'], 'medium', 'Part (b).'],
      ]);
      expect(s.topics).toEqual(['@mcq:price-ceiling', '@mcq:efficiency']);
      expect(s.conf).toBe('medium');
    });
  });

  it('reads a part key however the model spaces it', () => {
    const q = parted(1);
    const items = new Map([['q1 (a)', raw({ key: 'q1 (a)', main: 'elasticity' })], ['Q1:(b)', raw({ key: 'Q1:(b)', main: 'Per-Unit-Tax' })]].map(([k, v]) => [itemKey(k as string), v as RawTag]));
    expect(suggestionOf(q, (key) => items.get(key)).suggestion?.parts?.map((p) => p.topics[0])).toEqual(['@mcq:elasticity', '@mcq:per-unit-tax']);
  });

  it('asks once more for a question a part was left out of, keeps the fuller answer, and keeps a partial one', async () => {
    const client = scriptedClient([answerParts({ '(a)': 'price-ceiling' }), answerParts({ '(a)': 'price-ceiling', '(b)': 'efficiency' })]);
    const outcome = await runTagging([parted(1)], { client, preset }, { whyLanguage: 'en', signal: new AbortController().signal });
    expect(client.requests).toHaveLength(2);
    expect(outcome.suggestions[0].parts).toHaveLength(2);

    const stubborn = scriptedClient([answerParts({ '(a)': 'price-ceiling' }), '{"items":[]}']);
    const partial = await runTagging([parted(1)], { client: stubborn, preset }, { whyLanguage: 'en', signal: new AbortController().signal });
    expect(partial.suggestions[0].parts?.map((p) => p.label)).toEqual(['(a)']);
    expect(partial.failed).toEqual([]);
  });

  it('counts a question’s parts toward the ten items a request holds, and in the estimate', () => {
    const chunks = chunkQuestions([parted(1), parted(2), parted(3), parted(4), parted(5), parted(6)]);
    expect(chunks.map((c) => c.length)).toEqual([5, 1]);
    expect(tagJob(2, 'x', 12).outputTokens).toBeGreaterThan(tagJob(2, 'x').outputTokens);
    expect(tagJob(2, 'x', 12).inputTokens - tagJob(2, 'x').inputTokens).toBe(3000);
  });
});
