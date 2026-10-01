import { defineMessages } from '@/i18n/catalogue';

/** Native dialog titles, file-type names, "show in Finder" and where a key is kept (`./text.ts`). */
export const PLATFORM_MESSAGES = defineMessages({
  wordDocument: { en: 'Word document', zh: 'Word 檔案' },
  worksheet: { en: 'Worksheet', zh: '工作紙' },
  worksheetBackup: { en: 'Worksheet backup', zh: '工作紙備份' },
  excelWorkbook: { en: 'Excel workbook', zh: 'Excel 活頁簿' },
  pdfDocument: { en: 'PDF document', zh: 'PDF 文件' },
  pngImage: { en: 'PNG image', zh: 'PNG 圖像' },
  chooseExportFolder: { en: 'Choose a folder for the exported files', zh: '選擇存放匯出檔案的資料夾' },
  showInFolder: { en: 'Show in folder', zh: '在資料夾中顯示' },
  showInFinder: { en: 'Show in Finder', zh: '在 Finder 中顯示' },
  showInExplorer: { en: 'Show in Explorer', zh: '在檔案總管中顯示' },

  storeKeychain: { en: 'your Keychain', zh: '你的鑰匙圈' },
  storeCredentialManager: { en: 'Windows Credential Manager', zh: 'Windows 認證管理員' },
  storeBrowser: { en: 'this browser', zh: '這個瀏覽器' },
  storeTab: { en: 'this tab only', zh: '只限這個分頁' },
  storeSession: { en: 'this session only', zh: '只限這次使用' },

  keychainUnreachable: { en: "The keychain couldn't be reached.", zh: '無法連接鑰匙圈。' },
  keyRefused: { en: 'The key was refused.', zh: '這個 API key 被拒絕。' },
  keychainDenied: { en: "The keychain didn't allow access.", zh: '鑰匙圈不允許存取。' },
  keychainFailed: { en: "The keychain couldn't save or read the key.", zh: '鑰匙圈未能儲存或讀取這個 API key。' },
  notKeyAccount: { en: 'Not a key account.', zh: '這不是 API key 的帳戶。' },
  notAKey: { en: "That doesn't look like a key.", zh: '這看來不是 API key。' },
});
