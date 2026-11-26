import { defineMessages } from '@/i18n/catalogue';

/** Level 1 of the bank: the coverage strip and the topic cards. */
export const TOPIC_CARDS_MESSAGES = defineMessages({
  coverage: { en: 'Coverage', zh: '涵蓋' },
  coverageLabel: {
    en: (code: string, name: string, n: number) => `${code} ${name}, ${n} ${n === 1 ? 'question' : 'questions'}`,
    zh: (code: string, name: string, n: number) => `${code} ${name}，${n} 條題目`,
  },
  untaggedLead: {
    en: (n: number) => `${n} ${n === 1 ? 'question has' : 'questions have'} no topic`,
    zh: (n: number) => `${n} 條題目未有課題`,
  },
  tagIt: { en: ' · Tag it now →', zh: ' · 立即標記 →' },
  /** k-0569: questions under an EDB topic several MCQ topics share. */
  pickLead: {
    en: (n: number) => (n === 1 ? '1 question needs its MCQ topic' : `${n} questions need their MCQ topic`),
    zh: (n: number) => `${n} 條題目需要選定 MCQ 課題`,
  },
  pickThem: { en: ' · Pick →', zh: ' · 選擇 →' },
  pickTitle: {
    en: 'Tagged with an EDB topic that covers several of your MCQ topics (e.g. Market intervention: ceiling, floor, quota, tax, subsidy)',
    zh: '標記了涵蓋多個 MCQ 課題的 EDB 課題（例如政府干預：價格上限、價格下限、配額、從量稅、從量津貼）',
  },
  tagThem: { en: ' · Tag them now →', zh: ' · 立即標記 →' },
  classGapTitle: {
    en: (label: string, detail: string) => `Show the questions ${label} has not used${detail ? ` (${detail})` : ''}`,
    zh: (label: string, detail: string) => `顯示 ${label} 未用過的題目${detail ? `（${detail}）` : ''}`,
  },
  classUsage: {
    en: (label: string, used: number, total: number) => `${label} has used ${used} of ${total} questions`,
    zh: (label: string, used: number, total: number) => `${label} 已用過 ${total} 條題目中的 ${used} 條`,
  },
  allQuestions: {
    en: (n: number) => `All ${n} ${n === 1 ? 'question' : 'questions'} →`,
    zh: (n: number) => `全部 ${n} 條題目 →`,
  },
  topics: { en: 'Topics', zh: '課題' },
  cardQuestion: { en: 'question', zh: '條題目' },
  cardQuestions: { en: 'questions', zh: '條題目' },
  cardPatterns: { en: (n: number) => ` · ${n} 題型`, zh: (n: number) => ` · ${n} 個題型` },
  cardPatternsLink: { en: (n: number) => `${n} 題型 →`, zh: (n: number) => `${n} 個題型 →` },
  noQuestions: { en: 'No questions', zh: '沒有題目' },
  thin: { en: (n: number) => `Only ${n}. Worth adding more`, zh: (n: number) => `只有 ${n} 條，建議多加一些` },
});
