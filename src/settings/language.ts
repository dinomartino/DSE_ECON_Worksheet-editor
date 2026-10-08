import type { LanguageMode } from '@/model/types';
import { oneOf } from './validators';
import type { SettingsSchema } from './types';

/**
 * Settings → Language: two independent choices.
 * - `ui`, the chrome's language. English is today's text exactly; the paper, document
 *   defaults and the editing language never follow it. `<html lang>` mirrors it.
 * - `paper`, the language a paper starts in where no document decides it (a new paper,
 *   the 題庫 view, a new graph, pasted questions). The chrome never follows it, and an
 *   open document's language is its own. Added without a version bump: a stored object
 *   from an older build has no `paper` and reads as 'en'.
 */

export const UI_LANGUAGES = ['en', 'zh-HK'] as const;
export type UiLanguage = (typeof UI_LANGUAGES)[number];

export const PAPER_LANGUAGES = ['en', 'zh', 'bilingual'] as const satisfies readonly LanguageMode[];

export interface LanguageSettings {
  ui: UiLanguage;
  paper: LanguageMode;
}

export const LANGUAGE_SETTINGS: SettingsSchema<LanguageSettings> = {
  section: 'language',
  version: 1,
  storageKey: 'econgen.settings.language',
  defaults: () => ({ ui: 'en', paper: 'en' }),
  fields: { ui: oneOf(UI_LANGUAGES), paper: oneOf(PAPER_LANGUAGES) },
};

export function applyLanguage(root: HTMLElement, lang: UiLanguage): void {
  if (root.lang !== lang) root.lang = lang;
}

/** Runs inline in <head>: a stored 繁體中文 sets `<html lang>` before first paint. */
export const LANGUAGE_BOOT_SCRIPT = `(function(){try{var s=JSON.parse(localStorage.getItem('${LANGUAGE_SETTINGS.storageKey}')||'{}');if(s&&s.ui==='zh-HK')document.documentElement.lang='zh-HK'}catch(e){}})()`;
