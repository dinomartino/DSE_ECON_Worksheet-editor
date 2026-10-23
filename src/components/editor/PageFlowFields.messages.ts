import { defineMessages } from '@/i18n/catalogue';

export const PAGE_FLOW_MESSAGES = defineMessages({
  startOnNewPage: { en: 'Start on a new page', zh: '此題由新頁開始' },
  // Said under the box when it is ticked but the page already begins here, so a tick never
  // quietly does nothing. The first question stays on page 1 under the title: a title page is
  // made with a New page element, not by this.
  startFirst: {
    en: 'This is the first question, so it already opens the paper.',
    zh: '這是第一題，本來就在試卷開首。',
  },
  startAfterBreak: {
    en: 'A New page break sits right above, so this question already starts a page.',
    zh: '上方已有「新頁面」，這題本來就由新頁開始。',
  },
  keepOnOnePage: { en: 'Keep this question on one page', zh: '此題保持在同一頁' },
  keepHint: {
    en: 'If it does not fit what is left of a page, the whole question moves to the next page. One taller than a page is still split.',
    zh: '若頁面餘下的空位不夠，整題會移到下一頁。高於一頁的題目仍會分頁。',
  },
  keptOnPaper1: {
    en: 'A Paper 1 keeps every question on one page.',
    zh: 'Paper 1 的每一題都保持在同一頁。',
  },
});
