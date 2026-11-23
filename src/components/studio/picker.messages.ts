import { defineMessages } from '@/i18n/catalogue';

/** The reference picker of the Question studio (k-0516): a past-paper question to write like. */
export const REFERENCE_PICKER_MESSAGES = defineMessages({
  title: { en: 'Pick a past-paper question to write like', zh: '選一條歷屆試題作參考' },
  close: { en: 'Close', zh: '關閉' },
  search: { en: 'Search the past paper bank', zh: '搜尋歷屆試題庫' },
  searchPlaceholder: { en: 'Search every question…', zh: '搜尋所有題目…' },
  rail: { en: 'Browse the past paper bank', zh: '瀏覽歷屆試題庫' },
  diagram: { en: '▣ diagram', zh: '▣ 圖' },
  diagramTitle: { en: 'This question has a diagram, table or picture.', zh: '這條題目附有圖、表或圖片。' },
  cardLabel: { en: (label: string) => `Question ${label}`, zh: (label: string) => `題目 ${label}` },
  onlyDiagram: { en: 'Only questions with a diagram or table', zh: '只顯示有圖表的題目' },
  selected: { en: (label: string) => `Selected: ${label}`, zh: (label: string) => `已選：${label}` },
  noneSelected: { en: 'Click a question to select it.', zh: '按一下題目即可選取。' },
  cancel: { en: 'Cancel', zh: '取消' },
  use: { en: 'Use as reference', zh: '用作參考' },
  shown: { en: (n: number) => `${n} shown`, zh: (n: number) => `顯示 ${n} 條` },
  empty: { en: 'No multiple-choice question matches. Clear the search or the filter.', zh: '沒有相符的多項選擇題。請清除搜尋或篩選。' },
});
