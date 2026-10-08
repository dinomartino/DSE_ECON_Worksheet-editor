import { defineMessages } from '@/i18n/catalogue';

export const ANSWER_GRAPH_MESSAGES = defineMessages({
  title: { en: 'Graph space', zh: '作圖空間' },
  hint: { en: 'blank axes to draw on', zh: '供學生作圖的空白座標軸' },
  remove: { en: 'Remove', zh: '移除' },
  height: { en: 'Height', zh: '高度' },
  heightIn: { en: 'Height in lines', zh: '高度（行數）' },
  lines: { en: 'lines', zh: '行' },
  customLines: { en: 'Height in lines, 6 to 40', zh: '高度行數（6 至 40）' },
  linesTitle: {
    en: (lines: number, cm: number) => `${lines} lines (${cm} cm)`,
    zh: (lines: number, cm: number) => `${lines} 行（${cm} cm）`,
  },
  width: { en: 'Width', zh: '寬度' },
  half: { en: 'Half', zh: '半頁' },
  full: { en: 'Full', zh: '全頁' },
  grid: { en: 'Grid', zh: '格線' },
  origin: { en: 'Origin "0"', zh: '原點「0」' },
  vertical: { en: 'Vertical axis', zh: '縱軸' },
  horizontal: { en: 'Horizontal axis', zh: '橫軸' },
});
