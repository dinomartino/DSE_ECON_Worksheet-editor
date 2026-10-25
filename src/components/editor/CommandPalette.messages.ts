import { defineMessages } from '@/i18n/catalogue';

/** ⌘K: the command search over every insert, Setup setting and export (k-0201). */
export const COMMAND_PALETTE_MESSAGES = defineMessages({
  open: { en: 'Search commands', zh: '搜尋指令' },
  placeholder: { en: 'Find a command: table, fonts, page break, PDF…', zh: '搜尋指令：表格、字型、分頁、PDF…' },
  results: { en: 'Commands', zh: '指令' },
  noResults: { en: 'Nothing matches. Try another word.', zh: '沒有相符的項目，請試試其他字詞。' },
  keys: { en: 'Enter to run · Esc to close', zh: '按 Enter 執行・按 Esc 關閉' },
  groupView: { en: 'View', zh: '檢視' },
  groupMore: { en: 'More', zh: '其他' },
  exportWord: { en: 'Export to Word (.docx)', zh: '匯出為 Word（.docx）' },
  exportPdf: { en: 'Export a PDF or print', zh: '匯出 PDF 或列印' },
  exportKey: { en: 'Export the answer key', zh: '匯出評卷參考' },
  exportApps: { en: 'Export for other apps (CSV, Kahoot, Blooket)', zh: '匯出至其他應用程式（CSV、Kahoot、Blooket）' },
  exportJson: { en: 'Export the worksheet file (.json)', zh: '匯出工作紙檔案（.json）' },
  settings: { en: 'Settings', zh: '設定' },
  aiTools: { en: 'AI tools', zh: 'AI 工具' },
  setupWhole: { en: 'Open Setup', zh: '開啟頁面設定' },
});
