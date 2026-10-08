import { defineMessages } from '@/i18n/catalogue';
import { spaced } from '@/i18n/spacing';

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

/** The Question bank screen: its bar, empty states, notices and the topic dialogs it opens. */
export const BANK_SCREEN_MESSAGES = defineMessages({
  // Bulk Set topic
  bulkAdd: { en: 'Add', zh: '新增' },
  bulkRemove: { en: 'Remove', zh: '移除' },
  bulkReplace: { en: 'Replace', zh: '取代' },
  bulkAddDesc: {
    en: 'Adds the topics you tick. Topics already on a question stay.',
    zh: '新增你剔選的課題。題目已有的課題會保留。',
  },
  bulkRemoveDesc: {
    en: 'Takes the topics you tick off. Other topics stay. A ticked sub-topic can stay and lose only its 題型.',
    zh: '移除你剔選的課題，其他課題會保留。已剔選的子課題可保留，只移除其題型。',
  },
  bulkReplaceDesc: {
    en: 'Each question gets exactly the topics you tick. Tick none to clear them.',
    zh: '每條題目只會有你剔選的課題。不剔選任何課題即可清除。',
  },
  bulkAddConfirm: { en: 'Add topics', zh: '新增課題' },
  bulkRemoveConfirm: { en: 'Remove', zh: '移除' },
  bulkReplaceConfirm: { en: 'Replace topics', zh: '取代課題' },
  bulkClearConfirm: { en: 'Clear topics', zh: '清除課題' },
  bulkAddDone: {
    en: (q: number, w: number) => `Tagged ${q} ${plural(q, 'question')} in ${w} ${plural(w, 'worksheet')}.`,
    zh: (q: number, w: number) => `已在 ${w} 份工作紙中為 ${q} 條題目加上課題。`,
  },
  bulkRemoveDone: {
    en: (q: number, w: number) => `Removed topics from ${q} ${plural(q, 'question')} in ${w} ${plural(w, 'worksheet')}.`,
    zh: (q: number, w: number) => `已在 ${w} 份工作紙中移除 ${q} 條題目的課題。`,
  },
  bulkReplaceDone: {
    en: (q: number, w: number) => `Set topics on ${q} ${plural(q, 'question')} in ${w} ${plural(w, 'worksheet')}.`,
    zh: (q: number, w: number) => `已在 ${w} 份工作紙中設定 ${q} 條題目的課題。`,
  },
  bulkPatternsDone: {
    en: (q: number, w: number) => `Cleared 題型 on ${q} ${plural(q, 'question')} in ${w} ${plural(w, 'worksheet')}.`,
    zh: (q: number, w: number) => `已在 ${w} 份工作紙中清除 ${q} 條題目的題型。`,
  },
  bulkTitle: { en: (n: number) => `Set topic for ${n} ${plural(n, 'question')}`, zh: (n: number) => `為 ${n} 條題目設定課題` },
  bulkDescription: {
    en: (base: string, withParts: boolean) =>
      `${base} Every copy of each question changes.${withParts ? ' On a question with parts, it applies to every part; change one part alone in Edit topics.' : ''}`,
    zh: (base: string, withParts: boolean) =>
      `${base}每條題目的所有副本都會更改。${withParts ? '有分題的題目會套用到每個分題；如要單獨更改某個分題，請按該題目的「編輯」。' : ''}`,
  },
  bulkModes: { en: 'How to set topics', zh: '設定課題的方式' },
  bulkPatternNote: {
    en: 'To set a 題型, select questions of one type (MCQ or LQ) only. You can still clear one.',
    zh: '如要設定題型，請只選取同一類型（MCQ 或 LQ）的題目。你仍可清除題型。',
  },

  // Edit topics and tag as you go
  topics: { en: 'Topics', zh: '課題' },
  saveTopics: { en: 'Save topics', zh: '儲存課題' },
  topicsSaved: { en: 'Topics saved.', zh: '課題已儲存。' },
  partDescription: {
    en: (base: string) => `${base} Tag the whole question, then change a part alone.`,
    zh: (base: string) => `${base}先標記整條題目，再單獨更改某個分題。`,
  },
  savedIntoCopies: {
    en: (n: number) => `Saved into ${n === 2 ? 'both copies' : `all ${n} copies`} of this question.`,
    zh: (n: number) => (n === 2 ? '會儲存到這條題目的兩份副本。' : `會儲存到這條題目的全部 ${n} 份副本。`),
  },
  savedIntoDoc: {
    en: (title: string, number: string) => `Saved into “${title}”${number}.`,
    zh: (title: string, number: string) => `會儲存到「${title}」${number}。`,
  },
  tagTitleParts: { en: (name: string) => `Topics for ${name}`, zh: (name: string) => spaced`${name}的課題` },
  tagTitle: { en: 'Topics for this question', zh: '這條題目的課題' },
  tagDescOne: {
    en: 'Tick every topic it tests. Saving moves on to the next question.',
    zh: '剔選它考核的所有課題。儲存後會前往下一條題目。',
  },
  tagDescWhole: {
    en: 'Tick every topic it tests. They go on every part.',
    zh: '剔選它考核的所有課題。課題會套用到每個分題。',
  },
  tagDescPart: { en: (name: string) => `Tick every topic ${name} tests.`, zh: (name: string) => spaced`剔選${name}考核的所有課題。` },
  done: { en: 'Done', zh: '完成' },
  saveNext: { en: 'Save and next', zh: '儲存並下一條' },
  tagSaved: {
    en: (short: string, where: string) => `“${short}” tagged ${where}`,
    zh: (short: string, where: string) => spaced`「${short}」已標記為${where}`,
  },
  questionFallback: { en: 'Question', zh: '題目' },
  semi: { en: '; ', zh: '；' },
  sep: { en: ', ', zh: '、' },

  // The bar
  home: { en: 'Home', zh: '主頁' },
  topicsBack: { en: 'Topics', zh: '課題' },
  bankTitle: { en: 'Question bank 題庫', zh: '題庫' },
  untagged: { en: 'Untagged', zh: '未標記' },
  leftBefore: { en: '', zh: '尚餘 ' },
  leftAfter: { en: ' left', zh: ' 條' },
  patternsTitle: { en: '題型 Patterns', zh: '題型' },
  searchResults: { en: 'Search results', zh: '搜尋結果' },
  allQuestionsTitle: { en: 'All questions', zh: '全部題目' },
  tagHint: { en: 'Tag a question, the next one appears', zh: '標記一條題目，下一條便會出現' },
  searchLabel: { en: 'Search questions', zh: '搜尋題目' },
  searchIn: { en: (topic: string) => `Search in ${topic}`, zh: (topic: string) => spaced`在${topic}中搜尋` },
  searchAll: { en: 'Search every question 搜尋全部題目', zh: '搜尋全部題目' },
  patternsButtonTitle: { en: 'Define, rename, merge or delete your 題型', zh: '定義、重新命名、合併或刪除你的題型' },
  reading: {
    en: (done: number, total: number) => `Reading your worksheets · ${done} of ${total}`,
    zh: (done: number, total: number) => `正在讀取你的工作紙 · ${done} / ${total}`,
  },

  // Empty states
  noDocuments: {
    en: 'Your bank fills itself from the questions in your worksheets. Start one, and every question you write appears here, by topic.',
    zh: '題庫會自動收錄你工作紙中的題目。開始新增一份工作紙，你寫的每條題目都會按課題顯示在這裏。',
  },
  startClassroom: { en: 'Start a classroom worksheet', zh: '開始新增課堂工作紙' },
  noQuestionsYet: {
    en: (where: string) => `No questions${where ? ` in ${where}` : ''} yet. Tag questions with this topic and they appear here.`,
    zh: (where: string) => `${where ? `「${where}」` : ''}尚未有題目。為題目標記這個課題後，它們便會顯示在這裏。`,
  },
  nothingMatches: {
    en: (where: string, filters: string) => `Nothing${where ? ` in ${where}` : ''} matches ${filters}.`,
    zh: (where: string, filters: string) => `${where ? `在「${where}」中` : ''}沒有符合 ${filters} 的題目。`,
  },
  clearFilter: { en: (label: string) => `Clear ${label}`, zh: (label: string) => `清除 ${label}` },

  // Notices and errors
  noLongerSaved: { en: 'Those questions are no longer saved here.', zh: '這些題目已不在儲存的工作紙中。' },
  droppedOne: {
    en: 'Took 1 question off your list: it is no longer in your worksheets.',
    zh: '已將 1 條題目移出清單：它已不在你的工作紙中。',
  },
  droppedMany: {
    en: (n: number) => `Took ${n} questions off your list: they are no longer in your worksheets.`,
    zh: (n: number) => `已將 ${n} 條題目移出清單：它們已不在你的工作紙中。`,
  },
  aWorksheet: { en: 'A worksheet', zh: '一份工作紙' },
  savedIn: {
    en: (n: number) => `Saved in ${n} ${plural(n, 'worksheet')}.`,
    zh: (n: number) => `已儲存於 ${n} 份工作紙。`,
  },
  notChanged: {
    en: (title: string, reason: string) => `“${title}” was not changed: ${reason}.`,
    zh: (title: string, reason: string) => `「${title}」沒有更改：${reason}。`,
  },
  then: { en: (a: string, b: string) => `${a} ${b}`, zh: (a: string, b: string) => `${a}${b}` },
  patternDone: {
    en: (message: string, n: number) => `${message} ${n} ${plural(n, 'worksheet')} changed.`,
    zh: (message: string, n: number) => `${message}已更改 ${n} 份工作紙。`,
  },
  patternAdded: { en: (name: string) => `Added 題型 “${name}”.`, zh: (name: string) => `已新增題型「${name}」。` },
  patternRenamed: { en: (name: string) => `Renamed to “${name}”.`, zh: (name: string) => `已重新命名為「${name}」。` },
  patternMerged: { en: (name: string) => `Merged into “${name}”.`, zh: (name: string) => `已合併到「${name}」。` },
  patternDeleted: { en: (name: string) => `Deleted 題型 “${name}”.`, zh: (name: string) => `已刪除題型「${name}」。` },
});
