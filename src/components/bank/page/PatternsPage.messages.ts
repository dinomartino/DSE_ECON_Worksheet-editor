import { defineMessages } from '@/i18n/catalogue';

/** The 題型 (Pattern) manage page. */
export const PATTERNS_PAGE_MESSAGES = defineMessages({
  intro: {
    en: '題型 (Patterns) are the kinds of question you set within a sub-topic. MCQ and LQ keep separate lists. Renaming, merging or deleting one changes every question that uses it, in every worksheet. Never printed.',
    zh: '題型（Patterns）是你在子課題下設定的題目種類。MCQ 和 LQ 各有獨立的清單。重新命名、合併或刪除題型，會更改所有使用它的題目，涵蓋每份工作紙。題型不會被列印。',
  },
  readOnly: {
    en: 'This 題型 list was saved by a newer version of Econ Studio, so changes to the list cannot be saved here. They last until you close the app. Update Econ Studio to change it.',
    zh: '這份題型清單由較新版本的 Econ Studio 儲存，因此在這裏對清單所作的修改無法儲存，只會保留至你關閉程式為止。請更新 Econ Studio 再修改。',
  },
  show: { en: 'Show', zh: '顯示' },
  allTopics: { en: 'All topics', zh: '全部課題' },
  allSubTopics: { en: (code: string) => `${code} · all sub-topics`, zh: (code: string) => `${code} · 所有子課題` },
  noneIn: {
    en: (where: string) => `No 題型 ${where ? `in ${where} ` : ''}yet. Add one above, or while you set a question's topic.`,
    zh: (where: string) => `${where ? `「${where}」` : ''}尚未有題型。可在上方新增，或在設定題目課題時新增。`,
  },
  typeHeading: { en: (type: string, n: number) => `${type} 題型 · ${n}`, zh: (type: string, n: number) => `${type} 題型 · ${n}` },
  noneYet: { en: 'None yet', zh: '暫時沒有' },

  mergeTitle: {
    en: (name: string, into: string) => `Merge “${name}” into “${into}”?`,
    zh: (name: string, into: string) => `要將「${name}」合併到「${into}」嗎？`,
  },
  mergeText: {
    en: (n: number, name: string, into: string) =>
      `${n} ${n === 1 ? 'question' : 'questions'} filed under “${name}” ${n === 1 ? 'moves' : 'move'} to “${into}”, in every worksheet that holds a copy. “${name}” is then removed.`,
    zh: (n: number, name: string, into: string) =>
      `歸入「${name}」的 ${n} 條題目會移到「${into}」，涵蓋所有含有副本的工作紙。之後「${name}」會被移除。`,
  },
  merge: { en: 'Merge', zh: '合併' },
  cancel: { en: 'Cancel', zh: '取消' },
  deleteTitle: { en: (name: string) => `Delete 題型 “${name}”?`, zh: (name: string) => `要刪除題型「${name}」嗎？` },
  deleteText: {
    en: (n: number) =>
      `${n} ${n === 1 ? 'question' : 'questions'} ${n === 1 ? 'loses' : 'lose'} this 題型, in every worksheet that holds a copy. The questions and their topics stay.`,
    zh: (n: number) => `${n} 條題目會失去這個題型，涵蓋所有含有副本的工作紙。題目及其課題會保留。`,
  },
  deleteUnused: { en: 'No question uses it. It is removed from the list.', zh: '沒有題目使用它。它會從清單中移除。' },
  deleteButton: { en: 'Delete 題型', zh: '刪除題型' },

  typeName: { en: 'Type a name.', zh: '請輸入名稱。' },
  clash: {
    en: (name: string) => `“${name}” is already here. Use Merge to combine them.`,
    zh: (name: string) => `「${name}」已存在。請用「合併」將它們合併。`,
  },
  newNameFor: { en: (name: string) => `New name for ${name}`, zh: (name: string) => `「${name}」的新名稱` },
  save: { en: 'Save', zh: '儲存' },
  mergeInto: { en: (name: string) => `Merge “${name}” into`, zh: (name: string) => `將「${name}」合併到` },
  mergeIntoLabel: { en: (name: string) => `Merge ${name} into`, zh: (name: string) => `將 ${name} 合併到` },
  choosePattern: { en: 'Choose a 題型', zh: '選擇題型' },
  mergeEllipsis: { en: 'Merge…', zh: '合併…' },
  reviewTitle: { en: 'Review these questions', zh: '查看這些題目' },
  questionsLink: {
    en: (n: number) => `${n} ${n === 1 ? 'question' : 'questions'} →`,
    zh: (n: number) => `${n} 條題目 →`,
  },
  notUsed: { en: 'Not used yet', zh: '尚未使用' },
  rename: { en: 'Rename', zh: '重新命名' },
  delete: { en: 'Delete', zh: '刪除' },

  newPattern: { en: 'New 題型', zh: '新增題型' },
  subTopic: { en: 'Sub-topic', zh: '子課題' },
  chooseSubTopic: { en: 'Choose a sub-topic', zh: '選擇子課題' },
  questionType: { en: 'Question type', zh: '題目類型' },
  nameLabel: { en: '題型 name', zh: '題型名稱' },
  namePlaceholder: { en: 'e.g. Calculate PED from a change in TR', zh: '例如：由 TR 的變動計算 PED' },
  add: { en: 'Add', zh: '新增' },
  exists: { en: (name: string) => `“${name}” is already in this list.`, zh: (name: string) => `「${name}」已在這個清單中。` },
  close: {
    en: (name: string) => `Close to “${name}”. Add it only if it is a different 題型.`,
    zh: (name: string) => `與「${name}」相近。只有在它是不同的題型時才新增。`,
  },
});
