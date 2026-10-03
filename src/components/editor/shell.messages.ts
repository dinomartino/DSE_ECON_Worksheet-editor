import { defineMessages } from '@/i18n/catalogue';

/** The toolbar's save status: the word and its tooltip. */
export const SAVE_STATUS_MESSAGES = defineMessages({
  readOnly: { en: 'Read-only', zh: '唯讀' },
  readOnlyDetail: {
    en: 'Read-only: saved by a newer version of Econ Studio, so this copy cannot be changed',
    zh: '唯讀：由較新版本的 Econ Studio 儲存，因此無法修改這份工作紙',
  },
  notSaved: { en: 'Not saved yet', zh: '尚未儲存' },
  notSavedDetail: {
    en: 'Your latest changes are not saved yet. Choose Save now in the ⋯ menu to try again',
    zh: '最新的修改尚未儲存。請在 ⋯ 選單選擇「立即儲存」再試一次',
  },
  saving: { en: 'Saving', zh: '儲存中' },
  savingDetail: { en: 'Saving your changes', zh: '正在儲存修改' },
  saved: { en: 'Saved', zh: '已儲存' },
  savedDetail: {
    en: (time: string) => `All changes saved${time ? ` at ${time}` : ''}`,
    zh: (time: string) => (time ? `所有修改已於 ${time} 儲存` : '所有修改已儲存'),
  },
});

/** The bar's document name and the sidebar's tabs. */
export const SIDEBAR_MESSAGES = defineMessages({
  documentName: { en: 'Document name', zh: '工作紙名稱' },
  renameTitle: {
    en: (name: string) => `${name}. Click to rename`,
    zh: (name: string) => `${name}。按一下即可重新命名`,
  },
  sidebar: { en: 'Sidebar', zh: '側欄' },
  content: { en: 'Content', zh: '內容' },
  edit: { en: 'Edit', zh: '編輯' },
  question: {
    en: (number: string) => `Question ${number}`.trim(),
    zh: (number: string) => `題目 ${number}`.trim(),
  },
  bank: { en: '題庫 Bank', zh: '題庫' },
});

/** The update bar, the start screen's version line and the newer-version notice. */
export const UPDATE_MESSAGES = defineMessages({
  installing: {
    en: (version: string) => `Installing version ${version}. The app will restart in a moment.`,
    zh: (version: string) => `正在安裝 ${version} 版本，軟件稍後會重新啟動。`,
  },
  failed: {
    en: (version: string) =>
      `Version ${version} could not be installed. Try again, or download it from the releases page.`,
    zh: (version: string) => `未能安裝 ${version} 版本。請再試一次，或從發佈頁面下載。`,
  },
  ready: {
    en: (version: string) => `Version ${version} is ready. Restart to finish updating. Your work is saved first.`,
    zh: (version: string) => `${version} 版本已準備好。重新啟動即可完成更新，你的工作會先儲存。`,
  },
  tryAgain: { en: 'Try again', zh: '再試一次' },
  restartNow: { en: 'Restart now', zh: '立即重新啟動' },
  later: { en: 'Later', zh: '稍後' },

  versionLine: { en: (version: string) => `Version ${version}`, zh: (version: string) => `版本 ${version}` },
  checking: { en: 'Checking for updates…', zh: '正在檢查更新…' },
  downloadingBackground: {
    en: (version: string) => `Downloading ${version.trim()} in the background…`,
    zh: (version: string) => `正在背景下載 ${version.trim()}…`,
  },
  installingShort: {
    en: (version: string) => `Installing ${version}. The app will restart…`,
    zh: (version: string) => `正在安裝 ${version}，軟件即將重新啟動…`,
  },
  installFailedShort: {
    en: (version: string) => `${version} could not be installed.`,
    zh: (version: string) => `未能安裝 ${version}。`,
  },
  readyShort: { en: (version: string) => `${version} is ready.`, zh: (version: string) => `${version} 已準備好。` },
  restartToUpdate: { en: 'Restart to update', zh: '重新啟動以更新' },
  downloadFailed: {
    en: (version: string) => `${version} could not be downloaded.`,
    zh: (version: string) => `未能下載 ${version}。`,
  },
  checkFailed: { en: 'Could not check for updates', zh: '未能檢查更新' },
  upToDate: { en: 'Up to date', zh: '已是最新版本' },
  checkUpdates: { en: 'Check for updates', zh: '檢查更新' },

  newerMessage: {
    en: 'This worksheet was saved by a newer version of Econ Studio. Update to edit it safely.',
    zh: '這份工作紙由較新版本的 Econ Studio 儲存。請先更新軟件，才能安全地編輯。',
  },
  newerHint: {
    en: 'Open read-only. Nothing you do here changes the file.',
    zh: '以唯讀方式開啟，你在此所做的操作不會更改檔案。',
  },
  getLatest: { en: 'Get the latest version', zh: '取得最新版本' },
  duplicateEditable: { en: 'Duplicate as editable copy', zh: '建立可編輯的副本' },
  duplicateTitle: {
    en: 'A copy this version can edit. What only the newer version understands is left out of the copy; the original is untouched.',
    zh: '建立這個版本可以編輯的副本。只有較新版本才能理解的內容不會放進副本，原檔案不會被更改。',
  },
  newerChecking: { en: 'Checking…', zh: '檢查中…' },
  newerCheckFailed: {
    en: 'Could not check for updates. Are you online?',
    zh: '未能檢查更新。你的網絡連線正常嗎？',
  },
  newerCurrent: { en: 'No newer version is available yet.', zh: '暫時沒有較新的版本。' },
  newerDownloading: {
    en: (version: string) => `Downloading version ${version}. You will be told when it is ready.`,
    zh: (version: string) => `正在下載 ${version} 版本，準備好後會通知你。`,
  },
  copyFailed: { en: 'Could not save a copy.', zh: '未能儲存副本。' },
});

/** The Export dialog's pre-export check and the toolbar's paper summary chip. */
export const PAPER_CHECK_MESSAGES = defineMessages({
  more: { en: (n: number) => `+${n} more`, zh: (n: number) => `另有 ${n} 題` },
  questions: {
    en: (n: number) => `${n} ${n === 1 ? 'question' : 'questions'}`,
    zh: (n: number) => `${n} 條題目`,
  },
  marks: { en: (n: number) => `${n} ${n === 1 ? 'mark' : 'marks'}`, zh: (n: number) => `${n} 分` },
  estimate: { en: (n: number) => `~${n} min estimate`, zh: (n: number) => `預計約 ${n} 分鐘` },
  allowed: { en: (n: number) => `${n} min allowed`, zh: (n: number) => `限時 ${n} 分鐘` },
  noQuestions: { en: 'No questions yet.', zh: '尚未有題目。' },
  nothingToCheck: { en: 'nothing to check', zh: '沒有需要檢查的項目' },
  paperCheck: { en: 'Paper check', zh: '試卷檢查' },
  keyLetters: { en: 'Answer key letters', zh: '答案字母' },
  warning: { en: 'Warning', zh: '警告' },
  note: { en: 'Note', zh: '備註' },

  overTarget: { en: (list: string) => `Over target: ${list}`, zh: (list: string) => `超出目標：${list}` },
  underTarget: { en: (list: string) => `Under target: ${list}`, zh: (list: string) => `低於目標：${list}` },
  setTarget: { en: 'Set a target in Setup', zh: '在頁面設定中設定目標' },
  beforeFirstSection: { en: 'Before the first section', zh: '第一個部分之前' },
  sectionAnyOf: {
    en: (n: number, of: number) => `(any ${n} of ${of})`,
    zh: (n: number, of: number) => `（${of} 選 ${n}）`,
  },
  // Findings: the English is `model/paperHealth.ts`'s sentence, the Chinese its reading.
  fEmpty: {
    en: (n: number) => `${n} ${n === 1 ? 'question is' : 'questions are'} empty and will print as a bare number.`,
    zh: (n: number) => `${n} 條題目是空白的，列印時只會顯示題號。`,
  },
  fUnkeyed: {
    en: (n: number) => `${n} ${n === 1 ? 'MCQ has' : 'MCQs have'} no correct answer set.`,
    zh: (n: number) => `${n} 條 MCQ 尚未設定正確答案。`,
  },
  fBlankOption: {
    en: (n: number) => `${n} ${n === 1 ? 'MCQ has' : 'MCQs have'} a blank option.`,
    zh: (n: number) => `${n} 條 MCQ 有空白選項。`,
  },
  fDuplicateOptions: {
    en: (n: number) => `${n} ${n === 1 ? 'MCQ has' : 'MCQs have'} two options with the same wording.`,
    zh: (n: number) => `${n} 條 MCQ 有兩個選項的文字相同。`,
  },
  fBalance: {
    en: (letter: string, count: number, n: number, share: string, fair: string, only: boolean) =>
      `${letter} is the answer to ${only ? 'only ' : ''}${count} of ${n} MCQs (${share}); a fair key gives each letter about ${fair}.`,
    zh: (letter: string, count: number, n: number, share: string, fair: string, only: boolean) =>
      `${n} 條 MCQ 中，${only ? '只有' : ''} ${count} 條的答案是 ${letter}（${share}）；均衡的答案每個選項約佔 ${fair}。`,
  },
  fRun: {
    en: (n: number, letter: string) => `${n} questions in a row have answer ${letter}.`,
    zh: (n: number, letter: string) => `連續 ${n} 條題目的答案都是 ${letter}。`,
  },
  fUntranslated: {
    en: (n: number) => `${n} ${n === 1 ? 'string is' : 'strings are'} written in one language only.`,
    zh: (n: number) => `${n} 段文字只有一種語言。`,
  },
  fTerminology: {
    en: (n: number) => `${n} ${n === 1 ? 'term differs' : 'terms differ'} from the EDB glossary.`,
    zh: (n: number) => `${n} 個詞語與教育局詞彙表不同。`,
  },
  fUnanswered: {
    en: (n: number) => `${n} ${n === 1 ? 'question has' : 'questions have'} parts with no teacher answer.`,
    zh: (n: number) => `${n} 條題目有分題沒有教師答案。`,
  },
  fSchemeMarks: {
    en: (n: number) =>
      `${n} ${n === 1 ? 'question has' : 'questions have'} a marking scheme that totals differently from the marks printed.`,
    zh: (n: number) => `${n} 條題目的評分方案總分與試卷印出的分數不同。`,
  },
  fUnmarked: {
    en: (n: number) => `${n} ${n === 1 ? 'question carries' : 'questions carry'} no marks.`,
    zh: (n: number) => `${n} 條題目沒有分數。`,
  },
  fTime: {
    en: (est: number, stated: number, longer: boolean) =>
      `The estimate (~${est} min) is ${longer ? 'longer' : 'shorter'} than the ${stated} min allowed.`,
    zh: (est: number, stated: number, longer: boolean) =>
      `預計時間（約 ${est} 分鐘）比限時 ${stated} 分鐘${longer ? '長' : '短'}。`,
  },
  fOver: { en: (list: string) => `Over target: ${list}.`, zh: (list: string) => `超出目標：${list}。` },
  fUnder: { en: (list: string) => `Under target: ${list}.`, zh: (list: string) => `低於目標：${list}。` },
  summaryAria: { en: (parts: string) => `Paper summary: ${parts}`, zh: (parts: string) => `試卷摘要：${parts}` },
});

/** The page rail (thumbnails) and its delete confirmation. */
export const PAGE_RAIL_MESSAGES = defineMessages({
  pages: { en: 'Pages', zh: '頁面' },
  collapseAria: { en: 'Collapse page rail', zh: '收起頁面列' },
  collapse: { en: 'Collapse', zh: '收起' },
  cover: { en: 'Cover', zh: '封面' },
  coverAria: {
    en: (current: boolean) => `Cover page${current ? ', current' : ''}`,
    zh: (current: boolean) => `封面${current ? '（目前）' : ''}`,
  },
  pageAria: {
    en: (n: number, current: boolean) => `Page ${n}${current ? ', current' : ''}`,
    zh: (n: number, current: boolean) => `第 ${n} 頁${current ? '（目前）' : ''}`,
  },
  deletePage: { en: (n: number) => `Delete page ${n}`, zh: (n: number) => `刪除第 ${n} 頁` },
  deleteTitle: { en: (n: number) => `Delete page ${n}?`, zh: (n: number) => `刪除第 ${n} 頁？` },
  itemsRemoved: {
    en: (n: number) =>
      n === 1 ? 'The one item on this page will be removed.' : `All ${n} items on this page will be removed.`,
    zh: (n: number) => (n === 1 ? '此頁的 1 個項目將被刪除。' : `此頁的全部 ${n} 個項目將被刪除。`),
  },
  undoHint: { en: 'You can undo this with ⌘Z.', zh: '你可以按 ⌘Z 復原。' },
  cancel: { en: 'Cancel', zh: '取消' },
  deleteButton: { en: 'Delete page', zh: '刪除此頁' },
  showRail: { en: 'Show page rail', zh: '顯示頁面列' },
});
