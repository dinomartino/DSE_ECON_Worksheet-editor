import { defineMessages } from '@/i18n/catalogue';

/** The bar that offers to make a paste into questions (k-0201). */
export const PASTE_OFFER_MESSAGES = defineMessages({
  found: {
    en: (count: number) => (count === 1 ? 'This looks like a question.' : `This looks like ${count} questions.`),
    zh: (count: number) => (count === 1 ? '貼上的內容看來是一條題目。' : `貼上的內容看來是 ${count} 條題目。`),
  },
  make: {
    en: (count: number) => (count === 1 ? 'Make it a question' : 'Make these into questions'),
    zh: (count: number) => (count === 1 ? '轉為題目' : '轉為題目'),
  },
  keepText: { en: 'Keep as text', zh: '保留為文字' },
});
