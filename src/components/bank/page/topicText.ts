import { topicDisplay, topicHeading, topicLabel } from '@/model/topics';
import { uiLanguage } from '@/i18n/language';
import type { UiLanguage } from '@/settings/language';

/**
 * Topic names in the interface language: English mode reads as it always did (`names`),
 * 繁體中文 mode shows the Chinese name alone.
 */
const zh = (lang: UiLanguage) => lang === 'zh-HK';

/** The name; `names: 'both'` is English then 中文 in English mode. */
export function topicName(code: string, names: 'en' | 'both' = 'en', lang: UiLanguage = uiLanguage()): string {
  return topicDisplay(code, zh(lang) ? 'zh' : names);
}

/** The name with its coarse letter first (`topicHeading`). */
export function topicTitle(code: string, names: 'en' | 'both' = 'en', lang: UiLanguage = uiLanguage()): string {
  return topicHeading(code, zh(lang) ? 'zh' : names);
}

/** `topicLabel`: the name of a tag. */
export function tagName(tag: string, lang: UiLanguage = uiLanguage()): string {
  return topicLabel(tag, zh(lang) ? 'zh' : 'en');
}
