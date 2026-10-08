import { defineMessages } from '@/i18n/catalogue';

export const LANGUAGE_MESSAGES = defineMessages({
  interface: { en: 'UI language', zh: '介面語言' },
  interfaceNote: {
    en: 'Buttons, menus and dialogs. Papers print the same in either.',
    zh: '按鈕、選單和對話框所用的語言。試卷不受影響。',
  },
  group: { en: 'UI language', zh: '介面語言' },
  papers: { en: 'Paper language', zh: '試卷語言' },
  papersNote: {
    en: 'The language new papers and imported questions start in. Each paper can still be switched on its own.',
    zh: '新試卷和匯入題目的起始語言。每份試卷仍可個別切換。',
  },
  papersGroup: { en: 'Paper language', zh: '試卷語言' },
  paperEn: { en: 'English only', zh: '只用英文' },
  paperZh: { en: '中文 only', zh: '只用中文' },
  paperBoth: { en: 'Bilingual', zh: '中英對照' },
});
