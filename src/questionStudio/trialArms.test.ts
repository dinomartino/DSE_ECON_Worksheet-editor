import { describe, expect, it } from 'vitest';
import { presetFor } from '@/ai/providers';
import type { CompletionRequest } from '@/ai/types';
import { scriptedClient } from '@/translate/testKit';
import { EXAMPLE, INVENTED, REQUEST, okOutcome, solver, studioDraft, writeReply } from './fixtures';
import { EMPTY_CORPUS } from './nearCopy';
import type { StudioEnv } from './session';
import { TRIAL_BRIEFS } from './trialBriefs';
import { armOfSummary, briefsDone, createTrialLog, parseTrialLog, summaryOf, TRIAL_LOG_KEY } from './trialLog';
import { requestForArm, runBriefs } from './trialRun';
import { ARM_WORDS, reportText, tally } from './trialScore';
import type { SourceQuestion, StudioRequest } from './types';

const [A, B, C] = INVENTED;
const seeded = () => {
  let n = 9;
  return () => {
    n = (n * 9301 + 49297) % 233280;
    return n / 233280;
  };
};
const refs: SourceQuestion[] = ['r1', 'r2', 'r3'].map((id) => ({ ...EXAMPLE, id, auto: true }));
const envWith = (client: ReturnType<typeof scriptedClient>, references?: StudioEnv['references']): StudioEnv => ({
  resolve: async () => ({ ok: true, deps: { client, preset: presetFor('gemini'), glossary: null, corpus: EMPTY_CORPUS, random: seeded() }, compared: { past: 10, mine: 0 } }),
  ...(references ? { references } : {}),
});
const isWrite = (req: CompletionRequest) => (JSON.parse(req.turns.at(-1)!.content) as { task?: string }).task === 'question-studio-write';
const provider = () => {
  const solve = solver();
  return scriptedClient([(req) => (isWrite(req) ? writeReply([A, B, C]) : solve(req))]);
};
const withExample = TRIAL_BRIEFS.find((b) => b.example)!;
const plain = TRIAL_BRIEFS.find((b) => !b.example)!;
const live = () => new AbortController().signal;

describe('the three ways to write a brief', () => {
  it('today: the key point alone, even for a brief that carries an example', async () => {
    const env = envWith(provider(), async () => refs);
    expect((await requestForArm(plain, 'today', env, live())).examples).toEqual([]);
    expect((await requestForArm(withExample, 'today', env, live())).examples).toEqual([]);
  });

  it('refs: the real questions the studio picks, as a style (the brief’s own example is not used)', async () => {
    const env = envWith(provider(), async () => refs);
    const request = await requestForArm(withExample, 'refs', env, live());
    expect(request.examples.map((e) => e.id)).toEqual(['r1', 'r2', 'r3']);
    expect(request.strict).not.toBe(true);
  });

  it('strict: the brief’s own example when it has one, else the first real question, picked and strict', async () => {
    const env = envWith(provider(), async () => refs);
    const own = await requestForArm(withExample, 'strict', env, live());
    expect(own.examples).toHaveLength(1);
    expect(own).toMatchObject({ strict: true });
    const real = await requestForArm(plain, 'strict', env, live());
    expect(real.examples.map((e) => [e.id, e.auto])).toEqual([['r1', false]]);
    expect(real.strict).toBe(true);
    expect((await requestForArm(plain, 'strict', envWith(provider()), live())).examples).toEqual([]);
  });
});

describe('running briefs in an arm', () => {
  const three = TRIAL_BRIEFS.slice(0, 2);

  it('records the arm, and resumes each arm on its own', async () => {
    const log = createTrialLog(undefined);
    const env = envWith(provider(), async () => refs);
    await runBriefs({ env, log, signal: live(), briefs: three, arm: 'refs' });
    expect(log.getState().runs.map((r) => r.arm)).toEqual(['refs', 'refs']);
    expect(log.getState().runs[0].request).toMatchObject({ examples: 3, reference: 'style', auto: true });
    expect([...briefsDone(log.getState().runs, 'refs')]).toEqual(['B01', 'B02']);
    expect([...briefsDone(log.getState().runs, 'today')]).toEqual([]);
    await runBriefs({ env, log, signal: live(), briefs: three, arm: 'today' });
    expect(log.getState().runs.map((r) => r.arm)).toEqual(['refs', 'refs', 'today', 'today']);
    expect(log.getState().runs[2].request).toMatchObject({ examples: 0, reference: 'none' });
    await runBriefs({ env, log, signal: live(), briefs: three, arm: 'strict' });
    expect(log.getState().runs.at(-1)).toMatchObject({ arm: 'strict', request: { examples: 1, reference: 'pattern' } });
  });

  it('the default is the studio’s own way: with its real questions', async () => {
    const log = createTrialLog(undefined);
    await runBriefs({ env: envWith(provider(), async () => refs), log, signal: live(), briefs: three.slice(0, 1) });
    expect(log.getState().runs[0].arm).toBe('refs');
  });

  it('a request of the teacher’s own is put in an arm by what it held', () => {
    const log = createTrialLog(undefined);
    const add = (request: StudioRequest) => log.getState().record({ label: 'mine', kind: 'write', request, outcome: okOutcome([studioDraft('d1')]) });
    add(REQUEST);
    add({ ...REQUEST, examples: refs });
    add({ ...REQUEST, examples: [EXAMPLE], strict: true });
    add({ ...REQUEST, examples: [EXAMPLE], strict: false });
    expect(log.getState().runs.map((r) => r.arm)).toEqual(['today', 'refs', 'strict', 'style']);
    expect(armOfSummary(summaryOf(REQUEST))).toBe('today');
  });

  it('a record kept before the arms existed reads as the key point alone', () => {
    const log = createTrialLog(undefined);
    log.getState().record({ label: 'B01', kind: 'write', request: REQUEST, outcome: okOutcome([studioDraft('d1')]) });
    const stored = JSON.parse(JSON.stringify({ version: 1, runs: log.getState().runs })) as { runs: Array<{ arm?: string; request: { reference?: string; auto?: boolean } }> };
    delete stored.runs[0].arm;
    delete stored.runs[0].request.reference;
    delete stored.runs[0].request.auto;
    const old = JSON.stringify(stored);
    const [read] = parseTrialLog(old);
    expect(read.arm).toBe('today');
    expect(read.request).toMatchObject({ reference: 'none', auto: false });
    expect(TRIAL_LOG_KEY).toBe('econgen.studioTrial.v1');
  });
});

describe('the two extra marks and the ways compared', () => {
  const setup = () => {
    const log = createTrialLog(undefined);
    const run = (arm: 'today' | 'refs', ids: string[]) =>
      log.getState().record({ label: 'B01', kind: 'write', arm, request: REQUEST, outcome: okOutcome(ids.map((id) => studioDraft(id))) });
    run('today', ['t1', 't2']);
    run('refs', ['r1', 'r2']);
    return log;
  };

  it('sets and takes back each mark on its own', () => {
    const log = setup();
    log.getState().mark('t1', { dse: 'no', tested: 'yes' });
    log.getState().mark('r1', { dse: 'yes' });
    const drafts = log.getState().runs.flatMap((r) => r.drafts);
    expect(drafts.map((d) => [d.dse, d.tested])).toEqual([['no', 'yes'], [undefined, undefined], ['yes', undefined], [undefined, undefined]]);
    log.getState().mark('t1', { dse: null });
    expect(log.getState().runs[0].drafts[0]).not.toHaveProperty('dse');
    expect(log.getState().runs[0].drafts[0].tested).toBe('yes');
  });

  it('are not part of the bar: both marks are still needed from the old two', () => {
    const log = setup();
    log.getState().mark('t1', { dse: 'yes', tested: 'yes' });
    expect(tally(log.getState().runs).marks.marked).toBe(0);
  });

  it('tallies each way of writing, and the report says them in words', () => {
    const log = setup();
    log.getState().mark('t1', { dse: 'no', tested: 'no', key: 'ok', use: 'reject' });
    log.getState().mark('t2', { dse: 'no', tested: 'yes' });
    log.getState().mark('r1', { dse: 'yes', tested: 'yes', key: 'ok', use: 'asis' });
    log.getState().mark('r2', { dse: 'yes', tested: 'no' });
    const score = tally(log.getState().runs);
    expect(score.style).toEqual({ dseMarked: 4, dseYes: 2, testedMarked: 4, testedYes: 2 });
    expect(score.byArm).toEqual([
      { arm: 'today', shown: 2, keyMarked: 1, keyOk: 1, useMarked: 1, usable: 0, dseMarked: 2, dseYes: 0, testedMarked: 2, testedYes: 1 },
      { arm: 'refs', shown: 2, keyMarked: 1, keyOk: 1, useMarked: 1, usable: 1, dseMarked: 2, dseYes: 2, testedMarked: 2, testedYes: 1 },
    ]);
    const text = reportText(log.getState().runs, new Date('2026-11-24T00:00:00Z'));
    expect(text).toContain('Style and concepts');
    expect(text).toContain(`${ARM_WORDS.today}: 2 shown · key ok 1/1 (100%) · usable 0/1 (0%) · DSE-like 0/2 (0%) · commonly tested 1/2 (50%)`);
    expect(text).toContain(`${ARM_WORDS.refs}: 2 shown`);
  });
});
