import { createContext, useContext, useSyncExternalStore } from 'react';
import { LANGUAGE_SETTINGS, type UiLanguage } from '@/settings/language';
import { appSettings } from '@/settings/store';
import { resolveMessages, type Catalogue, type Messages } from './catalogue';

/** Pins a subtree's language (tests, a side-by-side preview); absent means the setting. */
export const UiLanguageOverride = createContext<UiLanguage | null>(null);

/** The setting now, outside React. A caller rendering with it must also re-render on change. */
export function uiLanguage(): UiLanguage {
  return appSettings.read(LANGUAGE_SETTINGS).ui;
}

const subscribe = (listener: () => void) => appSettings.subscribe(LANGUAGE_SETTINGS, listener);

/** The interface language; re-renders when it changes (not when the paper language does). */
export function useUiLanguage(): UiLanguage {
  const ui = useSyncExternalStore(subscribe, uiLanguage, () => 'en' as const);
  return useContext(UiLanguageOverride) ?? ui;
}

/** A catalogue in the current interface language: `const m = useMessages(MESSAGES)`. */
export function useMessages<C extends Catalogue>(catalogue: C): Messages<C> {
  return resolveMessages(catalogue, useUiLanguage());
}
