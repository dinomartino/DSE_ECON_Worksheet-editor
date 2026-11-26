import { describe, expect, it } from 'vitest';
import { createClient, readDecide } from './client';
import { fakeFetch, instantDeps } from './fakeFetch';
import { onRelayOutcome } from './relayOutcome';
import { MENTOR_MODEL, PRESETS } from './providers';
import { usageLog } from './usage';
import { isAiError, type DecideRequest, type ProviderConfig } from './types';

/** k-0567: Mentor's `/ai/decide` (CONTRACT v1.7 §3a), the hosted relay's client only. */

const mentor: ProviderConfig = { provider: 'mentor', apiKey: 'dsm_token', model: MENTOR_MODEL, baseUrl: PRESETS.mentor.baseUrl };
const req = (over: Partial<DecideRequest> = {}): DecideRequest => ({
  feature: 'tag',
  state: { questions: { q1: { format: 'multiple-choice question', entries: [{ role: 'stem', text: 'Demand is' }] } } },
  questions: { q1: { type: 'choice', instructions: 'Which topic?', criteria: { 'C.ped': 'PED', 'C.pes': 'PES' } } },
  signal: new AbortController().signal,
  ...over,
});
const OK = {
  answers: {
    q1: { type: 'choice', choice: 'C.ped', confidence: 0.9, probabilities: { 'C.ped': 0.92, 'C.pes': 0.08 } },
    q1_fits: { type: 'noul', noul: 0.2 },
    junk: { type: 'noul', noul: 7 },
  },
  mentor: { requestId: 'r1', model: 'jev-1.14.0', usage: { inputTokens: 3400, cachedTokens: 0, outputTokens: 12, thinkingTokens: 0 }, charged: 0.112, balance: 499.888, estimated: false, fallback: false },
};

describe('client.decide (k-0567)', () => {
  it('only the hosted relay has it; own keys keep complete()', () => {
    expect(createClient(mentor).decide).toBeTypeOf('function');
    expect(createClient({ provider: 'gemini', apiKey: 'AIzaTestKey0123456789', model: 'gemini-2.5-flash', baseUrl: '' }).decide).toBeUndefined();
  });

  it('posts { feature, state, questions } to {base}/decide with the token and an Idempotency-Key; reads the answers and the receipt', async () => {
    const { fetch, calls } = fakeFetch([{ status: 200, body: OK }]);
    const balances: Array<number | undefined> = [];
    const off = onRelayOutcome((o) => balances.push(o.balance));
    const before = usageLog().length;
    const res = await createClient(mentor, instantDeps(fetch).deps).decide!(req({ requestKey: 'k0567-test-key' }));
    off();
    expect(calls[0].url).toBe(`${PRESETS.mentor.baseUrl.replace(/\/+$/, '')}/decide`);
    expect(calls[0].headers.authorization).toBe('Bearer dsm_token');
    expect(calls[0].headers['idempotency-key']).toBe('k0567-test-key');
    expect(calls[0].json).toEqual({ feature: 'tag', state: req().state, questions: req().questions });
    expect(res).toMatchObject({ model: 'jev-1.14.0', fallback: false, charged: 0.112, balance: 499.888, usage: { input: 3400, output: 12 } });
    expect(res!.answers).toEqual({
      q1: { type: 'choice', choice: 'C.ped', confidence: 0.9, probabilities: { 'C.ped': 0.92, 'C.pes': 0.08 } },
      q1_fits: { type: 'noul', noul: 0.2 },
    });
    // The credits display hears the new balance; the usage log keeps the call under its feature.
    expect(balances).toEqual([499.888]);
    const last = usageLog().at(-1)!;
    expect(usageLog().length).toBe(before + 1);
    expect(last).toMatchObject({ feature: 'tag', model: 'jev-1.14.0', input: 3400, credits: 0.112 });
  });

  it('null when this Mentor does not offer it: 404 (older), 503 decide_off, 400 on the feature', async () => {
    for (const reply of [
      { status: 404, body: '<html>Not found</html>' },
      { status: 503, body: { error: 'decide_off' } },
      { status: 400, body: { error: 'invalid_request', field: 'feature' } },
    ]) {
      const { fetch } = fakeFetch([reply]);
      expect(await createClient(mentor, instantDeps(fetch).deps).decide!(req())).toBeNull();
    }
  });

  it('other refusals throw like complete(): no credits, signed out, Mentor down', async () => {
    const cases: Array<[number, unknown, string]> = [
      [402, { error: 'insufficient_credits', balance: 0.5, needed: 2 }, 'noCredits'],
      [401, { error: 'unauthorized' }, 'signedOut'],
      [502, { error: 'upstream_error' }, 'server'],
    ];
    for (const [status, body, kind] of cases) {
      // The transport retries a 5xx a few times, as for complete().
      const { fetch } = fakeFetch(Array.from({ length: 5 }, () => ({ status, body })));
      const error = await createClient(mentor, instantDeps(fetch).deps).decide!(req()).catch((e: unknown) => e);
      expect(isAiError(error) && error.info.kind, String(status)).toBe(kind);
    }
  });

  it('readDecide: a fallback answer and odd bodies', () => {
    expect(readDecide({ answers: { q1: { type: 'choice', choice: 'C.pes', confidence: null, probabilities: { 'C.pes': 0.85 } } }, mentor: { model: 'gemini-3.5-flash-lite', fallback: true } }))
      .toEqual({ answers: { q1: { type: 'choice', choice: 'C.pes', confidence: null, probabilities: { 'C.pes': 0.85 } } }, model: 'gemini-3.5-flash-lite', fallback: true });
    expect(readDecide(null)).toBeNull();
    expect(readDecide({ answers: [] })).toBeNull();
    expect(readDecide({ answers: {} })).toEqual({ answers: {}, model: 'unknown', fallback: false });
  });
});
