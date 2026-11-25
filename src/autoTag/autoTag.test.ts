import { describe, expect, it } from 'vitest';
import { tagJob } from '@/ai/credits';
import { presetFor } from '@/ai/providers';
import { AiError, type CompletionRequest } from '@/ai/types';
import { choiceQuestion, docWith } from '@/library/testKit';
import { TOPICS } from '@/model/topics';
import type { McqQuestion } from '@/model/types';
import { scriptedClient } from '@/translate/testKit';
import { cleanSuggestion, guideTopicsInTree, knownCode, parseTagReply, TAG_MARKER, TAG_SCHEMA, topicList, type RawTag } from './prompt';
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

const raw = (over: Partial<RawTag> = {}): RawTag => ({ key: 'q1', main: 'C.ped', also: '', pattern: '', conf: 'high', why: 'Reads PED from revenue.', ...over });

/** The keys of the questions in a request, from its payload. */
const keysOf = (req: CompletionRequest): string[] => (JSON.parse(req.turns[req.turns.length - 1].content) as { questions: Array<{ key: string }> }).questions.map((q) => q.key);
const answerAll = (main = 'C.ped') => (req: CompletionRequest) => JSON.stringify({ items: keysOf(req).map((key) => ({ key, main, also: '', pattern: '', conf: 'high', why: 'x' })) });

describe('the topic list (the bank tree)', () => {
  it('lists every part and topic the bank has, and nothing else', () => {
    const list = topicList();
    for (const part of TOPICS) {
      expect(list).toContain(`# ${part.code} ${part.en}`);
      for (const topic of part.children) expect(list).toMatch(new RegExp(`^${topic.code.replace('.', '\\.')}  `, 'm'));
    }
    const codes = list.split('\n').filter((line) => !line.startsWith('#')).map((line) => line.split('  ')[0]);
    expect(codes).toHaveLength(TOPICS.reduce((n, part) => n + part.children.length, 0));
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
    expect(knownCode('C.ped')).toBe('C.ped');
    expect(knownCode(' c.PED ')).toBe('C.ped');
    expect(knownCode('C.ped#arc')).toBe('C.ped');
    expect(knownCode('g')).toBe('G');
    expect(knownCode('EL1.pricing')).toBe('EL1.pricing');
    expect(knownCode('C.elasticity')).toBeUndefined();
    expect(knownCode('Price elasticity of demand')).toBeUndefined();
    expect(knownCode('')).toBeUndefined();
  });
});

describe('a suggestion, checked against the tree', () => {
  it('keeps the main topic first, drops unknown codes, repeats and a part beside its own topic', () => {
    const s = cleanSuggestion(raw({ main: 'C.ped', also: 'C, C.ped, Z.nothing, free text, C.pes' }), question(1));
    expect(s?.topics).toEqual(['C.ped', 'C.pes']);
    expect(s?.rootId).toBe('root-1');
  });

  it('never more than three topics', () => {
    expect(cleanSuggestion(raw({ also: 'C.pes, C.intervention, C.equilibrium' }), question(1))?.topics).toEqual(['C.ped', 'C.pes', 'C.intervention']);
  });

  it('moves up an "also" code when the main one is unknown, and gives nothing when no code is usable', () => {
    expect(cleanSuggestion(raw({ main: 'elasticity', also: 'C.pes' }), question(1))?.topics).toEqual(['C.pes']);
    expect(cleanSuggestion(raw({ main: 'elasticity', also: 'unknown' }), question(1))).toBeUndefined();
  });

  it('takes a 題型 only from the teacher’s own names under the main topic, as stored', () => {
    const q = question(1, { 'C.ped': ['Calculate PED from TR'], 'C.pes': ['PES and time'] });
    expect(cleanSuggestion(raw({ pattern: 'calculate  PED from TR' }), q)?.pattern).toEqual({ topic: 'C.ped', name: 'Calculate PED from TR' });
    expect(cleanSuggestion(raw({ pattern: 'PES and time' }), q)?.pattern).toBeUndefined();
    expect(cleanSuggestion(raw({ pattern: 'A brand new kind' }), q)?.pattern).toBeUndefined();
    expect(cleanSuggestion(raw({ pattern: 'Calculate PED from TR' }), question(1))?.pattern).toBeUndefined();
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
    expect(client.requests[0].system).toContain('C.ped  Price elasticity of demand');
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
