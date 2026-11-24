import { describe, expect, it } from 'vitest';
import { createClient } from './client';
import { addJobs, importCheckJob, questionsJob, ratesFor, studioJob, translateJob } from './credits';
import { FAKE_MODELS, fakeMentor } from './fakeMentor';
import { createMentorRelay, type MentorAccount } from './mentor';
import { MENTOR_MODEL, PRESETS } from './providers';
import { ITEMS_SCHEMA } from './schema';

/**
 * Estimates priced at the model each job runs on (CONTRACT v1.6, k-0539/k-0543): the server picks
 * the model by `feature`, `/ai/credits` → `models` says which and at what rates. What the teacher
 * sees: `src/components/ai/creditEstimateModels.test.ts`.
 */

const MAIN = { inputPerM: 1170, outputPerM: 5850 };
const LITE = { inputPerM: 234, outputPerM: 1950 };
const V16: Pick<MentorAccount, 'rates' | 'models'> = {
  rates: MAIN,
  models: { default: 'gemini-4-hydrogen', byFeature: { translate: 'gemini-3.5-flash-lite', test: 'gemini-3.5-flash-lite' }, rates: { 'gemini-4-hydrogen': MAIN, 'gemini-3.5-flash-lite': LITE } },
};
const OLD: Pick<MentorAccount, 'rates' | 'models'> = { rates: MAIN };
const signal = () => new AbortController().signal;

describe('ratesFor: models.rates[models.byFeature[feature] ?? models.default]', () => {
  it('a listed feature gets its model; any other, the default', () => {
    expect(ratesFor(V16, 'translate')).toEqual(LITE);
    expect(ratesFor(V16, 'test')).toEqual(LITE);
    expect(ratesFor(V16, 'studio.pick')).toEqual(MAIN);
    expect(ratesFor(V16, 'importCheck')).toEqual(MAIN);
    expect(ratesFor(V16)).toEqual(MAIN);
  });

  it('reads the map, never a list of its own: a server that moves a job moves the estimate', () => {
    const moved = { ...V16, models: { ...V16.models!, byFeature: { quality: 'gemini-3.5-flash-lite' } } };
    expect(ratesFor(moved, 'quality')).toEqual(LITE);
    expect(ratesFor(moved, 'translate')).toEqual(MAIN);
    const rolledBack = { ...V16, models: { ...V16.models!, byFeature: {} } };
    expect(ratesFor(rolledBack, 'translate')).toEqual(MAIN);
  });

  it("an older Mentor (no models), or a model with no rates, prices at the top-level rates; none, no estimate", () => {
    expect(ratesFor(OLD, 'translate')).toEqual(MAIN);
    const unpriced = { ...V16, models: { ...V16.models!, rates: { 'gemini-4-hydrogen': MAIN } } };
    expect(ratesFor(unpriced, 'translate')).toEqual(MAIN);
    expect(ratesFor({ models: { default: 'x', byFeature: {}, rates: {} } }, 'translate')).toBeUndefined();
    expect(ratesFor(null, 'translate')).toBeUndefined();
    // Prototype names are not features.
    expect(ratesFor(V16, 'constructor' as never)).toEqual(MAIN);
  });

  it('each job carries the feature its calls send', () => {
    expect(translateJob(['a'], 1).feature).toBe('translate');
    expect(importCheckJob(1, 'a').feature).toBe('importCheck');
    expect(questionsJob(1, 'a', 300, 'quality').feature).toBe('quality');
    expect(questionsJob(1, 'a', 450, 'answers').feature).toBe('answers');
    expect(studioJob({ questions: 1, sides: 1 }).feature).toBe('studio.write');
    expect(addJobs(translateJob(['a'], 1), translateJob(['b'], 1)).feature).toBe('translate');
    expect(addJobs(translateJob(['a'], 1), importCheckJob(1, 'b')).feature).toBeUndefined();
  });
});

describe('the fake relay is v1.6 too', () => {
  it('its /ai/credits names the models, and the account reads them', async () => {
    const server = fakeMentor();
    const account = await createMentorRelay({ deps: server.deps }).account(server.token, signal());
    expect(account.models?.byFeature).toEqual(FAKE_MODELS.byFeature);
    expect(ratesFor(account, 'translate')).toEqual(LITE);
  });

  it("charges each call at its own model's rates", async () => {
    const run = async (feature: 'translate' | 'quality', noModels = false) => {
      const server = fakeMentor({ credits: 100, noModels });
      const client = createClient({ provider: 'mentor', apiKey: server.token, model: MENTOR_MODEL, baseUrl: PRESETS.mentor.baseUrl }, server.deps);
      const res = await client.complete({ system: 'S', turns: [{ role: 'user', content: 'hi' }], schema: ITEMS_SCHEMA, maxOutputTokens: 1000, signal: signal(), feature });
      return res.charged ?? NaN;
    };
    // 1,000 in, 400 out + 100 thinking.
    expect(await run('translate')).toBeCloseTo((1000 * 234 + 500 * 1950) / 1e6, 9);
    expect(await run('quality')).toBeCloseTo((1000 * 1170 + 500 * 5850) / 1e6, 9);
    expect(await run('translate', true)).toBeCloseTo((1000 * 1170 + 500 * 5850) / 1e6, 9);
  });
});
