import { beforeEach, describe, expect, it } from 'vitest';
import { clearDialectCache, createClient, testConnection } from './client';
import { describeHttpError, isSchemaRejection } from './errors';
import { FAKE_RATES, fakeMentor } from './fakeMentor';
import { MENTOR_BUY_URL, MENTOR_PRICING_URL, createMentorRelay, mentorApiRoot, readAccount, safeMentorUrl } from './mentor';
import { MENTOR_API, MENTOR_MODEL, PRESETS } from './providers';
import { ITEMS_SCHEMA } from './schema';
import { isAiError, type AiError, type CompletionRequest, type ProviderConfig } from './types';

/** Hosted AI through the DSEcon Mentor account (k-0519), against the contract's stand-in (k-0518). */

const signal = () => new AbortController().signal;
const config = (token: string): ProviderConfig => ({ provider: 'mentor', apiKey: token, model: MENTOR_MODEL, baseUrl: PRESETS.mentor.baseUrl });
const request = (patch: Partial<CompletionRequest> = {}): CompletionRequest => ({
  system: 'S',
  turns: [{ role: 'user', content: 'hi' }],
  schema: ITEMS_SCHEMA,
  maxOutputTokens: 1000,
  signal: signal(),
  ...patch,
});
const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const err = (status: number, error: string, extra: Record<string, unknown> = {}) => describeHttpError('mentor', status, { error, ...extra }, new Headers(), {});

async function caught(p: Promise<unknown>): Promise<AiError> {
  try {
    await p;
  } catch (error) {
    if (isAiError(error)) return error;
    throw error;
  }
  throw new Error('expected an AiError');
}

beforeEach(() => clearDialectCache());

describe('AI requests through the relay (CONTRACT §3)', () => {
  it("wraps Gemini's own body as { feature, stream, request }, the token as a bearer, no model and no Google key", async () => {
    const server = fakeMentor();
    const res = await createClient(config(server.token), server.deps).complete(request({ feature: 'translate', images: [{ dataUrl: PNG }] }));
    expect(res.text).toContain('物價水平');
    const [sent] = server.requests;
    expect(sent.path).toBe('/ai/generate');
    expect(sent.headers.authorization).toBe(`Bearer ${server.token}`);
    expect(sent.headers['x-goog-api-key']).toBeUndefined();
    expect(sent.json).toMatchObject({ feature: 'translate', stream: false });
    const inner = sent.json?.request as Record<string, unknown>;
    expect(inner.model).toBeUndefined();
    const contents = inner.contents as Array<{ parts: Array<Record<string, unknown>> }>;
    expect(contents.at(-1)?.parts[1]).toEqual({ inlineData: { mimeType: 'image/png', data: 'iVBORw0KGgo=' } });
    expect(inner.generationConfig).toMatchObject({ maxOutputTokens: 1000, responseJsonSchema: ITEMS_SCHEMA, thinkingConfig: { thinkingLevel: 'low' } });
  });

  it('a request without a feature says "other"', async () => {
    const server = fakeMentor();
    await createClient(config(server.token), server.deps).complete(request());
    expect(server.requests[0].json?.feature).toBe('other');
  });

  it("streams: Gemini's chunks grow the text, the receipt closes it, the call is charged", async () => {
    const server = fakeMentor({ credits: 100 });
    const seen: string[] = [];
    const res = await createClient(config(server.token), server.deps).stream!(request({ feature: 'studio.write' }), (t) => seen.push(t));
    expect(server.requests[0].json).toMatchObject({ feature: 'studio.write', stream: true });
    expect(seen.length).toBe(2);
    expect(res).toMatchObject({ finish: 'stop', usage: { input: 1000, output: 400, thinking: 100 } });
    const charged = (1000 * FAKE_RATES.inputPerMillionTokens + 500 * FAKE_RATES.outputPerMillionTokens) / 1e6;
    expect(server.state.credits).toBeCloseTo(100 - charged, 6);
  });

  it('a stream that ends with event: error, or with no receipt, failed', async () => {
    for (const streamEnd of ['error', 'none'] as const) {
      const server = fakeMentor({ streamEnd });
      const error = await caught(createClient(config(server.token), server.deps).stream!(request(), () => undefined));
      expect(error.info.kind, streamEnd).toBe('server');
    }
  });

  it('the own-key Gemini provider still sends its key the Google way', async () => {
    const server = fakeMentor();
    const own: ProviderConfig = { provider: 'gemini', apiKey: 'AIzaSyTestKey0123456789abcdefghij', model: 'gemini-4-hydrogen', baseUrl: `${MENTOR_API}/ai` };
    await caught(createClient(own, server.deps).complete(request({ feature: 'translate' })));
    expect(server.requests[0].path).toBe('/ai/models/gemini-4-hydrogen:generateContent');
    expect(server.requests[0].headers['x-goog-api-key']).toBe('AIzaSyTestKey0123456789abcdefghij');
    expect(server.requests[0].headers.authorization).toBeUndefined();
  });

  it('a revoked token: signedOut, with Sign in', async () => {
    const server = fakeMentor();
    const error = await caught(createClient(config('dsm_revoked_0123456789'), server.deps).complete(request()));
    expect(error.info).toMatchObject({ kind: 'signedOut', fatal: true, actions: ['signIn'] });
  });

  it('not enough credits: noCredits, with Buy credits and Use my own key', async () => {
    const server = fakeMentor({ credits: 0 });
    const error = await caught(createClient(config(server.token), server.deps).complete(request()));
    expect(error.info).toMatchObject({ kind: 'noCredits', status: 402, actions: ['buyCredits', 'useOwnKey'] });
  });

  it('the month limit, the daily pause and the switch-off are asked once, never retried (live test, k-0519)', async () => {
    for (const [status, code] of [[429, 'monthly_cap'], [503, 'hosted_ai_paused'], [503, 'hosted_ai_off']] as const) {
      const server = fakeMentor({ failWith: { status, code } });
      await caught(createClient(config(server.token), server.deps).complete(request()));
      expect(server.requests.filter((r) => r.path === '/ai/generate'), code).toHaveLength(1);
    }
    // A plain rate limit is still waited out once, and Google being busy retried.
    const limited = fakeMentor({ failWith: { status: 429, code: 'rate_limited' } });
    await caught(createClient(config(limited.token), limited.deps).complete(request()));
    expect(limited.requests).toHaveLength(2);
    const busy = fakeMentor({ failWith: { status: 503, code: 'upstream_busy' } });
    await caught(createClient(config(busy.token), busy.deps).complete(request()));
    expect(busy.requests).toHaveLength(3);
  });

  it('every §5 code reads as what the teacher can do', () => {
    expect(err(401, 'unauthorized').kind).toBe('signedOut');
    expect(err(402, 'insufficient_credits', { balance: 1, needed: 9 }).kind).toBe('noCredits');
    expect(err(429, 'monthly_cap', { cap: 20000 })).toMatchObject({ kind: 'monthlyCap', fatal: true, actions: ['useOwnKey'] });
    expect(err(429, 'rate_limited')).toMatchObject({ kind: 'quota', message: 'Too many AI requests at once. Wait a minute and try again.' });
    expect(err(503, 'hosted_ai_paused')).toMatchObject({ kind: 'serviceDown', actions: ['retry', 'useOwnKey'] });
    expect(err(503, 'hosted_ai_off').kind).toBe('serviceDown');
    expect(err(503, 'upstream_busy').kind).toBe('server');
    expect(err(502, 'upstream_error').message).toMatch(/No credits were used/);
    expect(err(500, 'server_error').kind).toBe('server');
    expect(err(413, 'too_large', { limit: 4e6 }).message).toMatch(/fewer or smaller pictures/);
    expect(err(400, 'invalid_request', { field: 'request' }).kind).toBe('badRequest');
    expect(err(422, 'upstream_rejected', { message: 'x' }).kind).toBe('badRequest');
  });

  it("a 422 naming Gemini's schema field steps down the output ladder, as Gemini's own 400 does", () => {
    expect(isSchemaRejection('mentor', 422, { error: 'upstream_rejected', message: 'Invalid JSON payload: Unknown name "responseJsonSchema"' })).toBe(true);
    expect(isSchemaRejection('mentor', 422, { error: 'upstream_rejected', message: 'prompt too long' })).toBe(false);
    expect(isSchemaRejection('gemini', 422, { error: { message: 'Unknown name "responseJsonSchema"' } })).toBe(false);
  });

  it("Gemini's own 401 for a Google key is still a bad key, not a sign-out", () => {
    expect(describeHttpError('gemini', 401, {}, new Headers(), {}).kind).toBe('badKey');
  });

  it('Test connection works through the relay, tagged "test"', async () => {
    const server = fakeMentor();
    const test = await testConnection(config(server.token), signal(), server.deps);
    expect(test).toMatchObject({ ok: true, followedGlossary: true });
    expect(server.requests[0].json?.feature).toBe('test');
  });

  it('lists no models (the server picks one)', async () => {
    const server = fakeMentor();
    expect(await createClient(config(server.token), server.deps).listModels(signal())).toEqual([]);
    expect(server.requests).toHaveLength(0);
  });
});

describe('sign-in, credits and sign-out (CONTRACT §1–2)', () => {
  it('link start and checks, then the credits', async () => {
    const server = fakeMentor({ pendingPolls: 2 });
    const relay = createMentorRelay({ deps: server.deps });
    const start = await relay.startLink({ platform: 'desktop', deviceLabel: 'Econ Studio on Mac', appVersion: '0.10.0' }, signal());
    expect(start).toMatchObject({ code: 'BCDF-GHJK', verifyUrl: 'https://dseconmentor.com/link?code=BCDF-GHJK', intervalMs: 3000 });
    expect(server.requests[0]).toMatchObject({ path: '/auth/link/start', json: { platform: 'desktop', deviceLabel: 'Econ Studio on Mac', appVersion: '0.10.0' } });
    expect(Object.keys(server.requests[0].headers).sort()).toEqual(['content-type']);
    expect(await relay.pollLink(start.pollToken, signal())).toEqual({ status: 'pending' });
    expect(await relay.pollLink(start.pollToken, signal())).toEqual({ status: 'pending' });
    expect(await relay.pollLink(start.pollToken, signal())).toEqual({ status: 'approved', token: server.token });
    expect(server.requests[1]).toMatchObject({ path: '/auth/link/check', json: { pollToken: 'dsl_poll_secret_0123456789' } });
    const account = await relay.account(server.token, signal());
    expect(account).toEqual({
      credits: 900,
      status: 'on',
      rates: { inputPerM: 1170, outputPerM: 5850 },
      trialCredits: 900,
      packs: [{ priceHkd: 50, credits: 4170 }, { priceHkd: 100, credits: 8560 }, { priceHkd: 200, credits: 17350 }],
      extraPct: 10,
      buyUrl: 'https://dseconmentor.com/account#ai-credits',
      pricingUrl: 'https://dseconmentor.com/pricing#ai-credits',
    });
    expect(server.requests.at(-1)).toMatchObject({ path: '/ai/credits', method: 'GET', headers: { authorization: `Bearer ${server.token}` } });
  });

  it('denied, expired and used come back as denied / expired', async () => {
    for (const [outcome, want] of [['denied', 'denied'], ['expired', 'expired'], ['used', 'expired']] as const) {
      const server = fakeMentor({ pendingPolls: 0, outcome });
      expect(await createMentorRelay({ deps: server.deps }).pollLink('p', signal())).toEqual({ status: want });
    }
  });

  it('a paused or switched-off service shows in the account', async () => {
    const server = fakeMentor({ status: 'paused' });
    expect((await createMentorRelay({ deps: server.deps }).account(server.token, signal())).status).toBe('paused');
  });

  it('a stale token reading the credits: signedOut', async () => {
    const server = fakeMentor();
    const error = await caught(createMentorRelay({ deps: server.deps }).account('dsm_stale_0123456789', signal()));
    expect(error.info.kind).toBe('signedOut');
  });

  it('sign-out (204) and sign-out with no connection never throw', async () => {
    const server = fakeMentor();
    await expect(createMentorRelay({ deps: server.deps }).signOut(server.token, signal())).resolves.toBeUndefined();
    expect(server.state.revoked).toBe(true);
    const offline = { fetch: (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch, now: () => 0, sleep: async () => undefined };
    await expect(createMentorRelay({ deps: offline }).signOut('dsm_x_0123456789', signal())).resolves.toBeUndefined();
  });

  it('no connection at all names the host', async () => {
    const offline = { fetch: (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch, now: () => 0, sleep: async () => undefined };
    const error = await caught(createMentorRelay({ deps: offline }).startLink({ platform: 'web', deviceLabel: 'x', appVersion: '1' }, signal()));
    expect(error.info).toMatchObject({ kind: 'network' });
    expect(error.info.message).toContain('dseconmentor.com');
  });

  it('a dev or Preview Mentor is a setting: every call goes to its host', async () => {
    const server = fakeMentor();
    const seen: string[] = [];
    const deps = { ...server.deps, fetch: ((u: RequestInfo | URL, i?: RequestInit) => (seen.push(String(u)), server.fetch(String(u).replace('http://localhost:3001', 'https://dseconmentor.com'), i))) as typeof fetch };
    await createMentorRelay({ relayBase: 'http://localhost:3001/api/app/v1/ai', deps }).startLink({ platform: 'web', deviceLabel: 'x', appVersion: '1' }, signal());
    expect(seen[0]).toBe('http://localhost:3001/api/app/v1/auth/link/start');
  });

  it('opens only Mentor links: https on its host, or the dev relay itself', () => {
    expect(safeMentorUrl('https://dseconmentor.com/link?code=1', MENTOR_API)).toBeTruthy();
    expect(safeMentorUrl('https://www.dseconmentor.com/link?code=1', MENTOR_API)).toBeTruthy();
    expect(safeMentorUrl('https://evil.example/link', MENTOR_API)).toBeUndefined();
    expect(safeMentorUrl('http://dseconmentor.com/link', MENTOR_API)).toBeUndefined();
    expect(safeMentorUrl('javascript:alert(1)', MENTOR_API)).toBeUndefined();
    expect(safeMentorUrl('http://localhost:3001/link', 'http://localhost:3001/api/app/v1')).toBe('http://localhost:3001/link');
    expect(mentorApiRoot('http://localhost:3001/api/app/v1/ai/')).toBe('http://localhost:3001/api/app/v1');
  });

  it('a credits body is read defensively; strange links become the known pages', () => {
    expect(readAccount({ balance: 5, buyUrl: 'https://evil.example', pricingUrl: 7 }, MENTOR_API)).toEqual({ credits: 5, status: 'on', buyUrl: MENTOR_BUY_URL, pricingUrl: MENTOR_PRICING_URL });
    expect(readAccount({ balance: 'many' }, MENTOR_API)).toBeNull();
    expect(readAccount({ balance: 5, status: 'weird', rates: { inputPerMillionTokens: -1, outputPerMillionTokens: 2 } }, MENTOR_API)).toEqual({ credits: 5, status: 'on', buyUrl: MENTOR_BUY_URL, pricingUrl: MENTOR_PRICING_URL });
  });
});
