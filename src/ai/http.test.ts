import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeFetch, instantDeps, replyOf } from './fakeFetch';
import { MAX_BODY_BYTES, defaultHttpDeps, send, type HttpRequest } from './http';
import { isAiError, type AiErrorInfo } from './types';

const request = (signal = new AbortController().signal, timeoutMs = 120_000): HttpRequest => ({
  provider: 'deepseek',
  url: 'https://api.example.test/chat/completions',
  method: 'POST',
  headers: { authorization: 'Bearer k' },
  body: '{}',
  signal,
  timeoutMs,
});

async function failure(promise: Promise<unknown>): Promise<AiErrorInfo> {
  try {
    await promise;
  } catch (error) {
    if (isAiError(error)) return error.info;
    throw error;
  }
  throw new Error('expected a failure');
}

afterEach(() => {
  vi.useRealTimers();
});

describe('send', () => {
  it('fetches with credentials omitted, no referrer, no cache and redirects refused', async () => {
    const { fetch, calls } = fakeFetch([{ status: 200, body: { ok: 1 } }]);
    const res = await send(instantDeps(fetch).deps, request());
    expect(res).toMatchObject({ status: 200, body: { ok: 1 } });
    expect(calls[0].init).toMatchObject({
      method: 'POST',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      redirect: 'error',
      mode: 'cors',
    });
  });

  it('returns a non-2xx response as it is, body parsed', async () => {
    const { fetch } = fakeFetch([replyOf('deepseek-401')]);
    const res = await send(instantDeps(fetch).deps, request());
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: { type: 'authentication_error' } });
  });

  it('keeps a body that is not JSON as text', async () => {
    const { fetch } = fakeFetch([{ status: 502, body: '<html>bad gateway</html>' }, { status: 502, body: 'x' }, { status: 502, body: 'y' }]);
    const res = await send(instantDeps(fetch).deps, request());
    expect(res.body).toBe('y');
  });

  it('cuts a body over 2 MB', async () => {
    const { fetch } = fakeFetch([{ status: 200, body: 'x'.repeat(MAX_BODY_BYTES + 5000) }]);
    const res = await send(instantDeps(fetch).deps, request());
    expect((res.body as string).length).toBe(MAX_BODY_BYTES);
  });

  it('retries a 429 once after Retry-After when it is 20 s or less, then returns it', async () => {
    const { fetch, calls } = fakeFetch([
      { status: 429, headers: { 'retry-after': '12' } },
      { status: 429, headers: { 'retry-after': '12' } },
    ]);
    const { deps, sleeps } = instantDeps(fetch);
    const res = await send(deps, request());
    expect(res.status).toBe(429);
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([12_000]);
  });

  it('waits for Gemini RetryInfo, and 3 s when nothing says how long', async () => {
    const gemini = fakeFetch([replyOf('gemini-429-quota'), { status: 200 }]);
    const a = instantDeps(gemini.fetch);
    await send(a.deps, request());
    expect(a.sleeps).toEqual([12_000]);
    const bare = fakeFetch([{ status: 429 }, { status: 200 }]);
    const b = instantDeps(bare.fetch);
    await send(b.deps, request());
    expect(b.sleeps).toEqual([3_000]);
  });

  it('does not retry a 429 that asks for more than 20 s', async () => {
    const { fetch, calls } = fakeFetch([{ status: 429, headers: { 'retry-after': '60' } }]);
    const { deps, sleeps } = instantDeps(fetch);
    expect((await send(deps, request())).status).toBe(429);
    expect(calls).toHaveLength(1);
    expect(sleeps).toEqual([]);
  });

  it('retries a 5xx twice, at about 1 s then 3 s', async () => {
    const { fetch, calls } = fakeFetch([{ status: 503 }, { status: 500 }, { status: 503 }]);
    const { deps, sleeps } = instantDeps(fetch);
    expect((await send(deps, request())).status).toBe(503);
    expect(calls).toHaveLength(3);
    expect(sleeps[0]).toBeGreaterThanOrEqual(1_000);
    expect(sleeps[0]).toBeLessThan(1_250);
    expect(sleeps[1]).toBeGreaterThanOrEqual(3_000);
    expect(sleeps[1]).toBeLessThan(3_250);
  });

  it('retries an Anthropic overload and succeeds', async () => {
    const { fetch } = fakeFetch([replyOf('anthropic-529-overloaded'), { status: 200, body: { content: [] } }]);
    expect((await send(instantDeps(fetch).deps, request())).status).toBe(200);
  });

  it('retries a network TypeError once, then throws network', async () => {
    const { fetch, calls } = fakeFetch([new TypeError('Failed to fetch'), new TypeError('Failed to fetch')]);
    const { deps, sleeps } = instantDeps(fetch);
    const info = await failure(send(deps, request()));
    expect(info.kind).toBe('network');
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([1_000]);
  });

  it('is cancelled, with no fetch, when the signal is already aborted', async () => {
    const { fetch, calls } = fakeFetch([]);
    const controller = new AbortController();
    controller.abort();
    expect((await failure(send(instantDeps(fetch).deps, request(controller.signal)))).kind).toBe('cancelled');
    expect(calls).toHaveLength(0);
  });

  it('is cancelled when the user aborts mid-request, and fetches nothing after', async () => {
    const { fetch, calls } = fakeFetch(['hang', { status: 200 }]);
    const controller = new AbortController();
    const pending = failure(send(instantDeps(fetch).deps, request(controller.signal)));
    controller.abort();
    expect((await pending).kind).toBe('cancelled');
    expect(calls).toHaveLength(1);
  });

  it('times out on its own timer', async () => {
    vi.useFakeTimers();
    const { fetch } = fakeFetch(['hang']);
    const pending = failure(send(instantDeps(fetch).deps, request(undefined, 30_000)));
    await vi.advanceTimersByTimeAsync(30_000);
    expect((await pending).kind).toBe('timeout');
  });

  it('has a real sleep that waits, and rejects at once on abort', async () => {
    vi.useFakeTimers();
    const { sleep } = defaultHttpDeps();
    let done = false;
    const waiting = sleep(1_000, new AbortController().signal).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await waiting;
    expect(done).toBe(true);
    const controller = new AbortController();
    const aborted = sleep(60_000, controller.signal);
    controller.abort();
    await expect(aborted).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('stops a retry wait when the user aborts', async () => {
    const { fetch, calls } = fakeFetch([{ status: 503 }, { status: 200 }]);
    const controller = new AbortController();
    const { deps } = instantDeps(fetch);
    deps.sleep = async () => {
      controller.abort();
    };
    expect((await failure(send(deps, request(controller.signal)))).kind).toBe('cancelled');
    expect(calls).toHaveLength(1);
  });
});
