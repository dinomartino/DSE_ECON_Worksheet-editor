import { defineMessages } from '@/i18n/catalogue';

/** The one-question paper preview. */
export const PAPER_PREVIEW_MESSAGES = defineMessages({
  label: {
    en: (teacher: boolean) => `The question as it prints, ${teacher ? 'Teacher' : 'Student'} version`,
    zh: (teacher: boolean) => `題目的列印效果，${teacher ? '教師版' : '學生版'}`,
  },
  failed: { en: 'This question could not be read.', zh: '無法讀取這條題目。' },
  loading: { en: 'Loading…', zh: '載入中…' },
});
