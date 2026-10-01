import { defineMessages } from '@/i18n/catalogue';

/** The Filter button and its popover. */
export const FILTER_MESSAGES = defineMessages({
  filter: { en: 'Filter', zh: '篩選' },
  filters: { en: 'Filters', zh: '篩選' },
  filterWith: { en: (what: string) => `Filter · ${what}`, zh: (what: string) => `篩選 · ${what}` },
  panel: { en: 'Filter questions', zh: '篩選題目' },
  type: { en: 'Type', zh: '題目類型' },
  anyType: { en: 'Any type', zh: '所有類型' },
  pattern: { en: '題型', zh: '題型' },
  noPatternTitle: { en: 'No question here has a 題型 yet', zh: '這裏的題目都未有題型' },
  noPatternYet: { en: 'No 題型 yet', zh: '尚未有題型' },
  anyPattern: { en: 'Any 題型', zh: '所有題型' },
  marks: { en: 'Marks', zh: '分數' },
  class: { en: 'Class', zh: '班別' },
  classNeedsSetup: {
    en: 'Say which classes sat a paper in Setup to use this',
    zh: '請先在工作紙設定中指明哪些班別考過卷，才可使用此項',
  },
  noClasses: { en: 'No classes yet', zh: '尚未有班別' },
  anyClass: { en: 'Any class', zh: '所有班別' },
  since: { en: 'Since', zh: '期間' },
  language: { en: 'Language', zh: '語言' },
  anyLanguage: { en: 'Any language', zh: '所有語言' },
  source: { en: 'Source', zh: '來源' },
  allSources: { en: 'All sources', zh: '所有來源' },
  worksheets: { en: 'Worksheets', zh: '工作紙' },
  banks: { en: 'Banks', zh: '題庫' },
  clear: { en: 'Clear filters', zh: '清除篩選' },
  done: { en: 'Done', zh: '完成' },
});
