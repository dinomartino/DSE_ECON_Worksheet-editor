import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HttpDeps } from './types';

/** Test support: a scripted `fetch`, instant sleeps, and the recorded fixtures. Never shipped. */

export type Reply =
  | { status: number; body?: unknown; headers?: Record<string, string> }
  | Error
  /** Never answers; rejects with an AbortError when the request is aborted. */
  | 'hang';

export interface Call { url: string; init: RequestInit; json: Record<string, unknown> | null; headers: Record<string, string> }

export interface Fixture { source: string; status: number; headers: Record<string, string>; body: unknown }

export function fixture(name: string): Fixture {
  return JSON.parse(readFileSync(join(__dirname, 'fixtures', `${name}.json`), 'utf8')) as Fixture;
}

export function fakeFetch(replies: Reply[]) {
  const calls: Call[] = [];
  const queue = [...replies];
  const fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers = { ...(init.headers as Record<string, string> | undefined) };
    const json = typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    calls.push({ url: String(input), init, json, headers });
    const reply = queue.shift();
    if (!reply) throw new Error(`unexpected request ${String(input)}`);
    if (reply === 'hang') {
      return new Promise<Response>((_, reject) => {
        const abort = () => reject(new DOMException('Aborted', 'AbortError'));
        if (init.signal?.aborted) abort();
        init.signal?.addEventListener('abort', abort, { once: true });
      });
    }
    if (reply instanceof Error) throw reply;
    const body = typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body ?? {});
    return new Response(body, { status: reply.status, headers: reply.headers });
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

/** Deps whose sleeps return at once (recorded) and whose clock ticks 5 ms per read. */
export function instantDeps(fetch: typeof globalThis.fetch) {
  const sleeps: number[] = [];
  let t = 0;
  const deps: HttpDeps = {
    fetch,
    now: () => (t += 5),
    sleep: async (ms, signal) => {
      sleeps.push(ms);
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    },
  };
  return { deps, sleeps };
}

/** A fixture as a scripted reply. */
export const replyOf = (name: string): Reply => {
  const f = fixture(name);
  return { status: f.status, body: f.body, headers: f.headers };
};
