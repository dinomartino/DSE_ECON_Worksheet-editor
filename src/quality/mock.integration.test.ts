import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@/ai/client';
import { presetFor } from '@/ai/providers';
import { qualityQuestions } from './collect';
import { runQuality } from './run';
import { qualityWorksheet } from './testKit';

/** The real client against `scripts/ai-mock-server.mjs`, the provider the browser run uses. */
describe('quality check against the mock provider', () => {
  let server: { close(): void; address(): { port: number } };
  let port = 0;
  beforeAll(async () => {
    const { startMockServer } = await import('../../scripts/ai-mock-server.mjs');
    server = await startMockServer(0);
    port = server.address().port;
  });
  afterAll(() => server.close());

  it('returns the canned findings through the real client and parser', async () => {
    const config = { provider: 'custom' as const, apiKey: 'sk-test', model: 'mock-translator', baseUrl: `http://localhost:${port}/v1` };
    const client = createClient(config);
    const questions = qualityQuestions(qualityWorksheet(), { kind: 'paper' });
    const outcome = await runQuality(questions, { client, preset: presetFor('custom'), model: 'mock-translator' }, new AbortController().signal);
    expect(outcome).toMatchObject({ total: 3, reviewed: 3, failed: 0 });
    expect(outcome.findings.map((f) => [f.where, f.issue])).toEqual([
      ['Question 1', 'negativeStem'],
      ['Question 2 · Option C', 'statementRange'],
      ['Question 3 (a)', 'commandMarks'],
      ['Question 3 (b)', 'schemeMarks'],
      ['Question 3 (b)', 'bilingual'],
    ]);
  });
});
