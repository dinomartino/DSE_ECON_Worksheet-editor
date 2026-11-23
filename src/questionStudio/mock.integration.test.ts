import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@/ai/client';
import { presetFor } from '@/ai/providers';
import { EMPTY_CORPUS } from './nearCopy';
import { REQUEST } from './fixtures';
import { refine, writeDrafts } from './run';
import type { StudioDeps } from './types';

/** The real client and parsers against `scripts/ai-mock-server.mjs`, the provider the browser run uses. */
describe('question studio against the mock provider', () => {
  let server: { close(): void; address(): { port: number } };
  let port = 0;
  beforeAll(async () => {
    const { startMockServer } = await import('../../scripts/ai-mock-server.mjs');
    server = await startMockServer(0);
    port = server.address().port;
  });
  afterAll(() => server.close());

  const depsFor = (path = 'v1'): StudioDeps => {
    const config = { provider: 'custom' as const, apiKey: 'sk-test', model: 'mock-translator', baseUrl: `http://localhost:${port}/${path}` };
    return { client: createClient(config), preset: presetFor('custom'), glossary: null, corpus: EMPTY_CORPUS };
  };
  const signal = () => new AbortController().signal;

  it('writes, checks and solves five questions through the real client, keys where the plan says', async () => {
    const out = await writeDrafts({ ...REQUEST, count: 5 }, depsFor(), { signal: signal() });
    if (!out.ok) throw new Error(out.error.message);
    expect(out.drafts).toHaveLength(5);
    expect(out.drafts.map((d) => d.status)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok']);
    expect(out.drafts.every((d) => d.solve?.answer === d.draft.answerIndex)).toBe(true);
    expect(new Set(out.drafts.map((d) => d.draft.stem.en)).size).toBe(5);
    expect(out.usage.requests).toBe(2);
    expect(out.model).toBe('mock-translator');
    // A bilingual paper: both sides written, every number agreeing.
    expect(out.drafts.every((d) => d.draft.stem.en && d.draft.stem.zh)).toBe(true);
  });

  it('a teacher note holding "!look" makes the solver disagree: Look, after one rewrite', async () => {
    const out = await writeDrafts({ ...REQUEST, count: 2, note: 'please !look' }, depsFor(), { signal: signal() });
    if (!out.ok) throw new Error(out.error.message);
    expect(out.usage.requests).toBe(4);
    expect(out.drafts.map((d) => d.status)).toEqual(['look', 'look']);
    expect(out.drafts[0].checks.find((c) => c.id === 'key')?.findings[0].id).toBe('key.differs');
  });

  it('refines one draft through the real client', async () => {
    const out = await writeDrafts({ ...REQUEST, count: 2 }, depsFor(), { signal: signal() });
    if (!out.ok) throw new Error(out.error.message);
    const next = await refine(REQUEST, out.drafts[0], { kind: 'another' }, [out.drafts[1]], depsFor(), { signal: signal() });
    if (!next.ok) throw new Error(next.error.message);
    expect(next.drafts).toHaveLength(1);
    expect(next.drafts[0].draft.stem.en).not.toBe(out.drafts[0].draft.stem.en);
    expect(next.drafts[0].draft.stem.en).not.toBe(out.drafts[1].draft.stem.en);
  });

  it("a provider that refuses the location comes back as the region error", async () => {
    const out = await writeDrafts(REQUEST, depsFor('region/v1'), { signal: signal() });
    expect(out).toMatchObject({ ok: false, error: { kind: 'region' } });
  });
});
