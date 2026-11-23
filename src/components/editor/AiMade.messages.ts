import { defineMessages } from '@/i18n/catalogue';

/**
 * The Question studio's label on a question nobody has read yet (`Question.aiMade`, k-0499):
 * the Edit panel's note and its Checked button, the chip on the page, the outline's mark.
 * Screen only: none of these words print or reach the Word file.
 */
export const AI_MADE_MESSAGES = defineMessages({
  title: { en: 'AI-made, not checked yet', zh: 'AI 擬題，尚未核對' },
  body: {
    en: 'It can be wrong. Read the key, the numbers and the wording, then press Checked.',
    zh: '可能有錯。請細閱答案、數字及用字，確認後按「已核對」。',
  },
  checked: { en: 'Checked', zh: '已核對' },
  checkedHint: {
    en: 'I have read this question. Takes the label off; Undo puts it back.',
    zh: '我已細閱此題。按下後除去標示，可用「復原」恢復。',
  },
  // Beside the question on the page: short, and said once more where the label can be cleared.
  chip: { en: 'AI-made · not checked', zh: 'AI 擬題 · 未核對' },
  chipTitle: {
    en: 'Written by the AI and not checked yet. This label does not print. Press Checked in the Edit panel once you have read it.',
    zh: '由 AI 擬寫，尚未核對。此標示不會印出。細閱後請在編輯面板按「已核對」。',
  },
  // The outline row's mark (a sparkle): the same words as the chip, for a tooltip and a screen reader.
  outlineMark: { en: 'AI-made, not checked yet', zh: 'AI 擬題，尚未核對' },
});
