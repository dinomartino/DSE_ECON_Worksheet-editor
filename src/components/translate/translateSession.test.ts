import { describe, expect, it } from 'vitest';
import type { AiErrorInfo } from '@/ai/types';
import type { TermRow } from '@/translate/types';
import { PAPER_REQUEST, WS_ID, fakePlan, job, result, reviewRun, seeded } from './sessionFixtures';
import {
  EMPTY_SESSION,
  acceptedKeys,
  acceptedTermFixes,
  closeIntent,
  filterCounts,
  hostAction,
  insertCount,
  isTicked,
  locationLabel,
  pendingKeys,
  reduceSession,
  restrictPlan,
  reviewGroups,
  sameRequest,
  selectableKeys,
  type SessionAction,
  type TranslateSession,
} from './translateSession';

const run = (state: TranslateSession, ...actions: SessionAction[]) => actions.reduce(reduceSession, state);
const OPTIONS = seeded().options!;
const REGION: AiErrorInfo = {
  kind: 'region',
  provider: 'gemini',
  status: 400,
  message: "Google's Gemini API doesn't serve your location.",
  fatal: true,
  actions: ['switchProvider'],
};

describe('translateSession reducer', () => {
  it('runs setup → running → review', () => {
    const plan = reviewRun().plan;
    let s = run(EMPTY_SESSION, { type: 'open', request: PAPER_REQUEST, options: OPTIONS, mode: 'translate' });
    expect(s.phase).toBe('setup');
    expect(s.scope).toEqual({ kind: 'paper' });
    s = run(s, { type: 'runStarted', plan }, { type: 'progress', progress: { phase: 'translating', requestsDone: 0, requestsTotal: 1 } });
    expect(s.phase).toBe('running');
    expect(s.progress?.requestsTotal).toBe(1);
    s = run(s, { type: 'runFinished', outcome: { results: reviewRun().results, stopped: false, model: 'm', ms: 5 } });
    expect(s.phase).toBe('review');
    expect(filterCounts(s.run)).toEqual({ all: 4, look: 2, failed: 1 });
  });

  it('ticks follow defaultAccepted; failed rows can never be ticked', () => {
    const s = seeded({ phase: 'review', run: reviewRun() });
    expect([...acceptedKeys(s)]).toEqual(['t1', 't2']);
    const all = run(s, { type: 'tick', keys: ['t1', 't2', 't3', 't4'], value: true });
    expect([...acceptedKeys(all)]).toEqual(['t1', 't2', 't3']);
    expect(insertCount(run(all, { type: 'tick', keys: ['t1'], value: false }))).toBe(2);
  });

  it('Stop with finished rows goes to review; Stop with none goes back to setup', () => {
    const base = seeded({ phase: 'running', run: { ...reviewRun(), results: new Map() } });
    const partial = new Map([['t1', result('t1', '政府')]]);
    const withRows = reduceSession(base, { type: 'runFinished', outcome: { results: partial, stopped: true, model: 'm', ms: 1 } });
    expect(withRows.phase).toBe('review');
    expect(withRows.run?.stopped).toBe(true);
    const none = reduceSession(base, { type: 'runFinished', outcome: { results: new Map(), stopped: true, model: '', ms: 0 } });
    expect(none.phase).toBe('setup');
    expect(none.run).toBeNull();
  });

  it('a fatal error keeps the finished rows reviewable', () => {
    const base = seeded({ phase: 'running', run: { ...reviewRun(), results: new Map() } });
    const partial = new Map([['t1', result('t1', '政府')]]);
    const s = reduceSession(base, { type: 'runFinished', outcome: { results: partial, fatal: REGION, stopped: false, model: 'm', ms: 1 } });
    expect(s.phase).toBe('error');
    expect(s.error?.kind).toBe('region');
    expect(s.run?.results.size).toBe(1);
    expect(reduceSession(s, { type: 'review' }).phase).toBe('review');
    expect(pendingKeys(s.run!)).toEqual(['t2', 't3', 't4']);
  });

  it('a retry keeps earlier results and merges the new ones', () => {
    const s0 = seeded({ phase: 'review', run: reviewRun() });
    const s1 = reduceSession(s0, { type: 'runStarted' });
    expect(s1.run).toBe(s0.run);
    const fixed = new Map([['t4', result('t4', 'P₁')]]);
    const s2 = reduceSession(s1, { type: 'runFinished', outcome: { results: fixed, stopped: false, model: '', ms: 2000 } });
    expect(s2.run?.results.size).toBe(4);
    expect(s2.run?.results.get('t4')?.status).toBe('ready');
    expect(s2.run?.results.get('t1')).toBe(s0.run?.results.get('t1'));
    expect(s2.run?.ms).toBe(13000);
    expect(s2.run?.model).toBe('Gemini 3.5 Flash-Lite');
  });

  it('Select All skips failed rows, and a retried row starts from its own default tick', () => {
    const s0 = seeded({ phase: 'review', run: reviewRun() });
    expect(selectableKeys(s0.run!, 'all')).toEqual(['t1', 't2', 't3']);
    expect(selectableKeys(s0.run!, 'look')).toEqual(['t2', 't3']);
    expect(selectableKeys(s0.run!, 'failed')).toEqual([]);
    // Even an explicit tick on the failed row is dropped once the retry answers it.
    const ticked = reduceSession(s0, { type: 'tick', keys: ['t1', 't2', 't3', 't4'], value: true });
    const retrying = reduceSession(ticked, { type: 'runStarted' });
    const risky = new Map([['t4', result('t4', 'P₁', { status: 'flagged', defaultAccepted: false })]]);
    const s1 = reduceSession(retrying, { type: 'runFinished', outcome: { results: risky, stopped: false, model: '', ms: 1 } });
    expect(isTicked(s1, 't4')).toBe(false);
    expect(isTicked(s1, 't3')).toBe(true);
  });

  it('Stop with only symbol copies and no finished row goes back to setup', () => {
    const copies = [{ path: 'c', side: 'zh' as const, sourceSnapshot: [], targetSnapshot: [], next: [] }];
    const r = reviewRun();
    const base = seeded({ phase: 'running', run: { ...r, plan: fakePlan([...r.plan.jobs.values()], copies), results: new Map() } });
    const s = reduceSession(base, { type: 'runFinished', outcome: { results: new Map(), stopped: true, model: '', ms: 0 } });
    expect(s.phase).toBe('setup');
  });

  it('the next term tick clears "Nothing replaced"', () => {
    const s = seeded({ mode: 'check', nothingInserted: true });
    expect(reduceSession(s, { type: 'toggleTerm', key: 'a#0', value: true }).nothingInserted).toBe(false);
  });

  it('closing asks first: Stop while running, Discard with rows pending', () => {
    const running = seeded({ phase: 'running', run: reviewRun() });
    expect(closeIntent(running)).toBe('askStop');
    expect(closeIntent({ ...running, confirm: { kind: 'stop' } })).toBe('stop');
    const review = seeded({ phase: 'review', run: reviewRun() });
    expect(closeIntent(review)).toBe('askDiscard');
    expect(closeIntent({ ...review, confirm: { kind: 'discard', then: 'close' } })).toBe('discard');
    expect(closeIntent({ ...review, nothingInserted: true })).toBe('close');
    expect(closeIntent(seeded())).toBe('close');
    expect(closeIntent(seeded({ mode: 'check' }))).toBe('close');
  });

  it('Discard from Back returns to setup and forgets the run', () => {
    const s = run(seeded({ phase: 'review', run: reviewRun() }), { type: 'confirm', confirm: { kind: 'discard', then: 'setup' } }, { type: 'discard' });
    expect(s.phase).toBe('setup');
    expect(s.run).toBeNull();
    expect(s.confirm).toBeNull();
  });

  it('scope, options and mode change only in setup', () => {
    const setup = run(seeded(), { type: 'setScope', scope: { kind: 'questions', ids: ['Q3'] } }, { type: 'setOptions', patch: { includeTeacher: false } });
    expect(setup.scope).toEqual({ kind: 'questions', ids: ['Q3'] });
    expect(setup.options?.includeTeacher).toBe(false);
    const running = seeded({ phase: 'running', run: reviewRun() });
    expect(reduceSession(running, { type: 'setScope', scope: { kind: 'paper' } })).toBe(running);
    expect(reduceSession(running, { type: 'setMode', mode: 'check' })).toBe(running);
  });

  it('returnTo after Settings restores scope, options and finished rows', () => {
    const request = { ...PAPER_REQUEST, scope: { kind: 'questions' as const, ids: ['Q3'] } };
    let s = run(EMPTY_SESSION, { type: 'open', request, options: OPTIONS, mode: 'translate' }, { type: 'setOptions', patch: { includeDiagramLabels: false } });
    // Settings hands back an equal request (keys in another order).
    const back = { scope: { ids: ['Q3'], kind: 'questions' as const }, mode: 'translate' as const, worksheetId: WS_ID };
    expect(sameRequest(request, back)).toBe(true);
    s = reduceSession(s, { type: 'open', request: back, options: OPTIONS, mode: 'check' });
    expect(s.options?.includeDiagramLabels).toBe(false);
    expect(s.mode).toBe('translate');
    const errored = seeded({ phase: 'error', error: REGION, run: reviewRun() });
    expect(reduceSession(errored, { type: 'open', request: PAPER_REQUEST, options: OPTIONS, mode: 'translate' }).phase).toBe('review');
    const fresh = reduceSession(errored, { type: 'open', request: { ...PAPER_REQUEST, mode: 'check' }, options: OPTIONS, mode: 'check' });
    expect(fresh.run).toBeNull();
    expect(fresh.mode).toBe('check');
  });

  it('the host closes a request for another document or a read-only one', () => {
    const open = { kind: 'translate' as const, request: PAPER_REQUEST };
    const s = seeded();
    expect(hostAction(open, s, { worksheetId: WS_ID, readOnly: false })).toBe('open');
    expect(hostAction(open, s, { worksheetId: 'other', readOnly: false })).toBe('closeStale');
    expect(hostAction(open, s, { worksheetId: WS_ID, readOnly: true })).toBe('closeStale');
    expect(hostAction({ kind: 'settings', request: {}, returnTo: PAPER_REQUEST }, s, { worksheetId: WS_ID, readOnly: false })).toBe('keep');
    expect(hostAction({ kind: 'settings', request: {} }, s, { worksheetId: WS_ID, readOnly: false })).toBe('reset');
    expect(hostAction(null, s, { worksheetId: WS_ID, readOnly: false })).toBe('reset');
  });
});

describe('review rows', () => {
  it('group in plan order under the owner heading, filtered by state', () => {
    const cover = job('t9', 'Time allowed: 1 hour', { groupKey: 'cover', where: 'Cover · Head line', kind: 'coverLine' });
    const r = reviewRun();
    const plan = fakePlan([...r.plan.jobs.values(), cover]);
    const withCover = { ...r, plan, results: new Map([...r.results, ['t9', result('t9', '時限：1小時')]]) };
    const groups = reviewGroups(withCover, 'all');
    expect(groups.map((g) => g.label)).toEqual(['Question 3', 'Cover']);
    expect(groups[0].items.map((i) => i.key)).toEqual(['t1', 't2', 't3', 't4']);
    expect(reviewGroups(withCover, 'failed').flatMap((g) => g.items.map((i) => i.key))).toEqual(['t4']);
    expect(reviewGroups(withCover, 'look').flatMap((g) => g.items.map((i) => i.key))).toEqual(['t2', 't3']);
    expect(locationLabel(cover, 'Cover')).toBe('Head line');
    expect(locationLabel(cover, 'Question 1')).toBe('Cover · Head line');
  });

  it('restrictPlan keeps only the named jobs and drops empty groups and chunks', () => {
    const plan = reviewRun().plan;
    const narrowed = restrictPlan(plan, ['t4']);
    expect([...narrowed.jobs.keys()]).toEqual(['t4']);
    expect(narrowed.chunks).toHaveLength(1);
    expect(narrowed.chunks[0].groups[0].jobKeys).toEqual(['t4']);
    expect(restrictPlan(plan, []).chunks).toEqual([]);
    expect(plan.jobs.size).toBe(4);
  });
});

describe('Check terms ticks', () => {
  const row = (path: string, fixes: TermRow['checks']): TermRow => ({
    path,
    slot: {} as TermRow['slot'],
    en: [],
    zh: [],
    checks: fixes,
  });
  const check = (fix?: NonNullable<TermRow['checks'][number]['fix']>): TermRow['checks'][number] => ({
    entryId: 1,
    en: 'supply',
    source: { text: 'supply', start: 0, end: 6 },
    state: 'missing',
    severity: 'warn',
    expected: '供應',
    ...(fix ? { fix } : {}),
  });

  it('pre-ticks wrong forms only; a textbook variant and a lower rank wait for the teacher', () => {
    const rows = [
      row('a', [check({ start: 0, end: 2, to: '供應', kind: 'deny', denyKind: 'wrong' })]),
      row('b', [check({ start: 2, end: 6, to: '稅收承擔', kind: 'deny', denyKind: 'variant' })]),
      row('c', [check({ start: 0, end: 4, to: '效率損失', kind: 'lowerRank' }), check()]),
    ];
    const s = seeded({ mode: 'check' });
    expect([...acceptedTermFixes(s, rows).keys()]).toEqual(['a']);
    const ticked = run(s, { type: 'toggleTerm', key: 'b#0', value: true }, { type: 'toggleTerm', key: 'c#1', value: true });
    const accepted = acceptedTermFixes(ticked, rows);
    expect([...accepted.keys()]).toEqual(['a', 'b']);
    // A check without a fix is never accepted, even when ticked.
    expect(accepted.get('c')).toBeUndefined();
  });
});
