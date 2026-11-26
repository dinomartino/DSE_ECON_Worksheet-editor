import { afterEach, describe, expect, it } from 'vitest';
import { aiErrorInfo } from '@/ai/errors';
import { AiError, type AiClient, type DecideRequest, type DecideResult } from '@/ai/types';
import { jevStudioRead, READ_TIMEOUT_MS, resetStudioRead } from './engine';
import { PAGE } from './intentPhrasings';

/** k-0567 (u-5sy9): the engine's Jev read never takes a message down; it only ever skips work. */

const input = { text: 'the second one is too wordy', drafts: PAGE, recent: [1, 2, 3] };
const signal = () => new AbortController().signal;
const yes: DecideResult = {
  model: 'jev-1.14.0',
  fallback: false,
  ms: 200,
  answers: {
    intent: { type: 'choice', choice: 'edit', confidence: 0.97, probabilities: { edit: 0.98, another: 0.01, new: 0.01, ask: 0 } },
    all: { type: 'noul', noul: 0.02 },
    missing: { type: 'noul', noul: 0.02 },
    harder: { type: 'noul', noul: 0.02 },
    easier: { type: 'noul', noul: 0.02 },
    d1: { type: 'noul', noul: 0.01 },
    d2: { type: 'noul', noul: 0.98 },
    d3: { type: 'noul', noul: 0.01 },
  },
};
const client = (decide?: (req: DecideRequest) => Promise<DecideResult | null>) => ({ ...(decide ? { decide } : {}) }) as unknown as AiClient;

afterEach(() => resetStudioRead());

describe('jevStudioRead (k-0567)', () => {
  it('asks Mentor with feature studio.read and a short wait, and routes the answer', async () => {
    const seen: DecideRequest[] = [];
    const route = await jevStudioRead(input, { client: client(async (req) => (seen.push(req), yes)) }, signal());
    expect(seen[0]).toMatchObject({ feature: 'studio.read', timeoutMs: READ_TIMEOUT_MS });
    expect(route).toMatchObject({ route: 'act', kind: 'edit', drafts: [2] });
  });

  it('own key (no decide): nothing asked', async () => {
    expect(await jevStudioRead(input, { client: client() }, signal())).toBeUndefined();
  });

  it('a failure is today\'s read, never an error', async () => {
    const route = await jevStudioRead(input, { client: client(async () => { throw new AiError(aiErrorInfo('server', 'mentor', { status: 502 })); }) }, signal());
    expect(route).toBeUndefined();
  });

  it('Mentor doesn\'t offer it: not asked again for ten minutes', async () => {
    let calls = 0;
    let t = 1_000;
    const c = client(async () => (calls++, null));
    expect(await jevStudioRead(input, { client: c }, signal(), () => t)).toBeUndefined();
    expect(await jevStudioRead(input, { client: c }, signal(), () => t)).toBeUndefined();
    expect(calls).toBe(1);
    t += 10 * 60_000 + 1;
    await jevStudioRead(input, { client: c }, signal(), () => t);
    expect(calls).toBe(2);
  });
});
