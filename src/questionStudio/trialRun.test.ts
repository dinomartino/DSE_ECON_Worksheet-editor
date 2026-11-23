import { describe, expect, it } from 'vitest';
import { aiErrorInfo } from '@/ai/errors';
import { presetFor } from '@/ai/providers';
import { AiError, type CompletionRequest } from '@/ai/types';
import { scriptedClient } from '@/translate/testKit';
import { INVENTED, solver, writeReply } from './fixtures';
import { EMPTY_CORPUS } from './nearCopy';
import type { StudioEnv } from './session';
import { TRIAL_BRIEFS } from './trialBriefs';
import { briefsDone, createTrialLog } from './trialLog';
import { createBriefRunner, runBriefs, type BriefProgress } from './trialRun';

const [A, B, C] = INVENTED;
const preset = presetFor('gemini');
const compared = { past: 1759, mine: 2 };
const three = TRIAL_BRIEFS.slice(0, 3);
const seeded = () => {
  let n = 5;
  return () => {
    n = (n * 9301 + 49297) % 233280;
    return n / 233280;
  };
};
const body = (req: CompletionRequest) => JSON.parse(req.turns.at(-1)!.content) as { task?: string; avoid?: unknown[]; syllabus?: { keyPoint: { en: string } } };
const isWrite = (req: CompletionRequest) => body(req).task === 'question-studio-write';

/** A provider that writes the three invented questions and solves with their keys; `during` may fail a write. */
function provider(during?: (req: CompletionRequest) => void) {
  const solve = solver();
  return scriptedClient([
    (req) => {
      if (isWrite(req)) during?.(req);
      return isWrite(req) ? writeReply([A, B, C]) : solve(req);
    },
  ]);
}

const envWith = (client: ReturnType<typeof scriptedClient>): StudioEnv => ({
  resolve: async () => ({ ok: true, deps: { client, preset, glossary: null, corpus: EMPTY_CORPUS, random: seeded() }, compared }),
});

/** The key point a write request is about (B02 is "Scarcity, choice and opportunity cost"). */
const scarcity = (req: CompletionRequest) => body(req).syllabus?.keyPoint.en.startsWith('Scarcity') === true;

describe('running the invented briefs', () => {
  it('asks each in order and records each under its brief, with what the near-copy check compared', async () => {
    const client = provider();
    const log = createTrialLog(undefined);
    const progress: BriefProgress[] = [];
    const end = await runBriefs({ env: envWith(client), log, signal: new AbortController().signal, briefs: three, onProgress: (p) => progress.push(p) });
    expect(end).toEqual({ kind: 'finished' });
    expect(client.requests.filter(isWrite).length).toBeGreaterThanOrEqual(3);
    expect(log.getState().runs.map((run) => run.label)).toEqual(['B01', 'B02', 'B03']);
    expect(log.getState().runs.every((run) => run.ok && run.kind === 'write' && run.drafts.length === 3)).toBe(true);
    expect(log.getState().runs[0].compared).toEqual(compared);
    expect(log.getState().runs[0].request).toMatchObject({ keyPoint: three[0].keyPoint, level: three[0].level, shape: three[0].shape });
    expect(progress[0]).toMatchObject({ done: 0, total: 3, current: 'B01' });
    expect(progress.at(-1)).toEqual({ done: 3, total: 3 });
    expect([...briefsDone(log.getState().runs)]).toEqual(['B01', 'B02', 'B03']);
  });

  it('does not tell a brief about the drafts of the one before: each is judged on its own', async () => {
    const client = provider();
    await runBriefs({ env: envWith(client), log: createTrialLog(undefined), signal: new AbortController().signal, briefs: three });
    for (const req of client.requests.filter(isWrite)) expect(body(req).avoid ?? []).toEqual([]);
  });

  it('carries on where it left off: a brief that has drafts is not asked again', async () => {
    const log = createTrialLog(undefined);
    await runBriefs({ env: envWith(provider()), log, signal: new AbortController().signal, briefs: three.slice(0, 1) });
    expect(log.getState().runs.map((run) => run.label)).toEqual(['B01']);
    const client = provider();
    const end = await runBriefs({ env: envWith(client), log, signal: new AbortController().signal, briefs: three });
    expect(end).toEqual({ kind: 'finished' });
    expect(log.getState().runs.map((run) => run.label)).toEqual(['B01', 'B02', 'B03']);
    // B01's key point (price elasticity) was not written again.
    expect(client.requests.filter(isWrite).some((req) => body(req).syllabus?.keyPoint.en.startsWith('Price elasticity of demand'))).toBe(false);
  });

  it('stops at the first error, keeps what was done and says what went wrong; the failed brief is asked again next time', async () => {
    const client = provider((req) => {
      if (scarcity(req)) throw new AiError(aiErrorInfo('quota', 'gemini'));
    });
    const log = createTrialLog(undefined);
    const end = await runBriefs({ env: envWith(client), log, signal: new AbortController().signal, briefs: three });
    expect(end).toMatchObject({ kind: 'error', error: { kind: 'quota' } });
    expect(log.getState().runs.map((run) => [run.label, run.ok, run.error])).toEqual([['B01', true, undefined], ['B02', false, 'quota']]);
    expect([...briefsDone(log.getState().runs)]).toEqual(['B01']);
  });

  it('says so, and asks nothing, when the provider is not set up', async () => {
    const error = aiErrorInfo('notConfigured', 'gemini');
    const log = createTrialLog(undefined);
    const end = await runBriefs({ env: { resolve: async () => ({ ok: false, error }) }, log, signal: new AbortController().signal, briefs: three });
    expect(end).toEqual({ kind: 'error', error });
    expect(log.getState().runs).toEqual([]);
  });

  it('stops when the teacher stops, before a brief or in the middle of one, and keeps the cost of the one cut off', async () => {
    const before = new AbortController();
    before.abort();
    const idle = provider();
    expect(await runBriefs({ env: envWith(idle), log: createTrialLog(undefined), signal: before.signal, briefs: three })).toEqual({ kind: 'stopped' });
    expect(idle.requests).toHaveLength(0);

    const during = new AbortController();
    const client = provider((req) => {
      if (!scarcity(req)) return;
      during.abort();
      throw new Error('aborted');
    });
    const log = createTrialLog(undefined);
    const end = await runBriefs({ env: envWith(client), log, signal: during.signal, briefs: three });
    expect(end).toEqual({ kind: 'stopped' });
    expect(log.getState().runs.map((run) => [run.label, run.error])).toEqual([['B01', undefined], ['B02', 'cancelled']]);
    expect([...briefsDone(log.getState().runs)]).toEqual(['B01']);
  });

  it('keeps going when a run’s record cannot be kept', async () => {
    const log = createTrialLog(undefined);
    const original = log.getState().record;
    let calls = 0;
    log.setState({
      record: (entry) => {
        calls += 1;
        if (calls === 1) throw new Error('storage full');
        original(entry);
      },
    });
    const end = await runBriefs({ env: envWith(provider()), log, signal: new AbortController().signal, briefs: three.slice(0, 2) });
    expect(end).toEqual({ kind: 'finished' });
    expect(log.getState().runs.map((run) => run.label)).toEqual(['B02']);
  });
});

describe('the run as app state', () => {
  it('shows its progress while it runs, ends with how it ended, and runs one at a time', async () => {
    const log = createTrialLog(undefined);
    const runner = createBriefRunner(envWith(provider()), log, three);
    const seen: Array<number | undefined> = [];
    const stop = runner.subscribe((state) => seen.push(state.progress?.done));
    const first = runner.getState().start();
    expect(runner.getState().progress).toMatchObject({ done: 0, total: 3 });
    await runner.getState().start();
    await first;
    stop();
    expect(runner.getState().progress).toBeUndefined();
    expect(runner.getState().end).toEqual({ kind: 'finished' });
    expect(log.getState().runs.map((run) => run.label)).toEqual(['B01', 'B02', 'B03']);
    expect(seen.at(-1)).toBeUndefined();
    runner.getState().dismiss();
    expect(runner.getState().end).toBeUndefined();
  });

  it('stops on Stop and keeps what was done; starting again takes up the rest', async () => {
    const log = createTrialLog(undefined);
    const holder: { runner?: ReturnType<typeof createBriefRunner> } = {};
    const client = provider((req) => {
      if (scarcity(req)) {
        holder.runner?.getState().stop();
        throw new Error('aborted');
      }
    });
    holder.runner = createBriefRunner(envWith(client), log, three);
    await holder.runner.getState().start();
    expect(holder.runner.getState().end).toEqual({ kind: 'stopped' });
    expect([...briefsDone(log.getState().runs)]).toEqual(['B01']);
    const rest = createBriefRunner(envWith(provider()), log, three);
    await rest.getState().start();
    expect(rest.getState().end).toEqual({ kind: 'finished' });
    expect([...briefsDone(log.getState().runs)].sort()).toEqual(['B01', 'B02', 'B03']);
  });

  it('is idle again, never stuck on running, when something throws', async () => {
    const runner = createBriefRunner({ resolve: async () => { throw new Error('settings unreadable'); } }, createTrialLog(undefined), three);
    await expect(runner.getState().start()).rejects.toThrow('settings unreadable');
    expect(runner.getState().progress).toBeUndefined();
  });
});
