import { defineMessages } from '@/i18n/catalogue';

/** The Marking scheme view's own chrome (never printed). */
export const ANSWER_KEY_PREVIEW_MESSAGES = defineMessages({
  empty: {
    en: 'Nothing to mark yet. MC keys, answers and marking schemes you add appear here.',
    zh: '暫時未有評卷內容。你加入的 MC 答案、答案和評分要點會在這裡顯示。',
  },
  sheets: { en: 'Marking scheme sheets', zh: '評卷參考頁面' },
});
