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
  const EMPTY = { choices: {}, related: {}, own: {}, terms: {} };

  it('round-trips under econgen.settings.terms (v2), never touching documents', () => {
    const storage = new MemoryStorage();
    const store = createSettingsStore(() => storage, { desktop: false });
    expect(store.read(TERM_SETTINGS)).toEqual(EMPTY);
    const value = {
      choices: { [GDP]: '國內生產總值' },
      related: { [GDP]: true as const },
      own: { 'aggregate expenditure': ['總開銷'] },
      terms: { t1: { en: 'carbon tax', abbreviation: 'CT', zh: ['碳稅', '碳排放稅'] } },
    };
    store.write(TERM_SETTINGS, value);
    expect(JSON.parse(storage.getItem('econgen.settings.terms')!)).toEqual({ v: 2, ...value });
    const reopened = createSettingsStore(() => storage, { desktop: true });
    expect(reopened.read(TERM_SETTINGS)).toEqual(value);
    // Removing a row writes the record without it.
    reopened.write(TERM_SETTINGS, EMPTY);
    expect(createSettingsStore(() => storage, { desktop: false }).read(TERM_SETTINGS)).toEqual(EMPTY);
    expect([...storage.data.keys()]).toEqual(['econgen.settings.terms']);
  });

  it('migrates v1 to v2, keeping every choice', () => {
    const storage = new MemoryStorage();
    storage.setItem('econgen.settings.terms', JSON.stringify({ v: 1, choices: { [GDP]: '國內生產總值' }, related: { [GDP]: true } }));
    const store = createSettingsStore(() => storage, { desktop: false });
    expect(store.read(TERM_SETTINGS)).toEqual({ ...EMPTY, choices: { [GDP]: '國內生產總值' }, related: { [GDP]: true } });
    store.write(TERM_SETTINGS, { own: { capital: ['本錢'] } });
    expect(JSON.parse(storage.getItem('econgen.settings.terms')!)).toEqual({
      v: 2,
      choices: { [GDP]: '國內生產總值' },
      related: { [GDP]: true },
      own: { capital: ['本錢'] },
      terms: {},
    });
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

  it('drops a malformed term or wording alone, and keeps it in storage on the next write', () => {
    const storage = new MemoryStorage();
    const bad = { en: '', zh: ['甲'] };
    storage.setItem(
      'econgen.settings.terms',
      JSON.stringify({
        v: 2,
        choices: {},
        related: {},
        own: { capital: ['本錢', 7, 'a/b'], credit: 'x' },
        terms: { ok: { en: 'carbon tax', zh: ['碳稅', ''] }, bad, worse: null, ok2: { en: 'blue economy', zh: ['藍色經濟'], abbreviation: 'not caps' } },
      }),
    );
    const store = createSettingsStore(() => storage, { desktop: false });
    const value = store.read(TERM_SETTINGS);
    expect(value.own).toEqual({ capital: ['本錢'] });
    expect(value.terms).toEqual({ ok: { en: 'carbon tax', zh: ['碳稅'] }, ok2: { en: 'blue economy', zh: ['藍色經濟'] } });
    // A write from this build never erases a row it could not read.
    store.write(TERM_SETTINGS, { terms: { ...value.terms, t3: { en: 'green bond', zh: ['綠色債券'] } } });
    const raw = JSON.parse(storage.getItem('econgen.settings.terms')!);
    expect(raw.terms.bad).toEqual(bad);
    expect(raw.terms.worse).toBeNull();
    expect(Object.keys(raw.terms).sort()).toEqual(['bad', 'ok', 'ok2', 't3', 'worse']);
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
