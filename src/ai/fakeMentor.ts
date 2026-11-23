import type { HttpDeps } from './types';

/**
 * Test support, never shipped: a stand-in for Mentor's hosted AI (k-0519), answering as
 * `Outbox/k-0518/CONTRACT.md` v1.1 says: link-code sign-in (`/auth/link/start`, `/check`),
 * `GET /ai/credits`, and `POST /ai/generate` (`{ feature, stream, request }` → `{ response,
 * mentor }`, or Gemini's chunks then `event: mentor`). It charges each call from
 * `usageMetadata` at the contract's rates, refuses with 402 when the credits are short and
 * records every request. CONTRACT v1.3 (k-0521): a key already used answers `409
 * duplicate_request` and is never charged (Mentor keeps no answers); a call that failed and
 * was given back (502) frees its key; `deadline` stops a call and charges it.
 */

export interface FakeMentorOptions {
  credits?: number;
  /** Checks answered `pending` before `approved` (or `denied`/`expired`/`used`). */
  pendingPolls?: number;
  outcome?: 'approved' | 'denied' | 'expired' | 'used';
  /** The relay's reply text (a JSON string for structured requests). */
  reply?: string;
  usage?: { promptTokenCount: number; candidatesTokenCount: number; thoughtsTokenCount?: number };
  /** Forces this status and error code on every generate. */
  failWith?: { status: number; code: string; message?: string };
  /** A stream that ends with `event: error`, or with no receipt at all. */
  streamEnd?: 'mentor' | 'error' | 'none';
  status?: 'on' | 'paused' | 'off';
  token?: string;
  /** Answers the first n generates with `502 upstream_error` (given back: not charged, key free again). */
  failFirst?: number;
  /** Stops every generate at the time limit: `504 deadline`, or `event: error` `deadline` in a stream; charged. */
  deadline?: boolean;
  /** `/ai/credits` says the trial was refused and the balance is this (may be below zero). */
  trialRefused?: boolean;
  /** Sign-out answers this status (or fails as a network error), not 204. */
  logout?: number | 'network';
}

export interface FakeMentorRequest { method: string; path: string; headers: Record<string, string>; json: Record<string, unknown> | null }

const API = 'https://dseconmentor.com/api/app/v1';
/** CONTRACT §2: 100 credits = HK$1 at US$1 = HK$7.8 of US$1.50 in / US$7.50 out per million. */
export const FAKE_RATES = { inputPerMillionTokens: 1170, outputPerMillionTokens: 5850 };

export function fakeMentor(opts: FakeMentorOptions = {}) {
  const token = opts.token ?? 'dsm_test_token_0123456789abcdef';
  const state = { credits: opts.credits ?? 900, polls: 0, revoked: false, charged: 0, charges: 0, generates: 0 };
  /** Keys used, with what their call charged. */
  const used = new Map<string, number>();
  const requests: FakeMentorRequest[] = [];
  const usage = opts.usage ?? { promptTokenCount: 1000, candidatesTokenCount: 400, thoughtsTokenCount: 100 };
  const reply = opts.reply ?? JSON.stringify({ items: [{ key: 't1', text: '物價水平' }] });

  const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
  const relayError = (status: number, error: string, extra: Record<string, unknown> = {}) => json(status, { error, ...extra });

  const cost = () => (usage.promptTokenCount * FAKE_RATES.inputPerMillionTokens + (usage.candidatesTokenCount + (usage.thoughtsTokenCount ?? 0)) * FAKE_RATES.outputPerMillionTokens) / 1e6;
  const receipt = () => {
    const charged = cost();
    state.credits = Math.max(0, state.credits - charged);
    state.charged += charged;
    state.charges++;
    return { requestId: 'req_test', model: 'gemini-4-hydrogen', usage: { inputTokens: usage.promptTokenCount, outputTokens: usage.candidatesTokenCount, thinkingTokens: usage.thoughtsTokenCount ?? 0 }, charged, balance: state.credits, estimated: false };
  };

  const fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const headers = Object.fromEntries(Object.entries((init.headers as Record<string, string>) ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    const path = url.pathname.replace('/api/app/v1', '') + url.search;
    requests.push({ method: init.method ?? 'GET', path, headers, json: body });
    if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const authed = headers.authorization === `Bearer ${token}` && !state.revoked;

    if (path === '/auth/link/start') {
      return json(200, { code: 'BCDF-GHJK', pollToken: 'dsl_poll_secret_0123456789', verifyUrl: 'https://dseconmentor.com/link?code=BCDF-GHJK', interval: 3, expiresAt: new Date(Date.now() + 600_000).toISOString() });
    }
    if (path === '/auth/link/check') {
      if (state.polls++ < (opts.pendingPolls ?? 1)) return json(200, { status: 'pending' });
      const outcome = opts.outcome ?? 'approved';
      return json(200, outcome === 'approved' ? { status: 'approved', token, expiresAt: new Date(Date.now() + 1e10).toISOString(), userId: 'u1' } : { status: outcome });
    }
    if (path === '/auth/logout') {
      if (opts.logout === 'network') throw new TypeError('Failed to fetch');
      if (opts.logout && opts.logout !== 204) return relayError(opts.logout, 'server_error');
      state.revoked = true;
      return json(204, null);
    }
    if (path === '/ai/credits') {
      if (!authed) return relayError(401, 'unauthorized');
      return json(200, {
        status: opts.status ?? 'on',
        balance: state.credits,
        trial: opts.trialRefused ? { credits: 0, refused: true } : { credits: 900, grantedAt: '2026-11-23T09:58:01.000Z' },
        month: { spent: 0, cap: 20000, resetsAt: '2026-11-30T16:00:00.000Z' },
        model: 'gemini-4-hydrogen',
        rates: { creditsPerHkd: 100, hkdPerUsd: 7.8, ...FAKE_RATES, cachedInputPerMillionTokens: 58.5 },
        estimates: { studioWorksheet: 280, importCheck: 50, translate: 50, answerKey: 80 },
        extraPct: 10,
        packs: [{ id: 'hkd50', priceHkd: 50, credits: 4170 }, { id: 'hkd100', priceHkd: 100, credits: 8560 }, { id: 'hkd200', priceHkd: 200, credits: 17350 }],
        buyUrl: 'https://dseconmentor.com/account#ai-credits',
        pricingUrl: 'https://dseconmentor.com/pricing#ai-credits',
      });
    }
    if (path === '/ai/generate') {
      if (!authed) return relayError(401, 'unauthorized');
      if (opts.failWith) return relayError(opts.failWith.status, opts.failWith.code, opts.failWith.message ? { message: opts.failWith.message } : {});
      const request = body?.request as Record<string, unknown> | undefined;
      if (typeof body?.feature !== 'string' || !request || !Array.isArray(request.contents)) return relayError(400, 'invalid_request', { field: 'request' });
      const key = headers['idempotency-key'];
      if (key && !/^[A-Za-z0-9._:-]{8,100}$/.test(key)) return relayError(400, 'invalid_request', { field: 'Idempotency-Key' });
      if (key && used.has(key)) return relayError(409, 'duplicate_request', { state: 'done', requestId: 'req_test', charged: used.get(key) });
      if (state.credits < cost()) return relayError(402, 'insufficient_credits', { balance: state.credits, needed: cost() });
      if (opts.failFirst && state.generates++ < opts.failFirst) return relayError(502, 'upstream_error');
      if (key) used.set(key, cost());
      if (opts.deadline && body.stream !== true) {
        const { charged, balance } = receipt();
        return relayError(504, 'deadline', { charged, balance });
      }
      const candidate = (text: string, finish?: string) => ({ content: { role: 'model', parts: [{ text }] }, ...(finish ? { finishReason: finish } : {}) });
      if (body.stream !== true) {
        return json(200, { response: { candidates: [candidate(reply, 'STOP')], usageMetadata: usage, modelVersion: 'gemini-4-hydrogen' }, mentor: receipt() });
      }
      const half = Math.ceil(reply.length / 2);
      const chunks = [`data: ${JSON.stringify({ candidates: [candidate(reply.slice(0, half))] })}`, `data: ${JSON.stringify({ candidates: [candidate(reply.slice(half), 'STOP')], usageMetadata: usage })}`];
      const end = opts.deadline ? 'deadline' : (opts.streamEnd ?? 'mentor');
      if (end === 'deadline') {
        const { charged, balance } = receipt();
        chunks.push(`event: error\ndata: ${JSON.stringify({ error: 'deadline', refunded: false, charged, balance })}`);
      }
      if (end === 'mentor') chunks.push(`event: mentor\ndata: ${JSON.stringify(receipt())}`);
      if (end === 'error') chunks.push(`event: error\ndata: ${JSON.stringify({ error: 'upstream_error', refunded: true })}`);
      return new Response(chunks.map((c) => `${c}\n\n`).join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } });
    }
    return relayError(404, 'not_found');
  }) as typeof globalThis.fetch;

  const deps: HttpDeps = { fetch, now: () => Date.now(), sleep: async (_ms, signal) => { if (signal.aborted) throw new DOMException('Aborted', 'AbortError'); } };
  return { fetch, deps, requests, state, token, api: API };
}
