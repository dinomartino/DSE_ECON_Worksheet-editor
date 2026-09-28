import { describe, expect, it } from 'vitest';
import { aiErrorInfo, isSchemaRejection, mapHttpError, mapThrown, redact } from './errors';
import { fixture } from './fakeFetch';
import type { AiErrorKind, ProviderId } from './types';

function mapFixture(provider: ProviderId, name: string) {
  const f = fixture(name);
  return mapHttpError(provider, f.status, f.body, new Headers(f.headers));
}

describe('mapHttpError, from recorded and documented bodies', () => {
  const table: Array<[ProviderId, string, AiErrorKind]> = [
    ['gemini', 'gemini-400-region', 'region'],
    ['gemini', 'gemini-400-bad-key', 'badKey'],
    ['gemini', 'gemini-403-blocked-key', 'keyBlocked'],
    ['gemini', 'gemini-429-quota', 'quota'],
    ['gemini', 'gemini-404-model', 'model'],
    ['gemini', 'gemini-400-unknown-field', 'badRequest'],
    ['deepseek', 'deepseek-401', 'badKey'],
    ['deepseek', 'deepseek-402', 'billing'],
    ['qwen', 'dashscope-401', 'badKey'],
    ['openrouter', 'openrouter-401', 'badKey'],
    ['openrouter', 'openrouter-402', 'billing'],
    ['openrouter', 'openrouter-403-region', 'region'],
    ['openrouter', 'openrouter-404-policy', 'policy'],
    ['openai', 'openai-401', 'badKey'],
    ['openai', 'openai-403-region', 'region'],
    ['openai', 'openai-400-json-schema', 'badRequest'],
    ['anthropic', 'anthropic-401', 'badKey'],
    ['anthropic', 'anthropic-529-overloaded', 'server'],
  ];
  it.each(table)('%s %s → %s', (provider, name, kind) => {
    const info = mapFixture(provider, name);
    expect(info.kind).toBe(kind);
    expect(info.provider).toBe(provider);
    expect(info.status).toBe(fixture(name).status);
  });

  it('reads the bad Gemini key from the body, not the 400', () => {
    expect(mapHttpError('gemini', 400, { error: { message: 'API key not valid.' } }, new Headers()).kind).toBe('badKey');
    expect(mapHttpError('gemini', 400, { error: { message: 'Bad field' } }, new Headers()).kind).toBe('badRequest');
  });

  it('marks the run-stopping kinds fatal and gives each its actions', () => {
    const region = mapFixture('gemini', 'gemini-400-region');
    expect(region.fatal).toBe(true);
    expect(region.actions).toEqual(['switchProvider', 'openSettings']);
    expect(region.message).toMatch(/Google's rule for Hong Kong, not a problem with your key/);
    expect(mapFixture('gemini', 'gemini-400-bad-key').actions).toEqual(['openSettings', 'openKeyPage']);
    expect(mapFixture('anthropic', 'anthropic-529-overloaded').fatal).toBe(false);
    expect(mapFixture('openai', 'openai-400-json-schema')).toMatchObject({ fatal: false, actions: ['retry'] });
  });

  it('offers the fallback model on quota only where the preset has one', () => {
    expect(mapFixture('gemini', 'gemini-429-quota').actions).toContain('useFallbackModel');
    expect(mapHttpError('deepseek', 429, {}, new Headers()).actions).toEqual(['retry', 'switchProvider']);
  });

  it('reads the wait from RetryInfo, or from Retry-After in seconds', () => {
    expect(mapFixture('gemini', 'gemini-429-quota').retryAfterMs).toBe(12_000);
    expect(mapHttpError('openai', 429, {}, new Headers({ 'retry-after': '7' })).retryAfterMs).toBe(7_000);
  });

  it('keeps the provider sentence as detail, capped at 300 characters', () => {
    expect(mapFixture('gemini', 'gemini-400-region').detail).toBe('User location is not supported for the API use.');
    const long = mapHttpError('deepseek', 400, { error: { message: 'x'.repeat(1000) } }, new Headers());
    expect(long.detail?.length).toBe(300);
  });
});

describe('isSchemaRejection', () => {
  it('is a 400 naming a structured-output feature', () => {
    const f = fixture('openai-400-json-schema');
    expect(isSchemaRejection('openai', f.status, f.body)).toBe(true);
    const g = fixture('gemini-400-unknown-field');
    expect(isSchemaRejection('gemini', g.status, g.body)).toBe(true);
  });

  it('never mistakes the region error ("not supported") or a model 404 for one', () => {
    const region = fixture('gemini-400-region');
    expect(isSchemaRejection('gemini', region.status, region.body)).toBe(false);
    const model = fixture('gemini-404-model');
    expect(isSchemaRejection('gemini', model.status, model.body)).toBe(false);
    const key = fixture('gemini-400-bad-key');
    expect(isSchemaRejection('gemini', key.status, key.body)).toBe(false);
  });
});

describe('mapThrown', () => {
  it('lets the abort reason decide cancelled vs timeout', () => {
    const abort = new DOMException('Aborted', 'AbortError');
    expect(mapThrown('gemini', abort, 'user').kind).toBe('cancelled');
    expect(mapThrown('gemini', abort, 'timeout').kind).toBe('timeout');
    expect(mapThrown('gemini', abort, null).kind).toBe('cancelled');
  });

  it('reads a TypeError from OpenAI as networkOrKey, elsewhere as network', () => {
    const failed = new TypeError('Failed to fetch');
    expect(mapThrown('openai', failed, null)).toMatchObject({ kind: 'networkOrKey', fatal: false, actions: ['retry', 'openSettings'] });
    expect(mapThrown('deepseek', failed, null)).toMatchObject({ kind: 'network', actions: ['retry'] });
  });

  it('passes an AiError through unchanged', async () => {
    const { AiError } = await import('./types');
    const info = aiErrorInfo('quota', 'gemini');
    expect(mapThrown('gemini', new AiError(info), null)).toBe(info);
  });
});

describe('redact', () => {
  it('removes the key itself and anything key-shaped', () => {
    const key = 'my-secret-custom-key-123';
    const text = `bad ${key} and sk-abcdefghijk and sk-ant-api03-xyz and AIzaSyA1234567890abcdefghijk and Bearer abc.def`;
    const out = redact(text, key);
    for (const leaked of [key, 'sk-abcdefghijk', 'sk-ant-api03-xyz', 'AIzaSyA1234567890abcdefghijk', 'abc.def']) {
      expect(out).not.toContain(leaked);
    }
    expect(out).toContain('[key]');
  });

  it('caps at 300 characters', () => {
    expect(redact('a'.repeat(500), null)).toHaveLength(300);
  });
});
