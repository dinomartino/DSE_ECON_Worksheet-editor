import { describe, expect, it } from 'vitest';
import { PRESETS, presetFor } from './providers';
import { PROVIDER_IDS, type ProviderId } from './types';

const all = PROVIDER_IDS.map((id) => PRESETS[id]);

describe('PRESETS', () => {
  it('has one preset per provider id, keyed by its own id', () => {
    expect(Object.keys(PRESETS).sort()).toEqual([...PROVIDER_IDS].sort());
    for (const id of PROVIDER_IDS) expect(PRESETS[id].id).toBe(id);
  });

  it('uses https everywhere except Ollama on localhost', () => {
    for (const preset of all) {
      const urls = [preset.baseUrl, preset.keyUrl, preset.billingUrl, ...(preset.baseUrlChoices ?? []).map((c) => c.url)].filter(
        (url): url is string => !!url,
      );
      for (const url of urls) {
        if (preset.id === 'ollama') expect(url).toMatch(/^http:\/\/localhost[:/]/);
        else expect(url, `${preset.id}: ${url}`).toMatch(/^https:\/\//);
      }
    }
  });

  it('recommends Gemini and nothing else', () => {
    expect(all.filter((p) => p.recommended).map((p) => p.id)).toEqual(['gemini']);
  });

  it('marks DeepSeek and Qwen as available in Hong Kong', () => {
    expect(PRESETS.deepseek.hk.status).toBe('available');
    expect(PRESETS.qwen.hk.status).toBe('available');
    expect(all.filter((p) => p.hk.status === 'available').map((p) => p.id).sort()).toEqual(['deepseek', 'qwen']);
  });

  it('never points Qwen at the DashScope Hong Kong domain, which fails preflight', () => {
    const urls = [PRESETS.qwen.baseUrl, ...(PRESETS.qwen.baseUrlChoices ?? []).map((c) => c.url)];
    for (const url of urls) expect(url).not.toMatch(/cn-hongkong\.dashscope/);
  });

  it('gives every fixed provider a default model and every keyed provider a key page', () => {
    for (const preset of all) {
      if (preset.id !== 'custom' && preset.id !== 'ollama') {
        expect(preset.models.length, preset.id).toBeGreaterThan(0);
        expect(preset.keyUrl, preset.id).toBeTruthy();
      }
      expect(preset.keyRequired).toBe(preset.id !== 'ollama');
      expect(preset.concurrency).toBeGreaterThan(0);
      expect(preset.outputCap).toBeGreaterThan(0);
    }
  });

  it('gives a billing page to every provider whose billing error has a real one; Qwen falls back to its key page', () => {
    const billed = all.filter((p) => p.billingUrl).map((p) => p.id).sort();
    expect(billed).toEqual(['anthropic', 'deepseek', 'gemini', 'openai', 'openrouter']);
    for (const preset of all) if (preset.billingUrl) expect(preset.billingUrl).not.toBe(preset.keyUrl);
  });

  it('keeps model ids to the characters the model field accepts', () => {
    for (const preset of all) {
      for (const model of preset.models) expect(model.id).toMatch(/^[A-Za-z0-9._:/@-]{1,128}$/);
    }
  });
});

describe('presetFor', () => {
  it('returns the preset, and Gemini for an id this build does not know', () => {
    expect(presetFor('qwen')).toBe(PRESETS.qwen);
    expect(presetFor('someday' as ProviderId)).toBe(PRESETS.gemini);
  });
});
