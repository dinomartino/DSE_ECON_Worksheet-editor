import { defineMessages } from '@/i18n/catalogue';

/** The editor's top bar: home crumb, view switches, undo, Setup, Export, the ⋯ menu, its notices. */
export const TOOLBAR_MESSAGES = defineMessages({
  breadcrumb: { en: 'Breadcrumb', zh: '導覽路徑' },
  home: { en: 'Econ Studio home', zh: 'Econ Studio 主頁' },
  backToBankTitle: { en: 'Back to Question bank 題庫', zh: '返回題庫' },
  backToBank: { en: 'Back to Question bank', zh: '返回題庫' },
  bankShort: { en: 'Bank', zh: '題庫' },
  language: { en: 'Language', zh: '語言' },
  langEn: { en: 'English only', zh: '只顯示英文' },
  langZh: { en: '中文 only', zh: '只顯示中文' },
  langBoth: { en: 'Bilingual', zh: '中英對照' },
  version: { en: 'Version', zh: '版本' },
  student: { en: 'Student', zh: '學生版' },
  teacher: { en: 'Teacher', zh: '教師版' },
  studentTitle: { en: 'Student version: answers hidden', zh: '學生版：隱藏答案' },
  teacherTitle: { en: 'Teacher version / 教師版: answers shown', zh: '教師版：顯示答案' },
  markingScheme: { en: 'Marking scheme', zh: '評卷參考' },
  markingSchemeTitle: {
    en: 'Marking scheme / 評卷參考: the answer key on its own pages, to edit and print',
    zh: '評卷參考：獨立成頁的答案及評分要點，可編輯及列印',
  },
  pageMode: { en: 'Page mode', zh: '頁面模式' },
  edit: { en: 'Edit', zh: '編輯' },
  preview: { en: 'Preview', zh: '預覽' },
  editReadOnly: {
    en: 'Read-only: saved by a newer version of Econ Studio',
    zh: '唯讀：由較新版本的 Econ Studio 儲存',
  },
  editTitle: { en: 'Edit the worksheet on the page', zh: '直接在頁面上編輯工作紙' },
  previewTitle: {
    en: 'See the sheets exactly as they will print (Esc to leave)',
    zh: '預覽與列印完全相同的頁面（按 Esc 離開）',
  },
  undo: { en: 'Undo (⌘Z)', zh: '復原（⌘Z）' },
  redo: { en: 'Redo (⇧⌘Z)', zh: '重做（⇧⌘Z）' },
  setup: { en: 'Setup', zh: '頁面設定' },
  setupTitle: {
    en: 'Setup: title, paper, margins, header and footer',
    zh: '頁面設定：標題、紙張、邊界、頁首及頁尾',
  },
  exportButton: { en: 'Export…', zh: '匯出…' },
  exportTitle: { en: 'Word, PDF or the worksheet file', zh: 'Word、PDF 或工作紙檔案' },
  menu: { en: 'File and export options', zh: '檔案及匯出選項' },
  copying: { en: 'Copying…', zh: '複製中…' },
  copyForWord: { en: 'Copy for Word', zh: '複製到 Word' },
  saveNow: { en: 'Save now', zh: '立即儲存' },
  checkUpdates: { en: 'Check for updates', zh: '檢查更新' },
  whatsNew: { en: 'What’s new…', zh: '最新功能…' },
  sendFeedback: { en: 'Send feedback…', zh: '意見回饋…' },
  clearSaved: { en: 'Clear saved documents…', zh: '清除已儲存的工作紙…' },

  latest: {
    en: (version: string) => `You have the latest version${version ? ` (${version})` : ''}`,
    zh: (version: string) => `你已使用最新版本${version ? `（${version}）` : ''}`,
  },
  checkFailed: {
    en: 'Could not check for updates. Are you online?',
    zh: '未能檢查更新。你的網絡連線正常嗎？',
  },
  downloading: {
    en: (version: string) => `Downloading version ${version}. You will be told when it is ready`,
    zh: (version: string) => `正在下載 ${version} 版本，準備好後會通知你`,
  },
  savedCopy: { en: 'Saved a copy', zh: '已儲存副本' },
  downloadedCopy: { en: 'Downloaded a copy', zh: '已下載副本' },
  downloadFailed: { en: 'Download failed.', zh: '下載失敗。' },
  copied: { en: 'Copied. Paste into Word', zh: '已複製，可貼上到 Word' },
  copyFailed: {
    en: 'Copy failed. The browser blocked clipboard access.',
    zh: '複製失敗：瀏覽器封鎖了剪貼簿存取。',
  },
  exportedPdf: { en: 'Exported .pdf', zh: '已匯出 .pdf' },
  pdfFallback: {
    en: (reason: string) =>
      `Could not save the PDF directly (${reason}), so the print dialog opened. Choose Save as PDF there.`,
    zh: (reason: string) => `未能直接儲存 PDF（${reason}），已改為開啟列印視窗。請在其中選擇「另存為 PDF」。`,
  },
  printFailed: {
    en: (reason: string) => `Could not open the print dialog: ${reason}`,
    zh: (reason: string) => `未能開啟列印視窗：${reason}`,
  },
  clearFailed: { en: 'Could not clear saved documents.', zh: '未能清除已儲存的工作紙。' },

  clearTitle: { en: 'Clear saved documents?', zh: '清除已儲存的工作紙？' },
  clearDescription: {
    en: (desktop: boolean) =>
      `Every worksheet saved ${desktop ? 'on this computer' : 'in this browser'} will be deleted. This cannot be undone. Nothing is stored on a server.`,
    zh: (desktop: boolean) =>
      `儲存在${desktop ? '這部電腦' : '這個瀏覽器'}的所有工作紙都會被刪除，此操作無法復原。伺服器上不會儲存任何內容。`,
  },
  downloadFirst: { en: 'Download this one first', zh: '先下載這份' },
  cancel: { en: 'Cancel', zh: '取消' },
  clearEverything: { en: 'Clear everything', zh: '全部清除' },
  clearBody: {
    en: (desktop: boolean) =>
      `Every worksheet on the start screen lives ${desktop ? 'on this computer' : 'in this browser'}, not in the code, which is why your work comes back after a restart. Clearing empties that list and returns you to it.`,
    zh: (desktop: boolean) =>
      `開始畫面上的工作紙都儲存在${desktop ? '這部電腦' : '這個瀏覽器'}，而不是程式碼內，所以重新啟動後你的工作仍會保留。清除後會清空該列表，並返回開始畫面。`,
  },
  clearDetaches: {
    en: 'This computer also stops syncing with your storage folder. The folder and the files in it are left as they are.',
    zh: '這部電腦亦會停止與儲存資料夾同步，資料夾及其中的檔案會保持原狀。',
  },
  clearKept: {
    en: 'Your settings and AI keys are kept. Remove a key in Settings → AI & translation.',
    zh: '你的設定和 AI 金鑰會保留。如要移除金鑰，請前往「設定 → AI 與翻譯」。',
  },
});
