import { resolveMessages } from '@/i18n/catalogue';
import { uiLanguage } from '@/i18n/language';
import type { DocumentType } from '@/model/newWorksheet';
import type { UiLanguage } from '@/settings/language';
import { START_KIND_MESSAGES as K } from './screen.messages';

/**
 * The four kinds of document, in the order a teacher meets them: the one definition the
 * empty desk's cards and the new-worksheet gallery both read, so they can never name a
 * kind differently. Each names what the choice *includes*: nothing else needs asking.
 */
export interface StartKind {
  type: DocumentType;
  title: string;
  /** What the choice includes, under the new-worksheet gallery. */
  hint: string;
  /** The welcome card's shorter line, under the sketch of the page. */
  caption: string;
  titleZh: string;
}

export const START_KINDS: readonly StartKind[] = [
  {
    type: 'classroom',
    title: K.classroomTitle.en,
    hint: K.classroomHint.en,
    caption: K.classroomCaption.en,
    titleZh: '課堂工作紙',
  },
  {
    type: 'lqWorksheet',
    title: K.lqWorksheetTitle.en,
    hint: K.lqWorksheetHint.en,
    caption: K.lqWorksheetCaption.en,
    titleZh: '長題目工作紙',
  },
  {
    type: 'paper1',
    title: K.paper1Title.en,
    hint: K.paper1Hint.en,
    caption: K.paper1Caption.en,
    titleZh: '卷一模擬試卷',
  },
  {
    type: 'lqMock',
    title: K.lqMockTitle.en,
    hint: K.lqMockHint.en,
    caption: K.lqMockCaption.en,
    titleZh: '卷二模擬試卷',
  },
];

/**
 * A kind's words in the interface language. English mode keeps the bilingual card (the
 * title over `titleZh`); 中文 mode shows its own Chinese title alone (`bilingual: false`).
 */
export function kindText(type: DocumentType, lang: UiLanguage = uiLanguage()) {
  const m = resolveMessages(K, lang);
  const words = {
    classroom: { title: m.classroomTitle, hint: m.classroomHint, caption: m.classroomCaption },
    lqWorksheet: { title: m.lqWorksheetTitle, hint: m.lqWorksheetHint, caption: m.lqWorksheetCaption },
    paper1: { title: m.paper1Title, hint: m.paper1Hint, caption: m.paper1Caption },
    lqMock: { title: m.lqMockTitle, hint: m.lqMockHint, caption: m.lqMockCaption },
  }[type];
  return { ...words, bilingual: lang !== 'zh-HK' };
}

/**
 * The type the New worksheet button preselects: the last one created, per viewer. The key
 * sits outside the `econ-worksheet:` prefix, which the store treats as documents.
 */
const LAST_KIND_KEY = 'econgen.lastNewType';

export function readLastKind(): DocumentType {
  try {
    const stored = window.localStorage.getItem(LAST_KIND_KEY);
    return START_KINDS.find((kind) => kind.type === stored)?.type ?? 'classroom';
  } catch {
    return 'classroom';
  }
}

export function writeLastKind(type: DocumentType): void {
  try {
    window.localStorage.setItem(LAST_KIND_KEY, type);
  } catch {
    // Private mode or blocked storage: the button just starts on Classroom.
  }
}

/**
 * The school name the last exam paper was made with, so Paper 2 starts with the school Paper 1
 * was given (k-0299: the form asked again and the cover kept "SCHOOL NAME"). Per viewer, like
 * the type; outside the `econ-worksheet:` prefix. Only the form reads it, as a starting value.
 */
const LAST_SCHOOL_KEY = 'econgen.lastSchool';
const SCHOOL_MAX = 200;

export function readLastSchool(): string {
  try {
    const stored = window.localStorage.getItem(LAST_SCHOOL_KEY);
    return typeof stored === 'string' ? stored.slice(0, SCHOOL_MAX) : '';
  } catch {
    return '';
  }
}

/** Remembered as typed; an emptied box forgets it, so a teacher can clear it on purpose. */
export function writeLastSchool(school: string): void {
  try {
    const trimmed = school.trim().slice(0, SCHOOL_MAX);
    if (trimmed) window.localStorage.setItem(LAST_SCHOOL_KEY, trimmed);
    else window.localStorage.removeItem(LAST_SCHOOL_KEY);
  } catch {
    // Private mode or blocked storage: the box just starts empty.
  }
}
