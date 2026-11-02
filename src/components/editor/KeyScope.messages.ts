import { defineMessages } from '@/i18n/catalogue';

/** The Marking scheme view's This paper / Whole set switch (k-0299 step C). */
export const KEY_SCOPE_MESSAGES = defineMessages({
  label: { en: 'Marking scheme of', zh: '評卷參考範圍' },
  thisPaper: { en: 'This paper', zh: '這份試卷' },
  thisPaperTitle: { en: 'This paper’s marking scheme, which you can type on', zh: '這份試卷的評卷參考，可直接修改' },
  wholeSet: { en: 'Whole set', zh: '整套試卷' },
  wholeSetTitle: {
    en: (name: string) => `Every paper of “${name}” in one marking scheme, as Export → Whole set writes it`,
    zh: (name: string) => `「${name}」所有試卷的評卷參考合併為一份，與「匯出 → 整套試卷」相同`,
  },
  readOnly: {
    en: 'Whole set is read-only: to change a paper’s key, choose This paper there.',
    zh: '整套試卷只供檢視：如要修改某份試卷的評卷參考，請在該試卷選「這份試卷」。',
  },
  leftOut: {
    en: (names: string) => `Not in it yet (no questions): ${names}.`,
    zh: (names: string) => `尚未包括（未有題目）：${names}。`,
  },
});
