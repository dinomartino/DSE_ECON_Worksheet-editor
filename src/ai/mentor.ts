import { aiErrorInfo, describeHttpError, mapThrown } from './errors';
import { PROBE_TIMEOUT_MS, defaultHttpDeps, send, type HttpResponse } from './http';
import { MENTOR_API } from './providers';
import { AiError, isAiError, type HttpDeps } from './types';

/**
 * The DSEcon Mentor account's own calls (k-0519): sign in by link code, read the credits
 * left, sign out. Plain transport like the rest of `src/ai/`; the AI requests themselves go
 * through `createClient` (the `mentor` preset, `adapters/mentor.ts`). The wire is Mentor's
 * `Outbox/k-0518/CONTRACT.md` §1–2 (v1.1): fields may be added, never renamed.
 */

export interface LinkStart {
  /** Shown to the teacher, who sees the same code on the Allow page. */
  code: string;
  /** Secret: only this app polls with it. */
  pollToken: string;
  /** Opened in the system browser; https on Mentor's host only. */
  verifyUrl: string;
  intervalMs: number;
  /** ms since the epoch. */
  expiresAt: number;
}

/** `used` (the token was already handed out) reads as `expired`: sign in again. */
export type LinkPoll =
  | { status: 'pending'; retryAfterMs?: number }
  | { status: 'approved'; token: string }
  | { status: 'denied' }
  | { status: 'expired' };

export interface MentorAccount {
  /** Credits left (may have decimals; shown rounded down). 100 credits = HK$1 of Google's price. */
  credits: number;
  /** 'paused': today's safety stop (back after midnight HKT); 'off': switched off. */
  status: 'on' | 'paused' | 'off';
  /** Credits per million tokens, the rate the server charges; absent → no estimate. */
  rates?: { inputPerM: number; outputPerM: number };
  /** The one-time trial credits this account was given. */
  trialCredits?: number;
  /** Credit packs on sale (CONTRACT §2 v1.1): read, never computed. */
  packs?: Array<{ priceHkd: number; credits: number }>;
  /** The extra on top of Google's cost in each pack, in % (requests are charged at Google's cost). */
  extraPct?: number;
  /** Where Buy credits goes (Account page, credit packs). */
  buyUrl: string;
  /** The pricing page (the cost basis). */
  pricingUrl: string;
}

export interface LinkDevice {
  platform: 'desktop' | 'web';
  /** "Econ Studio on Mac". */
  deviceLabel: string;
  appVersion: string;
}

/** Throws `AiError` (kinds as for an AI request: network, serviceDown, signedOut…). */
export interface MentorRelay {
  startLink(device: LinkDevice, signal: AbortSignal): Promise<LinkStart>;
  pollLink(pollToken: string, signal: AbortSignal): Promise<LinkPoll>;
  account(token: string, signal: AbortSignal): Promise<MentorAccount>;
  /** Best effort; never throws. The caller forgets its token whatever happens. */
  signOut(token: string, signal: AbortSignal): Promise<void>;
}

export const MENTOR_PRICING_URL = 'https://dseconmentor.com/pricing#ai-credits';
export const MENTOR_BUY_URL = 'https://dseconmentor.com/account#ai-credits';
const MENTOR_HOSTS = new Set(['www.dseconmentor.com', 'dseconmentor.com']);

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const str = (x: unknown, max = 200): string | undefined => (typeof x === 'string' && x.trim() && x.length <= max ? x.trim() : undefined);
const num = (x: unknown): number | undefined => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);

/** A link the app may open: https on Mentor's host (or the dev server the relay itself is on). */
export function safeMentorUrl(url: unknown, api: string): string | undefined {
  if (typeof url !== 'string') return undefined;
  try {
    const u = new URL(url);
    const own = new URL(api);
    if (u.username || u.password) return undefined;
    if (u.protocol === 'https:' && (MENTOR_HOSTS.has(u.hostname) || u.host === own.host)) return u.toString();
    return u.protocol === 'http:' && u.host === own.host && ['localhost', '127.0.0.1'].includes(u.hostname) ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** The app API root for a relay base (`…/api/app/v1/ai` → `…/api/app/v1`). */
export const mentorApiRoot = (relayBase: string) => relayBase.replace(/\/+$/, '').replace(/\/ai$/, '');

export function readAccount(body: unknown, api: string): MentorAccount | null {
  if (!isRecord(body)) return null;
  const credits = num(body.balance);
  if (credits === undefined) return null;
  const status = body.status === 'paused' || body.status === 'off' ? body.status : 'on';
  const account: MentorAccount = {
    credits,
    status,
    buyUrl: safeMentorUrl(body.buyUrl, api) ?? MENTOR_BUY_URL,
    pricingUrl: safeMentorUrl(body.pricingUrl, api) ?? MENTOR_PRICING_URL,
  };
  if (isRecord(body.rates)) {
    const input = num(body.rates.inputPerMillionTokens);
    const output = num(body.rates.outputPerMillionTokens);
    if (input !== undefined && output !== undefined && input >= 0 && output >= 0) account.rates = { inputPerM: input, outputPerM: output };
  }
  const trial = isRecord(body.trial) ? num(body.trial.credits) : undefined;
  if (trial !== undefined && trial > 0) account.trialCredits = trial;
  const packs = Array.isArray(body.packs) ? body.packs.flatMap(readPack).slice(0, 6) : [];
  if (packs.length) account.packs = packs;
  const extra = num(body.extraPct);
  if (extra !== undefined && extra >= 0) account.extraPct = extra;
  return account;
}

function readPack(pack: unknown): Array<{ priceHkd: number; credits: number }> {
  if (!isRecord(pack)) return [];
  const priceHkd = num(pack.priceHkd);
  const credits = num(pack.credits);
  return priceHkd !== undefined && credits !== undefined && priceHkd > 0 && credits > 0 ? [{ priceHkd, credits }] : [];
}

function readStart(body: unknown, api: string, now: number): LinkStart | null {
  if (!isRecord(body)) return null;
  const code = str(body.code, 32);
  const pollToken = str(body.pollToken, 512);
  const verifyUrl = safeMentorUrl(body.verifyUrl, api);
  if (!code || !pollToken || !verifyUrl) return null;
  const interval = num(body.interval);
  const expires = typeof body.expiresAt === 'string' ? Date.parse(body.expiresAt) : NaN;
  return {
    code,
    pollToken,
    verifyUrl,
    intervalMs: Math.min(30_000, Math.max(1_000, (interval ?? 3) * 1000)),
    expiresAt: Number.isFinite(expires) ? expires : now + 10 * 60_000,
  };
}

function readPoll(body: unknown): LinkPoll | null {
  if (!isRecord(body)) return null;
  switch (body.status) {
    case 'pending':
      return { status: 'pending' };
    case 'approved': {
      const token = str(body.token, 512);
      return token ? { status: 'approved', token } : null;
    }
    case 'denied':
      return { status: 'denied' };
    case 'expired':
    case 'used':
      return { status: 'expired' };
    default:
      return null;
  }
}

export function createMentorRelay(opts: { relayBase?: string; deps?: Partial<HttpDeps> } = {}): MentorRelay {
  const api = opts.relayBase ? mentorApiRoot(opts.relayBase) : MENTOR_API;
  const d = defaultHttpDeps();
  const http: HttpDeps = { fetch: opts.deps?.fetch ?? d.fetch, now: opts.deps?.now ?? d.now, sleep: opts.deps?.sleep ?? d.sleep };

  const call = async (path: string, init: { method: 'GET' | 'POST'; token?: string; body?: unknown }, signal: AbortSignal): Promise<HttpResponse> => {
    // Only the headers CONTRACT §0 allows through CORS: content-type and authorization.
    const headers: Record<string, string> = {};
    if (init.body !== undefined) headers['content-type'] = 'application/json';
    if (init.token) headers.authorization = `Bearer ${init.token}`;
    try {
      return await send(http, {
        provider: 'mentor',
        url: `${api}${path}`,
        method: init.method,
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal,
        timeoutMs: PROBE_TIMEOUT_MS,
      });
    } catch (error) {
      const info = mapThrown('mentor', error, null);
      if (info.kind !== 'network') throw error;
      throw new AiError(aiErrorInfo('network', 'mentor', { host: new URL(api).host, detail: info.detail }));
    }
  };

  const failure = (res: HttpResponse, token?: string) =>
    new AiError(describeHttpError('mentor', res.status, res.body, res.headers, { key: token ?? null }));
  const unreadable = (res: HttpResponse) => new AiError(aiErrorInfo('badOutput', 'mentor', { status: res.status }));
  const ok = (res: HttpResponse) => res.status >= 200 && res.status < 300;

  return {
    async startLink(device, signal) {
      const res = await call('/auth/link/start', { method: 'POST', body: device }, signal);
      if (!ok(res)) throw failure(res);
      return readStart(res.body, api, http.now()) ?? (() => { throw unreadable(res); })();
    },

    async pollLink(pollToken, signal) {
      const res = await call('/auth/link/check', { method: 'POST', body: { pollToken } }, signal);
      // `send` already waited once on a short 429; a longer one is just "not yet".
      if (res.status === 429) return { status: 'pending', retryAfterMs: 10_000 };
      if (res.status === 410) return { status: 'expired' };
      if (!ok(res)) throw failure(res);
      return readPoll(res.body) ?? (() => { throw unreadable(res); })();
    },

    async account(token, signal) {
      const res = await call('/ai/credits', { method: 'GET', token }, signal);
      if (!ok(res)) throw failure(res, token);
      return readAccount(res.body, api) ?? (() => { throw unreadable(res); })();
    },

    async signOut(token, signal) {
      try {
        await call('/auth/logout', { method: 'POST', token, body: {} }, signal);
      } catch (error) {
        if (!isAiError(error)) console.warn('Mentor sign-out failed');
      }
    },
  };
}
