import { defineMessages } from '@/i18n/catalogue';

/** The start screen's dialogs, notices, errors and menus (the left panel is in `messages.ts`). */
export const START_SCREEN_MESSAGES = defineMessages({
  dismiss: { en: 'Dismiss', zh: '關閉' },
  untitled: { en: 'Untitled', zh: '未命名' },
  cancel: { en: 'Cancel', zh: '取消' },
  andMore: { en: (n: number) => `and ${n} more`, zh: (n: number) => `另外 ${n} 項` },
  // Errors and notices.
  notFound: {
    en: (desktop: boolean) => `That worksheet is no longer in this ${desktop ? 'computer' : 'browser'}’s storage.`,
    zh: (desktop: boolean) => `這份工作紙已不在這${desktop ? '部電腦' : '個瀏覽器'}的儲存空間內。`,
  },
  couldNotOpen: { en: 'Could not open that worksheet.', zh: '無法開啟這份工作紙。' },
  couldNotOpenFile: { en: 'Could not open that file.', zh: '無法開啟該檔案。' },
  folderChangeFailed: { en: 'Could not save that folder change.', zh: '無法儲存資料夾的變更。' },
  trashFailed: { en: 'Could not move that worksheet to the Trash.', zh: '無法將這份工作紙移至垃圾桶。' },
  restored: { en: (title: string) => `Restored “${title}”.`, zh: (title: string) => `已還原「${title}」。` },
  notInTrash: { en: 'That worksheet is no longer in the Trash.', zh: '這份工作紙已不在垃圾桶內。' },
  couldNotRestore: { en: 'Could not restore that worksheet.', zh: '無法還原這份工作紙。' },
  nothingToBackUp: { en: 'There is nothing saved to back up yet.', zh: '尚未儲存任何內容，沒有東西可備份。' },
  backedUp: {
    en: (docs: number, graphs: number, unreadable: number) =>
      `Backed up ${docs === 1 ? '1 document' : `${docs} documents`}${
        graphs > 0 ? ` and ${graphs === 1 ? '1 graph' : `${graphs} graphs`}` : ''
      }.` +
      (unreadable > 0
        ? ` ${unreadable === 1 ? '1 document' : `${unreadable} documents`} could not be read and ${
            unreadable === 1 ? 'is' : 'are'
          } not in it.`
        : ''),
    zh: (docs: number, graphs: number, unreadable: number) =>
      `已備份 ${docs} 份工作紙${graphs > 0 ? `及 ${graphs} 個圖表` : ''}。` +
      (unreadable > 0 ? `有 ${unreadable} 份工作紙無法讀取，未包含在備份內。` : ''),
  },
  couldNotWriteBackup: { en: 'Could not write the backup.', zh: '無法寫入備份。' },
  couldNotReadBackup: { en: 'Could not read that backup.', zh: '無法讀取該備份。' },
  couldNotReadFile: {
    en: (name: string, reason: string) => `Could not read “${name}”${reason ? `: ${reason}` : ''}.`,
    zh: (name: string, reason: string) => `無法讀取「${name}」${reason ? `：${reason}` : ''}。`,
  },
  couldNotBeRead: { en: 'could not be read', zh: '無法讀取' },
  couldNotImport: { en: 'Could not import those files.', zh: '無法匯入這些檔案。' },
  couldNotOpenSavedFolder: { en: 'Could not open the saved worksheets folder.', zh: '無法開啟已儲存工作紙的資料夾。' },
  couldNotOpenExportsFolder: { en: 'Could not open the exports folder.', zh: '無法開啟匯出資料夾。' },
  couldNotShowFile: { en: 'Could not show that file.', zh: '無法顯示該檔案。' },
  openFilterName: { en: 'Worksheet or backup', zh: '工作紙或備份' },
  paperFilterName: { en: 'Word, PDF or picture', zh: 'Word、PDF 或圖片' },
  // The ⋯ menu beside the document count.
  backingUp: { en: 'Backing up…', zh: '備份中…' },
  backUpAll: { en: 'Back up all…', zh: '全部備份…' },
  restoring: { en: 'Restoring…', zh: '還原中…' },
  restoreFromBackup: { en: 'Restore from backup…', zh: '從備份還原…' },
  showSaved: { en: 'Show saved worksheets', zh: '顯示已儲存的工作紙' },
  showExports: { en: 'Show exports folder', zh: '顯示匯出資料夾' },
  // New worksheet dialog.
  newTitle: { en: 'New worksheet', zh: '新增工作紙' },
  newDescription: {
    en: 'Name it, then press Create. Everything else has a default and is awkward to change once questions are written.',
    zh: '先為它命名，再按「建立」。其餘設定都有預設值，但寫好題目後便不容易更改。',
  },
  createWorksheet: { en: 'Create worksheet', zh: '建立工作紙' },
  // Folder dialogs.
  deleteFolderTitle: {
    en: (name: string) => `Delete the folder “${name}”?`,
    zh: (name: string) => `刪除資料夾「${name}」？`,
  },
  deleteFolder: { en: 'Delete folder', zh: '刪除資料夾' },
  folderDocsMove: {
    en: (n: number) =>
      `${n === 1 ? 'Its document moves' : `Its ${n} documents move`} to All documents. No document is deleted.`,
    zh: (n: number) => `${n} 份工作紙會移至「所有工作紙」。不會刪除任何工作紙。`,
  },
  untitledFolder: { en: 'Untitled folder', zh: '未命名資料夾' },
  renameFolder: { en: 'Rename folder', zh: '重新命名資料夾' },
  newFolder: { en: 'New folder', zh: '新增資料夾' },
  filedIn: { en: (title: string) => `“${title}” will be filed in it.`, zh: (title: string) => `「${title}」會放入這個資料夾。` },
  folderHelp: {
    en: 'Folders group documents here; a document can be in one folder.',
    zh: '資料夾用來整理工作紙；每份工作紙只能放在一個資料夾內。',
  },
  rename: { en: 'Rename', zh: '重新命名' },
  createAndMove: { en: 'Create and move', zh: '建立並移入' },
  createFolder: { en: 'Create folder', zh: '建立資料夾' },
  folderPlaceholder: { en: 'e.g. S5 2026-27, Mocks', zh: '例如：中五 2026-27、Mock' },
  moveTitle: { en: (title: string) => `Move “${title}”`, zh: (title: string) => `移動「${title}」` },
  moveDescription: {
    en: 'It stays in All documents wherever it is filed.',
    zh: '無論放在哪個資料夾，它都會保留在「所有工作紙」內。',
  },
  newFolderEllipsis: { en: 'New folder…', zh: '新增資料夾…' },
  noFolder: { en: 'No folder', zh: '不放入資料夾' },
  hereNow: { en: 'Here now', zh: '目前位置' },
  // Trash confirmations.
  trashTitle: { en: (title: string) => `Move “${title}” to Trash?`, zh: (title: string) => `將「${title}」移至垃圾桶？` },
  trashBody: {
    en: (days: number) => `You can restore it from the Trash for ${days} days. After that it is deleted for good.`,
    zh: (days: number) => `你可在 ${days} 日內從垃圾桶還原。之後會被永久刪除。`,
  },
  moveToTrash: { en: 'Move to Trash', zh: '移至垃圾桶' },
  purgeTitle: { en: (title: string) => `Delete “${title}” forever?`, zh: (title: string) => `永久刪除「${title}」？` },
  purgeBody: {
    en: (desktop: boolean) => `It is stored ${desktop ? 'on this computer' : 'in this browser'} only, so this cannot be undone.`,
    zh: (desktop: boolean) => `它只儲存在這${desktop ? '部電腦' : '個瀏覽器'}，因此無法復原。`,
  },
  deleteForever: { en: 'Delete forever', zh: '永久刪除' },
  emptyTitle: { en: 'Empty the Trash?', zh: '清空垃圾桶？' },
  emptyBody: {
    en: (n: number) => `${n === 1 ? '1 document' : `${n} documents`} will be deleted for good. This cannot be undone.`,
    zh: (n: number) => `${n} 份工作紙將被永久刪除，此操作無法復原。`,
  },
  emptyTrash: { en: 'Empty Trash', zh: '清空垃圾桶' },
  // Dropping files on the screen.
  dropHint: {
    en: 'Drop a .json to open it, a backup .zip to restore it, or Word, PDF or picture files to import their questions',
    zh: '放開 .json 即可開啟，放開備份 .zip 即可還原，放開 Word、PDF 或圖片檔案即可匯入題目',
  },
  dropRejected: {
    en: 'Only .json worksheets, a backup .zip, or Word, PDF or picture files can be dropped',
    zh: '只能放入 .json 工作紙、備份 .zip，或 Word、PDF 或圖片檔案',
  },
  importNothing: { en: 'Nothing to import.', zh: '沒有可匯入的內容。' },
  importImported: {
    en: (saved: number, copied: number) =>
      `Imported ${saved} ${saved === 1 ? 'worksheet' : 'worksheets'}${
        copied > 0 ? ` (${copied} as ${copied === 1 ? 'a copy' : 'copies'})` : ''
      }`,
    zh: (saved: number, copied: number) => `已匯入 ${saved} 份工作紙${copied > 0 ? `（其中 ${copied} 份為副本）` : ''}`,
  },
  importSkipped: { en: (n: number) => `skipped ${n} already here`, zh: (n: number) => `略過 ${n} 份已存在的` },
  importUnreadable: { en: (n: number) => `${n} unreadable`, zh: (n: number) => `${n} 份無法讀取` },
  importFailed: { en: (n: number) => `${n} could not be saved`, zh: (n: number) => `${n} 份無法儲存` },
  importIgnored: { en: (n: number) => `${n} not a .json or .zip`, zh: (n: number) => `${n} 個不是 .json 或 .zip` },
});

export const DASHBOARD_MESSAGES = defineMessages({
  savedDesktop: { en: 'Saved on this computer', zh: '儲存在這部電腦' },
  savedWeb: { en: 'Saved in this browser', zh: '儲存在這個瀏覽器' },
  shownOf: { en: (shown: number, count: string) => `${shown} shown · ${count}`, zh: (shown: number, count: string) => `顯示 ${shown} · ${count}` },
  trash: { en: 'Trash', zh: '垃圾桶' },
  trashN: { en: (n: number) => `Trash (${n})`, zh: (n: number) => `垃圾桶（${n}）` },
  backupMenu: { en: 'Back up, restore and folders', zh: '備份、還原及資料夾' },
  searchDocs: { en: 'Search saved documents', zh: '搜尋已儲存的工作紙' },
  searchByName: { en: 'Search by name', zh: '按名稱搜尋' },
  kindOfDocument: { en: 'Kind of document', zh: '工作紙類別' },
  all: { en: 'All', zh: '全部' },
  worksheets: { en: 'Worksheets', zh: '工作紙' },
  mockPapers: { en: 'Mock papers', zh: 'Mock 試卷' },
  order: { en: 'Order', zh: '排序' },
  recent: { en: 'Recent', zh: '最近' },
  recentTitle: { en: 'Recent: last edited first', zh: '最近：最近編輯的在前' },
  nameTitle: { en: 'A–Z: by name', zh: 'A–Z：按名稱排序' },
  view: { en: 'View', zh: '檢視' },
  pages: { en: 'Pages', zh: '頁面' },
  pagesTitle: { en: 'Pages: first pages, as a grid', zh: '頁面：以格狀顯示首頁' },
  list: { en: 'List', zh: '清單' },
  listTitle: { en: 'List: a compact list', zh: '清單：精簡顯示' },
  reading: { en: 'Reading saved documents…', zh: '正在讀取已儲存的工作紙…' },
  nothingSaved: {
    en: (desktop: boolean) =>
      `Nothing saved yet. Worksheets you start are kept ${desktop ? 'on this computer' : 'in this browser'}. Save a .json copy to move one to another machine.`,
    zh: (desktop: boolean) =>
      `尚未儲存任何工作紙。你建立的工作紙會儲存在這${desktop ? '部電腦' : '個瀏覽器'}。儲存 .json 副本，便可轉移到另一部電腦。`,
  },
  folderEmpty: {
    en: (name: string) => `“${name}” is empty. Choose Move to folder… on a document, or drag one onto this folder.`,
    zh: (name: string) => `「${name}」是空的。在工作紙上選擇「移至資料夾…」，或將工作紙拖到這個資料夾。`,
  },
  noMatch: { en: 'No saved document matches.', zh: '沒有符合的工作紙。' },
  clearFilters: { en: 'Clear filters', zh: '清除篩選' },
  folders: { en: 'Folders', zh: '資料夾' },
  newFolder: { en: 'New folder…', zh: '新增資料夾…' },
  allDocuments: { en: 'All documents', zh: '所有工作紙' },
  untitledFolder: { en: 'Untitled folder', zh: '未命名資料夾' },
  renameEllipsis: { en: 'Rename…', zh: '重新命名…' },
  deleteFolder: { en: 'Delete folder…', zh: '刪除資料夾…' },
  folderHelp: {
    en: 'Group documents by class or term. Press + to make a folder.',
    zh: '按班別或學期整理工作紙。按 + 建立資料夾。',
  },
  folderActions: { en: (name: string) => `Actions for folder ${name}`, zh: (name: string) => `資料夾「${name}」的操作` },
  open: { en: 'Open', zh: '開啟' },
  duplicate: { en: 'Duplicate', zh: '建立副本' },
  saveJson: { en: 'Save a .json copy…', zh: '儲存 .json 副本…' },
  downloadJson: { en: 'Download .json', zh: '下載 .json' },
  moveToFolder: { en: 'Move to folder…', zh: '移至資料夾…' },
  moveToTrash: { en: 'Move to Trash…', zh: '移至垃圾桶…' },
  questionBank: { en: 'Question bank', zh: '題庫' },
  mockPaper: { en: 'Mock exam paper', zh: 'Mock 試卷' },
  worksheet: { en: 'Worksheet', zh: '工作紙' },
  questions: { en: (n: number) => (n === 1 ? '1 question' : `${n} questions`), zh: (n: number) => `${n} 條題目` },
  openTitle: { en: (title: string) => `Open ${title}`, zh: (title: string) => `開啟「${title}」` },
  actionsFor: { en: (title: string) => `Actions for ${title}`, zh: (title: string) => `「${title}」的操作` },
  // dashboard.ts
  worksheetCount: { en: (n: number) => (n === 1 ? '1 worksheet' : `${n} worksheets`), zh: (n: number) => `${n} 份工作紙` },
  bankCount: { en: (n: number) => (n === 1 ? '1 bank' : `${n} banks`), zh: (n: number) => `${n} 個題庫` },
  deletedToday: { en: 'Deleted today', zh: '今日刪除' },
  deletedYesterday: { en: 'Deleted yesterday', zh: '昨日刪除' },
  deletedDaysAgo: { en: (n: number) => `Deleted ${n} days ago`, zh: (n: number) => `${n} 日前刪除` },
  removedIn: {
    en: (n: number) => `removed in ${n === 1 ? '1 day' : `${n} days`}`,
    zh: (n: number) => `${n} 日後移除`,
  },
});

export const TRASH_MESSAGES = defineMessages({
  back: { en: '← All documents', zh: '← 所有工作紙' },
  trash: { en: 'Trash', zh: '垃圾桶' },
  empty: { en: 'Empty Trash…', zh: '清空垃圾桶…' },
  kept: {
    en: (days: number) => `Deleted documents are kept for ${days} days, then removed for good.`,
    zh: (days: number) => `已刪除的工作紙會保留 ${days} 日，之後永久刪除。`,
  },
  isEmpty: { en: 'Trash is empty.', zh: '垃圾桶是空的。' },
  mockPaper: { en: 'Mock exam paper', zh: 'Mock 試卷' },
  worksheet: { en: 'Worksheet', zh: '工作紙' },
  restore: { en: 'Restore', zh: '還原' },
  deleteForever: { en: 'Delete forever…', zh: '永久刪除…' },
});

export const WELCOME_MESSAGES = defineMessages({
  welcome: { en: 'Welcome to Econ Studio', zh: '歡迎使用 Econ Studio' },
  welcomeZh: { en: '歡迎使用經濟備課室', zh: '經濟備課室' },
  lead: {
    en: 'Choose the paper you want to print. You name it next, and every other setting starts from a default.',
    zh: '選擇你想列印的試卷類型。下一步為它命名，其餘設定都會使用預設值。',
  },
  haveWorksheets: { en: 'Already have worksheets?', zh: '已有工作紙？' },
  openFile: { en: 'Open a file…', zh: '開啟檔案…' },
  restoring: { en: 'Restoring…', zh: '還原中…' },
  restoreBackup: { en: 'Restore a backup…', zh: '還原備份…' },
  orDrop: { en: 'Or drop a .json, a .zip, or a Word or PDF file anywhere here.', zh: '或將 .json、.zip，或 Word 或 PDF 檔案放到這裏。' },
  /** Desktop, no folder chosen: the Settings setup step's other-computer tip, from this side. */
  otherComputer: {
    en: 'Using Econ Studio on another computer? Choose the same folder here too.',
    zh: '已在另一部電腦使用 Econ Studio？請在這裏也選擇同一個資料夾。',
  },
  openStorage: { en: 'Storage location…', zh: '儲存位置…' },
});

export const RENAME_MESSAGES = defineMessages({
  newer: {
    en: 'This worksheet was saved by a newer version of Econ Studio and cannot be renamed here. Update to rename it.',
    zh: '這份工作紙由較新版本的 Econ Studio 儲存，無法在此重新命名。請先更新軟件。',
  },
  failed: { en: 'Could not rename that worksheet.', zh: '無法重新命名這份工作紙。' },
  title: { en: 'Rename worksheet', zh: '重新命名工作紙' },
  description: {
    en: 'What this document is called here and what the exported file is named. The heading printed on the page is set in the document itself.',
    zh: '這是工作紙在這裏的名稱，也是匯出檔案的名稱。頁面上列印的標題則在工作紙內另行設定。',
  },
  cancel: { en: 'Cancel', zh: '取消' },
  rename: { en: 'Rename', zh: '重新命名' },
  placeholder: { en: 'Document name', zh: '工作紙名稱' },
});

export const NEW_FORM_MESSAGES = defineMessages({
  nameRequired: { en: 'Give it a name first.', zh: '請先為它命名。' },
  name: { en: 'Name', zh: '名稱' },
  nameHint: {
    en: "What it's called in your list and the file name. It doesn't print on the paper.",
    zh: '這是它在清單中的名稱，也是檔案名稱，不會列印在試卷上。',
  },
  placeholderClassroom: { en: 'S5 Demand and supply quiz', zh: '中五 需求與供應小測' },
  placeholderLq: { en: 'S6 Market structure LQ practice', zh: '中六 市場結構 LQ 練習' },
  placeholderPaper1: { en: (year: string) => `S6 Mock Paper 1 ${year}`, zh: (year: string) => `中六 Mock Paper 1 ${year}` },
  placeholderPaper2: { en: (year: string) => `S6 Mock Paper 2 ${year}`, zh: (year: string) => `中六 Mock Paper 2 ${year}` },
  documentType: { en: 'Document type', zh: '工作紙類型' },
  documentTypeHint: {
    en: 'Decides the cover, sections and page furniture. Everything else below is paper.',
    zh: '決定封面、部分及頁面格式。下面其餘設定都屬於紙張。',
  },
  school: { en: 'School', zh: '學校' },
  examination: { en: 'Examination', zh: '考試' },
  sectionsCheck: { en: 'Start with Section A / Section B headings', zh: '以 Section A / Section B 標題開始' },
  startsLqMock: {
    en: 'Starts with Sections A–C (derived marks totals) and one sample long question.',
    zh: '以 Section A–C（分數總計自動計算）及一條示範長題目開始。',
  },
  startsPaper1: {
    en: 'Starts with the “There are N questions…” line, one sample question and “END OF PAPER”. No section headings.',
    zh: '以「There are N questions…」一行、一條示範題目及「END OF PAPER」開始。沒有部分標題。',
  },
  startsLq: {
    en: 'Starts with one sample long question. No section headings.',
    zh: '以一條示範長題目開始。沒有部分標題。',
  },
  language: { en: 'Language', zh: '語言' },
  languageHint: {
    en: 'Which side the editor shows. Both are always stored.',
    zh: '編輯器顯示哪一種語言。兩種語言都會一併儲存。',
  },
  onlyEnglish: { en: 'English only', zh: '只顯示英文' },
  onlyChinese: { en: '中文 only', zh: '只顯示中文' },
  bilingual: { en: 'Bilingual', zh: '中英對照' },
  paper: { en: 'Paper', zh: '紙張大小' },
  margins: { en: 'Margins', zh: '邊界' },
  fonts: { en: 'Fonts', zh: '字型' },
  bookletFixed: { en: 'Booklet (fixed)', zh: '答題簿（固定）' },
  examFixed: { en: 'Exam paper (fixed)', zh: '試卷（固定）' },
});

export const START_KIND_MESSAGES = defineMessages({
  classroomTitle: { en: 'Classroom worksheet', zh: '課堂工作紙' },
  classroomHint: { en: 'MCQ + structured questions. No cover.', zh: 'MCQ 及結構題。沒有封面。' },
  classroomCaption: { en: 'Everyday practice: MCQ and structured questions.', zh: '日常練習：MCQ 及結構題。' },
  lqWorksheetTitle: { en: 'LQ worksheet', zh: 'LQ 工作紙' },
  lqWorksheetHint: {
    en: 'Long questions with dotted answer space. No exam furniture.',
    zh: '長題目，附點線答題空間。沒有試卷格式。',
  },
  lqWorksheetCaption: { en: 'Long questions with dotted lines to write on.', zh: '長題目，附點線供書寫。' },
  paper1Title: { en: 'Paper 1 mock · MCQ', zh: 'Paper 1 Mock · MCQ' },
  paper1Hint: { en: 'Exam cover; answers on a separate answer sheet.', zh: '附試卷封面；答案寫在另設的答題紙上。' },
  paper1Caption: { en: 'An MCQ paper with an exam cover.', zh: '附試卷封面的 MCQ 試卷。' },
  lqMockTitle: { en: 'Paper 2 mock · booklet', zh: 'Paper 2 Mock · 答題簿' },
  lqMockHint: {
    en: 'Question-Answer Book: cover, Sections A–C, page frame.',
    zh: '試題答題簿：封面、Section A–C、頁面框架。',
  },
  lqMockCaption: { en: 'A Question-Answer Book, Sections A to C.', zh: '試題答題簿，包含 Section A–C。' },
});

/** The notice after restoring a backup (`storage/backup.ts:restoreSummary` is the English source). */
export const RESTORE_MESSAGES = defineMessages({
  restored: { en: (n: number) => `Restored ${n}`, zh: (n: number) => `已還原 ${n} 份` },
  restoredWithCopies: {
    en: (n: number, copies: number) => `Restored ${n} (${copies} as ${copies === 1 ? 'a copy' : 'copies'})`,
    zh: (n: number, copies: number) => `已還原 ${n} 份（其中 ${copies} 份為副本）`,
  },
  skipped: { en: (n: number) => `skipped ${n} already here`, zh: (n: number) => `略過 ${n} 份（已存在）` },
  unreadable: { en: (n: number) => `${n} unreadable`, zh: (n: number) => `${n} 份無法讀取` },
  failed: { en: (n: number) => `${n} could not be saved`, zh: (n: number) => `${n} 份無法儲存` },
  graphsRestored: {
    en: (n: number) => `${n} ${n === 1 ? 'graph' : 'graphs'} restored`,
    zh: (n: number) => `已還原 ${n} 幅圖表`,
  },
  graphsHere: {
    en: (n: number) => `${n} ${n === 1 ? 'graph' : 'graphs'} already here`,
    zh: (n: number) => `${n} 幅圖表已存在`,
  },
  graphsFailed: {
    en: (n: number) => `${n} ${n === 1 ? 'graph' : 'graphs'} could not be saved`,
    zh: (n: number) => `${n} 幅圖表無法儲存`,
  },
  termsRestored: {
    en: (n: number) => `${n} translation ${n === 1 ? 'term' : 'terms'} added`,
    zh: (n: number) => `加入 ${n} 個翻譯用語`,
  },
  empty: { en: 'That backup has no worksheets in it.', zh: '這個備份內沒有工作紙。' },
});
