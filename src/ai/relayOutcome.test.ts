import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearDialectCache, createClient } from './client';
import { fakeMentor } from './fakeMentor';
import { MENTOR_MODEL, PRESETS } from './providers';
import { onRelayOutcome, type RelayOutcome } from './relayOutcome';
import { ITEMS_SCHEMA } from './schema';
import type { CompletionRequest, ProviderConfig } from './types';

/** Every request through Mentor's relay tells the credits display what is left (k-0524). */

const config = (token: string): ProviderConfig => ({ provider: 'mentor', apiKey: token, model: MENTOR_MODEL, baseUrl: PRESETS.mentor.baseUrl });
const request = (patch: Partial<CompletionRequest> = {}): CompletionRequest => ({
  system: 'S',
  turns: [{ role: 'user', content: 'hi' }],
  schema: ITEMS_SCHEMA,
  maxOutputTokens: 1000,
  signal: new AbortController().signal,
  ...patch,
});

let heard: RelayOutcome[] = [];
let off = () => {};
beforeEach(() => {
  clearDialectCache();
  heard = [];
  off = onRelayOutcome((o) => heard.push(o));
});
afterEach(() => off());

describe('relay outcomes', () => {
  it('a whole answer reports the receipt balance (mentor.balance)', async () => {
    const server = fakeMentor({ credits: 100 });
    const res = await createClient(config(server.token), server.deps).complete(request());
    expect(heard).toEqual([{ balance: server.state.credits }]);
    expect(res.balance).toBe(server.state.credits);
  });

  it("a stream reports its closing receipt's balance", async () => {
    const server = fakeMentor({ credits: 100 });
    await createClient(config(server.token), server.deps).stream!(request(), () => undefined);
    expect(heard).toEqual([{ balance: server.state.credits }]);
  });

  it('a charged deadline reports the balance its error event carried', async () => {
    const server = fakeMentor({ credits: 100, deadline: true });
    await createClient(config(server.token), server.deps).stream!(request(), () => undefined).catch(() => undefined);
    expect(heard).toEqual([{ balance: server.state.credits }]);
  });

  it("402 insufficient_credits reports the balance in Mentor's error", async () => {
    const server = fakeMentor({ credits: 0.5 });
    await createClient(config(server.token), server.deps).complete(request()).catch(() => undefined);
    expect(heard).toEqual([{ balance: 0.5 }]);
  });

  it('a failure without a balance still reports, so the credits are read again', async () => {
    const server = fakeMentor({ credits: 100, streamEnd: 'error' });
    await createClient(config(server.token), server.deps).stream!(request(), () => undefined).catch(() => undefined);
    expect(heard).toEqual([{}]);
  });

  it('an own key reports nothing', async () => {
    const fetch = (async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"items":[]}' }] }, finishReason: 'STOP' }] }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof globalThis.fetch;
    await createClient({ provider: 'gemini', apiKey: 'AIzaSyTest0123456789abcdefghijklmnopqrs', model: 'gemini-3.5-flash-lite', baseUrl: '' }, { fetch }).complete(request());
    expect(heard).toEqual([]);
  });
});
