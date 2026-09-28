import { describe, expect, it } from 'vitest';
import { AI_SETTINGS, readAiStatus, resolveAiConfig } from './aiSettings';

describe('AI_SETTINGS', () => {
  it('defaults to Gemini, remembers keys on desktop only, and includes teacher text', () => {
    expect(AI_SETTINGS.defaults({ desktop: false })).toMatchObject({
      provider: 'gemini',
      rememberKey: false,
      includeTeacherText: true,
    });
    expect(AI_SETTINGS.defaults({ desktop: true }).rememberKey).toBe(true);
  });

  it('accepts its own defaults field by field', () => {
    for (const env of [{ desktop: false }, { desktop: true }]) {
      const defaults = AI_SETTINGS.defaults(env);
      for (const [name, validate] of Object.entries(AI_SETTINGS.fields)) {
        expect(validate(defaults[name as keyof typeof defaults]), name).toEqual(defaults[name as keyof typeof defaults]);
      }
    }
  });

  it('holds no field that could carry key material', () => {
    const names = Object.keys(AI_SETTINGS.fields).filter((n) => n !== 'rememberKey' && n !== 'keychainSaved');
    for (const name of names) expect(name).not.toMatch(/key|token|secret|password/i);
  });

  it('drops a bad model id or base URL without losing the others', () => {
    expect(AI_SETTINGS.fields.models({ gemini: 'gemini-3.5-flash-lite', qwen: 'bad id!' })).toEqual({
      gemini: 'gemini-3.5-flash-lite',
    });
    expect(AI_SETTINGS.fields.baseUrls({ custom: 'http://example.com', ollama: 'http://localhost:11434/v1' })).toEqual({
      ollama: 'http://localhost:11434/v1',
    });
    expect(AI_SETTINGS.fields.provider('someday')).toBeUndefined();
  });
});

describe('the AI status before a provider is set up', () => {
  it('reads as unconfigured Gemini with its default model', () => {
    const status = readAiStatus();
    expect(status).toMatchObject({ provider: 'gemini', configured: false, keyStore: null });
    expect(status.model).toBe(status.preset.models[0].id);
    expect(readAiStatus()).toBe(status);
  });

  it('resolves to no key, never throwing', async () => {
    await expect(resolveAiConfig()).resolves.toMatchObject({ ok: false, reason: 'noKey' });
  });
});
