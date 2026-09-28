import { beforeEach, describe, expect, it, vi } from 'vitest';
import { presetFor } from '@/ai/providers';
import { emptyGlossary } from '@/glossary/load';
import type { AiConfigResult } from '@/settings/aiSettings';
import { createRunDeps } from './deps';

const hoisted = vi.hoisted(() => ({
  resolve: vi.fn<() => Promise<unknown>>(),
  load: vi.fn<() => Promise<unknown>>(),
}));
vi.mock('@/settings/aiSettings', () => ({ resolveAiConfig: hoisted.resolve }));
vi.mock('@/glossary/load', async (original) => ({
  ...(await original<typeof import('@/glossary/load')>()),
  loadGlossary: hoisted.load,
}));

const preset = presetFor('deepseek');
const config = { provider: 'deepseek' as const, apiKey: 'sk-test', model: 'deepseek-chat', baseUrl: preset.baseUrl };
const resolves = (result: AiConfigResult) => hoisted.resolve.mockResolvedValue(result);

beforeEach(() => {
  hoisted.resolve.mockReset();
  hoisted.load.mockReset().mockResolvedValue(emptyGlossary());
});

describe('createRunDeps', () => {
  it.each([
    { ok: false, provider: 'gemini', reason: 'noKey' },
    { ok: false, provider: 'custom', reason: 'noBaseUrl' },
    { ok: false, provider: 'openai', reason: 'noModel' },
    { ok: false, provider: 'anthropic', reason: 'secretError', error: { kind: 'denied', message: 'Keychain access was denied.' } },
  ] as AiConfigResult[])('passes a settings failure through: $reason', async (failure) => {
    resolves(failure);
    expect(await createRunDeps()).toEqual(failure);
    expect(hoisted.load).not.toHaveBeenCalled();
  });

  it('builds a client for the configured provider, with the glossary loaded once', async () => {
    resolves({ ok: true, config, preset });
    const result = await createRunDeps();
    if (!result.ok) throw new Error('expected deps');
    expect(result.config).toBe(config);
    expect(result.deps).toMatchObject({ preset, model: 'deepseek-chat' });
    expect(result.deps.glossary?.meta).toBeDefined();
    expect(typeof result.deps.client.complete).toBe('function');
    expect(hoisted.load).toHaveBeenCalledTimes(1);
  });

  it('runs without a glossary when asked, or when it fails to load', async () => {
    resolves({ ok: true, config, preset });
    const off = await createRunDeps({ glossary: false });
    expect(off.ok && off.deps.glossary).toBe(null);
    expect(hoisted.load).not.toHaveBeenCalled();
    hoisted.load.mockRejectedValue(new Error('chunk failed'));
    const failed = await createRunDeps();
    expect(failed.ok && failed.deps.glossary).toBe(null);
  });
});
