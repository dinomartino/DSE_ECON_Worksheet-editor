import { defineMessages } from '@/i18n/catalogue';

/**
 * What the import check says (k-0494): each finding's line, its fix's button, the bar.
 * Interface text only — nothing here reaches the paper or the `.docx`.
 */
export const IMPORT_CHECK_MESSAGES = defineMessages({
  // Findings, by kind
  junk: { en: (text: string) => `Layout text left over from the file: “${text}”`, zh: (text: string) => `檔案殘留的版面文字：「${text}」` },
  marksInText: {
    en: (marks: number, set: boolean) => `“${marks} marks” is still in the words${set ? ', and the part has no marks' : ''}`,
    zh: (marks: number, set: boolean) => `文字中仍有「${marks} 分」${set ? '，而這部分沒有分數' : ''}`,
  },
  marksTotal: {
    en: (file: number, paper: number) => `The file gives ${file} marks here, the paper ${paper}`,
    zh: (file: number, paper: number) => `檔案在這裏共 ${file} 分，試卷是 ${paper} 分`,
  },
  marksMissing: { en: (marks: number) => `No marks: the file gives ${marks}`, zh: (marks: number) => `沒有分數：檔案寫 ${marks} 分` },
  spaceMissing: {
    en: (lines: number) => `No answer lines: the file has ${lines}`,
    zh: (lines: number) => `沒有作答橫線：檔案有 ${lines} 行`,
  },
  fixSpace: { en: (lines: number) => `Add ${lines} lines`, zh: (lines: number) => `加入 ${lines} 行` },
  lostText: { en: (text: string) => `Words from the file are missing: “${text}”`, zh: (text: string) => `缺少檔案中的文字：「${text}」` },
  lostDrawing: {
    en: (count: number, what: string) =>
      `${count === 1 ? 'A' : count} ${what === 'chart' ? (count === 1 ? 'Word chart' : 'Word charts') : what === 'smartart' ? 'SmartArt graphic' : count === 1 ? 'diagram drawn with Word shapes' : 'diagrams drawn with Word shapes'} could not be imported. Copy ${count === 1 ? 'it' : 'each'} in Word as a picture and paste it here`,
    zh: (count: number, what: string) =>
      `有 ${count} 個${what === 'chart' ? ' Word 圖表' : what === 'smartart' ? ' SmartArt 圖形' : '用 Word 圖形繪畫的圖'}無法匯入。請在 Word 中把它複製為圖片，再貼到這裏`,
  },
  lostPicture: { en: 'A picture from the file is missing', zh: '缺少檔案中的一張圖片' },
  pictureMoved: { en: (from: number) => `This picture is in Question ${from}; the file has it here`, zh: (from: number) => `這張圖片放了在第 ${from} 題；檔案中它在這裏` },
  pictureSize: {
    en: (width: number, max: number) => `The picture is ${width} px wide, wider than the text column (${max} px)`,
    zh: (width: number, max: number) => `圖片闊 ${width} px，比文字欄（${max} px）闊`,
  },
  optionCount: { en: (count: number) => `This MC question has ${count} options, not 4`, zh: (count: number) => `這條 MC 題有 ${count} 個選項，不是 4 個` },
  optionsMerged: { en: (count: number) => `${count} options were read as one`, zh: (count: number) => `${count} 個選項被讀成一個` },
  mcAsWritten: {
    en: 'This reads as an MC question whose options are pictures, but it became a written question',
    zh: '這看來是以圖片作選項的 MC 題，但匯入成了文字題',
  },
  questionMerged: {
    en: (n: number) => `Question ${n} was read as part of this question`,
    zh: (n: number) => `第 ${n} 題被讀成這條題目的一部分`,
  },
  partMerged: { en: (label: string) => `Part ${label} was read as text of the part before it`, zh: (label: string) => `分題 ${label} 被讀成上一分題的文字` },
  language: {
    en: (to: string) => `The words are on the ${to === 'zh' ? 'English' : '中文'} side but they are ${to === 'zh' ? 'Chinese' : 'English'}`,
    zh: (to: string) => `文字放了在${to === 'zh' ? '英文' : '中文'}一邊，但它們是${to === 'zh' ? '中文' : '英文'}`,
  },
  garbled: {
    en: (count: number) => `${count} ${count === 1 ? 'character' : 'characters'} from a symbol font will not print as in Word`,
    zh: (count: number) => `有 ${count} 個符號字型的字元不會像 Word 中那樣印出`,
  },
  emptyBlock: { en: 'An empty paragraph left by the import', zh: '匯入留下的空白段落' },
  split: { en: 'One sentence was split into two paragraphs', zh: '一句句子被分成了兩段' },
  tableAsText: { en: (rows: number) => `A table of ${rows} rows was read as lines of text`, zh: (rows: number) => `一個 ${rows} 行的表格被讀成文字` },
  tableChanged: {
    en: (paper: string, file: string) => `This table (${paper}) is not the file's (${file})`,
    zh: (paper: string, file: string) => `這個表格（${paper}）與檔案中的（${file}）不同`,
  },
  aiFinding: { en: (text: string) => `AI: ${text}`, zh: (text: string) => `AI：${text}` },

  // Fix buttons
  fixRemove: { en: 'Remove', zh: '移除' },
  fixMarks: { en: (marks: number) => `Set ${marks} marks`, zh: (marks: number) => `設為 ${marks} 分` },
  fixMarksText: { en: 'Move to marks', zh: '移到分數' },
  fixSplit: { en: 'Split the options', zh: '分開選項' },
  fixPutBack: { en: 'Put it back', zh: '放回' },
  fixMove: { en: 'Move it here', zh: '移到這裏' },
  fixFit: { en: 'Fit the column', zh: '配合欄寬' },
  fixSide: { en: (to: string) => (to === 'zh' ? 'Move to 中文' : 'Move to English'), zh: (to: string) => (to === 'zh' ? '移到中文' : '移到英文') },
  fixSymbols: { en: 'Replace the symbols', zh: '取代符號' },
  fixJoin: { en: 'Join', zh: '合併' },
  fixTable: { en: 'Read as a table', zh: '讀作表格' },
  fixTableFile: { en: "Use the file's table", zh: '使用檔案的表格' },
  fixNewQuestion: { en: 'Make it a question', zh: '設為新題目' },
  fixPart: { en: 'Make it a part', zh: '設為分題' },
  fixKeepText: { en: 'Keep the words', zh: '保留文字' },
  fixMakeMc: { en: 'Make it MC', zh: '改為 MC 題' },
  fixApply: { en: 'Apply', zh: '套用' },

  // The check itself
  checkImport: { en: 'Check import', zh: '檢查匯入' },
  checkImportTitle: { en: 'Compare the paper with the file and list what the import got wrong', zh: '把試卷與檔案比較，列出匯入出錯的地方' },
  checking: { en: 'Checking the import…', zh: '正在檢查匯入…' },
  findingsN: {
    en: (n: number, safe: number) => `${n} ${n === 1 ? 'thing' : 'things'} to check${safe ? ` · ${safe} safe ${safe === 1 ? 'fix' : 'fixes'}` : ''}`,
    zh: (n: number, safe: number) => `${n} 項要檢查${safe ? ` · ${safe} 項安全修正` : ''}`,
  },
  noFindings: { en: 'The paper matches the file: nothing to fix', zh: '試卷與檔案相符：沒有要修正的地方' },
  applyAllSafe: { en: (n: number) => `Apply all safe fixes (${n})`, zh: (n: number) => `套用全部安全修正（${n}）` },
  appliedN: { en: (n: number) => `${n} ${n === 1 ? 'fix' : 'fixes'} applied`, zh: (n: number) => `已套用 ${n} 項修正` },
  staleN: {
    en: (n: number) => `${n} ${n === 1 ? 'fix no longer fits' : 'fixes no longer fit'} the paper and ${n === 1 ? 'was' : 'were'} left out`,
    zh: (n: number) => `有 ${n} 項修正已不適用於試卷，沒有套用`,
  },
  skip: { en: 'Skip', zh: '略過' },
  skipped: { en: 'Skipped', zh: '已略過' },
  applied: { en: 'Applied', zh: '已套用' },
  before: { en: 'Now', zh: '現在' },
  after: { en: 'After', zh: '之後' },
  removed: { en: '(removed)', zh: '（移除）' },
  noFix: { en: 'No automatic fix: change it on the page', zh: '沒有自動修正：請在頁面上修改' },
  close: { en: 'Close', zh: '關閉' },
  where: { en: (n: number, place: string) => `Question ${n}${place ? ` ${place}` : ''}`, zh: (n: number, place: string) => `第 ${n} 題${place ? ` ${place}` : ''}` },
  askAi: { en: 'Also ask the AI', zh: '同時詢問 AI' },
  askAiTitle: {
    en: 'Send each question and its part of the file to the AI provider in Settings → AI, for what the rules cannot see',
    zh: '把每條題目及檔案中相應的部分傳送到「設定 → AI」中的 AI 服務，找出規則看不到的問題',
  },
  aiNoProvider: { en: 'No AI provider is set up (Settings → AI): only the rules ran', zh: '未設定 AI 服務（設定 → AI）：只用了規則檢查' },
  aiFailed: { en: (n: number) => `The AI could not check ${n} ${n === 1 ? 'question' : 'questions'}`, zh: (n: number) => `AI 未能檢查 ${n} 條題目` },
  aiChecking: { en: (n: number) => `Asking the AI about ${n} ${n === 1 ? 'question' : 'questions'}…`, zh: (n: number) => `正在向 AI 查詢 ${n} 條題目…` },
  reviewNote: {
    en: 'Fixes change the import before Save; ⌘Z takes the last one back.',
    zh: '修正會在儲存前改動匯入內容；⌘Z 可取消最後一項。',
  },
  needFile: {
    en: 'Choose the file this paper was imported from',
    zh: '請選擇這份試卷匯入時用的檔案',
  },
  fileUnreadable: { en: 'That file could not be read', zh: '無法讀取該檔案' },
  checkImportLabel: { en: 'Check import', zh: '檢查匯入' },
  checkImportFile: { en: 'Check import against a file…', zh: '與檔案比較檢查匯入…' },
  checkingImport: { en: 'Checking the import against the file…', zh: '正在與檔案比較檢查匯入…' },
  sendsImport: {
    en: (n: number, provider: string) => `Rules first, then ${n} ${n === 1 ? 'question' : 'questions'} and the file's words to ${provider} with your key`,
    zh: (n: number, provider: string) => `先用規則檢查，再把 ${n} 條題目及檔案文字連同你的 API key 傳送到 ${provider}`,
  },
  noSourceYet: { en: 'Asks for the file the paper came from', zh: '會要求選擇試卷來源檔案' },
});
