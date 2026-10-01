import { oneOf } from './validators';
import type { SettingsSchema } from './types';

/**
 * Settings → Language: the chrome's language. English is the default and is today's text
 * exactly; the paper, document defaults and the editing language never follow it.
 * `<html lang>` mirrors it, so the browser picks Hong Kong CJK fonts.
 */

export const UI_LANGUAGES = ['en', 'zh-HK'] as const;
export type UiLanguage = (typeof UI_LANGUAGES)[number];

export interface LanguageSettings {
  ui: UiLanguage;
}

export const LANGUAGE_SETTINGS: SettingsSchema<LanguageSettings> = {
  section: 'language',
  version: 1,
  storageKey: 'econgen.settings.language',
  defaults: () => ({ ui: 'en' }),
  fields: { ui: oneOf(UI_LANGUAGES) },
};

export function applyLanguage(root: HTMLElement, lang: UiLanguage): void {
  if (root.lang !== lang) root.lang = lang;
}

/** Runs inline in <head>: a stored 繁體中文 sets `<html lang>` before first paint. */
export const LANGUAGE_BOOT_SCRIPT = `(function(){try{var s=JSON.parse(localStorage.getItem('${LANGUAGE_SETTINGS.storageKey}')||'{}');if(s&&s.ui==='zh-HK')document.documentElement.lang='zh-HK'}catch(e){}})()`;
