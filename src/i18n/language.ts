import { createContext, useContext } from 'react';
import { LANGUAGE_SETTINGS, type UiLanguage } from '@/settings/language';
import { appSettings, useSettings } from '@/settings/store';
import { resolveMessages, type Catalogue, type Messages } from './catalogue';

/** Pins a subtree's language (tests, a side-by-side preview); absent means the setting. */
export const UiLanguageOverride = createContext<UiLanguage | null>(null);

/** The setting now, outside React. A caller rendering with it must also re-render on change. */
export function uiLanguage(): UiLanguage {
  return appSettings.read(LANGUAGE_SETTINGS).ui;
}

/** The interface language; re-renders when it changes. */
export function useUiLanguage(): UiLanguage {
  const [{ ui }] = useSettings(LANGUAGE_SETTINGS);
  return useContext(UiLanguageOverride) ?? ui;
}

/** A catalogue in the current interface language: `const m = useMessages(MESSAGES)`. */
export function useMessages<C extends Catalogue>(catalogue: C): Messages<C> {
  return resolveMessages(catalogue, useUiLanguage());
}
