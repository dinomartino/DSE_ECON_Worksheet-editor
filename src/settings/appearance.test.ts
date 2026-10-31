import { describe, expect, it } from 'vitest';
import {
  APPEARANCE_SETTINGS,
  applyTheme,
  resolveTheme,
  schemeOf,
  THEME_BOOT_SCRIPT,
  THEME_PREFERENCES,
  THEMES,
} from './appearance';

/** Runs the inline boot script against a stored value and an OS preference. */
function boot(stored: string | null | (() => never), systemDark: boolean): Record<string, string> {
  const root = { dataset: {} as Record<string, string> };
  const localStorage = {
    getItem: () => (typeof stored === 'function' ? stored() : stored),
  };
  const window = { matchMedia: (q: string) => ({ matches: systemDark && q === '(prefers-color-scheme: dark)' }) };
  new Function('document', 'localStorage', 'window', THEME_BOOT_SCRIPT)({ documentElement: root }, localStorage, window);
  return root.dataset;
}

describe('appearance settings', () => {
  it('defaults to following the system, and rejects anything else', () => {
    expect(APPEARANCE_SETTINGS.defaults({ desktop: false })).toEqual({ theme: 'system' });
    for (const theme of THEME_PREFERENCES) expect(APPEARANCE_SETTINGS.fields.theme(theme)).toBe(theme);
    expect(APPEARANCE_SETTINGS.fields.theme('neon')).toBeUndefined();
    expect(APPEARANCE_SETTINGS.fields.theme(3)).toBeUndefined();
  });

  it('keeps the ids every earlier build wrote, with their old meaning', () => {
    // 0.7–0.8 stored system | light | dark; a stored value must keep looking the same.
    expect(THEME_PREFERENCES.slice(0, 3)).toEqual(['system', 'light', 'dark']);
    expect(schemeOf('light')).toBe('light');
    expect(schemeOf('dark')).toBe('dark');
  });

  it('resolves system from the OS (Classic or Dark) and an explicit choice regardless of it', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    for (const { id } of THEMES) {
      expect(resolveTheme(id, true)).toBe(id);
      expect(resolveTheme(id, false)).toBe(id);
    }
  });

  it('boot script agrees with resolveTheme and schemeOf for every stored choice', () => {
    for (const theme of THEME_PREFERENCES) {
      for (const systemDark of [false, true]) {
        const resolved = resolveTheme(theme, systemDark);
        expect(boot(JSON.stringify({ v: 1, theme }), systemDark)).toEqual({ theme: resolved, scheme: schemeOf(resolved) });
      }
    }
  });

  it('boot script falls back to the system on missing, corrupt, unknown or blocked storage', () => {
    expect(boot(null, true)).toEqual({ theme: 'dark', scheme: 'dark' });
    expect(boot('{not json', false)).toEqual({ theme: 'light', scheme: 'light' });
    expect(boot(JSON.stringify({ theme: 'neon' }), true)).toEqual({ theme: 'dark', scheme: 'dark' });
    expect(boot(JSON.stringify({ theme: 'system' }), false)).toEqual({ theme: 'light', scheme: 'light' });
    expect(boot(() => { throw new Error('blocked'); }, true)).toEqual({ theme: 'dark', scheme: 'dark' });
  });

  it('applyTheme writes data-theme and the scheme', () => {
    const root = { dataset: {} } as unknown as HTMLElement;
    applyTheme(root, 'dark');
    expect(root.dataset).toEqual({ theme: 'dark', scheme: 'dark' });
    applyTheme(root, 'sepia');
    expect(root.dataset).toEqual({ theme: 'sepia', scheme: 'light' });
  });
});
