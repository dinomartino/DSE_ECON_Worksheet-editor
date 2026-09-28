import { mapThrown, retryDelayMs } from './errors';
import { AiError, type HttpDeps, type ProviderId } from './types';

/**
 * The only file in `src/` that calls `fetch` (`src/test/networkCalls.test.ts`): the privacy
 * copy promises nothing is sent anywhere else. The key travels only in a header, never in
 * a URL; `redirect:'error'` stops that header following a redirect to another host.
 */

export const MAX_BODY_BYTES = 2 * 1024 * 1024;
export const COMPLETION_TIMEOUT_MS = 120_000;
export const PROBE_TIMEOUT_MS = 30_000;
const RATE_LIMIT_MAX_WAIT_MS = 20_000;
const RATE_LIMIT_DEFAULT_MS = 3_000;
const SERVER_RETRY_MS = [1_000, 3_000];
const NETWORK_RETRY_MS = 1_000;

export interface HttpRequest {
  provider: ProviderId;
  url: string;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: string;
  signal: AbortSignal;
  timeoutMs: number;
}
/** Parsed JSON when the body is JSON, else the (capped) text. */
export interface HttpResponse { status: number; headers: Headers; body: unknown }

function abortError(): DOMException {
  return new DOMException('Aborted', 'AbortError');
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortError());
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** Real fetch, clock and sleep; `fetch` is looked up per call so a stubbed global still works. */
export function defaultHttpDeps(): HttpDeps {
  return { fetch: (input, init) => fetch(input, init), now: () => Date.now(), sleep };
}

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return (await res.text()).slice(0, MAX_BODY_BYTES);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let out = '';
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const room = MAX_BODY_BYTES - bytes;
    bytes += value.byteLength;
    if (value.byteLength >= room) {
      out += decoder.decode(value.subarray(0, room), { stream: true });
      await reader.cancel().catch(() => undefined);
      break;
    }
    out += decoder.decode(value, { stream: true });
  }
  return out + decoder.decode();
}

function parseBody(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const isServerError = (status: number, body: unknown) =>
  status >= 500 || (typeof body === 'object' && JSON.stringify(body ?? '').includes('overloaded_error'));

/**
 * One request with the transport retries: a 429 once (only when the wait asked for is
 * ≤ 20 s), a 5xx or overload twice (1 s, 3 s, jittered), a network TypeError once. Returns
 * the final response whatever its status; throws `AiError` only for a thrown failure. The
 * caller's signal and the timer are combined by hand (no `AbortSignal.any` in older WKWebView).
 */
export async function send(deps: HttpDeps, req: HttpRequest): Promise<HttpResponse> {
  const { provider } = req;
  if (req.signal.aborted) throw new AiError(mapThrown(provider, null, 'user'));
  const controller = new AbortController();
  let reason: 'user' | 'timeout' | null = null;
  const onAbort = () => {
    reason ??= 'user';
    controller.abort();
  };
  req.signal.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => {
    reason ??= 'timeout';
    controller.abort();
  }, req.timeoutMs);
  const fail = (error: unknown) => new AiError(mapThrown(provider, error, reason));
  const pause = async (ms: number) => {
    try {
      await deps.sleep(ms, controller.signal);
    } catch (error) {
      throw fail(error);
    }
    if (controller.signal.aborted) throw fail(abortError());
  };

  try {
    let serverRetries = 0;
    let rateRetried = false;
    let networkRetried = false;
    for (;;) {
      let status: number;
      let headers: Headers;
      let body: unknown;
      try {
        const res = await deps.fetch(req.url, {
          method: req.method,
          headers: req.headers,
          body: req.body,
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          cache: 'no-store',
          redirect: 'error',
          mode: 'cors',
          signal: controller.signal,
        });
        status = res.status;
        headers = res.headers;
        body = parseBody(await readCapped(res));
      } catch (error) {
        if (!reason && error instanceof TypeError && !networkRetried) {
          networkRetried = true;
          await pause(NETWORK_RETRY_MS);
          continue;
        }
        throw fail(error);
      }
      if (status === 429 && !rateRetried) {
        const wait = retryDelayMs(body, headers) ?? RATE_LIMIT_DEFAULT_MS;
        if (wait <= RATE_LIMIT_MAX_WAIT_MS) {
          rateRetried = true;
          await pause(wait);
          continue;
        }
      }
      if (isServerError(status, body) && serverRetries < SERVER_RETRY_MS.length) {
        await pause(SERVER_RETRY_MS[serverRetries++] + Math.floor(Math.random() * 250));
        continue;
      }
      return { status, headers, body };
    }
  } finally {
    clearTimeout(timer);
    req.signal.removeEventListener('abort', onAbort);
  }
}
