import { describe, expect, it } from 'vitest';
import { aiErrorInfo } from '@/ai/errors';
import { INVENTED, REQUEST, okOutcome, studioDraft, usageOf } from './fixtures';
import { createTrialLog, type KeyMark, type TrialRun, type UseMark } from './trialLog';
import { BAR, flagsOf, reportText, tally } from './trialScore';

const compared = { past: 1759, mine: 4 };
const lint = { id: 'lint' as const, state: 'look' as const, findings: [{ id: 'lint.keyLongest' }] };
const keyLook = { id: 'key' as const, state: 'look' as const, findings: [{ id: 'key.differs' }] };
const copyFail = { id: 'copy' as const, state: 'fail' as const, findings: [{ id: 'copy.close', params: { percent: 41, with: 'bank', verbatim: 0 } }], value: 41 };

/** A log of one brief run holding `n` shown drafts marked as given (marks cycle). */
function marked(n: number, key: (i: number) => KeyMark, use: (i: number) => UseMark, over: { bank?: boolean } = {}): TrialRun[] {
  const log = createTrialLog(undefined);
  const drafts = Array.from({ length: n }, (_, i) => studioDraft(`d${i}`, { from: INVENTED[i % INVENTED.length] }));
  log.getState().record({ label: 'B01', kind: 'write', request: REQUEST, outcome: okOutcome(drafts), compared: over.bank === false ? { past: null, mine: 0 } : compared });
  drafts.forEach((d, i) => log.getState().mark(d.id, { key: key(i), use: use(i) }));
  return log.getState().runs;
}

describe('the tally of the record', () => {
  const build = () => {
    const log = createTrialLog(undefined);
    const record = log.getState().record;
    record({ label: 'B01', kind: 'write', request: REQUEST, outcome: okOutcome([studioDraft('ok1'), studioDraft('look1', { rows: [lint, keyLook] }), studioDraft('gone', { rows: [copyFail] })], { usage: usageOf({ requests: 4, ms: 20000 }) }), compared });
    record({ label: 'B02', kind: 'write', request: REQUEST, outcome: okOutcome([studioDraft('ok2')]), compared: { past: null, mine: 3 } });
    record({ label: 'mine', kind: 'write', request: REQUEST, outcome: okOutcome([studioDraft('mine1')]), compared });
    record({ label: 'mine', kind: 'refine', request: REQUEST, outcome: okOutcome([studioDraft('mine2')]), compared });
    record({ label: 'B03', kind: 'write', request: REQUEST, outcome: { ok: false, error: aiErrorInfo('network', 'gemini'), usage: usageOf({ requests: 1, ms: 5000 }) } });
    record({ label: 'B04', kind: 'write', request: REQUEST, outcome: { ok: false, error: aiErrorInfo('cancelled', 'gemini'), usage: usageOf({ requests: 1, ms: 1000 }) } });
    log.getState().mark('ok1', { key: 'ok', use: 'asis' });
    log.getState().mark('look1', { key: 'bad', use: 'reject' });
    return log.getState().runs;
  };

  it('counts runs: briefs with drafts, the teacher’s own writes and refinements, failures and stops', () => {
    expect(tally(build()).runs).toEqual({ briefs: 2, mine: 1, refinements: 1, errors: 1, stopped: 1 });
  });

  it('counts drafts written, shown and warned (k-0531: shown, never left out), and what warned them', () => {
    expect(tally(build()).drafts).toEqual({ written: 6, shown: 6, warned: 1, warnedBy: { copy: 1, shape: 0 } });
  });

  it('counts the local checks over every draft (the copy figures over those without a warning)', () => {
    const { local } = tally(build());
    expect(local).toMatchObject({ keyAgree: 5, keyLook: 1, keySkipped: 0, lint: 1, syllabus: 0, numbers: 0, terms: 0, nearCopyShown: 0, copyMax: 4, copyP90: 4 });
    // B02's near-copy check had no bank to compare with.
    expect(local.bankMissing).toBe(1);
  });

  it('adds up what it cost, a stopped or failed run included', () => {
    const { cost } = tally(build());
    expect(cost.runs).toBe(6);
    expect(cost.requests).toBe(4 + 2 + 2 + 2 + 1 + 1);
    expect(cost.ms).toBe(20000 + 12000 + 12000 + 12000 + 5000 + 1000);
  });

  it('counts the marks given', () => {
    expect(tally(build()).marks).toEqual({ shown: 6, marked: 2, keyMarked: 2, keyOk: 1, useMarked: 2, asis: 1, edit: 0, reject: 1 });
  });

  it('reads an empty record as zeros and no verdict', () => {
    const t = tally([]);
    expect(t.drafts).toEqual({ written: 0, shown: 0, warned: 0, warnedBy: { copy: 0, shape: 0 } });
    expect(t.local.copyMax).toBeUndefined();
    expect(t.bar.verdict).toBe('pending');
    expect(t.bar.keyDefensible.percent).toBeUndefined();
  });
});

describe('the bar', () => {
  it('waits until enough is marked to mean something', () => {
    const t = tally(marked(BAR.minMarked - 1, () => 'ok', () => 'asis'));
    expect(t.bar.keyDefensible).toMatchObject({ got: 19, of: 19, percent: 100, need: 90, pass: undefined });
    expect(t.bar.verdict).toBe('pending');
  });

  it('passes when the key is defensible on 90% and 60% is usable as it stands or after one edit, and nothing near-copy was shown', () => {
    // 20 marked: 18 keys ok (90%), 12 usable (60%).
    const t = tally(marked(20, (i) => (i < 18 ? 'ok' : 'bad'), (i) => (i < 8 ? 'asis' : i < 12 ? 'edit' : 'reject')));
    expect(t.bar.keyDefensible).toMatchObject({ got: 18, of: 20, percent: 90, pass: true });
    expect(t.bar.usable).toMatchObject({ got: 12, of: 20, percent: 60, pass: true });
    expect(t.bar.nearCopy).toMatchObject({ got: 0, of: 20, pass: true });
    expect(t.bar.verdict).toBe('pass');
  });

  it('fails on either number one short of the bar', () => {
    const keyShort = tally(marked(20, (i) => (i < 17 ? 'ok' : 'bad'), () => 'asis'));
    expect(keyShort.bar.keyDefensible.pass).toBe(false);
    expect(keyShort.bar.verdict).toBe('fail');
    const useShort = tally(marked(20, () => 'ok', (i) => (i < 11 ? 'asis' : 'reject')));
    expect(useShort.bar.usable).toMatchObject({ percent: 55, pass: false });
    expect(useShort.bar.verdict).toBe('fail');
  });

  it('fails whenever a near-copy was shown, and does not pass without a bank to compare with', () => {
    const log = createTrialLog(undefined);
    const drafts = Array.from({ length: 20 }, (_, i) => studioDraft(`d${i}`, { rows: i === 0 ? [{ id: 'copy', state: 'look', findings: [], value: 33 }] : [] }));
    log.getState().record({ label: 'B01', kind: 'write', request: REQUEST, outcome: okOutcome(drafts), compared });
    for (const d of drafts) log.getState().mark(d.id, { key: 'ok', use: 'asis' });
    const t = tally(log.getState().runs);
    expect(t.bar.nearCopy).toMatchObject({ got: 1, pass: false });
    expect(t.bar.verdict).toBe('fail');
    const noBank = tally(marked(20, () => 'ok', () => 'asis', { bank: false }));
    expect(noBank.local.bankMissing).toBe(1);
    expect(noBank.bar.nearCopy.pass).toBe(false);
  });
});

describe('the report', () => {
  const runs = () => {
    const log = createTrialLog(undefined);
    log.getState().record({ label: 'B01', kind: 'write', request: { ...REQUEST, points: ['C.ped#arc'] }, outcome: okOutcome([studioDraft('a'), studioDraft('b', { rows: [lint, keyLook], keyIndex: 1 }), studioDraft('gone', { rows: [copyFail] })]), compared });
    log.getState().mark('a', { key: 'ok', use: 'asis' });
    log.getState().mark('b', { key: 'bad', use: 'reject' });
    return log.getState().runs;
  };

  it('writes the bar, the checks, the cost and each brief that ran, and names the ones that did not', () => {
    const text = reportText(runs(), new Date('2026-11-24T08:00:00Z'));
    expect(text).toContain('Question studio trial report');
    expect(text).toContain('Date 2026-11-24 · model fake-model');
    expect(text).toContain('Drafts: 3 written · 3 shown · 1 warned (copy 1, shape 0)');
    expect(text).toContain('Key defensible: 1 of 2 = 50% (need 90%) not enough marked yet');
    expect(text).toContain('Near-copy shown: 0 (must be 0)');
    expect(text).toContain('B01 C.ped C.ped#arc: asked 3, shown 3 (1 warned)');
    expect(text).toContain('Not run: B02, B03');
    expect(text).toContain('Verdict: PENDING');
  });

  it('lists what needs a look: the rejected and the key not defensible, with the checks that said so', () => {
    const text = reportText(runs());
    expect(text).toContain('Needs a look: rejected, or the key not defensible (1)');
    expect(text).toMatch(/B01 C\.ped same\/any: key B \(not defensible\) · reject · key\.differs, lint\.keyLongest · "A cafe raises the price/);
  });

  it('reads an empty record without failing', () => {
    const text = reportText([]);
    expect(text).toContain('Drafts: 0 written · 0 shown · 0 warned');
    expect(text).toContain('Not run: B01');
  });

  it('names the flags of a draft by their codes, a row with nothing to say by its own name', () => {
    expect(flagsOf(studioDraft('x', { rows: [lint, keyLook, { id: 'terms', state: 'look', findings: [] }] }))).toEqual(['key.differs', 'terms', 'lint.keyLongest']);
    expect(flagsOf(studioDraft('y'))).toEqual([]);
  });
});
