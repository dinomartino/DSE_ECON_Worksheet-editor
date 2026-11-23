import { topicDisplay, topicHeading, topicNamesFor } from '@/model/topics';
import type { LanguageMode } from '@/model/types';
import { paperLanguage } from '@/settings/paperLanguage';

/**
 * Topic names in the language the questions are shown in (`topicNamesFor`), never the
 * interface's: on every page of the 題庫, the 題型 map and its sort board too, where the
 * screen's view language decides (k-0500, which ended the 2026-10-19 exception). `wide`: both names when the view is bilingual; `tight`: one.
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
