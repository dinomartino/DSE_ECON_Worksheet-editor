import { afterEach, describe, expect, it, vi } from 'vitest';
import { AI_SETTINGS } from './aiSettings';
import { createSettingsStore } from './store';
import type { SettingsSchema, StorageLike } from './types';
import { bool, oneOf, recordOf, text } from './validators';

class MemoryStorage implements StorageLike {
  data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

const throwing: StorageLike = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

interface Demo { theme: 'light' | 'dark'; size: string; flags: Partial<Record<'a' | 'b', boolean>>; on: boolean }
const DEMO: SettingsSchema<Demo> = {
  section: 'demo',
  version: 2,
  storageKey: 'econgen.settings.demo',
  defaults: (env) => ({ theme: 'light', size: 'm', flags: {}, on: env.desktop }),
  fields: { theme: oneOf(['light', 'dark'] as const), size: text(4), flags: recordOf(['a', 'b'] as const, bool), on: bool },
  migrate: (raw, from) => (from < 2 && raw.dark === true ? { ...raw, theme: 'dark' } : raw),
};
const OTHER: SettingsSchema<{ x: boolean }> = {
  section: 'other',
  version: 1,
  storageKey: 'econgen.settings.other',
  defaults: () => ({ x: false }),
  fields: { x: bool },
};

const web = { desktop: false };
const stored = (s: MemoryStorage, key = DEMO.storageKey) => JSON.parse(s.data.get(key) ?? 'null');

afterEach(() => vi.unstubAllGlobals());

describe('the settings store', () => {
  it('reads defaults when storage is empty, missing or throwing', () => {
    expect(createSettingsStore(() => new MemoryStorage(), web).read(DEMO)).toEqual({ theme: 'light', size: 'm', flags: {}, on: false });
    expect(createSettingsStore(() => null, { desktop: true }).read(DEMO).on).toBe(true);
    expect(createSettingsStore(() => throwing, web).read(DEMO).theme).toBe('light');
    const garbage = new MemoryStorage();
    garbage.setItem(DEMO.storageKey, '{not json');
    expect(createSettingsStore(() => garbage, web).read(DEMO).size).toBe('m');
  });

  it('falls back one bad field at a time', () => {
    const s = new MemoryStorage();
    s.setItem(DEMO.storageKey, JSON.stringify({ v: 2, theme: 'purple', size: 'l', flags: { a: true, b: 'yes' }, on: true }));
    expect(createSettingsStore(() => s, web).read(DEMO)).toEqual({ theme: 'light', size: 'l', flags: { a: true }, on: true });
  });

  it('keeps unknown keys and invalid-but-present values through a write, and never lowers v', () => {
    const s = new MemoryStorage();
    s.setItem(DEMO.storageKey, JSON.stringify({ v: 5, theme: 'sepia', later: { x: 1 }, flags: { a: true, c: true, b: 'odd' } }));
    const store = createSettingsStore(() => s, web);
    store.write(DEMO, { size: 's', flags: { a: false } });
    expect(stored(s)).toEqual({ v: 5, theme: 'sepia', later: { x: 1 }, size: 's', flags: { a: false, c: true, b: 'odd' } });
    store.write(DEMO, { flags: { b: true } });
    expect(stored(s).flags).toEqual({ c: true, b: true });
  });

  it('writes v as the schema version on a fresh section', () => {
    const s = new MemoryStorage();
    createSettingsStore(() => s, web).write(DEMO, { theme: 'dark' });
    expect(stored(s)).toEqual({ v: 2, theme: 'dark' });
  });

  it('runs migrate for an older v', () => {
    const s = new MemoryStorage();
    s.setItem(DEMO.storageKey, JSON.stringify({ v: 1, dark: true }));
    const store = createSettingsStore(() => s, web);
    expect(store.read(DEMO).theme).toBe('dark');
    store.write(DEMO, { size: 'xl' });
    expect(stored(s)).toMatchObject({ v: 2, theme: 'dark', dark: true, size: 'xl' });
  });

  it('keeps read identity until a write changes the value', () => {
    const store = createSettingsStore(() => new MemoryStorage(), web);
    const first = store.read(DEMO);
    expect(store.read(DEMO)).toBe(first);
    store.write(DEMO, { theme: 'light' });
    expect(store.read(DEMO)).toBe(first);
    const second = store.write(DEMO, { theme: 'dark' });
    expect(second).not.toBe(first);
    expect(store.read(DEMO)).toBe(second);
  });

  it('notifies subscribers of the written section only', () => {
    const store = createSettingsStore(() => new MemoryStorage(), web);
    const demo = vi.fn();
    const other = vi.fn();
    const off = store.subscribe(DEMO, demo);
    store.subscribe(OTHER, other);
    store.write(DEMO, { size: 'l' });
    store.write(DEMO, { size: 'l' });
    expect(demo).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
    off();
    store.write(DEMO, { size: 's' });
    expect(demo).toHaveBeenCalledTimes(1);
  });

  it('resets its own fields and keeps unknown keys', () => {
    const s = new MemoryStorage();
    const store = createSettingsStore(() => s, web);
    s.setItem(DEMO.storageKey, JSON.stringify({ v: 2, theme: 'dark', later: 1 }));
    store.reset(DEMO);
    expect(stored(s)).toEqual({ v: 2, later: 1 });
    expect(store.read(DEMO).theme).toBe('light');
  });

  it('keeps writes in memory when storage is blocked', () => {
    const store = createSettingsStore(() => throwing, web);
    store.write(DEMO, { theme: 'dark' });
    expect(store.read(DEMO).theme).toBe('dark');
    expect(store.persistent()).toBe(false);
    expect(createSettingsStore(() => null, web).persistent()).toBe(false);
    expect(createSettingsStore(() => new MemoryStorage(), web).persistent()).toBe(true);
  });

  it('knows storage refuses writes before the first write fails', () => {
    const readOnly = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } };
    expect(createSettingsStore(() => readOnly, web).persistent()).toBe(false);
    const s = new MemoryStorage();
    expect(createSettingsStore(() => s, web).persistent()).toBe(true);
    expect(s.data.size).toBe(0);
  });

  it('re-reads a section when another tab writes it, and only that section', () => {
    let onStorage: ((e: { key: string | null }) => void) | undefined;
    vi.stubGlobal('window', { addEventListener: (_: string, fn: typeof onStorage) => (onStorage = fn) });
    const s = new MemoryStorage();
    const store = createSettingsStore(() => s, web);
    const demo = vi.fn();
    const other = vi.fn();
    store.subscribe(DEMO, demo);
    store.subscribe(OTHER, other);
    store.read(DEMO);
    const otherValue = store.read(OTHER);
    s.setItem(DEMO.storageKey, JSON.stringify({ v: 2, theme: 'dark' }));
    onStorage?.({ key: DEMO.storageKey });
    expect(store.read(DEMO).theme).toBe('dark');
    expect(demo).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
    expect(store.read(OTHER)).toBe(otherValue);
  });

  it('never names a field after key material (AI settings)', () => {
    const allowed = new Set(['rememberKey', 'keychainSaved']);
    for (const name of Object.keys(AI_SETTINGS.fields)) {
      if (!allowed.has(name)) expect(name).not.toMatch(/key|token|secret|password/i);
    }
  });
});
