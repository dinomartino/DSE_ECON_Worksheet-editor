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
  noQuestions: { en: 'No questions', zh: '沒有題目' },
  thin: { en: (n: number) => `Only ${n}. Worth adding more`, zh: (n: number) => `只有 ${n} 條，建議多加一些` },
});
