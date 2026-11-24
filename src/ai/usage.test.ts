import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearDialectCache, createClient } from './client';
import { fakeMentor } from './fakeMentor';
import { MENTOR_MODEL, PRESETS } from './providers';
import { ITEMS_SCHEMA } from './schema';
import type { CompletionRequest, ProviderConfig } from './types';
import { clearUsageLog, hostedCredits, onUsage, toRecord, usageByJob, usageLog, USAGE_STORAGE_KEY, type UsageRecord } from './usage';

/** Every answered AI call lands in the usage log, tagged and grouped by job (k-0537). */

const mentor = (token: string): ProviderConfig => ({ provider: 'mentor', apiKey: token, model: MENTOR_MODEL, baseUrl: PRESETS.mentor.baseUrl });
const request = (patch: Partial<CompletionRequest> = {}): CompletionRequest => ({
  system: 'S',
  turns: [{ role: 'user', content: 'hi' }],
  schema: ITEMS_SCHEMA,
  maxOutputTokens: 1000,
  signal: new AbortController().signal,
  ...patch,
});

const fact = { job: 'j', feature: 'studio.write' as const, provider: 'gemini' as const, model: 'm', ms: 5, at: 1 };

let heard: UsageRecord[] = [];
let off = () => {};
beforeEach(() => {
  clearDialectCache();
  clearUsageLog();
  heard = [];
  off = onUsage((r) => heard.push(r));
});
afterEach(() => off());

describe('credits', () => {
  it("bills fresh input, cached input and output plus thinking at Mentor's rates", () => {
    // 4,000 fresh × 1,170 + 1,000 cached × 58.5 + (500 + 500) × 5,850, per million.
    expect(hostedCredits({ input: 5000, cached: 1000, output: 500, thinking: 500 })).toBeCloseTo(4.68 + 0.0585 + 5.85, 6);
  });

  it("uses the relay's receipt when it has one, and estimates an own Gemini key at the same rates", () => {
    const usage = { input: 2000, cached: 0, output: 100, thinking: 100 };
    expect(toRecord({ ...fact, family: 'gemini', relay: true, usage, charged: 9.9 })).toMatchObject({ credits: 9.9 });
    expect(toRecord({ ...fact, family: 'gemini', relay: true, usage, charged: 9.9 }).estimated).toBeUndefined();
    expect(toRecord({ ...fact, family: 'gemini', relay: false, usage })).toMatchObject({ credits: hostedCredits({ input: 2000, cached: 0, output: 100, thinking: 100 }), estimated: true });
  });

  it("gives no credits for other providers, and keeps output as the visible answer (OpenAI's count includes reasoning)", () => {
    const r = toRecord({ ...fact, provider: 'openai', family: 'openai', relay: false, usage: { input: 10, output: 300, thinking: 200, cached: 4 } });
    expect(r).toMatchObject({ input: 10, cached: 4, output: 100, thinking: 200 });
    expect(r.credits).toBeUndefined();
  });
});

describe('the log', () => {
  it("records each relay call with its feature, the receipt's charge and one job per client", async () => {
    const server = fakeMentor({ credits: 100 });
    const studio = createClient(mentor(server.token), server.deps);
    await studio.complete(request({ feature: 'studio.pick' }));
    await studio.stream!(request({ feature: 'studio.write' }), () => undefined);
    await createClient(mentor(server.token), server.deps).complete(request({ feature: 'translate' }));

    expect(heard.map((r) => r.feature)).toEqual(['studio.pick', 'studio.write', 'translate']);
    expect(heard.every((r) => r.credits !== undefined && r.credits > 0 && !r.estimated)).toBe(true);
    expect(heard.reduce((sum, r) => sum + (r.credits ?? 0), 0)).toBeCloseTo(server.state.charged, 6);

    const jobs = usageByJob();
    expect(jobs.map((j) => [j.features, j.calls])).toEqual([[['studio.pick', 'studio.write'], 2], [['translate'], 1]]);
    expect(usageLog()).toHaveLength(3);
  });

  it('files a call without a feature as other', async () => {
    const server = fakeMentor({ credits: 100 });
    await createClient(mentor(server.token), server.deps).complete(request());
    expect(heard[0]?.feature).toBe('other');
  });

  it('logs nothing for a call that failed', async () => {
    const server = fakeMentor({ credits: 0.5 });
    await createClient(mentor(server.token), server.deps).complete(request()).catch(() => undefined);
    expect(heard).toEqual([]);
  });

  it('keeps token counts only, never the prompt or the answer, under its own storage key', async () => {
    const server = fakeMentor({ credits: 100 });
    await createClient(mentor(server.token), server.deps).complete(request({ system: 'SECRET-PROMPT', turns: [{ role: 'user', content: 'SECRET-PAPER' }] }));
    const saved = globalThis.localStorage?.getItem(USAGE_STORAGE_KEY) ?? JSON.stringify(usageLog());
    expect(saved).not.toContain('SECRET');
    expect(JSON.parse(saved)).toHaveLength(1);
  });
});
