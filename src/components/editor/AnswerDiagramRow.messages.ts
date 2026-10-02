import { defineMessages } from '@/i18n/catalogue';

export const ANSWER_DIAGRAM_MESSAGES = defineMessages({
  title: { en: 'Model diagram', zh: '參考圖表' },
  hint: { en: 'teacher only', zh: '只供教師' },
  onQuestionDiagram: {
    en: 'To mark the answer on the question’s own diagram instead, open that diagram and turn on Draw answer.',
    zh: '如要把答案直接畫在題目的圖表上，請開啟該圖表，再開啟「繪製答案」。',
  },
  remove: { en: 'Remove', zh: '移除' },
  drawThis: { en: 'Draw on this diagram', zh: '在此圖表上繪圖' },
  pieData: { en: 'A pie chart is edited as data', zh: '圓形圖以數據編輯' },
  draw: { en: '✎ Draw…', zh: '✎ 繪圖…' },
  blank: { en: 'Blank axes', zh: '空白座標軸' },
  width: { en: 'Width', zh: '寬度' },
});
