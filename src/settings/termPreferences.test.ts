import { describe, expect, it } from 'vitest';
import { loadGlossary } from '@/glossary/load';
import { createSettingsStore } from './store';
import { preferencesKey, TERM_SETTINGS } from './termPreferences';
import type { StorageLike } from './types';

const GDP = 'Gross Domestic Product (GDP)';

class MemoryStorage implements StorageLike {
  data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

describe('Settings → Translation terms storage', () => {
  it('round-trips under econgen.settings.terms, never touching documents', () => {
    const storage = new MemoryStorage();
    const store = createSettingsStore(() => storage, { desktop: false });
    expect(store.read(TERM_SETTINGS)).toEqual({ choices: {}, related: {} });
    store.write(TERM_SETTINGS, { choices: { [GDP]: '國內生產總值' }, related: { [GDP]: true } });
    expect(JSON.parse(storage.getItem('econgen.settings.terms')!)).toEqual({
      v: 1,
      choices: { [GDP]: '國內生產總值' },
      related: { [GDP]: true },
    });
    const reopened = createSettingsStore(() => storage, { desktop: true });
    expect(reopened.read(TERM_SETTINGS)).toEqual({ choices: { [GDP]: '國內生產總值' }, related: { [GDP]: true } });
    // Removing a row writes the record without it.
    reopened.write(TERM_SETTINGS, { choices: {}, related: {} });
    expect(createSettingsStore(() => storage, { desktop: false }).read(TERM_SETTINGS)).toEqual({ choices: {}, related: {} });
    expect([...storage.data.keys()]).toEqual(['econgen.settings.terms']);
  });

  it('reads malformed storage as the rows it can, and never throws', () => {
    for (const text of ['not json', '[]', '{"v":1,"choices":"x","related":[]}', '{"v":1,"choices":{"a":5,"b":"","c":"甲"},"related":{"c":"yes","d":true}}']) {
      const storage = new MemoryStorage();
      storage.setItem('econgen.settings.terms', text);
      const value = createSettingsStore(() => storage, { desktop: false }).read(TERM_SETTINGS);
      expect(value.choices).toEqual(text.includes('"c":"甲"') ? { c: '甲' } : {});
      expect(value.related).toEqual(text.includes('"d":true') ? { d: true } : {});
    }
  });

  it('keys the loader by content, not by order', () => {
    expect(preferencesKey({ choices: {}, related: {} })).toBe('');
    expect(preferencesKey({ choices: { a: '甲', b: '乙' }, related: {} })).toBe(preferencesKey({ choices: { b: '乙', a: '甲' }, related: {} }));
  });

  it('loads one glossary per set of preferences, and the defaults when none is given', async () => {
    const prefs = { choices: { [GDP]: '國內生產總值' }, related: {} };
    const chosen = await loadGlossary(prefs);
    expect(loadGlossary({ choices: { [GDP]: '國內生產總值' }, related: {} })).toBe(loadGlossary(prefs));
    expect(chosen.entries.find((e) => e.en === GDP)!.preferred).toBe('國內生產總值');
    const plain = await loadGlossary();
    expect(plain.entries.find((e) => e.en === GDP)!.preferred).toBe('本地生產總值');
    expect(plain.entries).not.toBe(chosen.entries);
  });
});
