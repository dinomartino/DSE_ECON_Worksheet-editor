import { resolveMessages } from '@/i18n/catalogue';
import { uiLanguage } from '@/i18n/language';
import type { UiLanguage } from '@/settings/language';
import { appSettings } from '@/settings/store';
import { cleanComputerName, SYNC_SETTINGS } from '@/settings/sync';
import { SYNC_MESSAGES } from './messages';
import type { CopyNamer } from './types';

/**
 * The copy names sync writes, in the interface language at the moment the copy is made:
 * "Mock (Mac, 5 Oct 14:32)" / 「Mock（Mac，10月5日 14:32）」. `plainNamer` stays for tests.
 */

const two = (n: number) => String(n).padStart(2, '0');

/** This computer's name until the teacher gives one: from the platform. */
export function defaultComputerName(lang: UiLanguage = uiLanguage()): string {
  const m = resolveMessages(SYNC_MESSAGES, lang);
  if (typeof navigator === 'undefined') return m.computerOther;
  const platform = `${navigator.platform ?? ''} ${navigator.userAgent ?? ''}`;
  if (/Mac/.test(platform)) return m.computerMac;
  // Not /win/i: that matches "Darwin".
  if (/Windows|Win32|Win64/.test(platform)) return m.computerWindows;
  return m.computerOther;
}

/** The name the teacher gave this computer (Settings → Storage location), else the default. */
export function computerName(lang: UiLanguage = uiLanguage()): string {
  return cleanComputerName(appSettings.read(SYNC_SETTINGS).computerName) || defaultComputerName(lang);
}

export function localNamer(
  computer: (lang: UiLanguage) => string = computerName,
  language: () => UiLanguage = uiLanguage,
): CopyNamer {
  return {
    conflictCopy(name, at) {
      const lang = language();
      const time = `${two(at.getHours())}:${two(at.getMinutes())}`;
      return resolveMessages(SYNC_MESSAGES, lang).conflictCopy(name, computer(lang), at.getDate(), at.getMonth() + 1, time);
    },
    providerCopy: (name) => resolveMessages(SYNC_MESSAGES, language()).providerCopy(name),
  };
}
