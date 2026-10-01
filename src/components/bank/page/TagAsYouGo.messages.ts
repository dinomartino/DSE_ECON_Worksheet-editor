import { defineMessages } from '@/i18n/catalogue';

/** Level 3 of the bank: the untagged questions, one at a time. */
export const TAG_AS_YOU_GO_MESSAGES = defineMessages({
  allTagged: { en: 'Every question has a topic.', zh: '所有題目都已有課題。' },
  allTaggedHint: {
    en: 'New questions you write appear here until they are tagged.',
    zh: '你新寫的題目會顯示在這裏，直至標記課題為止。',
  },
  backToTopics: { en: 'Back to topics', zh: '返回課題' },
  previous: { en: 'Previous question (skip back)', zh: '上一條題目（返回）' },
  next: { en: 'Next question (skip)', zh: '下一條題目（略過）' },
  livesIn: { en: 'Lives in ', zh: '所在位置：' },
  open: { en: 'Open in worksheet', zh: '在工作紙中開啟' },
  openTitle: { en: 'Open this question in its worksheet (O)', zh: '在所屬工作紙中開啟這條題目（O）' },
  topicsFor: { en: (name: string) => `Topics for ${name}`, zh: (name: string) => `${name}的課題` },
  topicsForQuestion: { en: 'Topics for this question', zh: '這條題目的課題' },
  partialTitle: {
    en: (heading: string, where: string) => `${heading}: on ${where} only. Press to put it on every part.`,
    zh: (heading: string, where: string) => `${heading}：只在 ${where}。按下以套用到每個分題。`,
  },
  hint: {
    en: (n: number) => `Suggestions come from topics used on the same worksheet, then your most used. Press 1 to ${n} or click; Enter saves and moves on.`,
    zh: (n: number) => `建議來自同一份工作紙用過的課題，其次是你最常用的課題。按 1 至 ${n} 或點擊選擇；按 Enter 儲存並前往下一條。`,
  },
  hintNone: {
    en: 'Nothing to suggest yet: choose from All topics. Enter saves and moves on.',
    zh: '暫時沒有建議：請從「全部課題」選擇。按 Enter 儲存並前往下一條。',
  },
  hintParts: {
    en: ' The keys tag the whole question until you pick a part (click it, or press [ and ]).',
    zh: ' 在你選擇分題之前（點擊分題，或按 [ 和 ]），這些按鍵會標記整條題目。',
  },
  saveNext: { en: 'Save and next', zh: '儲存並下一條' },
  allTopics: { en: 'All topics', zh: '全部課題' },

  partsLabel: { en: 'Tag the whole question or one part', zh: '標記整條題目或其中一個分題' },
  whole: { en: 'Whole question', zh: '整條題目' },
  everyPart: { en: 'Every part', zh: '所有分題' },
  sameAs: { en: (label: string) => `Same as ${label}`, zh: (label: string) => `與 ${label} 相同` },
  noTopicYet: { en: 'No topic yet', zh: '尚未有課題' },
  move: { en: '[ ] move', zh: '[ ] 移動' },
  chipTitle: { en: (title: string, detail: string) => `${title}: ${detail}`, zh: (title: string, detail: string) => `${title}：${detail}` },

  saved: { en: (text: string) => `${text}.`, zh: (text: string) => `${text}。` },
  undo: { en: 'Undo', zh: '復原' },
  undoTitle: { en: 'Take these topics off again (⌫ or ⌘Z)', zh: '取消這些課題（⌫ 或 ⌘Z）' },
});
