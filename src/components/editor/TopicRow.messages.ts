import { defineMessages } from '@/i18n/catalogue';

/** The Topics row and its picker. */
export const TOPIC_ROW_MESSAGES = defineMessages({
  codeLike: {
    en: (typed: string) => `“${typed}” is written like a topic code, so it can’t be a tag. Add a word, for example “${typed} notes”.`,
    zh: (typed: string) => `「${typed}」的寫法像課題代碼，因此不能作標籤。請加上文字，例如「${typed} notes」。`,
  },
  separator: { en: 'A tag can’t contain “::”.', zh: '標籤不可包含「::」。' },
  atSign: { en: 'A tag can’t start with “@”.', zh: '標籤不可以「@」開頭。' },
  pickFromList: { en: 'Pick a topic from the list.', zh: '請從清單選擇課題。' },
  filterAria: { en: 'Filter topics or type a free tag', zh: '篩選課題，或輸入自訂標籤' },
  filterAriaTopicsOnly: { en: 'Filter topics', zh: '篩選課題' },
  filterPlaceholder: { en: 'Filter, or type a tag and press Enter', zh: '篩選，或輸入標籤後按 Enter' },
  noMatch: { en: 'No matching topic.', zh: '沒有符合的課題。' },
  noMatchFreeTag: {
    en: (typed: string) => `No matching topic. Press Enter to add “${typed}” as a free tag.`,
    zh: (typed: string) => `沒有符合的課題。按 Enter 可將「${typed}」加為自訂標籤。`,
  },
  title: { en: 'Topics', zh: '課題' },
  hint: { en: '課題 · never printed', zh: '不會印出' },
  empty: { en: 'No topic yet. Tags feed the question bank.', zh: '未有課題。標籤會用於題庫。' },
  done: { en: 'Done', zh: '完成' },
  addTopic: { en: 'Add topic', zh: '加入課題' },
  removeTopic: { en: (name: string) => `Remove topic ${name}`, zh: (name: string) => `移除課題 ${name}` },
});

/** The per-part Topics row. */
export const PART_TOPICS_MESSAGES = defineMessages({
  wholeQuestion: { en: 'Whole question', zh: '整條題目' },
  partsOnly: {
    en: 'A part takes topics and 題型 only. Tags go on the whole question.',
    zh: '分題只可加入課題和題型。標籤請加在整條題目。',
  },
  topicsFor: { en: (label: string) => `Topics for ${label}`, zh: (label: string) => `${label} 的課題` },
  noTopicDot: { en: 'No topic yet.', zh: '未有課題。' },
  setOnWhole: {
    en: (label: string) => `Set on the whole question. A change here is for ${label} only.`,
    zh: (label: string) => `已設定於整條題目。在此更改只適用於 ${label}。`,
  },
  and: { en: ' and ', zh: '及' },
  ownTopicsInstead: {
    en: (labels: string, count: number) => `${labels} ${count === 1 ? 'has its' : 'have their'} own topics instead.`,
    zh: (labels: string, count: number) => `${labels}${count === 1 ? '已改用自己的課題' : '均已改用各自的課題'}。`,
  },
  sameAs: { en: (parent: string) => `Same as ${parent}`, zh: (parent: string) => `與 ${parent} 相同` },
  sameAsTitle: {
    en: (sub: string, parent: string) => `${sub} tests what ${parent} tests`,
    zh: (sub: string, parent: string) => `${sub} 與 ${parent} 考核相同內容`,
  },
  itsOwn: { en: 'Its own', zh: '另設課題' },
  itsOwnTitle: {
    en: (sub: string, parent: string) => `Give ${sub} its own topics, in place of ${parent}’s`,
    zh: (sub: string, parent: string) => `為 ${sub} 另設課題，取代 ${parent} 的課題`,
  },
  inPlaceOf: {
    en: (parent: string) => `In place of ${parent}’s topics.`,
    zh: (parent: string) => `取代 ${parent} 的課題。`,
  },
  startsFrom: {
    en: (parent: string, sub: string) =>
      `Starts from ${parent}’s topics. Add or remove one to give ${sub} its own.`,
    zh: (parent: string, sub: string) => `由 ${parent} 的課題開始。加入或移除任何一個，即為 ${sub} 另設課題。`,
  },
  hintNeverPrinted: { en: '課題 · never printed', zh: '不會印出' },
  parentNoTopic: { en: (parent: string) => `${parent} has no topic yet.`, zh: (parent: string) => `${parent} 未有課題。` },
  topics: { en: 'Topics', zh: '課題' },
  hintByPart: { en: '課題 · by part · never printed', zh: '按分題 · 不會印出' },
  done: { en: 'Done', zh: '完成' },
  addToEvery: { en: 'Add to every part', zh: '加入所有分題' },
  itsOwnSuffix: { en: ' · its own', zh: ' · 另設課題' },
  noTopicYet: { en: 'No topic yet', zh: '未有課題' },
  fromQuestion: {
    en: 'Set on the whole question, so every part has them. Click a part to change it alone.',
    zh: '已設定於整條題目，因此每個分題都有。按一個分題即可單獨更改。',
  },
  clickAPart: {
    en: 'Click a part, here or on the page, to tag it.',
    zh: '在此或頁面上按一個分題，即可為它加入課題。',
  },
  topicsOnlyEvery: {
    en: 'Only topics go on every part. Add a tag under Tags.',
    zh: '只有課題可加入所有分題。標籤請在「標籤」下加入。',
  },
  thatIsATopic: {
    en: 'That is a topic. Click a part to add it, or use Add to every part.',
    zh: '這是課題。請按一個分題加入，或使用「加入所有分題」。',
  },
  tags: { en: 'Tags', zh: '標籤' },
  removeTag: { en: (tag: string) => `Remove tag ${tag}`, zh: (tag: string) => `移除標籤 ${tag}` },
  addTag: { en: '+ Tag', zh: '+ 標籤' },
  newTag: { en: 'New tag', zh: '新標籤' },
  typeATag: { en: 'Type a tag and press Enter', zh: '輸入標籤後按 Enter' },
});
