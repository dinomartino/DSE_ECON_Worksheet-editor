import { describe, expect, it } from 'vitest';
import { PRESETS } from '@/ai/providers';
import { PROVIDER_IDS } from '@/ai/types';
import { aiErrorInfo } from '@/ai/errors';
import { ERROR_COPY_MESSAGES } from './errorCopy.messages';
import { geminiRegionMessage, localizedErrorMessage } from './errorCopy';
import { PROVIDER_COPY_MESSAGES } from './providerCopy.messages';
import { baseUrlChoiceLabel, modelNote, providerCopy } from './providerCopy';

describe('provider copy', () => {
  it('has a 中文 entry whose English is the preset text, for every provider', () => {
    for (const id of PROVIDER_IDS) {
      const preset = PRESETS[id];
      const key = (part: string) => `${id}${part}` as keyof typeof PROVIDER_COPY_MESSAGES;
      expect(PROVIDER_COPY_MESSAGES[key('Blurb')].en).toBe(preset.blurb);
      expect(PROVIDER_COPY_MESSAGES[key('Privacy')].en).toBe(preset.privacy);
      expect(PROVIDER_COPY_MESSAGES[key('Hk')].en).toBe(preset.hk.note);
      if (preset.keyHint) expect(PROVIDER_COPY_MESSAGES[key('KeyHint')].en).toBe(preset.keyHint);
    }
  });

  it('keeps English in English and translates in zh-HK', () => {
    const gemini = PRESETS.gemini;
    expect(providerCopy(gemini, 'en').blurb).toBe(gemini.blurb);
    expect(providerCopy(gemini, 'zh-HK').blurb).not.toBe(gemini.blurb);
    const note = gemini.models[0];
    expect(modelNote(note.id, note.note, 'en')).toBe(note.note);
    expect(modelNote(note.id, note.note, 'zh-HK')).not.toBe(note.note);
    for (const choice of PRESETS.qwen.baseUrlChoices ?? []) {
      expect(baseUrlChoiceLabel(choice.label, 'en')).toBe(choice.label);
      expect(baseUrlChoiceLabel(choice.label, 'zh-HK')).not.toBe(choice.label);
    }
  });
});

describe('error copy', () => {
  it('keeps the English of src/ai/errors.ts', () => {
    expect(ERROR_COPY_MESSAGES.geminiRegion.en).toBe(geminiRegionMessage('en'));
    expect(ERROR_COPY_MESSAGES.notConfigured.en).toBe(aiErrorInfo('notConfigured', 'gemini').message);
    expect(ERROR_COPY_MESSAGES.policy.en).toBe(aiErrorInfo('policy', 'openrouter').message);
  });

  it('translates the app’s own sentences in zh-HK and nothing else', () => {
    const kinds = ['notConfigured', 'region', 'badKey', 'keyBlocked', 'networkOrKey', 'quota', 'billing', 'policy', 'badRequest', 'server', 'timeout', 'cancelled', 'safety', 'truncated', 'badOutput'] as const;
    for (const provider of ['gemini', 'deepseek'] as const) {
      for (const kind of kinds) {
        const info = aiErrorInfo(kind, provider);
        expect(localizedErrorMessage(info, 'en')).toBe(info.message);
        expect(localizedErrorMessage(info, 'zh-HK')).toMatch(/[㐀-鿿]/);
      }
    }
    const model = aiErrorInfo('model', 'deepseek', { model: 'deepseek-x' });
    expect(localizedErrorMessage(model, 'zh-HK')).toContain('deepseek-x');
    const network = aiErrorInfo('network', 'ollama', { host: 'localhost:11434' });
    expect(localizedErrorMessage(network, 'zh-HK')).toContain('localhost:11434');
    const theirs = { ...aiErrorInfo('badRequest', 'deepseek'), message: 'Invalid parameter foo' };
    expect(localizedErrorMessage(theirs, 'zh-HK')).toBe('Invalid parameter foo');
  });
});
