import { defineMessages } from '@/i18n/catalogue';

/** The bilingual text field's own chrome; the AI fill's button and notes come from `translate/fieldFill`. */
export const BITEXT_MESSAGES = defineMessages({
  placeholderEn: { en: 'English…', zh: '英文…' },
  placeholderZh: { en: '中文…', zh: '中文…' },
  sideEn: { en: 'English', zh: '英文' },
  sideZh: { en: '中文', zh: '中文' },
  oneMissing: { en: 'One language is missing', zh: '缺少其中一種語言' },
  needsTranslation: { en: 'needs translation', zh: '需要翻譯' },
  filling: { en: 'Filling…', zh: '填寫中…' },
  inserted: { en: 'Inserted. Check it on the page.', zh: '已插入，請在頁面上檢查。' },
  loadFailed: {
    en: 'Couldn’t load translation. Check your connection and try again.',
    zh: '無法載入翻譯功能。請檢查網絡連線後再試。',
  },
});
