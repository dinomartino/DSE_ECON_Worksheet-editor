import { defineMessages } from '@/i18n/catalogue';

/** Settings → Translation terms. The renderings and English keys are glossary data, never here. */
export const TERMS_MESSAGES = defineMessages({
  explain: {
    en: 'Translation and Check terms use the wording you pick. The other listed wordings still count as correct.',
    zh: '翻譯和檢查用詞會跟從你選擇的譯法。其他列出的譯法仍然算作正確。',
  },
  search: { en: 'Search English or 中文', zh: '搜尋英文或中文' },
  filterLabel: { en: 'Show', zh: '顯示' },
  filterAll: { en: (n: number) => `All with choices (${n})`, zh: (n: number) => `所有可選用語（${n}）` },
  filterChanged: { en: (n: number) => `Changed (${n})`, zh: (n: number) => `已更改（${n}）` },
  resetAll: { en: 'Reset all', zh: '全部重設' },
  common: { en: 'Common choices', zh: '常見選擇' },
  allTerms: { en: 'All terms', zh: '所有用語' },
  loading: { en: 'Loading the EDB glossary…', zh: '正在載入 EDB 詞彙表…' },
  loadFailed: {
    en: 'The EDB glossary couldn’t load. Close Settings and try again.',
    zh: 'EDB 詞彙表未能載入。請關閉設定再試一次。',
  },
  noMatch: { en: (q: string) => `No terms match “${q}”.`, zh: (q: string) => `沒有用語符合「${q}」。` },
  noneChanged: {
    en: 'You haven’t changed any terms yet. Every term uses its default wording.',
    zh: '你未有更改任何用語。所有用語都採用預設譯法。',
  },
  showMore: { en: (n: number) => `Show more (${n} left)`, zh: (n: number) => `顯示更多（尚餘 ${n} 個）` },
  default: { en: 'Default', zh: '預設' },
  changed: { en: 'Changed', zh: '已更改' },
  reset: { en: 'Reset', zh: '重設' },
  resetTerm: { en: (term: string) => `Reset ${term}`, zh: (term: string) => `重設 ${term}` },
  sense: { en: (n: number) => `Meaning ${n}`, zh: (n: number) => `第 ${n} 個意思` },
  relatedOffer: {
    en: (n: number) => `Also use it in ${n} related ${n === 1 ? 'term' : 'terms'}?`,
    zh: (n: number) => `也用於 ${n} 個相關用語？`,
  },
  relatedOn: {
    en: (n: number) => `Also used in ${n} related ${n === 1 ? 'term' : 'terms'}.`,
    zh: (n: number) => `已同時用於 ${n} 個相關用語。`,
  },
  relatedApply: { en: 'Use in related terms', zh: '用於相關用語' },
  relatedStop: { en: 'Stop', zh: '停用' },
  relatedShow: { en: 'Show which', zh: '顯示是哪些' },
  derived: { en: 'Not in the EDB list', zh: '不在 EDB 列表' },
  derivedTitle: {
    en: 'The EDB glossary does not list this wording. It follows your choice, so Check terms accepts it.',
    zh: 'EDB 詞彙表沒有列出這個譯法。它跟從你的選擇，所以檢查用詞會接受。',
  },
  follows: { en: (term: string) => `Follows your choice for ${term}:`, zh: (term: string) => `跟從你為 ${term} 所選的譯法：` },
});
