import { defineMessages } from '@/i18n/catalogue';

const questions = (n: number) => `${n} ${n === 1 ? 'question' : 'questions'}`;

/** The 題型 map (question patterns): first run, the per-sub-topic lists, and their actions. */
export const PATTERNS_PAGE_MESSAGES = defineMessages({
  intro: {
    en: 'A 題型 (question pattern) is a kind of question you set within one sub-topic, like a revision book’s sections: “Calculate PED”, “PED and total revenue”, “Explain the change in TR with a diagram”. Group your questions by them, then find the kind you need in a click, here, in the review list and in the editor’s 題庫 tab. Never printed.',
    zh: '題型是你在一個子課題下設定的題目種類，就像溫習書的分類：「計算 PED」、「PED 與總收益」、「以圖解釋 TR 的變動」。把題目按題型分組後，在這裏、題目清單或編輯器的「題庫」分頁，一按便找到所需的題目。題型不會被列印。',
  },
  readOnly: {
    en: 'This 題型 list was saved by a newer version of Econ Studio, so changes to the list cannot be saved here. They last until you close the app. Update Econ Studio to change it.',
    zh: '這份題型清單由較新版本的 Econ Studio 儲存，因此在這裏對清單所作的修改無法儲存，只會保留至你關閉程式為止。請更新 Econ Studio 再修改。',
  },
  show: { en: 'Show', zh: '顯示' },
  allTopics: { en: 'All topics', zh: '全部課題' },
  allSubTopics: { en: (code: string) => `${code} · all sub-topics`, zh: (code: string) => `${code} · 所有子課題` },
  showEmpty: { en: 'Show sub-topics with no questions', zh: '顯示沒有題目的子課題' },

  // First run
  example: { en: 'What it looks like', zh: '效果示例' },
  exampleNote: { en: 'Example only', zh: '僅為示例' },
  example1: { en: 'Calculate PED from price and quantity', zh: '由價格和數量計算 PED' },
  example2: { en: 'PED and total revenue', zh: 'PED 與總收益' },
  example3: { en: 'Explain the change in TR with a diagram', zh: '以圖解釋 TR 的變動' },
  emptyLibrary: {
    en: 'Your 題型 map fills as you write questions. Once a worksheet has questions with topics, come back to group them.',
    zh: '你寫題目後，題型一覽便會逐步建立。當工作紙有已標記課題的題目，再回來把它們分組。',
  },
  startClassroom: { en: 'Start a classroom worksheet', zh: '開始新增課堂工作紙' },
  startHere: { en: 'Start where you have the most questions', zh: '從題目最多的子課題開始' },
  startHint: {
    en: 'Open the questions, then give each one a 題型 with Edit beside its Topics. Or name the 題型 here first.',
    zh: '打開題目，在「課題」旁按「編輯」為每條題目設定題型；或先在這裏為題型命名。',
  },
  noSubTopic: {
    en: 'None of your questions has a sub-topic yet. A 題型 sits under a sub-topic, so tag your questions with one first.',
    zh: '你的題目都未有子課題。題型屬於子課題，請先為題目標記子課題。',
  },
  nameAny: { en: 'Or name one for any sub-topic:', zh: '或為任何子課題命名題型：' },

  // In use
  summary: {
    en: (inUse: number, unused: number) => `${inUse} 題型 in use${unused ? ` · ${unused} not used yet` : ''}`,
    zh: (inUse: number, unused: number) => `${inUse} 個題型使用中${unused ? ` · ${unused} 個尚未使用` : ''}`,
  },
  boxCounts: {
    en: (n: number, without: number) => `${questions(n)}${without ? ` · ${without} without a 題型` : ''}`,
    zh: (n: number, without: number) => `${n} 條題目${without ? ` · ${without} 條未有題型` : ''}`,
  },
  noPatternLine: { en: 'No 題型', zh: '未有題型' },
  noPatternYet: { en: 'No 題型 yet', zh: '尚未有題型' },
  reviewThese: { en: 'Review these →', zh: '查看這些題目 →' },
  reviewTheseTitle: {
    en: 'Open these questions, then set each one’s 題型 with Edit beside its Topics',
    zh: '打開這些題目，再在「課題」旁按「編輯」設定題型',
  },
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
  chooseSubTopicFirst: { en: 'Choose a sub-topic first.', zh: '請先選擇子課題。' },
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
  notUsed: { en: 'Not used yet', zh: '尚未使用' },
  rename: { en: 'Rename', zh: '重新命名' },
  delete: { en: 'Delete', zh: '刪除' },
  actionsFor: { en: (name: string) => `Rename, merge or delete ${name}`, zh: (name: string) => `重新命名、合併或刪除「${name}」` },

  newPattern: { en: 'New 題型', zh: '新增題型' },
  newHere: { en: '+ New 題型 here', zh: '+ 在此新增題型' },
  newIn: { en: (where: string) => `New 題型 in ${where}`, zh: (where: string) => `在「${where}」新增題型` },
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
