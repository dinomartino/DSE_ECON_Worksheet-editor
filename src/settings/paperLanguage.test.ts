import { describe, expect, it } from 'vitest';
import { LANGUAGE_SETTINGS } from './language';
import { paperSide } from './paperLanguage';
import { createSettingsStore } from './store';
import type { StorageLike } from './types';

const KEY = LANGUAGE_SETTINGS.storageKey;
function storeWith(stored?: object) {
  const data = new Map<string, string>(stored ? [[KEY, JSON.stringify(stored)]] : []);
  const storage: StorageLike = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
  return {
    settings: createSettingsStore(() => storage, { desktop: false }),
    saved: () => JSON.parse(data.get(KEY) ?? '{}') as unknown,
  };
}

describe('the paper language setting', () => {
  it('reads as English from settings an older build saved (no paper field)', () => {
    const { settings } = storeWith({ v: 1, ui: 'zh-HK' });
    expect(settings.read(LANGUAGE_SETTINGS)).toEqual({ ui: 'zh-HK', paper: 'en' });
  });

  it('falls back to English on an unknown value, keeping the interface choice', () => {
    const { settings } = storeWith({ v: 1, ui: 'zh-HK', paper: 'fr' });
    expect(settings.read(LANGUAGE_SETTINGS)).toEqual({ ui: 'zh-HK', paper: 'en' });
  });

  it('is independent of the interface language in both directions', () => {
    const { settings, saved } = storeWith({ v: 1, ui: 'zh-HK' });
    settings.write(LANGUAGE_SETTINGS, { paper: 'bilingual' });
    expect(settings.read(LANGUAGE_SETTINGS)).toEqual({ ui: 'zh-HK', paper: 'bilingual' });
    settings.write(LANGUAGE_SETTINGS, { ui: 'en' });
    expect(saved()).toEqual({ v: 1, ui: 'en', paper: 'bilingual' });
  });

  it('names one side for a one-language paper and none for both', () => {
    expect(paperSide('en')).toBe('en');
    expect(paperSide('zh')).toBe('zh');
    expect(paperSide('bilingual')).toBeUndefined();
  });
});
