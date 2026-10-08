import { createContext, useContext, useSyncExternalStore } from 'react';
import type { Side } from '@/model/textSlots';
import type { LanguageMode } from '@/model/types';
import { LANGUAGE_SETTINGS } from './language';
import { appSettings } from './store';

/**
 * Settings → Language → Papers: the language a paper starts in when no document decides
 * it. Read once, when a new paper, view or import starts; an open document never follows
 * a later change.
 */

/** The setting now, outside React. */
export function paperLanguage(): LanguageMode {
  return appSettings.read(LANGUAGE_SETTINGS).paper;
}

const subscribe = (listener: () => void) => appSettings.subscribe(LANGUAGE_SETTINGS, listener);

/** The setting; re-renders only when the paper language changes. */
export function usePaperLanguage(): LanguageMode {
  return useSyncExternalStore(subscribe, paperLanguage, () => 'en');
}

/** The one side a one-language paper starts on; undefined for both (detect instead). */
export function paperSide(language: LanguageMode = paperLanguage()): Side | undefined {
  return language === 'bilingual' ? undefined : language;
}

/**
 * The language the questions on screen are shown in: the open document's mode in the
 * editor, the 題庫 page's view language there. Paper words on screen (topic names) follow
 * it; the chrome never does.
 */
const ViewLanguageContext = createContext<LanguageMode | undefined>(undefined);
export const ViewLanguageProvider = ViewLanguageContext.Provider;

/** The view language; the paper language where no document or bank view decides. */
export function useViewLanguage(): LanguageMode {
  const paper = usePaperLanguage();
  return useContext(ViewLanguageContext) ?? paper;
}
