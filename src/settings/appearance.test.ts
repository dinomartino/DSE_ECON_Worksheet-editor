import { describe, expect, it } from 'vitest';
import { APPEARANCE_SETTINGS, applyTheme, resolveTheme, THEME_BOOT_SCRIPT, type ThemePreference } from './appearance';

/** Runs the inline boot script against a stored value and an OS preference. */
function boot(stored: string | null | (() => never), systemDark: boolean): string | undefined {
  const root = { dataset: {} as Record<string, string> };
  const localStorage = {
    getItem: () => (typeof stored === 'function' ? stored() : stored),
  };
  const window = { matchMedia: (q: string) => ({ matches: systemDark && q === '(prefers-color-scheme: dark)' }) };
  new Function('document', 'localStorage', 'window', THEME_BOOT_SCRIPT)({ documentElement: root }, localStorage, window);
  return root.dataset.theme;
}

describe('appearance settings', () => {
  it('defaults to following the system, and rejects anything else', () => {
    expect(APPEARANCE_SETTINGS.defaults({ desktop: false })).toEqual({ theme: 'system' });
    expect(APPEARANCE_SETTINGS.fields.theme('dark')).toBe('dark');
    expect(APPEARANCE_SETTINGS.fields.theme('sepia')).toBeUndefined();
  });

  it('resolves system from the OS and an explicit choice regardless of it', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('boot script agrees with resolveTheme for every stored choice', () => {
    for (const theme of ['system', 'light', 'dark'] as ThemePreference[]) {
      for (const systemDark of [false, true]) {
        expect(boot(JSON.stringify({ v: 1, theme }), systemDark)).toBe(resolveTheme(theme, systemDark));
      }
    }
  });

  it('boot script falls back to the system on missing, corrupt or blocked storage', () => {
    expect(boot(null, true)).toBe('dark');
    expect(boot('{not json', false)).toBe('light');
    expect(boot(JSON.stringify({ theme: 'sepia' }), true)).toBe('dark');
    expect(boot(() => { throw new Error('blocked'); }, true)).toBe('dark');
  });

  it('applyTheme writes data-theme', () => {
    const root = { dataset: {} } as unknown as HTMLElement;
    applyTheme(root, 'dark');
    expect(root.dataset.theme).toBe('dark');
  });
});
