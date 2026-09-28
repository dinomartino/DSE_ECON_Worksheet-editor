import { presetFor } from './providers';
import { isAiError, type AiAction, type AiErrorInfo, type AiErrorKind, type ProviderId } from './types';

/**
 * Provider failures → one teacher-facing `AiErrorInfo`. Table-driven, body first, then
 * status: Gemini reports a bad key as 400. Nothing here logs; `detail` is always redacted.
 */

const FATAL: ReadonlySet<AiErrorKind> = new Set([
  'notConfigured', 'region', 'badKey', 'keyBlocked', 'quota', 'billing', 'model', 'policy',
]);

const ACTIONS: Record<AiErrorKind, AiAction[]> = {
  notConfigured: ['openSettings'],
  region: ['switchProvider', 'openSettings'],
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
}

function messageFor(kind: AiErrorKind, provider: ProviderId, ctx: ErrorContext): string {
  const p = presetFor(provider).label;
  switch (kind) {
    case 'notConfigured':
      return 'Set up a provider in Settings first.';
    case 'region':
      return provider === 'gemini'
        ? `${p}'s API doesn't serve your location. This is Google's rule for Hong Kong, not a problem with your key.`
        : `${p}'s API doesn't serve your location.`;
    case 'badKey':
      return `${p} didn't accept this key. It may be mistyped or deleted.`;
    case 'keyBlocked':
      return provider === 'gemini'
        ? 'Google has blocked this key. Create a new key in AI Studio.'
        : `${p} has blocked this key. Create a new key.`;
    case 'networkOrKey':
      return `${p} didn't answer. Usually this is a wrong key — ${p} hides the reason from browsers — or no connection.`;
    case 'network': {
      const base = `Couldn't reach ${ctx.host ?? p}. Check your connection.`;
      if (provider === 'ollama') return `${base} Is it running, and does it allow this app (OLLAMA_ORIGINS)?`;
      if (provider === 'custom') return `${base} Is it running, and does it allow browser requests (CORS)?`;
      return base;
    }
    case 'quota':
      return provider === 'gemini'
        ? `${p}'s limit was reached. Daily limits reset at midnight Pacific time (3 pm or 4 pm in Hong Kong).`
        : `${p}'s limit was reached.`;
    case 'billing':
      return `Your ${p} balance is empty.`;
    case 'model':
      return ctx.model ? `${p} has no model “${ctx.model}” for this key.` : `${p} has no such model for this key.`;
    case 'policy':
      return 'No model matches the privacy setting (no data collection).';
    case 'badRequest':
      return `${p} couldn't read the request.`;
    case 'server':
      return `${p} is having trouble right now.`;
    case 'timeout':
      return `${p} took too long to answer.`;
    case 'cancelled':
      return 'Stopped.';
    case 'safety':
      return 'The provider declined to translate this text.';
    case 'truncated':
      return "Couldn't translate this text safely (the answer was cut off).";
    case 'badOutput':
      return "Couldn't translate this text safely (the answer wasn't readable).";
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

const KEY_SHAPES = [/sk-ant-[\w-]+/g, /sk-[\w-]{8,}/g, /AIza[\w-]{20,}/g, /Bearer\s+[\w.~+/=-]+/gi];

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

/** First match wins: region and a blocked key before a plain bad key, policy before model. */
const RULES: Rule[] = [
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
    when: (s, t, p) => s === 402 || /Insufficient Balance/i.test(t) || (p === 'openrouter' && /\bcredits\b/i.test(t)),
  },
  { kind: 'policy', when: (s, t, p) => p === 'openrouter' && s === 404 && /data policy/i.test(t) },
  {
    kind: 'model',
    when: (s, t) => s === 404 || /\bNOT_FOUND\b|model_not_found/.test(t) || /model.*(not found|does not exist)/i.test(t),
  },
  { kind: 'quota', when: (s, t) => s === 429 || /RESOURCE_EXHAUSTED|rate_limit_error/.test(t) },
  { kind: 'server', when: (s, t) => s >= 500 || /overloaded_error/.test(t) },
  { kind: 'safety', when: (s, t, p) => p === 'openrouter' && s === 403 && /moderation|flagged/i.test(t) },
  // Any other 403 is the key lacking permission (Gemini: the API not enabled for its project).
  { kind: 'badKey', when: (s) => s === 403 },
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
  const kind = RULES.find((rule) => rule.when(status, text, provider))?.kind ?? 'badRequest';
  const retryAfterMs = kind === 'quota' ? retryDelayMs(body, headers) : undefined;
  return aiErrorInfo(kind, provider, { ...ctx, status, retryAfterMs, detail: providerMessage(body) });
}

/**
 * A 400 naming a structured-output feature: the client steps one rung down the ladder.
 * Region and key failures are mapped first, so "location is not supported" never counts.
 */
export function isSchemaRejection(provider: ProviderId, status: number, body: unknown): boolean {
  if (status !== 400 || mapHttpError(provider, status, body, new Headers()).kind !== 'badRequest') return false;
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
