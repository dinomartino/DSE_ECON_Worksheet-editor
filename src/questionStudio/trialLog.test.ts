import { describe, expect, it } from 'vitest';
import { aiErrorInfo } from '@/ai/errors';
import { EXAMPLE, INVENTED, REQUEST, cleanRows, okOutcome, studioDraft, usageOf } from './fixtures';
import { TRIAL_LOG_KEY, briefsDone, createTrialLog, findDraft, isMarked, parseTrialLog, shownDrafts, summaryOf } from './trialLog';

const memoryStorage = (seed: Record<string, string> = {}) => {
  const data = new Map(Object.entries(seed));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
};

const compared = { past: 1759, mine: 4 };
const failedCopy = () => studioDraft('gone', { rows: [{ id: 'copy', state: 'fail', findings: [{ id: 'copy.close', params: { percent: 40, with: 'bank', verbatim: 0 } }], value: 40 }] });

describe('what the record keeps of a request', () => {
  it('is what was asked and no more: the examples are counted, never kept', () => {
    const summary = summaryOf({ ...REQUEST, points: ['C.ped#arc'], examples: [EXAMPLE], note: ' HK prices ' });
    expect(summary).toEqual({ keyPoint: 'C.ped', points: 1, examples: 1, reference: 'style', auto: false, note: true, count: 3, level: 'same', shape: 'any', sides: ['en', 'zh'] });
    expect(JSON.stringify(summary)).not.toContain('pen');
    expect(summaryOf(REQUEST).note).toBe(false);
  });
});

describe('recording a run', () => {
  it('keeps a write’s drafts with their checks, the model, the usage and what the near-copy check compared', () => {
    const log = createTrialLog(undefined);
    log.getState().record({ label: 'B07', kind: 'write', request: REQUEST, outcome: okOutcome([studioDraft('d1'), failedCopy()], { notes: [{ id: 'batch.keyLetter' }] }), compared, at: '2026-11-24T01:00:00.000Z' });
    const [run] = log.getState().runs;
    expect(run).toMatchObject({ label: 'B07', kind: 'write', ok: true, model: 'fake-model', at: '2026-11-24T01:00:00.000Z', compared, notes: ['batch.keyLetter'] });
    expect(run.usage).toEqual(usageOf());
    expect(run.drafts.map((d) => d.id)).toEqual(['d1', 'gone']);
    expect(run.drafts[0].draft.checks).toHaveLength(8);
    expect(run.drafts.every((d) => d.key === undefined && d.use === undefined)).toBe(true);
  });

  it('keeps a run that failed or was stopped, with its cost and no drafts', () => {
    const log = createTrialLog(undefined);
    log.getState().record({ label: 'mine', kind: 'write', request: REQUEST, outcome: { ok: false, error: aiErrorInfo('quota', 'gemini'), usage: usageOf({ requests: 1 }) } });
    log.getState().record({ label: 'B01', kind: 'write', request: REQUEST, outcome: { ok: false, error: aiErrorInfo('cancelled', 'gemini'), usage: usageOf({ requests: 1 }) } });
    const runs = log.getState().runs;
    expect(runs.map((r) => [r.ok, r.error, r.drafts.length])).toEqual([[false, 'quota', 0], [false, 'cancelled', 0]]);
    expect(runs[0].usage.requests).toBe(1);
  });
});

describe('marking', () => {
  const setup = () => {
    const log = createTrialLog(undefined);
    log.getState().record({ label: 'B01', kind: 'write', request: REQUEST, outcome: okOutcome([studioDraft('a'), studioDraft('b')]), compared });
    return log;
  };

  it('sets and takes back each mark on its own draft', () => {
    const log = setup();
    log.getState().mark('a', { key: 'ok' });
    log.getState().mark('a', { use: 'edit' });
    const [a, b] = log.getState().runs[0].drafts;
    expect([a.key, a.use, isMarked(a)]).toEqual(['ok', 'edit', true]);
    expect([b.key, b.use, isMarked(b)]).toEqual([undefined, undefined, false]);
    log.getState().mark('a', { key: null });
    expect(log.getState().runs[0].drafts[0]).not.toHaveProperty('key');
    expect(isMarked(log.getState().runs[0].drafts[0])).toBe(false);
    log.getState().mark('nope', { key: 'bad' });
    expect(log.getState().runs[0].drafts.map((d) => d.key)).toEqual([undefined, undefined]);
  });

  it('never changes what was recorded: the draft and its checks stay as the studio wrote them', () => {
    const log = setup();
    const before = JSON.stringify(log.getState().runs[0].drafts[0].draft);
    log.getState().mark('a', { key: 'bad', use: 'reject' });
    expect(JSON.stringify(log.getState().runs[0].drafts[0].draft)).toBe(before);
  });
});

describe('reading the record', () => {
  const runs = () => {
    const log = createTrialLog(undefined);
    log.getState().record({ label: 'B02', kind: 'write', request: REQUEST, outcome: okOutcome([studioDraft('a'), failedCopy()]), compared });
    log.getState().record({ label: 'B03', kind: 'write', request: REQUEST, outcome: { ok: false, error: aiErrorInfo('network', 'gemini'), usage: usageOf() } });
    log.getState().record({ label: 'mine', kind: 'write', request: REQUEST, outcome: okOutcome([studioDraft('c', { from: INVENTED[1] })]), compared });
    log.getState().record({ label: 'B04', kind: 'refine', request: REQUEST, outcome: okOutcome([studioDraft('d')]), compared });
    return log.getState().runs;
  };

  it('shows every draft, one with a failed hard check too (k-0531)', () => {
    expect(shownDrafts(runs()).map(({ entry }) => entry.id)).toEqual(['a', 'gone', 'c', 'd']);
  });

  it('counts a brief as done once it has drafts: not when it failed, and not a refinement under its name', () => {
    expect([...briefsDone(runs())]).toEqual(['B02']);
  });

  it('finds a draft with its run', () => {
    expect(findDraft(runs(), 'c')?.run.label).toBe('mine');
    expect(findDraft(runs(), 'zzz')).toBeUndefined();
  });
});

describe('keeping it between visits', () => {
  it('saves every run and mark, and the next visit starts from them', () => {
    const storage = memoryStorage();
    const first = createTrialLog(storage);
    first.getState().record({ label: 'B01', kind: 'write', request: REQUEST, outcome: okOutcome([studioDraft('a')]), compared });
    first.getState().mark('a', { key: 'ok', use: 'asis' });
    const second = createTrialLog(storage);
    expect(second.getState().runs).toHaveLength(1);
    expect(second.getState().runs[0].drafts[0]).toMatchObject({ id: 'a', key: 'ok', use: 'asis' });
    expect(second.getState().runs[0].drafts[0].draft.checks).toEqual(cleanRows());
  });

  it('forgets everything on Clear, and the saved copy goes too', () => {
    const storage = memoryStorage();
    const log = createTrialLog(storage);
    log.getState().record({ label: 'B01', kind: 'write', request: REQUEST, outcome: okOutcome([studioDraft('a')]), compared });
    expect(storage.data.has(TRIAL_LOG_KEY)).toBe(true);
    log.getState().clear();
    expect(log.getState().runs).toEqual([]);
    expect(storage.data.has(TRIAL_LOG_KEY)).toBe(false);
  });

  it('reads a damaged or foreign record as empty, and drops only the run that is not what it wrote', () => {
    expect(parseTrialLog(null)).toEqual([]);
    expect(parseTrialLog('not json')).toEqual([]);
    expect(parseTrialLog(JSON.stringify({ version: 2, runs: [] }))).toEqual([]);
    expect(parseTrialLog(JSON.stringify([1, 2]))).toEqual([]);
    const good = createTrialLog(undefined);
    good.getState().record({ label: 'B01', kind: 'write', request: REQUEST, outcome: okOutcome([studioDraft('a')]), compared });
    const [run] = good.getState().runs;
    const raw = JSON.stringify({ version: 1, runs: [run, { id: 'x' }, { ...run, id: 'y', drafts: [{ id: 'z' }] }, null] });
    expect(parseTrialLog(raw).map((r) => r.id)).toEqual([run.id]);
  });

  it('says when it could not save, and stops saying so once it can; works with no storage at all', () => {
    let full = true;
    const storage = { ...memoryStorage(), setItem: () => { if (full) throw new Error('QuotaExceededError'); } };
    const log = createTrialLog(storage);
    log.getState().record({ label: 'B01', kind: 'write', request: REQUEST, outcome: okOutcome([studioDraft('a')]), compared });
    expect(log.getState().saveFailed).toBe(true);
    expect(log.getState().runs).toHaveLength(1);
    full = false;
    log.getState().mark('a', { key: 'ok' });
    expect(log.getState().saveFailed).toBe(false);
    const none = createTrialLog(undefined);
    none.getState().record({ label: 'mine', kind: 'write', request: REQUEST, outcome: okOutcome([studioDraft('b')]) });
    expect(none.getState().runs).toHaveLength(1);
    expect(none.getState().saveFailed).toBe(false);
  });

  it('starts empty when the storage will not even be read', () => {
    const storage = { getItem: () => { throw new Error('blocked'); }, setItem: () => {}, removeItem: () => {} };
    expect(createTrialLog(storage).getState().runs).toEqual([]);
  });
});
