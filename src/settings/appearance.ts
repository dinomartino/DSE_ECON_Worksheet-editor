import { oneOf } from './validators';
import type { SettingsSchema } from './types';

/**
 * Settings → Appearance: the chrome's colour scheme. `system` follows the OS and is the
 * default, so an untouched install looks as it always did. The paper is never themed.
 * The resolved scheme lives on `<html data-theme>`; globals.css keys every dark token on it.
 */

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = 'light' | 'dark';

export interface AppearanceSettings {
  theme: ThemePreference;
}

export const APPEARANCE_SETTINGS: SettingsSchema<AppearanceSettings> = {
  section: 'appearance',
  version: 1,
  storageKey: 'econgen.settings.appearance',
  defaults: () => ({ theme: 'system' }),
  fields: { theme: oneOf(THEME_PREFERENCES) },
};

export const DARK_QUERY = '(prefers-color-scheme: dark)';

export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  if (preference === 'system') return systemDark ? 'dark' : 'light';
  return preference;
}

export function applyTheme(root: HTMLElement, theme: ResolvedTheme): void {
  if (root.dataset.theme !== theme) root.dataset.theme = theme;
}

/**
 * Runs inline in <head> before first paint, so a stored choice never flashes the other
 * scheme. Mirrors `resolveTheme` over the raw stored JSON; any failure means `system`.
 */
export const THEME_BOOT_SCRIPT = `(function(){var p='system';try{var s=JSON.parse(localStorage.getItem('${APPEARANCE_SETTINGS.storageKey}')||'{}');if(s&&(s.theme==='light'||s.theme==='dark'))p=s.theme}catch(e){}var d=p==='dark'||(p==='system'&&window.matchMedia&&window.matchMedia('${DARK_QUERY}').matches);document.documentElement.dataset.theme=d?'dark':'light'})()`;
