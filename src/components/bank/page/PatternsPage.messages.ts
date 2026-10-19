import { defineMessages } from '@/i18n/catalogue';

const questions = (n: number) => `${n} ${n === 1 ? 'question' : 'questions'}`;

/** The 題型 map (question patterns): where to start sorting, the per-sub-topic lists, and their actions. */
export const PATTERNS_PAGE_MESSAGES = defineMessages({
  heading: { en: 'Sort your questions into 題型', zh: '把題目分成不同題型' },
  intro: {
    en: 'Group the questions you set into kinds, like a revision book’s sections. Then find the kind you need in a click, here, in the review list and in the editor’s 題庫 tab. Never printed.',
    zh: '像溫習書的分類一樣，把你出的題目分成不同題型。之後在這裏、題目清單或編輯器的「題庫」分頁，一按便找到所需的題目。題型不會被列印。',
  },
  status: {
    en: (n: number, sorted: number, patterns: number) =>
      sorted === 0 && patterns === 0 ? `${questions(n)} · none sorted yet` : `${questions(n)} · ${sorted} sorted · ${patterns} 題型`,
    zh: (n: number, sorted: number, patterns: number) =>
      sorted === 0 && patterns === 0 ? `${n} 條題目 · 尚未分類` : `${n} 條題目 · 已分類 ${sorted} 條 · ${patterns} 個題型`,
  },
  readOnly: {
    en: 'This 題型 list was saved by a newer version of Econ Studio, so changes to the list cannot be saved here. They last until you close the app. Update Econ Studio to change it.',
    zh: '這份題型清單由較新版本的 Econ Studio 儲存，因此在這裏對清單所作的修改無法儲存，只會保留至你關閉程式為止。請更新 Econ Studio 再修改。',
  },
  show: { en: 'Show', zh: '顯示' },
  allTopics: { en: 'All topics', zh: '全部課題' },
  allSubTopics: { en: (code: string) => `${code} · all sub-topics`, zh: (code: string) => `${code} · 所有子課題` },
  showEmpty: { en: 'Show sub-topics with no questions', zh: '顯示沒有題目的子課題' },

  // No 題型 yet
  pickTopic: { en: 'Pick a topic to start', zh: '選一個課題開始' },
  mostFirst: { en: 'Most questions to sort first', zh: '待分類題目最多的排先' },
  topicCount: {
    en: (n: number, subTopics: number) => `${n} to sort · ${subTopics} ${subTopics === 1 ? 'sub-topic' : 'sub-topics'}`,
    zh: (n: number, subTopics: number) => `${n} 條待分類 · ${subTopics} 個子課題`,
  },
  sortTopic: { en: (code: string) => `Sort ${code} →`, zh: (code: string) => `分類 ${code} →` },
  sortTopicLabel: { en: (name: string) => `Sort ${name}`, zh: (name: string) => `分類「${name}」` },
  otherTopics: { en: 'Other topics:', zh: '其他課題：' },
  example: { en: 'What a sorted sub-topic looks like', zh: '分類後的樣子' },
  exampleNote: { en: 'Example', zh: '示例' },
  // Three ways teachers name a 題型, in the language they are often written in (user,
  // 2026-10-19): a command and a concept, two concepts, a cause and its effect.
  example1: { en: '計算需求價格彈性', zh: '計算需求價格彈性' },
  example2: { en: 'Per unit tax & elasticity', zh: 'Per unit tax & elasticity' },
  example3: { en: 'Elastic demand → a price rise cuts TR', zh: 'Elastic demand → a price rise cuts TR' },
  emptyLibrary: {
    en: 'Your 題型 map fills as you write questions. Once a worksheet has questions with topics, come back to sort them.',
    zh: '你寫題目後，題型一覽便會逐步建立。當工作紙有已標記課題的題目，再回來把它們分類。',
  },
  startClassroom: { en: 'Start a classroom worksheet', zh: '開始新增課堂工作紙' },
  noSubTopic: {
    en: 'None of your questions has a sub-topic yet. A 題型 sits under a sub-topic, so tag your questions with one first.',
    zh: '你的題目都未有子課題。題型屬於子課題，請先為題目標記子課題。',
  },

  // In use
  keepGoing: { en: 'Keep going', zh: '繼續分類' },
  notSortedIn: { en: (n: number) => `${n} not sorted`, zh: (n: number) => `${n} 條未分類` },
  stillToSort: { en: 'Not sorted yet:', zh: '尚未分類：' },
  boxCounts: {
    en: (n: number, without: number) => `${questions(n)}${without ? ` · ${without} not sorted` : ''}`,
    zh: (n: number, without: number) => `${n} 條題目${without ? ` · ${without} 條未分類` : ''}`,
  },
  noPatternLine: { en: 'Not sorted', zh: '未分類' },
  sortThese: { en: 'Sort these →', zh: '分類這些題目 →' },
  noQuestionsYet: { en: 'No questions yet', zh: '尚未有題目' },
  sortInto: { en: 'Sort into it →', zh: '把題目分類到這裏 →' },
  noneIn: {
    en: (where: string) => `No 題型 or questions ${where ? `in ${where} ` : ''}yet.`,
    zh: (where: string) => `${where ? `「${where}」` : ''}尚未有題型或題目。`,
  },

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
    en: (n: number) => `${questions(n)} →`,
    zh: (n: number) => `${n} 條題目 →`,
  },
  questionCount: { en: (n: number) => questions(n), zh: (n: number) => `${n} 條題目` },
  rename: { en: 'Rename', zh: '重新命名' },
  delete: { en: 'Delete', zh: '刪除' },
  actionsFor: { en: (name: string) => `Rename, merge or delete ${name}`, zh: (name: string) => `重新命名、合併或刪除「${name}」` },

  newPattern: { en: 'New 題型', zh: '新增題型' },
  newHere: { en: '+ New 題型 here', zh: '+ 在此新增題型' },
  newIn: { en: (where: string) => `New 題型 in ${where}`, zh: (where: string) => `在「${where}」新增題型` },
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
