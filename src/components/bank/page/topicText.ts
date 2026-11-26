import { viewDisplay, viewHeading, viewTopicOf } from '@/model/mcqView';
import { topicDisplay, topicHeading, topicNamesFor } from '@/model/topics';
import type { UiLanguage } from '@/settings/language';
import type { LanguageMode } from '@/model/types';
import { paperLanguage } from '@/settings/paperLanguage';

/**
 * Topic names in the language the questions are shown in (`topicNamesFor`), never the
 * interface's. `wide`: both names when the view is bilingual; `tight`: one.
 */
type Room = 'tight' | 'wide';

/**
 * The name. The bank groups by the teacher's MCQ topics (k-0569): a view code (a section,
 * `@mcq:<key>`, or an EDB code the view keeps) reads by the view (`model/mcqView.ts`); any
 * other EDB code ('C.ped', a 題型's sub-topic) by `model/topics.ts`.
 */
export function topicName(code: string, language: LanguageMode = paperLanguage(), room: Room = 'tight'): string {
  const names = topicNamesFor(language, room);
  return viewTopicOf(code) ? viewDisplay(code, names) : topicDisplay(code, names);
}

/** The name with its section letter first (`viewHeading`, else `topicHeading`). */
export function topicTitle(code: string, language: LanguageMode = paperLanguage(), room: Room = 'tight'): string {
  const names = topicNamesFor(language, room);
  return viewTopicOf(code) ? viewHeading(code, names) : topicHeading(code, names);
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
