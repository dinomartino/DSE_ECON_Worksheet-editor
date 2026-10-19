import { topicDisplay, topicHeading, topicNamesFor } from '@/model/topics';
import type { UiLanguage } from '@/settings/language';
import type { LanguageMode } from '@/model/types';
import { paperLanguage } from '@/settings/paperLanguage';

/**
 * Topic names in the language the questions are shown in (`topicNamesFor`), never the
 * interface's. `wide`: both names when the view is bilingual; `tight`: one.
 */
type Room = 'tight' | 'wide';

/** The name. */
export function topicName(code: string, language: LanguageMode = paperLanguage(), room: Room = 'tight'): string {
  return topicDisplay(code, topicNamesFor(language, room));
}

/** The name with its coarse letter first (`topicHeading`). */
export function topicTitle(code: string, language: LanguageMode = paperLanguage(), room: Room = 'tight'): string {
  return topicHeading(code, topicNamesFor(language, room));
}

/** The name of a tag; a free tag as stored. */
export function tagName(tag: string, language: LanguageMode = paperLanguage()): string {
  return topicName(tag, language);
}

/**
 * The one exception to "topic names are paper words": the 題型 map and its sort board are
 * chrome only (no paper on screen), so their topic names follow the interface language
 * (user, 2026-10-19, `docs/design/question-types-empty-state.md` § 6).
 */
export function chromeTopicName(code: string, ui: UiLanguage): string {
  return topicDisplay(code, ui === 'zh-HK' ? 'zh' : 'en');
}
