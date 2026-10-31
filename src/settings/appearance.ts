import { oneOf } from './validators';
import type { SettingsSchema } from './types';

/**
 * Settings → Appearance: the chrome's theme. `system` follows the OS between Classic and
 * Dark and is the default, so an untouched install looks as it always did. The paper is
 * never themed. A theme is one token file in `src/app/themes/` (its contract is
 * `light.css`); `<html data-theme>` names it and `<html data-scheme>` says whether it is
 * light or dark, which `dark:` utilities and native controls key on.
 *
 * Ids are stored, so they never change meaning: `light` is Classic, `dark` is Dark, as
 * every build since 0.7 wrote them. A build that does not know a newer theme reads it as
 * `system` (the validator below, and the boot script's own list).
 */

export type ThemeScheme = 'light' | 'dark';

export const THEMES = [
  { id: 'light', scheme: 'light' },
  { id: 'dark', scheme: 'dark' },
  { id: 'midnight', scheme: 'dark' },
  { id: 'contrast', scheme: 'light' },
  { id: 'sepia', scheme: 'light' },
  { id: 'bright', scheme: 'light' },
  { id: 'poster', scheme: 'light' },
] as const satisfies readonly { id: string; scheme: ThemeScheme }[];

export type ThemeId = (typeof THEMES)[number]['id'];
export type ThemePreference = 'system' | ThemeId;
export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', ...THEMES.map((t) => t.id)];

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

export function schemeOf(theme: ThemeId): ThemeScheme {
  return THEMES.find((t) => t.id === theme)?.scheme ?? 'light';
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): ThemeId {
  if (preference === 'system') return systemDark ? 'dark' : 'light';
  return preference;
}

export function applyTheme(root: HTMLElement, theme: ThemeId): void {
  if (root.dataset.theme !== theme) root.dataset.theme = theme;
  const scheme = schemeOf(theme);
  if (root.dataset.scheme !== scheme) root.dataset.scheme = scheme;
}

const DARK_IDS = THEMES.filter((t) => t.scheme === 'dark').map((t) => t.id);

/**
 * Runs inline in <head> before first paint, so a stored choice never flashes another
 * theme. Mirrors `resolveTheme` over the raw stored JSON; any failure means `system`.
 */
export const THEME_BOOT_SCRIPT = `(function(){var t=${JSON.stringify(THEMES.map((t) => t.id))},k=${JSON.stringify(DARK_IDS)},p='system';try{var s=JSON.parse(localStorage.getItem('${APPEARANCE_SETTINGS.storageKey}')||'{}');if(s&&t.indexOf(s.theme)>=0)p=s.theme}catch(e){}if(p==='system')p=window.matchMedia&&window.matchMedia('${DARK_QUERY}').matches?'dark':'light';var r=document.documentElement;r.dataset.theme=p;r.dataset.scheme=k.indexOf(p)>=0?'dark':'light'})()`;
