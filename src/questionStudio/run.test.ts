import { describe, expect, it } from 'vitest';
import { aiErrorInfo } from '@/ai/errors';
import { presetFor } from '@/ai/providers';
import { AiError, type CompletionResult } from '@/ai/types';
import { fakeGlossary } from '@/translate/fakeGlossary';
import { scriptedClient } from '@/translate/testKit';
import { EXAMPLE, INVENTED, REQUEST, corpusOf, replyEntry, solveQuestions, solver, writeReply, type Invented } from './fixtures';
import { EMPTY_CORPUS, type CorpusIndex } from './nearCopy';
import { SOLVE_TASK_MARKER, WRITE_TASK_MARKER } from './prompt';
import { parseSolveReply, refine, writeDrafts, type Stage } from './run';
import { CHECK_IDS, type StudioDeps, type StudioDraft, type StudioOutcome } from './types';

const preset = presetFor('gemini');
const seeded = () => {
  let n = 3;
  return () => {
    n = (n * 9301 + 49297) % 233280;
    return n / 233280;
  };
};
type Replies = Parameters<typeof scriptedClient>[0];
const setup = (replies: Replies, corpus: CorpusIndex = EMPTY_CORPUS, glossary = false) => {
  const client = scriptedClient(replies);
  const deps: StudioDeps = { client, preset, glossary: glossary ? fakeGlossary() : null, corpus, random: seeded() };
  return { client, deps };
};
const live = () => new AbortController().signal;
const hooks = (stages: Stage[] = []) => ({ signal: live(), progress: (_d: number, _t: number, stage: Stage) => stages.push(stage) });
interface Payload {
  task: string;
  languages: string[];
  make: { count: number; level: string; shape: string; keys: number[] };
  syllabus: { keyPoint: { en: string } };
  redo: Array<{ problem: string; draft: { stem: { en: string } } }>;
  rewrite?: { how: string; note?: string; draft: { stem: { en: string }; answer: number } };
  avoid?: unknown[];
  language: string;
  questions: Array<{ id: string; stem: string; statements: string[]; options: string[] }>;
}
const userOf = (req: { turns: Array<{ content: string }> }) => JSON.parse(req.turns.at(-1)!.content) as Payload;
const ok = (out: StudioOutcome) => {
  if (!out.ok) throw new Error(`not ok: ${out.error.kind}`);
  return out;
};
const checkOf = (d: StudioDraft, id: string) => d.checks.find((c) => c.id === id)!;
const [A, B, C, D, E] = INVENTED;
const write = (...items: Invented[]) => writeReply(items);

describe('writeDrafts: the happy path', () => {
  it('writes, checks and solves in two requests', async () => {
    const { client, deps } = setup([write(A, B, C), solver()]);
    const stages: Stage[] = [];
    const out = ok(await writeDrafts(REQUEST, deps, hooks(stages)));
    expect(client.requests).toHaveLength(2);
    expect(client.requests[0].system.startsWith(WRITE_TASK_MARKER)).toBe(true);
    expect(client.requests[1].system.startsWith(SOLVE_TASK_MARKER)).toBe(true);
    expect(out.drafts.map((d) => d.status)).toEqual(['ok', 'ok', 'ok']);
    expect(out.drafts[0].checks.map((c) => c.id)).toEqual(CHECK_IDS);
    expect(out.drafts.every((d) => d.checks.every((c) => c.state === 'pass'))).toBe(true);
    expect(out.drafts.map((d) => d.attempt)).toEqual([1, 1, 1]);
    expect(out.drafts.map((d) => d.angle)).toEqual([A.angle, B.angle, C.angle]);
    expect(out.notes).toEqual([]);
    expect(out.usage.requests).toBe(2);
    expect(stages).toEqual(['write', 'solve']);
    expect(new Set(out.drafts.map((d) => d.id)).size).toBe(3);
  });

  it('asks for the key positions and the paper\'s languages in the writing payload', async () => {
    const { client, deps } = setup([write(A, B, C), solver()]);
    await writeDrafts({ ...REQUEST, level: 'harder', shape: 'plain', sides: ['en', 'zh'] }, deps, hooks());
    const payload = userOf(client.requests[0]);
    expect(payload).toMatchObject({ task: 'question-studio-write', languages: ['en', 'zh'], make: { count: 3, level: 'harder', shape: 'plain' } });
    expect(payload.make.keys).toHaveLength(3);
    expect(payload.syllabus.keyPoint.en).toBe('Price elasticity of demand');
  });

  it('the solve request carries the questions only: no key, no explanation, no angle, no brief', async () => {
    const { client, deps } = setup([write(A, B, C), solver()]);
    await writeDrafts({ ...REQUEST, examples: [EXAMPLE], note: 'use property prices' }, deps, hooks());
    const req = client.requests[1];
    const text = JSON.stringify(req);
    expect(Object.keys(userOf(req)).sort()).toEqual(['language', 'questions', 'task']);
    expect(userOf(req).questions[0]).toEqual({ id: expect.stringMatching(/^d\d+$/), stem: A.stem.en, statements: [], options: A.options.map((o) => o.en) });
    for (const secret of [A.explanation.en, A.angle, 'property prices', 'When the price of a pen', 'EXAMPLE-LABEL', 'syllabus', 'keys']) expect(text).not.toContain(secret);
    expect(req.schema).toBeDefined();
  });

  it('solves in 中文 when the paper prints no English', async () => {
    const { client, deps } = setup([write(A, B, C), solver()]);
    const out = ok(await writeDrafts({ ...REQUEST, sides: ['zh'] }, deps, hooks()));
    expect(userOf(client.requests[1]).language).toBe('zh');
    expect(userOf(client.requests[1]).questions[0].stem).toBe(out.drafts[0].draft.stem.zh);
    expect(out.drafts[0].draft.stem.en).toBe('');
  });

  it('trims a reply of more drafts than asked', async () => {
    const { deps } = setup([write(A, B, C, D, E), solver()]);
    const out = ok(await writeDrafts({ ...REQUEST, count: 3 }, deps, hooks()));
    expect(out.drafts).toHaveLength(3);
  });

  it('sums the provider\'s token counts and times', async () => {
    const res = (text: string, usage: CompletionResult['usage'], ms: number): CompletionResult => ({ text, finish: 'stop', dialect: 'gemini-jsonSchema', model: 'gem-x', ms, usage });
    const { deps } = setup([res(write(A), { input: 1000, output: 400, thinking: 50 }, 800), (req) => res(solver()(req), { input: 300, output: 100 }, 300)]);
    const out = ok(await writeDrafts({ ...REQUEST, count: 1 }, deps, hooks()));
    expect(out.usage).toEqual({ requests: 2, input: 1300, output: 500, thinking: 50, ms: 1100 });
    expect(out.model).toBe('gem-x');
  });

  it('refuses an unknown key point without calling the provider', async () => {
    const { client, deps } = setup([write(A)]);
    const out = await writeDrafts({ ...REQUEST, keyPoint: 'Z.none' }, deps, hooks());
    expect(out.ok).toBe(false);
    expect(client.requests).toHaveLength(0);
  });

  it('writes one language when the paper prints one', async () => {
    const { client, deps } = setup([write(A, B, C), solver()]);
    const out = ok(await writeDrafts({ ...REQUEST, sides: ['en'] }, deps, hooks()));
    expect(userOf(client.requests[0]).languages).toEqual(['en']);
    expect(out.drafts[0].draft.stem.zh).toBe('');
    expect(out.drafts.map((d) => d.status)).toEqual(['ok', 'ok', 'ok']);
  });
});

describe('writeDrafts: the blind solve', () => {
  it('a draft the solver disagrees with is rewritten once and solved again', async () => {
    const { client, deps } = setup([write(A, B, C), solver({ [B.stem.en]: 0 }), write(D), solver()]);
    const stages: Stage[] = [];
    const out = ok(await writeDrafts(REQUEST, deps, hooks(stages)));
    expect(client.requests).toHaveLength(4);
    expect(stages).toEqual(['write', 'solve', 'rewrite', 'solve']);
    const redo = userOf(client.requests[2]);
    expect(redo.make.count).toBe(1);
    expect(redo.redo).toHaveLength(1);
    expect(redo.redo[0].problem).toMatch(/chose option A, but you marked option B/);
    expect(redo.redo[0].draft.stem.en).toBe(B.stem.en);
    expect(out.drafts[1].draft.stem.en).toBe(D.stem.en);
    expect(out.drafts[1]).toMatchObject({ attempt: 2, status: 'ok' });
    expect(checkOf(out.drafts[1], 'key').state).toBe('pass');
    expect(userOf(client.requests[3]).questions).toHaveLength(1);
  });

  it('a rewrite that still disagrees stays on the sheet with a look note', async () => {
    const stem = B.stem.en;
    const { client, deps } = setup([write(A, B, C), solver({ [stem]: 0 }), write(B), solver({ [stem]: 3 })]);
    const out = ok(await writeDrafts(REQUEST, deps, hooks()));
    expect(client.requests).toHaveLength(4);
    expect(out.drafts[1]).toMatchObject({ attempt: 2, status: 'look' });
    expect(checkOf(out.drafts[1], 'key')).toMatchObject({ state: 'look', findings: [{ id: 'key.differs', params: { solver: 'D', key: 'B' } }] });
    expect(out.drafts[1].solve?.answer).toBe(3);
  });

  it('keeps the original, flagged, when the rewrite fails a hard check', async () => {
    const broken = { ...replyEntry(D), options: replyEntry(D).options.slice(0, 3) };
    const { deps } = setup([write(A, B, C), solver({ [B.stem.en]: 0 }), JSON.stringify({ questions: [broken] }), solver()]);
    const out = ok(await writeDrafts(REQUEST, deps, hooks()));
    expect(out.drafts[1].draft.stem.en).toBe(B.stem.en);
    expect(out.drafts[1]).toMatchObject({ attempt: 1, status: 'look' });
    expect(checkOf(out.drafts[1], 'key').findings[0].id).toBe('key.differs');
  });

  it('a solver that calls a question ambiguous earns a look note and no rewrite', async () => {
    const { client, deps } = setup([write(A, B, C), solver({}, [A.stem.en])]);
    const out = ok(await writeDrafts(REQUEST, deps, hooks()));
    expect(client.requests).toHaveLength(2);
    expect(out.drafts[0]).toMatchObject({ status: 'look' });
    expect(checkOf(out.drafts[0], 'key').findings).toEqual([{ id: 'key.ambiguous' }]);
  });

  it('a solve that fails keeps the drafts, with the key unchecked and a batch note', async () => {
    const { deps } = setup([write(A, B, C), new AiError(aiErrorInfo('server', 'gemini'))]);
    const out = ok(await writeDrafts(REQUEST, deps, hooks()));
    expect(out.drafts.map((d) => d.status)).toEqual(['look', 'look', 'look']);
    expect(checkOf(out.drafts[0], 'key').state).toBe('skipped');
    expect(out.notes).toEqual([{ id: 'run.keyNotChecked', params: { message: "Google Gemini is having trouble right now." } }]);
  });

  it('a solve that is not JSON reads as a failed solve', async () => {
    const { deps } = setup([write(A, B, C), 'I think the answer is B']);
    const out = ok(await writeDrafts(REQUEST, deps, hooks()));
    expect(out.notes[0].id).toBe('run.keyNotChecked');
    expect(checkOf(out.drafts[0], 'key').state).toBe('skipped');
  });

  it('a question the solver skipped has its key unchecked', async () => {
    const { deps } = setup([write(A, B, C), (req) => JSON.stringify({ answers: solveQuestions(req).slice(0, 2).map((q, i) => ({ id: q.id, working: '', answer: [2, 1][i], ambiguous: false })) })]);
    const out = ok(await writeDrafts(REQUEST, deps, hooks()));
    expect(checkOf(out.drafts[2], 'key').state).toBe('skipped');
    expect(out.drafts[2].status).toBe('look');
    expect(out.drafts[0].status).toBe('ok');
  });
});

describe('writeDrafts: the local checks', () => {
  it('a copy of a bank question is rewritten once', async () => {
    const corpus = corpusOf([{ en: [A.stem.en, ...A.options.map((o) => o.en)].join(' '), zh: [A.stem.zh, ...A.options.map((o) => o.zh)].join(' ') }]);
    const { client, deps } = setup([write(A, B, C), write(D), solver()], corpus);
    const stages: Stage[] = [];
    const out = ok(await writeDrafts(REQUEST, deps, hooks(stages)));
    expect(stages).toEqual(['write', 'rewrite', 'solve']);
    expect(userOf(client.requests[1]).redo[0].problem).toMatch(/existing question/);
    expect(out.drafts[0]).toMatchObject({ attempt: 2, status: 'ok' });
    expect(out.drafts[0].draft.stem.en).toBe(D.stem.en);
    expect(userOf(client.requests[2]).questions).toHaveLength(3);
    expect(out.usage.requests).toBe(3);
  });

  it('a draft that is a copy twice is left out, never solved, and noted', async () => {
    const corpus = corpusOf([{ en: [A.stem.en, ...A.options.map((o) => o.en)].join(' ') }]);
    const { client, deps } = setup([write(A, B, C), write(A), solver()], corpus);
    const out = ok(await writeDrafts(REQUEST, deps, hooks()));
    expect(out.drafts[0].status).toBe('failed');
    expect(checkOf(out.drafts[0], 'copy')).toMatchObject({ state: 'fail', findings: [{ id: 'copy.close' }] });
    expect(checkOf(out.drafts[0], 'copy').value).toBeGreaterThanOrEqual(30);
    expect(userOf(client.requests[2]).questions).toHaveLength(2);
    expect(out.notes).toContainEqual({ id: 'run.fewer', params: { asked: 3, got: 2 } });
  });

  it('a draft that copies the example it was shown is caught as a copy of that example', async () => {
    const copy: Invented = { ...A, stem: EXAMPLE.stem, options: EXAMPLE.options, statements: [], answer: 1 };
    const { deps } = setup([write(copy, B, C), write(D), solver()]);
    const out = ok(await writeDrafts({ ...REQUEST, examples: [EXAMPLE] }, deps, hooks()));
    expect(out.drafts[0].attempt).toBe(2);
  });

  it('drafts too close to each other: the later one is rewritten', async () => {
    const { deps } = setup([write(A, A, C), write(D), solver()]);
    const out = ok(await writeDrafts(REQUEST, deps, hooks()));
    expect(out.drafts[0].attempt).toBe(1);
    expect(out.drafts[1]).toMatchObject({ attempt: 2 });
    expect(out.drafts[1].draft.stem.en).toBe(D.stem.en);
  });

  it('a broken shape (three options) fails and is rewritten once', async () => {
    const broken = { ...replyEntry(A), options: replyEntry(A).options.slice(0, 3) };
    const { client, deps } = setup([JSON.stringify({ questions: [broken, replyEntry(B), replyEntry(C)] }), write(D), solver()]);
    const out = ok(await writeDrafts(REQUEST, deps, hooks()));
    expect(userOf(client.requests[1]).redo[0].problem).toMatch(/3 options; it needs exactly 4/);
    expect(out.drafts[0].draft.stem.en).toBe(D.stem.en);
  });

  it('a draft that fails after its rewrite is returned failed, with its shape finding', async () => {
    const broken = { ...replyEntry(A), answer: 7 };
    const { deps } = setup([JSON.stringify({ questions: [broken, replyEntry(B), replyEntry(C)] }), JSON.stringify({ questions: [broken] }), solver()]);
    const out = ok(await writeDrafts(REQUEST, deps, hooks()));
    expect(out.drafts[0].status).toBe('failed');
    expect(checkOf(out.drafts[0], 'shape').findings).toEqual([{ id: 'shape.keyRange' }]);
  });

  it('reports a number that differs between the two sides', async () => {
    const slip: Invented = { ...A, stem: { en: A.stem.en.replace('$25', '$25 million'), zh: A.stem.zh } };
    const { deps } = setup([write(slip, B, C), solver()]);
    const out = ok(await writeDrafts(REQUEST, deps, hooks()));
    expect(out.drafts[0].status).toBe('look');
    expect(checkOf(out.drafts[0], 'numbers').findings[0]).toMatchObject({ id: 'numbers.differ' });
  });

  it('reports an out-of-syllabus term, and key letters used too often', async () => {
    const giffen: Invented = { ...A, stem: { en: `${A.stem.en} Giffen goods aside, what is it?`, zh: A.stem.zh } };
    const same = (item: Invented, answer: number): Invented => ({ ...item, answer });
    const { deps } = setup([write(giffen, same(B, 2), same(C, 2)), solver({ [B.stem.en]: 2, [C.stem.en]: 2 })]);
    const out = ok(await writeDrafts(REQUEST, deps, hooks()));
    expect(checkOf(out.drafts[0], 'syllabus').findings[0]).toMatchObject({ id: 'syllabus.limited', params: { term: 'Giffen goods' } });
    expect(out.notes).toContainEqual({ id: 'lint.keySpread', params: { letter: 'C', count: 3, of: 3 } });
  });

  it('notes a draft whose shape is not the one asked for', async () => {
    const { deps } = setup([write(A, B, C), solver()]);
    const out = ok(await writeDrafts({ ...REQUEST, shape: 'combination' }, deps, hooks()));
    expect(checkOf(out.drafts[0], 'lint').findings).toEqual([{ id: 'lint.shapeAsked', params: { asked: 'combination', got: 'plain' } }]);
    expect(checkOf(out.drafts[2], 'lint').findings).toEqual([]);
    const plain = setup([write(A, B, C), solver()]);
    const asked = ok(await writeDrafts({ ...REQUEST, shape: 'plain' }, plain.deps, hooks()));
    expect(checkOf(asked.drafts[2], 'lint').findings[0]).toMatchObject({ id: 'lint.shapeAsked', params: { asked: 'plain', got: 'combination' } });
  });

  it('fixes an EDB deny form in place (供給 → 供應) through the glossary', async () => {
    const withDeny: Invented = { ...A, stem: { en: 'A fall in supply raises the price of the good. Demand for the good is', zh: '供給下跌令該物品價格上升。該物品的需求' } };
    const { deps } = setup([write(withDeny), solver({ [withDeny.stem.en]: 2 })], EMPTY_CORPUS, true);
    const out = ok(await writeDrafts({ ...REQUEST, count: 1 }, deps, hooks()));
    expect(out.drafts[0].draft.stem.zh).toContain('供應');
    expect(out.drafts[0].draft.stem.zh).not.toContain('供給');
  });
});

describe('writeDrafts: failing and stopping', () => {
  it('a cut-off reply is a truncated error', async () => {
    const cut: CompletionResult = { text: '{"questions":[', finish: 'length', dialect: 'gemini-jsonSchema', model: 'x', ms: 1 };
    const { deps } = setup([cut]);
    const out = await writeDrafts(REQUEST, deps, hooks());
    expect(out).toMatchObject({ ok: false, error: { kind: 'truncated' } });
  });

  it('a reply that is not the asked JSON is a badOutput error', async () => {
    const { deps } = setup(['Sure! Here are some questions.']);
    expect(await writeDrafts(REQUEST, deps, hooks())).toMatchObject({ ok: false, error: { kind: 'badOutput' } });
  });

  it('a provider error is returned as it is', async () => {
    const { deps } = setup([new AiError(aiErrorInfo('region', 'gemini'))]);
    const out = await writeDrafts(REQUEST, deps, hooks());
    expect(out).toMatchObject({ ok: false, error: { kind: 'region', fatal: true } });
  });

  it('Stop during the first write is a cancelled error, nothing kept', async () => {
    const controller = new AbortController();
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const { deps } = setup([() => { controller.abort(); throw abort; }]);
    const out = await writeDrafts(REQUEST, deps, { signal: controller.signal });
    expect(out).toMatchObject({ ok: false, error: { kind: 'cancelled' } });
  });

  it('Stop after the write keeps the drafts, with the key unchecked', async () => {
    const controller = new AbortController();
    const { client, deps } = setup([() => { controller.abort(); return write(A, B, C); }, solver()]);
    const out = ok(await writeDrafts(REQUEST, deps, { signal: controller.signal }));
    expect(client.requests).toHaveLength(1);
    expect(out.drafts).toHaveLength(3);
    expect(out.notes).toContainEqual({ id: 'run.stopped' });
    expect(checkOf(out.drafts[0], 'key').state).toBe('skipped');
  });

  it('never makes more than five requests', async () => {
    const { client, deps } = setup([write(A, A, A), write(A, A), solver({ [A.stem.en]: 0 }), write(A), solver({ [A.stem.en]: 0 }), write(A), solver()]);
    await writeDrafts(REQUEST, deps, hooks());
    expect(client.requests.length).toBeLessThanOrEqual(5);
  });
});

describe('refine', () => {
  const sheet = async () => {
    const { deps } = setup([write(A, B, C), solver()]);
    return ok(await writeDrafts(REQUEST, deps, hooks())).drafts;
  };

  it('Harder rewrites one draft in place: a rewrite payload at level harder, the others to avoid', async () => {
    const drafts = await sheet();
    const { client, deps } = setup([write(D), solver()]);
    const out = ok(await refine(REQUEST, drafts[1], { kind: 'harder' }, [drafts[0], drafts[2]], deps, hooks()));
    const payload = userOf(client.requests[0]);
    expect(payload.make).toMatchObject({ count: 1, level: 'harder' });
    expect(payload.rewrite).toMatchObject({ how: 'harder', draft: { stem: { en: B.stem.en }, answer: 1 } });
    expect(payload.avoid).toHaveLength(2);
    expect(out.drafts).toHaveLength(1);
    expect(out.drafts[0]).toMatchObject({ status: 'ok' });
    expect(out.drafts[0].id).not.toBe(drafts[1].id);
  });

  it('Easier and the Change line say what to change', async () => {
    const drafts = await sheet();
    const easy = setup([write(D), solver()]);
    await refine(REQUEST, drafts[0], { kind: 'easier' }, [], easy.deps, hooks());
    expect(userOf(easy.client.requests[0])).toMatchObject({ make: { level: 'easier' }, rewrite: { how: 'easier' } });
    const change = setup([write(D), solver()]);
    await refine(REQUEST, drafts[0], { kind: 'change', text: ' make #2 use property prices ' }, [], change.deps, hooks());
    expect(userOf(change.client.requests[0]).rewrite).toMatchObject({ how: 'change', note: 'make #2 use property prices' });
  });

  it('Another writes one more beside the others and must not repeat any of them', async () => {
    const drafts = await sheet();
    const { client, deps } = setup([write(A), write(D), solver()]);
    const out = ok(await refine(REQUEST, drafts[0], { kind: 'another' }, [drafts[1]], deps, hooks()));
    const payload = userOf(client.requests[0]);
    expect(payload.rewrite).toBeUndefined();
    expect(payload.make.count).toBe(1);
    expect(payload.avoid).toHaveLength(2);
    // The first reply repeats draft A word for word: caught as a copy of a draft on the sheet, then rewritten.
    expect(out.drafts[0].draft.stem.en).toBe(D.stem.en);
  });

  it('a refinement is not blamed for being near the draft it replaces', async () => {
    const drafts = await sheet();
    const { deps } = setup([write(A), solver()]);
    const out = ok(await refine(REQUEST, drafts[0], { kind: 'harder' }, [], deps, hooks()));
    expect(out.drafts[0].status).toBe('ok');
  });
});

describe('parseSolveReply', () => {
  it('reads answers by id and drops an entry with no usable answer', () => {
    const map = parseSolveReply('noise {"answers":[{"id":"d1","working":"w","answer":2,"ambiguous":true},{"id":"d2","answer":9},{"id":"d3","answer":"B"},{"answer":1},{"id":"d4","working":"","answer":0,"ambiguous":false}]} end');
    expect([...map!.keys()]).toEqual(['d1', 'd4']);
    expect(map!.get('d1')).toEqual({ answer: 2, working: 'w', ambiguous: true });
  });
  it('is null for anything that is not the asked JSON', () => {
    expect(parseSolveReply('B')).toBeNull();
    expect(parseSolveReply('{"answers":"B"}')).toBeNull();
    expect(parseSolveReply('{oops')).toBeNull();
  });
});
