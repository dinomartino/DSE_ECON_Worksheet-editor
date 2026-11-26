import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDialectCache, createClient, newRequestKey, testConnection } from './client';
import { RELAY_TIMEOUT_MS } from './http';
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

  it('401 after 30 days unused, and 403 token_scope (v1.3): both ask to sign in again', () => {
    for (const info of [err(401, 'unauthorized'), err(403, 'token_scope')]) {
      expect(info).toMatchObject({ kind: 'signedOut', fatal: true, actions: ['signIn'] });
      expect(info.message).toContain('Sign in again');
    }
  });

  it('the fake answers like v1.3: logout 200 {ok:true}, a link token refused off the AI routes', async () => {
    const server = fakeMentor();
    const res = await server.fetch(`${server.api}/me`, { method: 'GET', headers: { authorization: `Bearer ${server.token}` } });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'token_scope' });
    const out = await server.fetch(`${server.api}/auth/logout`, { method: 'POST', headers: { authorization: `Bearer ${server.token}` }, body: '{}' });
    expect([out.status, await out.json()]).toEqual([200, { ok: true }]);
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
      credits: 500,
      status: 'on',
      rates: { inputPerM: 1170, outputPerM: 5850 },
      models: {
        default: 'gemini-4-hydrogen',
        byFeature: { translate: 'gemini-3.5-flash-lite', test: 'gemini-3.5-flash-lite', tag: 'gemini-3.5-flash-lite' },
        rates: { 'gemini-4-hydrogen': { inputPerM: 1170, outputPerM: 5850 }, 'gemini-3.5-flash-lite': { inputPerM: 234, outputPerM: 1950 } },
      },
      trialCredits: 500,
      packs: [{ priceHkd: 50, credits: 4170 }, { priceHkd: 100, credits: 8560 }, { priceHkd: 200, credits: 17350 }],
      extraPct: 10,
      buy: {
        minHkd: 50,
        maxHkd: 1000,
        quickPicks: [{ hkd: 50, credits: 4170 }, { hkd: 100, credits: 8560 }, { hkd: 200, credits: 17350 }],
        urlTemplate: 'https://dseconmentor.com/account?amount={hkd}#ai-credits',
        terms: { stripeFee: { pct: 3.4, fixedHkd: 2.35 }, extraPct: 10, creditsPerHkd: 100 },
        studioWorksheet: 280,
      },
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

  it('sign-out says whether Mentor revoked the token, and never throws (k-0521 F9)', async () => {
    const server = fakeMentor();
    await expect(createMentorRelay({ deps: server.deps }).signOut(server.token, signal())).resolves.toBe('revoked');
    expect(server.state.revoked).toBe(true);
    // A token Mentor no longer knows is as good as revoked.
    await expect(createMentorRelay({ deps: fakeMentor().deps }).signOut('dsm_unknown_0123456789', signal())).resolves.toBe('revoked');
    // No connection (or no CORS: the browser reports both as a TypeError) and a server error are failures.
    await expect(createMentorRelay({ deps: fakeMentor({ logout: 'network' }).deps }).signOut(server.token, signal())).resolves.toBe('failed');
    const broken = fakeMentor({ logout: 500 });
    await expect(createMentorRelay({ deps: broken.deps }).signOut(broken.token, signal())).resolves.toBe('failed');
    expect(broken.state.revoked).toBe(false);
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

  it('models (v1.6): no default → ignored; bad map entries and bad rates are dropped, the rest kept', () => {
    const base = { credits: 5, status: 'on', buyUrl: MENTOR_BUY_URL, pricingUrl: MENTOR_PRICING_URL };
    expect(readAccount({ balance: 5, models: { byFeature: { translate: 'x' } } }, MENTOR_API)).toEqual(base);
    expect(readAccount({ balance: 5, models: 'gemini' }, MENTOR_API)).toEqual(base);
    expect(
      readAccount({ balance: 5, models: { default: 'main', byFeature: { translate: 'lite', test: 7, quality: '' }, rates: { main: { inputPerMillionTokens: 10, outputPerMillionTokens: 20 }, lite: { inputPerMillionTokens: -1, outputPerMillionTokens: 2 } } } }, MENTOR_API),
    ).toEqual({ ...base, models: { default: 'main', byFeature: { translate: 'lite' }, rates: { main: { inputPerM: 10, outputPerM: 20 } } } });
  });

  it('an older Mentor (before v1.6) has no models: the account is as before', async () => {
    const server = fakeMentor({ noModels: true });
    const account = await createMentorRelay({ deps: server.deps }).account(server.token, signal());
    expect(account.models).toBeUndefined();
    expect(account.rates).toEqual({ inputPerM: 1170, outputPerM: 5850 });
  });
});

describe('one request is charged once: Idempotency-Key (k-0521 F10, CONTRACT v1.3)', () => {
  afterEach(() => vi.useRealTimers());
  const generates = (server: ReturnType<typeof fakeMentor>) => server.requests.filter((r) => r.path === '/ai/generate');

  it('every generate carries a fresh random key; streams too', async () => {
    const server = fakeMentor();
    const client = createClient(config(server.token), server.deps);
    await client.complete(request());
    await client.complete(request());
    await client.stream!(request(), () => undefined);
    const keys = generates(server).map((r) => r.headers['idempotency-key']);
    expect(keys).toHaveLength(3);
    for (const key of keys) expect(key).toMatch(/^[A-Za-z0-9._:-]{8,100}$/);
    expect(new Set(keys).size).toBe(3);
  });

  it('a call Mentor gave back (502) is retried with the same key, and charged once', async () => {
    const server = fakeMentor({ failFirst: 1 });
    const res = await createClient(config(server.token), server.deps).complete(request());
    expect(res.text).toContain('物價水平');
    const [first, again] = generates(server);
    expect(again.headers['idempotency-key']).toBe(first.headers['idempotency-key']);
    expect(server.state.charges).toBe(1);
  });

  it('an answer lost on the way: the retry with the same key gets 409, never a second charge', async () => {
    const server = fakeMentor();
    let dropped = false;
    const flaky = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!dropped) {
        dropped = true;
        await server.fetch(input, init);
        throw new TypeError('Failed to fetch');
      }
      return server.fetch(input, init);
    }) as typeof fetch;
    const error = await caught(createClient(config(server.token), { ...server.deps, fetch: flaky }).complete(request()));
    const [first, again] = generates(server);
    expect(again.headers['idempotency-key']).toBe(first.headers['idempotency-key']);
    expect(generates(server)).toHaveLength(2);
    expect(server.state.charges).toBe(1);
    expect(error.info).toMatchObject({ kind: 'server', status: 409, actions: ['retry'] });
    expect(error.info.message).toContain('already sent once');
    expect(error.info.message).not.toContain('No credits were used');
  });

  it("a caller's own key is used as given; asking again with it is refused (409), not charged", async () => {
    const server = fakeMentor();
    const client = createClient(config(server.token), server.deps);
    const requestKey = newRequestKey();
    await client.complete(request({ requestKey }));
    await caught(client.complete(request({ requestKey })));
    expect(generates(server).map((r) => r.headers['idempotency-key'])).toEqual([requestKey, requestKey]);
    expect(server.state.charges).toBe(1);
  });

  it('Mentor stopping a long call (504 deadline, or event: error in a stream): charged, never retried, says how much', async () => {
    const whole = fakeMentor({ deadline: true });
    const error = await caught(createClient(config(whole.token), whole.deps).complete(request()));
    expect(generates(whole)).toHaveLength(1);
    expect(whole.state.charges).toBe(1);
    expect(error.info).toMatchObject({ kind: 'timeout', status: 504 });
    expect(error.info.message).toBe('This took too long and DSEcon Mentor stopped it; 4 credits were used. Try a smaller job.');
    const streamed = fakeMentor({ deadline: true });
    const late = await caught(createClient(config(streamed.token), streamed.deps).stream!(request(), () => undefined));
    expect(late.info).toMatchObject({ kind: 'timeout' });
    expect(late.info.message).toContain('4 credits were used');
  });

  it('503 limits_unavailable is retried like Google being busy, then says Mentor has trouble', async () => {
    const server = fakeMentor({ failWith: { status: 503, code: 'limits_unavailable' } });
    const error = await caught(createClient(config(server.token), server.deps).complete(request()));
    expect(generates(server)).toHaveLength(3);
    expect(new Set(generates(server).map((r) => r.headers['idempotency-key'])).size).toBe(1);
    expect(error.info).toMatchObject({ kind: 'server', actions: ['retry'] });
    expect(error.info.message).toContain('DSEcon Mentor is having trouble');
  });

  it('a balance below zero: noCredits with its own words; a refused trial is read', async () => {
    const neg = err(402, 'insufficient_credits', { balance: -12.5, needed: 3 });
    expect(neg).toMatchObject({ kind: 'noCredits', actions: ['buyCredits', 'useOwnKey'] });
    expect(neg.message).toContain('below zero after a refund or dispute');
    expect(err(402, 'insufficient_credits', { balance: 2, needed: 3 }).message).toContain('Not enough AI credits left');
    const server = fakeMentor({ trialRefused: true });
    const account = await createMentorRelay({ deps: server.deps }).account(server.token, signal());
    expect(account).toMatchObject({ trialRefused: true });
    expect(account.trialCredits).toBeUndefined();
  });

  it('a different body (one step down the output ladder) gets its own key', async () => {
    const server = fakeMentor({ failWith: { status: 422, code: 'invalid_request', message: 'responseJsonSchema' } });
    await caught(createClient(config(server.token), server.deps).complete(request({ requestKey: 'job-0123456789' })));
    const keys = generates(server).map((r) => r.headers['idempotency-key']);
    expect(keys[0]).toBe('job-0123456789');
    expect(keys.length).toBeGreaterThan(1);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('a key Mentor would refuse is not sent', async () => {
    const server = fakeMentor();
    await createClient(config(server.token), server.deps).complete(request({ requestKey: 'bad key\n' }));
    expect(generates(server)[0].headers['idempotency-key']).toBeUndefined();
  });

  it("own-key providers never get the header", async () => {
    const seen: Array<Record<string, string>> = [];
    const fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(init?.headers as Record<string, string>);
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"items":[]}' }] }, finishReason: 'STOP' }] }), { status: 200 });
    }) as typeof globalThis.fetch;
    await createClient({ provider: 'gemini', apiKey: 'AIzaTestKey0123456789', model: 'gemini-2.5-flash', baseUrl: '' }, { fetch, sleep: async () => undefined }).complete(request());
    expect(Object.keys(seen[0]).map((k) => k.toLowerCase())).not.toContain('idempotency-key');
  });

  it("the editor waits past Mentor's own 300 s, and a timeout is never retried", async () => {
    vi.useFakeTimers();
    const server = fakeMentor();
    const hang = (async (input: RequestInfo | URL, init?: RequestInit) => {
      server.requests.push({ method: 'POST', path: new URL(String(input)).pathname, headers: {}, json: null });
      return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
    }) as typeof fetch;
    let settled: AiError | null = null;
    void caught(createClient(config(server.token), { ...server.deps, fetch: hang }).complete(request())).then((e) => (settled = e));
    await vi.advanceTimersByTimeAsync(300_000);
    expect(settled).toBeNull();
    await vi.advanceTimersByTimeAsync(RELAY_TIMEOUT_MS - 300_000 + 1);
    expect(settled).not.toBeNull();
    expect(settled!.info.kind).toBe('timeout');
    expect(server.requests).toHaveLength(1);
  });
});
