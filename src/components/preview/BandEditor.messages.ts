import { defineMessages, type TextKey } from '@/i18n/catalogue';

/** The in-page band editor: header, footer and title block rows. */
export const BAND_EDITOR_MESSAGES = defineMessages({
  addRow: { en: '+ Row', zh: '+ 行' },
  removeRow: { en: 'Remove this row', zh: '移除此行' },
  removeField: { en: 'Remove field', zh: '移除欄位' },
  addField: {
    en: (zone: string) => `Add a field to the ${zone} zone`,
    zh: (zone: string) => `在${zone === 'left' ? '左' : zone === 'right' ? '右' : '中'}區加入欄位`,
  },
  addText: { en: 'Double-click to add text', zh: '按兩下以加入文字' },
  totalMarksTitle: { en: 'Computed from the question marks', zh: '由各題分數計算' },
  ruleTitle: { en: 'A ruled space, sized by the field width', zh: '按欄位寬度而定的橫線空位' },
  pageNumberTitle: { en: 'Numbered by Word when the document is opened', zh: '開啟文件時由 Word 編號' },

  // The surface names the page passes as `label`
  titleBlock: { en: 'Title block', zh: '標題區' },
  page1Header: { en: 'Page 1 header', zh: '第 1 頁頁首' },
  page1Footer: { en: 'Page 1 footer', zh: '第 1 頁頁尾' },
  headerPages2: { en: 'Header · pages 2+', zh: '頁首 · 第 2 頁起' },
  footerPages2: { en: 'Footer · pages 2+', zh: '頁尾 · 第 2 頁起' },
  headerEvery: { en: 'Header · every page', zh: '頁首 · 所有頁面' },
  footerEvery: { en: 'Footer · every page', zh: '頁尾 · 所有頁面' },
});

/** The page's English surface names, so the editor can name them in the interface language. */
export const BAND_LABEL_KEYS: Readonly<Record<string, TextKey<typeof BAND_EDITOR_MESSAGES>>> = {
  'Title block': 'titleBlock',
  'Page 1 header': 'page1Header',
  'Page 1 footer': 'page1Footer',
  'Header · pages 2+': 'headerPages2',
  'Footer · pages 2+': 'footerPages2',
  'Header · every page': 'headerEvery',
  'Footer · every page': 'footerEvery',
};
