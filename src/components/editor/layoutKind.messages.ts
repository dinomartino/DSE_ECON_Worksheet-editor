import { defineMessages } from '@/i18n/catalogue';

/** The name of each layout element kind (`LAYOUT_NAME` in English), keyed by `LayoutElement['kind']`. */
export const LAYOUT_KIND_MESSAGES = defineMessages({
  section: { en: 'Section', zh: '部分' },
  heading: { en: 'Heading', zh: '標題' },
  text: { en: 'Text', zh: '文字' },
  spacer: { en: 'Blank space', zh: '留白' },
  divider: { en: 'Divider', zh: '分隔線' },
  pageBreak: { en: 'New page', zh: '新頁面' },
  answerLines: { en: 'Answer lines', zh: '答題線' },
  answerSpace: { en: 'Answer space', zh: '答題空位' },
  partHeader: { en: 'Part header', zh: '分部標題' },
  labelList: { en: 'Label list', zh: '標示列表' },
  questionCount: { en: 'Question count', zh: '題目數量' },
  stimulus: { en: 'Shared stimulus', zh: '共用資料' },
});
