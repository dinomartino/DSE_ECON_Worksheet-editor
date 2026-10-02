import { defineMessages } from '@/i18n/catalogue';

/** The Export dialog, and the status lines `exportSession` hands the toolbar. */
export const EXPORT_MESSAGES = defineMessages({
  title: { en: 'Export', zh: '匯出' },
  description: {
    en: 'A Word document, a PDF, or the worksheet file itself.',
    zh: 'Word 檔案、PDF，或工作紙檔案本身。',
  },
  cancel: { en: 'Cancel', zh: '取消' },
  done: { en: 'Done', zh: '完成' },
  skip: { en: 'Skip', zh: '略過' },
  failed: { en: 'Export failed.', zh: '匯出失敗。' },

  // Footer actions
  downloadKey: { en: 'Download answer key', zh: '下載評卷參考' },
  downloadVersion: { en: (letter: string) => `Download version ${letter}`, zh: (letter: string) => `下載版本 ${letter}` },
  downloadPaper: { en: 'Download question paper', zh: '下載試卷' },
  savePdf: { en: 'Save PDF…', zh: '儲存 PDF…' },
  printPdf: { en: 'Print to PDF…', zh: '列印為 PDF…' },
  exporting: { en: 'Exporting…', zh: '匯出中…' },
  exportJson: { en: 'Export .json', zh: '匯出 .json' },
  exportExt: { en: (ext: string) => `Export .${ext}`, zh: (ext: string) => `匯出 .${ext}` },
  exportFiles: { en: (n: number) => `Export ${n} files`, zh: (n: number) => `匯出 ${n} 個檔案` },
  exportDocx: { en: 'Export .docx', zh: '匯出 .docx' },

  // After the save
  keyExportedBut: {
    en: (note: string) => `The answer key was exported, but ${note}.`,
    zh: (note: string) => `評卷參考已匯出，但${note}。`,
  },
  waitingNote: {
    en: (paper: boolean) =>
      `${paper ? 'The question paper has downloaded.' : 'The first file has downloaded.'} Browsers allow one download per click, so the next file waits for yours.`,
    zh: (paper: boolean) =>
      `${paper ? '試卷已下載。' : '第一個檔案已下載。'}瀏覽器每次點按只允許下載一個檔案，所以下一個檔案會等你再按一次。`,
  },
  inKey: { en: (notes: string) => `In the answer key, ${notes}.`, zh: (notes: string) => `在評卷參考中，${notes}。` },
  noteSeparator: { en: '; ', zh: '；' },
  listSeparator: { en: ', ', zh: '、' },
  quoted: { en: (title: string) => `“${title}”`, zh: (title: string) => `「${title}」` },
  skippedOne: {
    en: (names: string) => `${names} could not be opened and was left out`,
    zh: (names: string) => `${names}無法開啟，已略過`,
  },
  skippedMany: {
    en: (names: string) => `${names} could not be opened and were left out`,
    zh: (names: string) => `${names}無法開啟，已略過`,
  },

  // Fields
  format: { en: 'Format', zh: '格式' },
  what: { en: 'What', zh: '內容' },
  whatAria: { en: 'What to export', zh: '匯出內容' },
  paper: { en: 'Question paper', zh: '試卷' },
  key: { en: 'Answer key', zh: '評卷參考' },
  both: { en: 'Both', zh: '兩者' },
  apps: { en: 'Other apps', zh: '其他應用程式' },
  appsTitle: { en: 'Answer-key CSV, Kahoot or Blooket', zh: '答案 CSV、Kahoot 或 Blooket' },
  notPdf: { en: 'Not as PDF: export it as .docx', zh: 'PDF 不適用，請以 .docx 匯出' },
  hintPdf: {
    en: 'PDF prints the page as it shows: the question paper or the answer key. Both and Other apps export under .docx.',
    zh: 'PDF 會按頁面所見列印試卷或評卷參考。「兩者」和「其他應用程式」請以 .docx 匯出。',
  },
  hintPdfKey: {
    en: 'The page switches to the Marking scheme view, then prints its sheets.',
    zh: '頁面會切換到評卷參考，然後列印這些頁面。',
  },
  hintBothFolder: {
    en: (n: number) => `${n} files, saved together in a folder you choose.`,
    zh: (n: number) => `${n} 個檔案，會一併儲存在你選擇的資料夾。`,
  },
  hintBothClicks: {
    en: (n: number) => `${n} files. Each downloads on its own click.`,
    zh: (n: number) => `${n} 個檔案，每個都需要各按一次下載。`,
  },
  hintApps: {
    en: 'The MCQs, for a bubble-sheet scanner or a quiz game.',
    zh: 'MCQ 題目，適用於答題卡掃描器或問答遊戲。',
  },
  hintKey: {
    en: 'The answer key is a separate document: answer grid and marking scheme.',
    zh: '評卷參考是獨立的文件，包含答案表和評分要點。',
  },
  app: { en: 'App', zh: '應用程式' },
  noMcq: { en: 'No multiple-choice questions to export.', zh: '沒有可匯出的多項選擇題。' },
  andMore: { en: (n: number) => `And ${n} more.`, zh: (n: number) => `另有 ${n} 項。` },
  language: { en: 'Language', zh: '語言' },
  languageHint: {
    en: (desktop: boolean) => `The page switches to this language and version, then ${desktop ? 'saves' : 'prints'}.`,
    zh: (desktop: boolean) => `頁面會切換到這個語言和版本，然後${desktop ? '儲存' : '列印'}。`,
  },
  languageHintKey: {
    en: (desktop: boolean) => `The page switches to this language, then ${desktop ? 'saves' : 'prints'}.`,
    zh: (desktop: boolean) => `頁面會切換到這個語言，然後${desktop ? '儲存' : '列印'}。`,
  },
  langEn: { en: 'English only', zh: '只顯示英文' },
  langZh: { en: '中文 only', zh: '只顯示中文' },
  langBoth: { en: 'Bilingual', zh: '中英對照' },
  copy: { en: 'Student or teacher copy', zh: '學生版或教師版' },
  copyKeyOnly: { en: 'Applies to the question paper only.', zh: '只適用於試卷。' },
  copyHint: { en: 'The teacher copy shows the answers inline.', zh: '教師版會在題目旁顯示答案。' },
  student: { en: 'Student', zh: '學生版' },
  teacher: { en: 'Teacher', zh: '教師版' },
  studentTitle: { en: 'Student version: answers hidden', zh: '學生版：隱藏答案' },
  teacherTitle: { en: 'Teacher version / 教師版: answers shown', zh: '教師版：顯示答案' },
  shuffled: { en: 'Shuffled versions', zh: '選項亂序版本' },
  shuffledPdf: {
    en: 'Options shuffle per version. PDF prints one version at a time.',
    zh: '每個版本的選項次序不同。PDF 一次只列印一個版本。',
  },
  shuffledFiles: {
    en: 'Options shuffle per version. One file each; the answer key covers them all.',
    zh: '每個版本的選項次序不同，各自一個檔案；評卷參考涵蓋所有版本。',
  },
  all: { en: 'All', zh: '全部' },
  allPdf: { en: 'PDF prints one version at a time', zh: 'PDF 一次只列印一個版本' },
  allVersions: { en: (letters: string) => `Versions ${letters}`, zh: (letters: string) => `版本 ${letters}` },
  onlyVersion: { en: (letter: string) => `Version ${letter} only`, zh: (letter: string) => `只有版本 ${letter}` },
  include: { en: 'Include', zh: '包含' },
  includePdf: {
    en: 'Untick to leave it out of this print; the page gets it back after.',
    zh: '取消剔選即可從今次列印中略去；列印後頁面會恢復。',
  },
  includePaper: {
    en: 'Untick to leave it out of the question paper.',
    zh: '取消剔選即可從試卷中略去。',
  },
  cover: { en: 'Cover page', zh: '封面' },
  answerSpace: { en: 'Answer space', zh: '答題空間' },
  downloadsOnly: {
    en: 'Your browser saves to its Downloads folder. To choose a folder each time, turn on “Ask where to save” in the browser’s settings.',
    zh: '你的瀏覽器會儲存到「下載」資料夾。如要每次自行選擇資料夾，請在瀏覽器設定中開啟「儲存前詢問位置」。',
  },

  // Formats
  docxTitle: { en: 'Word document', zh: 'Word 檔案' },
  docxHint: {
    en: 'Word, to keep editing. Other apps writes a CSV or spreadsheet instead.',
    zh: 'Word 檔案，可繼續編輯。「其他應用程式」會改為輸出 CSV 或試算表。',
  },
  pdfDesktopTitle: { en: 'A PDF file of the sheets', zh: '頁面的 PDF 檔案' },
  pdfDesktopHint: {
    en: 'Saves the sheets as they look here to a PDF file.',
    zh: '將頁面按目前外觀儲存為 PDF 檔案。',
  },
  pdfWebTitle: { en: 'Print, or Save as PDF', zh: '列印，或另存為 PDF' },
  pdfWebHint: {
    en: 'Prints the sheets as they look here; pick Save as PDF in the print dialog.',
    zh: '按目前外觀列印頁面；請在列印視窗中選擇「另存為 PDF」。',
  },
  jsonTitle: { en: 'The worksheet file, to open again in this app', zh: '工作紙檔案，可在本軟件再次開啟' },
  jsonHint: {
    en: 'The worksheet itself, to open again here. The options below do not apply.',
    zh: '工作紙本身，可在此再次開啟。以下選項不適用。',
  },

  // Other apps
  zipgradeTitle: { en: 'ZipGrade answer-key CSV', zh: 'ZipGrade 答案 CSV' },
  zipgradeHint: { en: 'MCQ key for ZipGrade: Import Key CSV.', zh: 'ZipGrade 的 MCQ 答案：請使用 Import Key CSV。' },
  keyCsvTitle: { en: 'Question, Answer CSV', zh: '題號與答案 CSV' },
  keyCsvHint: {
    en: 'MCQ number and letter, for Excel or any scanner.',
    zh: 'MCQ 題號及答案字母，適用於 Excel 或任何掃描器。',
  },
  kahootTitle: { en: 'Kahoot spreadsheet (.xlsx)', zh: 'Kahoot 試算表（.xlsx）' },
  kahootHint: { en: 'MCQs as a Kahoot quiz: Import spreadsheet.', zh: 'MCQ 轉為 Kahoot 問答：請使用 Import spreadsheet。' },
  blooketTitle: { en: 'Blooket CSV import', zh: 'Blooket CSV 匯入' },
  blooketHint: { en: 'MCQs as a Blooket set: CSV Import.', zh: 'MCQ 轉為 Blooket 題目集：請使用 CSV Import。' },

  // Status lines for the toolbar
  exportedFiles: { en: (n: number) => `Exported ${n} files`, zh: (n: number) => `已匯出 ${n} 個檔案` },
  exportedKey: { en: 'Exported answer key', zh: '已匯出評卷參考' },
  exportedExt: { en: (ext: string) => `Exported .${ext}`, zh: (ext: string) => `已匯出 .${ext}` },
  exportedDocx: { en: 'Exported .docx', zh: '已匯出 .docx' },
  exportedJson: { en: 'Exported .json', zh: '已匯出 .json' },
  leftOut: { en: (message: string, n: number) => `${message}, ${n} left out`, zh: (message: string, n: number) => `${message}，略過 ${n} 份` },
  toFolder: { en: (message: string, name: string) => `${message} to “${name}”`, zh: (message: string, name: string) => `${message}至「${name}」` },
  exportedNamed: { en: (name: string) => `Exported “${name}”`, zh: (name: string) => `已匯出「${name}」` },
});
