import { defineMessages } from '@/i18n/catalogue';

/** Each section's rail label, sub-line and heading line (the dialog resolves them). */
export const SECTION_MESSAGES = defineMessages({
  aiLabel: { en: 'AI & translation', zh: 'AI 與翻譯' },
  aiHint: { en: 'Provider, key, model', zh: '供應商、API key、模型' },
  aiDescription: {
    en: 'Translate with your own key, and check terms against the EDB glossary.',
    zh: '用你自己的 API key 翻譯，並按教育局詞彙表檢查用詞。',
  },
  termsLabel: { en: 'Translation terms', zh: '翻譯用語' },
  termsHint: { en: 'Your wording for EDB terms', zh: '你慣用的 EDB 譯法' },
  termsDescription: {
    en: 'Some terms are listed more than one way in the EDB glossary. Pick the one you write, or add your own.',
    zh: '教育局詞彙表為部分用語列出多於一種譯法。選擇你慣用的一種，或加入你自己的譯法。',
  },
  appearanceLabel:{ en: 'Appearance', zh: '外觀' },
  appearanceHint: { en: 'Light, dark or system', zh: '淺色、深色或跟隨系統' },
  appearanceDescription: {
    en: 'The colour scheme around the page. Worksheets always print black on white.',
    zh: '頁面周圍的配色。工作紙一律以白底黑字列印。',
  },
  languageLabel: { en: 'Language 語言', zh: '語言' },
  languageHint: { en: 'English or 繁體中文', zh: 'English 或繁體中文' },
  languageDescription: {
    en: 'The language of buttons, menus and dialogs. Worksheets print exactly as you wrote them.',
    zh: '按鈕、選單和對話框所用的語言。工作紙照你所寫的內容列印，不受影響。',
  },
  storageLabel: { en: 'Storage location', zh: '儲存位置' },
  storageHint: { en: 'Sync two computers', zh: '兩部電腦同步' },
  storageDescription: {
    en: 'Keep your worksheets in a cloud folder to have them on your other computer too.',
    zh: '把工作紙存放在雲端資料夾，在另一部電腦也可使用。',
  },
});
