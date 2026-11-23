import { looksLikeKey } from './keyShape';
import { presetFor } from './providers';
import { isAiError, type AiAction, type AiErrorInfo, type AiErrorKind, type ProviderId } from './types';

/**
 * Provider failures → one teacher-facing `AiErrorInfo`. Table-driven, body first, then
 * status: Gemini reports a bad key as 400. Nothing here logs; `detail` is always redacted.
 */

const FATAL: ReadonlySet<AiErrorKind> = new Set([
  'notConfigured', 'region', 'badKey', 'keyBlocked', 'quota', 'billing', 'model', 'policy',
  'signedOut', 'noCredits', 'monthlyCap', 'serviceDown',
]);

const ACTIONS: Record<AiErrorKind, AiAction[]> = {
  notConfigured: ['openSettings'],
  region: ['retry', 'switchProvider', 'openSettings'],
  badKey: ['openSettings', 'openKeyPage'],
  keyBlocked: ['openKeyPage'],
  networkOrKey: ['retry', 'openSettings'],
  network: ['retry'],
  quota: ['retry', 'useFallbackModel', 'switchProvider'],
  billing: ['openBilling', 'switchProvider'],
  model: ['chooseModel'],
  policy: ['openSettings'],
  badRequest: ['retry'],
  server: ['retry'],
  timeout: ['retry'],
  cancelled: [],
  safety: [],
  truncated: [],
  badOutput: [],
  signedOut: ['signIn'],
  noCredits: ['buyCredits', 'useOwnKey'],
  monthlyCap: ['useOwnKey'],
  serviceDown: ['retry', 'useOwnKey'],
};

export interface ErrorContext {
  status?: number;
  retryAfterMs?: number;
  /** Raw provider text; redacted and capped here. */
  detail?: string;
  /** The key to scrub from `detail`. */
  key?: string | null;
  model?: string;
  host?: string;
  /** Mentor's own error (`CONTRACT.md` §5): its code, and the credits it charged / left when it says. */
  relay?: RelayError;
}

export interface RelayError { code: string; charged?: number; balance?: number }

/** Mentor's `{ error, charged?, balance? }`, or undefined for any other body. */
export function relayErrorOf(body: unknown): RelayError | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const b = body as { error?: unknown; charged?: unknown; balance?: unknown };
  if (typeof b.error !== 'string') return undefined;
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);
  return { code: b.error, ...(n(b.charged) !== undefined ? { charged: n(b.charged) } : {}), ...(n(b.balance) !== undefined ? { balance: n(b.balance) } : {}) };
}

/** "41" · "<1": the credits a stopped call used, for the deadline message. */
export const usedCredits = (n: number) => (n < 1 ? '<1' : String(Math.round(n)));

/** Mentor stopped the call at its ~270 s limit (CONTRACT v1.3): charged for what it used. */
export const mentorDeadlineMessage = (charged?: number) =>
  charged === undefined
    ? 'This took too long and DSEcon Mentor stopped it; the credits it used were charged. Try a smaller job.'
    : `This took too long and DSEcon Mentor stopped it; ${usedCredits(charged)} credits were used. Try a smaller job.`;

/** Gemini refuses Hong Kong per request, so the fix is a VPN kept on, not a new key. */
export const GEMINI_REGION_MESSAGE = "Gemini can't be reached from your location. Turn on a VPN and try again.";

function messageFor(kind: AiErrorKind, provider: ProviderId, ctx: ErrorContext): string {
  const p = presetFor(provider).label;
  switch (kind) {
    case 'notConfigured':
      return 'Set up a provider in Settings first.';
    case 'region':
      return provider === 'gemini' ? GEMINI_REGION_MESSAGE : `${p}'s API doesn't serve your location.`;
    case 'badKey':
      return `${p} didn't accept this key. It may be mistyped or deleted.`;
    case 'keyBlocked':
      return provider === 'gemini'
        ? 'Google has blocked this key. Create a new key in AI Studio.'
        : `${p} has blocked this key. Create a new key.`;
    case 'networkOrKey':
      return `${p} didn't answer. Usually this is a wrong key, but ${p} hides the reason from browsers. Or there is no connection.`;
    case 'network': {
      const base = `Couldn't reach ${ctx.host ?? p}. Check your connection.`;
      if (provider === 'ollama') return `${base} Is it running, and does it allow this app (OLLAMA_ORIGINS)?`;
      if (provider === 'custom') return `${base} Is it running, and does it allow browser requests (CORS)?`;
      return base;
    }
    case 'quota':
      if (provider === 'mentor') return 'Too many AI requests at once. Wait a minute and try again.';
      return provider === 'gemini'
        ? `${p}'s limit was reached. Daily limits reset at midnight Pacific time (3 pm or 4 pm in Hong Kong).`
        : `${p}'s limit was reached.`;
    case 'billing':
      return `Your ${p} balance is empty.`;
    case 'model':
      return ctx.model && !keyLikeModel(ctx.model, ctx.key ?? null)
        ? `${p} has no model “${ctx.model}” for this key.`
        : `${p} has no such model for this key.`;
    case 'policy':
      return 'No model matches the privacy setting (no data collection).';
    case 'badRequest':
      if (provider === 'mentor') return "DSEcon Mentor couldn't use this request: it may be too big (fewer or smaller pictures), or Econ Studio needs an update.";
      return `${p} couldn't read the request.`;
    case 'server':
      if (provider === 'mentor' && ctx.relay?.code === 'duplicate_request') return 'This job was already sent once, and its answer didn’t arrive. Try again to send it afresh.';
      if (provider === 'mentor' && ctx.relay?.code === 'limits_unavailable') return 'DSEcon Mentor is having trouble. No credits were used. Try again in a minute.';
      if (provider === 'mentor') return "Google's AI didn't answer through DSEcon Mentor. No credits were used. Try again.";
      return `${p} is having trouble right now.`;
    case 'timeout':
      if (provider === 'mentor' && ctx.relay?.code === 'deadline') return mentorDeadlineMessage(ctx.relay.charged);
      return `${p} took too long to answer.`;
    case 'cancelled':
      return 'Stopped.';
    case 'safety':
      return 'The provider declined to translate this text.';
    case 'truncated':
      return "Couldn't translate this text safely (the answer was cut off).";
    case 'badOutput':
      return "Couldn't translate this text safely (the answer wasn't readable).";
    case 'signedOut':
      return 'You are signed out of DSEcon Mentor. Sign in again in Settings → AI.';
    case 'noCredits':
      if ((ctx.relay?.balance ?? 0) < 0) return 'Your credit balance is below zero after a refund or dispute. Buy credits to continue, or use your own key.';
      return 'Not enough AI credits left. Buy credits to keep using AI, or use your own key.';
    case 'monthlyCap':
      return 'This account reached its monthly AI limit. It resets at the start of next month; until then, use your own key.';
    case 'serviceDown':
      return "DSEcon Mentor's AI is paused or switched off right now. Try again later (a pause ends at midnight), or use your own key.";
  }
}

/** Builds the info for `kind`: message, fatality and actions come from the tables above. */
export function aiErrorInfo(kind: AiErrorKind, provider: ProviderId, ctx: ErrorContext = {}): AiErrorInfo {
  const preset = presetFor(provider);
  const actions = ACTIONS[kind].filter(
    (a) => (a !== 'openKeyPage' || !!preset.keyUrl) && (a !== 'useFallbackModel' || !!preset.quotaFallbackModel),
  );
  const info: AiErrorInfo = { kind, provider, message: messageFor(kind, provider, ctx), fatal: FATAL.has(kind), actions };
  if (ctx.status !== undefined) info.status = ctx.status;
  if (ctx.retryAfterMs !== undefined) info.retryAfterMs = ctx.retryAfterMs;
  if (ctx.detail) info.detail = redact(ctx.detail, ctx.key ?? null);
  return info;
}

// `\b` keeps model names like `deepseek-reasoner` intact.
const KEY_SHAPES = [/\bsk-ant-[\w-]+/g, /\bsk-[\w-]{8,}/g, /\bAIza[\w-]{20,}/g, /Bearer\s+[\w.~+/=-]+/gi];

/** A model id that is, or contains, the key (pasted into the wrong field): never sent, never shown. */
export function keyLikeModel(model: string, key: string | null): boolean {
  return (!!key && key.length >= 4 && model.includes(key)) || looksLikeKey(model);
}

/** The key itself and anything shaped like a key removed; at most 300 characters. */
export function redact(text: string, key: string | null): string {
  let out = text;
  if (key && key.length >= 4) out = out.split(key).join('[key]');
  for (const shape of KEY_SHAPES) out = out.replace(shape, '[key]');
  return out.length > 300 ? `${out.slice(0, 299)}…` : out;
}

/** Every string in a parsed error body, joined: codes, statuses, reasons and messages. */
function haystack(body: unknown): string {
  const parts: string[] = [];
  const visit = (value: unknown, depth: number) => {
    if (parts.length > 64 || depth > 6) return;
    if (typeof value === 'string') parts.push(value);
    else if (Array.isArray(value)) value.forEach((v) => visit(v, depth + 1));
    else if (value && typeof value === 'object') Object.values(value).forEach((v) => visit(v, depth + 1));
  };
  visit(body, 0);
  return parts.join(' \n ');
}

/** The provider's own sentence: `error.message` in every family, else the raw text. */
function providerMessage(body: unknown): string | undefined {
  if (typeof body === 'string') return body.trim() || undefined;
  const b = body as { error?: { message?: unknown } | string; message?: unknown } | null;
  if (b && typeof b.error === 'object' && typeof b.error?.message === 'string') return b.error.message;
  if (b && typeof b.error === 'string') return b.error;
  if (b && typeof b.message === 'string') return b.message;
  return undefined;
}

/** The wait a 429 asks for: `Retry-After` (seconds or a date), else Gemini's `RetryInfo.retryDelay`. */
export function retryDelayMs(body: unknown, headers: Headers): number | undefined {
  const header = headers.get('retry-after');
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const at = Date.parse(header);
    if (Number.isFinite(at)) return Math.max(0, at - Date.now());
  }
  const details = (body as { error?: { details?: unknown } } | null)?.error?.details;
  if (Array.isArray(details)) {
    for (const d of details) {
      const delay = (d as { retryDelay?: unknown } | null)?.retryDelay;
      const m = typeof delay === 'string' ? /^(\d+(?:\.\d+)?)s$/.exec(delay) : null;
      if (m) return Math.round(Number(m[1]) * 1000);
    }
  }
  return undefined;
}

type Rule = { kind: AiErrorKind; when: (status: number, text: string, provider: ProviderId) => boolean };

/** The relay's own error code (`Outbox/k-0518/CONTRACT.md` §5: `{ "error": "<code>" }`). */
const relayCode = (t: string, ...codes: string[]) => codes.some((code) => new RegExp(`\\b${code}\\b`).test(t));

/** First match wins: the hosted relay's own errors, then region and a blocked key before a plain bad key, policy before model. */
const RULES: Rule[] = [
  // 401: missing, revoked, or unused for 30 days; 403 token_scope (v1.3): a token this route won't take. Both: sign in again.
  { kind: 'signedOut', when: (s, t, p) => p === 'mentor' && (s === 401 || relayCode(t, 'unauthorized', 'token_scope')) },
  { kind: 'noCredits', when: (s, t, p) => p === 'mentor' && (s === 402 || relayCode(t, 'insufficient_credits')) },
  { kind: 'monthlyCap', when: (_s, t, p) => p === 'mentor' && relayCode(t, 'monthly_cap') },
  { kind: 'serviceDown', when: (_s, t, p) => p === 'mentor' && relayCode(t, 'hosted_ai_paused', 'hosted_ai_off') },
  // The rest of the relay's codes: too_large / invalid_request / upstream_rejected (a 422 is
  // Gemini refusing the request as sent) are a bad request; upstream_error / upstream_busy /
  // server_error fall to 'server' below, rate_limited to 'quota'.
  { kind: 'badRequest', when: (s, t, p) => p === 'mentor' && (s === 413 || s === 422 || relayCode(t, 'too_large', 'invalid_request', 'upstream_rejected')) },
  {
    kind: 'region',
    when: (s, t) =>
      /location is not supported/i.test(t) ||
      /unsupported_country_region_territory/.test(t) ||
      (s === 403 && /\b(region|country|territory)\b|not available in your/i.test(t)) ||
      (/permission_error/.test(t) && /\b(region|country|territory)\b/i.test(t)),
  },
  {
    kind: 'keyBlocked',
    when: (_s, t) => /PERMISSION_DENIED/.test(t) && /unrestricted|leaked|blocked|dormant|restricted key/i.test(t),
  },
  {
    kind: 'badKey',
    when: (s, t) => s === 401 || /API_KEY_INVALID|API key not valid|authentication_error|invalid_api_key/.test(t),
  },
  {
    kind: 'billing',
    when: (s, t, p) => s === 402 || /Insufficient Balance/i.test(t) || (p === 'openrouter' && s !== 429 && /\bcredits\b/i.test(t)),
  },
  { kind: 'policy', when: (s, t, p) => p === 'openrouter' && s === 404 && /data policy/i.test(t) },
  {
    kind: 'model',
    when: (s, t) => s === 404 || /\bNOT_FOUND\b|model_not_found/.test(t) || /model.*(not found|does not exist)/i.test(t),
  },
  { kind: 'quota', when: (s, t) => s === 429 || /RESOURCE_EXHAUSTED|rate_limit_error/.test(t) },
  { kind: 'server', when: (s, t) => s >= 500 || /overloaded_error/.test(t) },
  { kind: 'safety', when: (s, t, p) => p === 'openrouter' && s === 403 && /moderation|flagged/i.test(t) },
  // Another 403 is fatal to the key only when it is about the key or its project's API;
  // one about a model or resource is model access. Anything else stays a retryable badRequest.
  { kind: 'badKey', when: (s, t) => s === 403 && /SERVICE_DISABLED|has not been used|API_KEY_/.test(t) },
  { kind: 'model', when: (s, t) => s === 403 && /\bmodels?\b|\bresource\b/i.test(t) },
  { kind: 'badKey', when: (s, t) => s === 403 && /\bapi[ _-]?key\b/i.test(t) },
];

/** An HTTP failure the transport could not retry away. */
export function mapHttpError(provider: ProviderId, status: number, body: unknown, headers: Headers): AiErrorInfo {
  return describeHttpError(provider, status, body, headers, {});
}

/** `mapHttpError` for a known request: the key is scrubbed before the cap, the model named. */
export function describeHttpError(
  provider: ProviderId,
  status: number,
  body: unknown,
  headers: Headers,
  ctx: Pick<ErrorContext, 'key' | 'model'>,
): AiErrorInfo {
  const text = haystack(body);
  const relay = provider === 'mentor' ? relayErrorOf(body) : undefined;
  // CONTRACT v1.3: a stopped call (charged), a repeated job key, the limits not checkable.
  const relayKind: AiErrorKind | undefined =
    relay?.code === 'deadline' ? 'timeout' : relay?.code === 'duplicate_request' || relay?.code === 'limits_unavailable' ? 'server' : undefined;
  const kind = relayKind ?? RULES.find((rule) => rule.when(status, text, provider))?.kind ?? 'badRequest';
  const retryAfterMs = kind === 'quota' ? retryDelayMs(body, headers) : undefined;
  return aiErrorInfo(kind, provider, { ...ctx, status, retryAfterMs, detail: providerMessage(body), ...(relay ? { relay } : {}) });
}

/**
 * A 400 naming a structured-output feature: the client steps one rung down the ladder.
 * Region and key failures are mapped first, so "location is not supported" never counts.
 */
export function isSchemaRejection(provider: ProviderId, status: number, body: unknown): boolean {
  // Mentor's relay hands Gemini's 400 on as `422 upstream_rejected` with Gemini's message (k-0519).
  const relayed = provider === 'mentor' && status === 422;
  if ((status !== 400 && !relayed) || mapHttpError(provider, status, body, new Headers()).kind !== 'badRequest') return false;
  return SCHEMA_WORDS.test(haystack(body));
}

const SCHEMA_WORDS =
  /responseJsonSchema|response_json_schema|responseFormat|response_format|json_schema|json_object|output_config|not supported|unknown name|cannot find field|unknown parameter|unrecognized/i;

/** A thrown failure: the abort reason decides cancelled vs timeout; OpenAI hides a bad key as a TypeError. */
export function mapThrown(provider: ProviderId, error: unknown, reason: 'user' | 'timeout' | null): AiErrorInfo {
  if (isAiError(error)) return error.info;
  if (reason === 'user') return aiErrorInfo('cancelled', provider);
  if (reason === 'timeout') return aiErrorInfo('timeout', provider);
  const name = error instanceof Error || error instanceof DOMException ? error.name : '';
  if (name === 'AbortError') return aiErrorInfo('cancelled', provider);
  if (name === 'TimeoutError') return aiErrorInfo('timeout', provider);
  const detail = error instanceof Error ? error.message : undefined;
  return aiErrorInfo(provider === 'openai' ? 'networkOrKey' : 'network', provider, { detail });
}
