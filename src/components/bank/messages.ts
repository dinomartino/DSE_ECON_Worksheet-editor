import { defineMessages } from '@/i18n/catalogue';

/** The editor's 題庫 tab: filters, Fill, states and the empty-result sentence. */
export const BANK_TAB_MESSAGES = defineMessages({
  readOnly: { en: 'This paper is read-only.', zh: '此工作紙為唯讀。' },
  leavePreview: { en: 'Leave print preview to drag questions in.', zh: '離開列印預覽後，才能拖入題目。' },
  dragHint: { en: 'Drag a question onto the page', zh: '拖曳題目到頁面上插入' },
  searchBank: { en: 'Search the bank', zh: '搜尋題庫' },
  searchPlaceholder: { en: 'Search 搜尋 · both languages', zh: '搜尋 · 中英文皆可' },
  topic: { en: 'Topic', zh: '課題' },
  type: { en: 'Type', zh: '類型' },
  marks: { en: 'Marks', zh: '分數' },
  classLabel: { en: 'Class', zh: '班別' },
  from: { en: 'From', zh: '來源' },
  anyTopic: { en: 'Any topic', zh: '任何課題' },
  anyType: { en: 'Any type', zh: '任何類型' },
  anyClass: { en: 'Any class', zh: '任何班別' },
  notUsedWith: { en: (c: string) => `Not used with ${c}`, zh: (c: string) => `未用於 ${c}` },
  fromAll: { en: 'From: all worksheets', zh: '來源：所有工作紙' },
  fromBanks: { en: 'From: banks', zh: '來源：題庫文件' },
  fromDoc: { en: (title: string) => `From: ${title}`, zh: (title: string) => `來源：${title}` },
  allOfTopic: {
    en: (code: string, name: string) => `All of ${code} · ${name}`,
    zh: (code: string, name: string) => `全部 ${code} · ${name}`,
  },
  bandAny: { en: 'Any marks', zh: '任何分數' },
  band1: { en: '1 mark', zh: '1 分' },
  band2to4: { en: '2–4 marks', zh: '2–4 分' },
  band5to8: { en: '5–8 marks', zh: '5–8 分' },
  band9: { en: '9+ marks', zh: '9+ 分' },
  scanning: { en: 'Reading your worksheets', zh: '正在讀取你的工作紙' },
  scanProgress: {
    en: (done: number, total: number) => ` · ${done} of ${total}`,
    zh: (done: number, total: number) => ` · ${done} / ${total}`,
  },
  scanError: { en: 'Your worksheets could not be read.', zh: '無法讀取你的工作紙。' },
  tryAgain: { en: 'Try again', zh: '再試一次' },
  bankEmpty: {
    en: 'Your bank fills itself from the questions in your saved worksheets.',
    zh: '題庫會自動收錄你已儲存工作紙中的題目。',
  },
  bankEmptyHint: {
    en: 'Save another worksheet with questions and they appear here.',
    zh: '再儲存另一份有題目的工作紙，題目便會出現在這裏。',
  },
  clearFilterBtn: { en: (what: string) => `Clear ${what}`, zh: (what: string) => `清除${what}` },
  clearFilters: { en: 'Clear filters', zh: '清除篩選' },
  filterText: { en: (t: string) => `“${t}”`, zh: (t: string) => `「${t}」` },
  filterNotUsed: { en: (c: string) => `not used with ${c}`, zh: (c: string) => `未用於 ${c}` },
  filterBanksOnly: { en: 'banks only', zh: '僅題庫文件' },
  filterFrom: { en: (title: string) => `from ${title}`, zh: (title: string) => `來自${title}` },
  filterOneWorksheet: { en: 'one worksheet', zh: '一份工作紙' },
  filterMarks: { en: 'marks', zh: '分數' },
  showMore: { en: (n: number) => `Show ${n} more`, zh: (n: number) => `再顯示 ${n} 條` },
  skipped: {
    en: (n: number) =>
      `${n} question${n === 1 ? '' : 's'} changed since the bank was read, so ${n === 1 ? 'it was' : 'they were'} skipped.`,
    zh: (n: number) => `有 ${n} 條題目在讀取題庫後已被修改，因此已略過。`,
  },
  fallbackLabel: { en: 'Question', zh: '題目' },
  // Where an insert lands. In 中文 each is a verb phrase, so "Adds …" reads whole.
  whereSplit: { en: 'in the section for its type', zh: '加到各題目類型所屬的部分' },
  whereAfter: { en: (anchor: string) => `after ${anchor}`, zh: (anchor: string) => `加到 ${anchor} 之後` },
  whereIn: { en: (section: string) => `in ${section}`, zh: (section: string) => `加到 ${section}` },
  whereEnd: { en: 'at the end', zh: '加到最後' },
  addsWhere: { en: (where: string) => `Adds ${where}`, zh: (where: string) => `${where}` },
  rowHint: {
    en: (where: string) =>
      `Drag onto the page, or press Enter to insert ${where}. Up and down arrows move between questions.`,
    zh: (where: string) => `拖到頁面上，或按 Enter ${where}。按上下方向鍵可在題目間移動。`,
  },
  fill: { en: 'Fill', zh: '填入' },
  howMany: { en: 'How many', zh: '數量' },
  fillType: { en: 'Fill type', zh: '填入類型' },
  fillQuestions: { en: 'questions', zh: '題目' },
  fillFrom: { en: 'from', zh: '來自' },
  fillTopic: { en: 'Fill topic', zh: '填入課題' },
  anyTopicLower: { en: 'any topic', zh: '任何課題' },
  addN: {
    en: (n: number) => `Add ${n} ${n === 1 ? 'question' : 'questions'}`,
    zh: (n: number) => `加入 ${n} 條題目`,
  },
  nothingLeft: { en: (topic: string) => `Nothing left in ${topic}.`, zh: (topic: string) => `${topic}已沒有可用的題目。` },
  alreadyUsed: {
    en: (n: number, c: string) => `${n} already used with ${c}`,
    zh: (n: number, c: string) => `有 ${n} 條已用於 ${c}`,
  },
  onlyLeft: {
    en: (n: number, topic: string) => `Only ${n} left in ${topic}.`,
    zh: (n: number, topic: string) => `${topic}只剩 ${n} 條。`,
  },
  noneUsed: {
    en: (c: string, where: string) => `None used with ${c} · adds ${where}`,
    zh: (c: string, where: string) => `沒有已用於 ${c} 的題目 · ${where}`,
  },
  undoesOne: {
    en: (where: string) => `Adds ${where} · one ⌘Z undoes it`,
    zh: (where: string) => `${where} · ⌘Z 可一次復原`,
  },
  // tabText: the sentence for a filter that matched nothing, and the paper's usual types.
  noQuestions: { en: 'questions', zh: '題目' },
  typeNounShort: { en: (label: string) => `${label}s`, zh: (label: string) => `${label} 題目` },
  typeNounLong: { en: (label: string) => `${label.toLowerCase()} questions`, zh: (label: string) => `${label} 題目` },
  emptyIn: { en: (t: string) => `in ${t}`, zh: (t: string) => `課題：${t}` },
  emptyWorth: { en: (b: string) => `worth ${b}`, zh: (b: string) => `分數：${b}` },
  emptyMatching: { en: (t: string) => `matching “${t}”`, zh: (t: string) => `包含「${t}」` },
  emptyNotUsed: { en: (c: string) => `not used with ${c}`, zh: (c: string) => `未用於 ${c}` },
  emptyBanks: { en: 'in your banks', zh: '來源：題庫文件' },
  emptyDoc: { en: 'in that worksheet', zh: '來源：該工作紙' },
  emptySentence: {
    en: (noun: string, rest: string) => `No ${noun}${rest ? ` ${rest}` : ''}.`,
    zh: (noun: string, rest: string) => `沒有符合條件的${noun}${rest ? `（${rest}）` : ''}。`,
  },
  paperTakes: {
    en: (takes: string) => `This paper usually takes ${takes} only.`,
    zh: (takes: string) => `此工作紙通常只包含 ${takes}。`,
  },
  listAnd: { en: ' and ', zh: '及 ' },
  listComma: { en: ' ', zh: '，' },
});

/** One bank row and the small labels the Question bank page shares with it. */
export const BANK_ROW_MESSAGES = defineMessages({
  untitled: { en: 'Untitled question', zh: '未命名題目' },
  dragOnto: { en: 'Drag onto the page', zh: '拖到頁面上' },
  diagram: { en: '◩ diagram', zh: '◩ 圖表' },
  inPaper: { en: 'In this paper', zh: '已在此工作紙' },
  versions: { en: (n: number) => `${n} versions`, zh: (n: number) => `${n} 個版本` },
  partsTest: {
    en: (parts: string, count: number, topic: string) => `${parts} ${count === 1 ? 'tests' : 'test'} ${topic}`,
    zh: (parts: string, _count: number, topic: string) => `${parts} 考核 ${topic}`,
  },
  partsJoin: {
    en: ' and ',
    zh: '、',
  },
  chineseOnly: { en: '中文 only', zh: '僅有中文' },
  englishOnly: { en: 'English only', zh: '僅有英文' },
  marks: { en: (n: number) => `${n} ${n === 1 ? 'mark' : 'marks'}`, zh: (n: number) => `${n} 分` },
  usedWith: {
    en: (classes: string, month: string) => `Used with ${classes || 'this class'}${month ? ` · ${month}` : ''}`,
    zh: (classes: string, month: string) => `已用於 ${classes || '此班別'}${month ? ` · ${month}` : ''}`,
  },
  noClass: { en: 'No class', zh: '沒有班別' },
  edited: { en: 'Edited further down', zh: '後面部分有修改' },
  reworded: { en: 'Reworded', zh: '措辭不同' },
  says: { en: (snippet: string) => `Says “${snippet}”`, zh: (snippet: string) => `內容為「${snippet}」` },
});

export const BANK_REVIEW_MESSAGES = defineMessages({
  added: {
    en: (n: number) => `${n} question${n === 1 ? '' : 's'} added from 題庫`,
    zh: (n: number) => `已從題庫加入 ${n} 條題目`,
  },
  previous: { en: 'Previous', zh: '上一個' },
  next: { en: 'Next', zh: '下一個' },
  undo: { en: 'Undo', zh: '復原' },
  done: { en: 'Done', zh: '完成' },
  release: { en: 'Release to insert here · Esc cancels', zh: '放開即可插入此處 · Esc 取消' },
  drop: { en: 'Drop between questions · Esc cancels', zh: '拖到題目之間放開 · Esc 取消' },
});

export const PATTERN_PICKER_MESSAGES = defineMessages({
  noPattern: { en: 'No 題型', zh: '未有題型' },
  clearedOnSave: { en: '· cleared on save', zh: '· 儲存時清除' },
  keep: {
    en: (kind: string, topic: string) => `Keep the ${kind} 題型 under ${topic}`,
    zh: (kind: string, topic: string) => `保留${topic}下的 ${kind} 題型`,
  },
  clear: { en: 'Clear 題型', zh: '清除題型' },
  change: {
    en: (value: string, kind: string) => `${value} · change the ${kind} 題型`,
    zh: (value: string, kind: string) => `${value} · 更改 ${kind} 題型`,
  },
  remove: { en: (value: string) => `Remove 題型 ${value}`, zh: (value: string) => `移除題型 ${value}` },
  add: { en: '+ Add 題型', zh: '+ 新增題型' },
  inputLabel: {
    en: (kind: string, topic: string) => `${kind} 題型 for ${topic}`,
    zh: (kind: string, topic: string) => `${topic}的 ${kind} 題型`,
  },
  placeholder: {
    en: (kind: string) => `Pick an ${kind} 題型 or type a new one`,
    zh: (kind: string) => `選擇 ${kind} 題型，或輸入新名稱`,
  },
  listLabel: {
    en: (kind: string, topic: string) => `${kind} 題型 under ${topic}`,
    zh: (kind: string, topic: string) => `${topic}下的 ${kind} 題型`,
  },
  similar: { en: 'similar', zh: '相近' },
  newPattern: { en: (name: string) => `New 題型 “${name}”`, zh: (name: string) => `新增題型「${name}」` },
  close: {
    en: (name: string) => `Close to “${name}”. Pick it above if it is the same 題型.`,
    zh: (name: string) => `與「${name}」相近。若是同一題型，請選上面的項目。`,
  },
  none: {
    en: (kind: string) => `No ${kind} 題型 here yet. Type a name to create one.`,
    zh: (kind: string) => `這裏還沒有 ${kind} 題型。輸入名稱即可建立。`,
  },
  keys: { en: '↑↓ to move · Enter to pick', zh: '↑↓ 移動 · Enter 選取' },
  cancel: { en: 'Cancel', zh: '取消' },
  readOnly: {
    en: 'The 題型 list is from a newer version of Econ Studio, so a new name is not saved to it.',
    zh: '題型清單由較新版本的 Econ Studio 儲存，因此新名稱不會存入清單。',
  },
});
