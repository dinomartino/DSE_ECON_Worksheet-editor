import { pictureId } from '../chat/chatPictures';

/**
 * What goes into a review record is scrubbed here (k-0598): no key, token or sign-in, and no
 * picture data (a picture is named by its fingerprint and size instead, so the record stays
 * small and the agent can still tell which picture went with which call).
 */

/** Key- and token-shaped text: Gemini, OpenAI/Anthropic/OpenRouter/DeepSeek, bearer headers, JWTs, `key=…`. */
const SECRETS: readonly RegExp[] = [
  /AIza[0-9A-Za-z_-]{20,}/g,
  /\bsk-(?:ant-|or-|proj-)?[0-9A-Za-z_-]{16,}/g,
  /\bBearer\s+[0-9A-Za-z._~+/=-]{8,}/gi,
  /\beyJ[0-9A-Za-z_-]{8,}\.[0-9A-Za-z_-]{8,}\.[0-9A-Za-z_-]{8,}/g,
  /([?&](?:key|api_key|apikey|token|access_token)=)[^&\s"']+/gi,
];

/** Keys whose value is never kept, whatever it holds. */
const SECRET_KEYS = /^(api[-_]?key|apikey|key|token|access[-_]?token|refresh[-_]?token|authorization|secret|password|requestkey|signal|bearer)$/i;

export function redactSecrets(text: string): string {
  let out = text;
  // A pattern with a group keeps it (the `?key=` before the value); the rest go whole.
  for (const pattern of SECRETS) out = out.replace(pattern, (_match, keep: unknown) => `${typeof keep === 'string' ? keep : ''}[redacted]`);
  return out;
}

const PICTURE = /^data:image\/[a-z+]+;base64,/i;

/** A picture's line in the record: its fingerprint and size. */
export const pictureLine = (dataUrl: string) => `[picture ${pictureId(dataUrl)}, ${Math.round((dataUrl.length * 3) / 4 / 1024)} KB]`;

/**
 * `value` as plain data fit for a record: every string scrubbed, pictures named not kept,
 * secret-named keys and functions dropped, cycles cut. Never throws.
 */
export function lean<T = unknown>(value: unknown, depth = 0, seen: WeakSet<object> = new WeakSet()): T {
  if (typeof value === 'string') return (PICTURE.test(value) ? pictureLine(value) : redactSecrets(value)) as T;
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value as T;
  if (typeof value !== 'object' || depth > 40) return undefined as T;
  if (seen.has(value)) return '[repeated]' as T;
  seen.add(value);
  if (Array.isArray(value)) {
    const out = value.map((each) => lean(each, depth + 1, seen));
    seen.delete(value);
    return out as T;
  }
  if (typeof AbortSignal !== 'undefined' && value instanceof AbortSignal) return undefined as T;
  const out: Record<string, unknown> = {};
  for (const [k, each] of Object.entries(value)) {
    if (SECRET_KEYS.test(k) || typeof each === 'function') continue;
    const kept = lean(each, depth + 1, seen);
    if (kept !== undefined) out[k] = kept;
  }
  seen.delete(value);
  return out as T;
}
