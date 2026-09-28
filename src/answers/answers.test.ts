import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { presetFor } from '@/ai/providers';
import { AiError, type CompletionRequest } from '@/ai/types';
import type { Glossary, TermCheck } from '@/glossary/types';
import { schemeMax } from '@/model/markScheme';
import { bi, plain } from '@/model/text';
import type { McqQuestion, StructuredQuestion, Worksheet } from '@/model/types';
import { scriptedClient } from '@/translate/testKit';
import { fakeGlossary } from '@/translate/fakeGlossary';
import { applyAnswerWrites } from './apply';
import { PROMPT_VERSION, buildRequest, systemPrompt } from './prompt';
import { planAnswers } from './plan';
import { runAnswers, writesFor } from './run';
import { answersPaper, cannedReply, payloadOf } from './testKit';
import type { AnswerPlan, RunDeps } from './types';
import { evaluateAnswer, parseAnswersReply } from './validate';

const PAPER = { kind: 'paper' } as const;
const EN = { language: 'en' } as const;
const preset = { ...presetFor('gemini'), concurrency: 1 };

function deps(client: RunDeps['client'], glossary: Glossary | null = null): RunDeps {
  return { client, preset, model: 'fake', glossary };
}

const questionOf = <T>(ws: Worksheet, id: string) => ws.questions.find((q) => q.id === id) as T;
const targetsOf = (plan: AnswerPlan) => [...plan.targets.values()];

describe('planAnswers', () => {
  it('collects empty answers, missing schemes and missing rationales from the model', () => {
    const { ws } = answersPaper();
    const plan = planAnswers(ws, PAPER, EN);
    expect(targetsOf(plan).map((t) => [t.where, t.needs])).toEqual([
      ['Question 1 (a)', { shape: 'written', answer: true, scheme: true }],
      ['Question 1 (b)(i)', { shape: 'written', answer: true, scheme: true }],
      // The teacher's answer stays; only the scheme is missing.
      ['Question 1 (b)(ii)', { shape: 'written', answer: false, scheme: true }],
      // Option A already has the teacher's rationale; the blank-free rest need one.
      ['Question 2', { shape: 'choice', options: ['O1', 'O2', 'O3'] }],
    ]);
  });

  it('skips answered leaves, unmarked schemes, blank parts and unkeyed MCQs', () => {
    const { ws, structured, mcq } = answersPaper();
    structured.parts[0].answer = bi('Done.', '');
    structured.parts[0].scheme = { routes: [{ id: 'r', groups: [{ id: 'g', points: [{ id: 'p', text: bi('x', ''), marks: 4 }] }] }] };
    structured.parts[1].subParts![0].marks = undefined;
    structured.parts[1].subParts![0].answer = bi('Shared label.', '');
    structured.parts[1].subParts![1].blocks = [];
    (mcq as McqQuestion).answerIndex = 9;
    expect(planAnswers(ws, PAPER, EN).targets.size).toBe(0);
  });

  it('narrows to the leaf whose text is selected; stem text means the whole question', () => {
    const { ws } = answersPaper();
    const sub = planAnswers(ws, { kind: 'paths', paths: ['q:Q1/part:PB/sub:S1/blocks/b:' + questionOf<StructuredQuestion>(ws, 'Q1').parts[1].subParts![0].blocks[0].id] }, EN);
    expect(targetsOf(sub).map((t) => t.where)).toEqual(['Question 1 (b)(i)']);
    const part = planAnswers(ws, { kind: 'paths', paths: ['q:Q1/part:PB/blocks/b:' + questionOf<StructuredQuestion>(ws, 'Q1').parts[1].blocks[0].id] }, EN);
    expect(targetsOf(part).map((t) => t.where)).toEqual(['Question 1 (b)(i)', 'Question 1 (b)(ii)']);
    const stem = planAnswers(ws, { kind: 'paths', paths: ['q:Q1/blocks/b:' + questionOf<StructuredQuestion>(ws, 'Q1').blocks[0].id] }, EN);
    expect(stem.targets.size).toBe(3);
    expect(planAnswers(ws, { kind: 'questions', ids: ['Q2'] }, EN).targets.size).toBe(1);
  });

  it('writes the languages the paper prints', () => {
    expect(planAnswers(answersPaper().ws, PAPER, EN).sides).toEqual(['en']);
    expect(planAnswers(answersPaper(true).ws, PAPER, EN).sides).toEqual(['en', 'zh']);
    expect(planAnswers(answersPaper().ws, PAPER, { language: 'bilingual' }).sides).toEqual(['en', 'zh']);
    // An English paper viewed in 中文 still prints English.
    expect(planAnswers(answersPaper().ws, PAPER, { language: 'zh' }).sides).toEqual(['en', 'zh']);
  });
});

describe('the prompt', () => {
  it('is pinned: a change bumps PROMPT_VERSION', () => {
    const sha = createHash('sha256').update(systemPrompt()).digest('hex').slice(0, 12);
    expect({ PROMPT_VERSION, sha }).toEqual({ PROMPT_VERSION: 'e1.1', sha: '395bd34d8fc7' });
  });

  it('sends printed text, marks, the key and glossary pins — never ids', () => {
    const { ws } = answersPaper(true);
    const plan = planAnswers(ws, PAPER, EN);
    const req = buildRequest(plan, plan.chunks[0], fakeGlossary(), preset, new AbortController().signal);
    const payload = payloadOf(req);
    expect(payload.languages).toEqual(['en', 'zh']);
    expect(payload.glossary.some((line) => line.includes('物價水平'))).toBe(true);
    expect(payload.questions[0].items[0]).toEqual({ key: 'a1', type: 'written', label: '(a)', marks: 4, write: ['answer', 'scheme'] });
    expect(payload.questions[0].items[2]).toMatchObject({ write: ['scheme'], answer: { en: 'Teacher wrote this.', zh: '' } });
    expect(payload.questions[1].items[0]).toEqual({ key: 'a4', type: 'choice', options: ['A', 'B', 'C', 'D'], correct: 'B', write: ['B', 'C', 'D'] });
    expect(req.turns[0].content).not.toMatch(/Q1|PA|O1|WS/);
    expect(req.shapeHint).toContain('"points"');
  });
});

describe('evaluateAnswer', () => {
  const { ws } = answersPaper();
  const plan = planAnswers(ws, PAPER, EN);
  const [a, , bii, mcq] = targetsOf(plan);
  const item = (over: object) => ({ key: 'a1', answerEn: 'Demand rises.', answerZh: '', points: [], rationales: [], ...over });

  it('keeps the answer and drops a scheme that does not total the marks', () => {
    const result = evaluateAnswer(a, item({ points: [{ en: 'One', zh: '', marks: 1 }] }), ['en'], null);
    expect(result.status).toBe('look');
    expect(result.fill).toEqual({ shape: 'written', answer: bi('Demand rises.', '') });
    expect(result.notes).toEqual(["Mark scheme didn't add up to 4 marks — not inserted"]);
  });

  it('builds an HKEAA scheme whose derived total is the leaf marks', () => {
    const points = [1, 3].map((marks) => ({ en: `P${marks}`, zh: '', marks }));
    const result = evaluateAnswer(a, item({ points }), ['en'], null);
    expect(result.status).toBe('ok');
    expect(result.fill?.shape === 'written' && schemeMax(result.fill.scheme!)).toBe(4);
  });

  it('fails when a scheme-only leaf gets no usable scheme, or the answer is empty', () => {
    expect(evaluateAnswer(bii, item({ key: 'a3', points: [{ en: 'x', zh: '', marks: 0 }] }), ['en'], null)).toMatchObject({ status: 'failed' });
    expect(evaluateAnswer(a, item({ answerEn: '  ' }), ['en'], null)).toMatchObject({ status: 'failed', notes: ['The reply had no answer — nothing inserted'] });
    expect(evaluateAnswer(a, undefined, ['en'], null).status).toBe('failed');
  });

  it('writes both sides when the paper prints both; a missing side is a look note', () => {
    const both = evaluateAnswer(a, item({ answerZh: '需求上升。', points: [1, 1, 1, 1].map(() => ({ en: 'p', zh: '點', marks: 1 })) }), ['en', 'zh'], null);
    expect(both.status).toBe('ok');
    const half = evaluateAnswer(a, item({ points: [1, 1, 1, 1].map(() => ({ en: 'p', zh: '點', marks: 1 })) }), ['en', 'zh'], null);
    expect(half.notes).toEqual(['No 中文 answer']);
  });

  it('auto-fixes deny forms and notes glossary deviations', () => {
    const fixed = evaluateAnswer(a, item({ answerEn: 'The price level rises.', answerZh: '價格水平上升。' }), ['en', 'zh'], fakeGlossary());
    expect(fixed.fill?.shape === 'written' && plain(fixed.fill.answer!.zh)).toBe('物價水平上升。');
    const stub = {
      ...fakeGlossary(),
      checkEnToZh: (): TermCheck[] => [{ entryId: 1, en: 'import', source: { text: 'imports', start: 0, end: 7 }, state: 'not-preferred', severity: 'warn', expected: '進口' }],
    };
    const noted = evaluateAnswer(a, item({ answerEn: 'Imports fall.', answerZh: '入口下跌。' }), ['en', 'zh'], stub);
    expect(noted.status).toBe('look');
    expect(noted.notes).toContain('EDB: 進口 for “imports”');
  });

  it('explains each missing option; a missing letter is a look note', () => {
    const result = evaluateAnswer(mcq, item({ key: 'a4', rationales: [{ option: 'B.', en: 'Non-rival.', zh: '' }, { option: 'c', en: 'Rival.', zh: '' }] }), ['en'], null);
    expect(result.status).toBe('look');
    expect(result.notes).toEqual(['No explanation for option D']);
    expect(result.fill).toEqual({ shape: 'choice', rationales: { O1: bi('Non-rival.', ''), O2: bi('Rival.', '') } });
  });

  it('parses leniently but refuses a reply without items', () => {
    expect(parseAnswersReply('```json\n{"items":[{"key":"a1"}]}\n```')).toEqual([{ key: 'a1', answerEn: '', answerZh: '', points: [], rationales: [] }]);
    expect(parseAnswersReply('{"nope":1}')).toBeNull();
    expect(parseAnswersReply('not json')).toBeNull();
  });
});

describe('runAnswers and apply', () => {
  it('fills every target in one pass, never overwriting and never moving the key', async () => {
    const { ws } = answersPaper();
    const plan = planAnswers(ws, PAPER, EN);
    const outcome = await runAnswers(plan, deps(scriptedClient([(req) => cannedReply(req)])), new AbortController().signal);
    const { worksheet, report } = applyAnswerWrites(ws, writesFor(plan, outcome));
    expect(report).toEqual({ applied: ['a1', 'a2', 'a3', 'a4'], skipped: [] });
    const q1 = questionOf<StructuredQuestion>(worksheet, 'Q1');
    expect(plain(q1.parts[0].answer!.en)).toBe('Answer (a)');
    expect(schemeMax(q1.parts[0].scheme!)).toBe(4);
    expect(plain(q1.parts[1].subParts![1].answer!.en)).toBe('Teacher wrote this.');
    expect(schemeMax(q1.parts[1].subParts![1].scheme!)).toBe(3);
    const q2 = questionOf<McqQuestion>(worksheet, 'Q2');
    expect(q2.answerIndex).toBe(1);
    expect(q2.options.map((o) => plain(o.rationale?.en))).toEqual(['Teacher: rival.', 'Why B.', 'Why C.', 'Why D.']);
  });

  it('skips a leaf the teacher changed during the run and leaves other questions identical', async () => {
    const { ws } = answersPaper();
    const plan = planAnswers(ws, PAPER, EN);
    const outcome = await runAnswers(plan, deps(scriptedClient([(req) => cannedReply(req)])), new AbortController().signal);
    const q1 = questionOf<StructuredQuestion>(ws, 'Q1');
    const edited: Worksheet = {
      ...ws,
      questions: [{ ...q1, parts: [{ ...q1.parts[0], answer: bi('Typed meanwhile.', '') }, q1.parts[1]] }, ws.questions[1]],
    };
    const { worksheet, report } = applyAnswerWrites(edited, writesFor(plan, outcome).filter((w) => w.questionId === 'Q1'));
    expect(report.skipped).toEqual([{ key: 'a1', reason: 'changed' }]);
    expect(plain(questionOf<StructuredQuestion>(worksheet, 'Q1').parts[0].answer!.en)).toBe('Typed meanwhile.');
    expect(worksheet.questions[1]).toBe(ws.questions[1]);
  });

  it('commits nothing when every write is stale', () => {
    const { ws } = answersPaper();
    const plan = planAnswers(ws, PAPER, EN);
    const target = targetsOf(plan)[0];
    const write = { key: 'a1', questionId: 'Q1', leafKey: target.leaf.key, stamp: {}, fill: { shape: 'written' as const, answer: bi('x', '') } };
    expect(applyAnswerWrites(ws, [write]).worksheet).toBe(ws);
    expect(applyAnswerWrites(ws, [{ ...write, questionId: 'gone' }]).report.skipped).toEqual([{ key: 'a1', reason: 'gone' }]);
  });

  it('Stop keeps the chunks that finished', async () => {
    const { ws } = answersPaper();
    const plan = planAnswers(ws, { kind: 'paper' }, EN);
    const split: AnswerPlan = { ...plan, chunks: [{ id: 'c1', targetKeys: ['a1'] }, { id: 'c2', targetKeys: ['a2', 'a3', 'a4'] }] };
    const controller = new AbortController();
    const client = scriptedClient([
      (req: CompletionRequest) => {
        controller.abort();
        return cannedReply(req);
      },
    ]);
    const outcome = await runAnswers(split, deps(client), controller.signal);
    expect(outcome.stopped).toBe(true);
    expect([...outcome.results.keys()]).toEqual(['a1']);
    expect(client.requests).toHaveLength(1);
  });

  it('a fatal error stops the run; a cut-off reply bisects; an unreadable one is asked once more', async () => {
    const { ws } = answersPaper();
    const plan = planAnswers(ws, PAPER, EN);
    const quota = new AiError({ kind: 'quota', provider: 'gemini', message: 'Out of quota', fatal: true, actions: [] });
    const fatal = await runAnswers(plan, deps(scriptedClient([quota])), new AbortController().signal);
    expect(fatal.fatal?.kind).toBe('quota');
    expect(fatal.results.size).toBe(0);

    const one: AnswerPlan = { ...plan, chunks: [{ id: 'c1', targetKeys: ['a1', 'a2'] }] };
    const cut = scriptedClient([
      { text: '{"items":[', finish: 'length', dialect: 'openai-jsonSchema', model: 'fake', ms: 1 },
      (req: CompletionRequest) => cannedReply(req),
    ]);
    const bisected = await runAnswers(one, deps(cut), new AbortController().signal);
    expect(cut.requests).toHaveLength(3);
    expect([...bisected.results.values()].map((r) => r.status)).toEqual(['ok', 'ok']);

    const garbled = scriptedClient(['nonsense', (req: CompletionRequest) => cannedReply(req)]);
    const retried = await runAnswers({ ...plan, chunks: [{ id: 'c1', targetKeys: ['a1'] }] }, deps(garbled), new AbortController().signal);
    expect(garbled.requests).toHaveLength(2);
    expect(retried.results.get('a1')?.status).toBe('ok');
  });

  it('a transport failure fails its chunk only', async () => {
    const { ws } = answersPaper();
    const plan = planAnswers(ws, PAPER, EN);
    const split: AnswerPlan = { ...plan, chunks: [{ id: 'c1', targetKeys: ['a1'] }, { id: 'c2', targetKeys: ['a2'] }] };
    const down = new AiError({ kind: 'server', provider: 'gemini', message: 'The provider had a problem', fatal: false, actions: [] });
    const outcome = await runAnswers(split, deps(scriptedClient([down, (req: CompletionRequest) => cannedReply(req)])), new AbortController().signal);
    expect(outcome.results.get('a1')).toMatchObject({ status: 'failed', notes: ['The provider had a problem — nothing inserted'] });
    expect(outcome.results.get('a2')?.status).toBe('ok');
  });
});

describe('src/answers', () => {
  it('never branches on a question type: leaves reach it only through the registry hook', () => {
    const files = readdirSync('src/answers').filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'));
    expect(files.length).toBeGreaterThan(5);
    for (const path of [...files.map((name) => `src/answers/${name}`), 'src/model/answerLeaves.ts', 'src/assist/verbs/writeAnswers.ts']) {
      const source = readFileSync(path, 'utf8');
      expect(source, `${path} must not branch on 'mcq'`).not.toMatch(/['"]mcq['"]/);
      expect(source, `${path} must not branch on 'structured'`).not.toMatch(/['"]structured['"]/);
    }
  });
});
