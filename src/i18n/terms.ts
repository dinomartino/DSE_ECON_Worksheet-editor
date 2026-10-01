/**
 * Hong Kong wording for the interface (`docs/design/ui-language.md`). The guard test
 * (`src/i18n/catalogues.test.ts`) enforces KEEP_ENGLISH and the two blocklists over every
 * catalogue; STANDARD_TRANSLATIONS is the glossary translators follow. A new term: add it
 * here in the same change.
 */

export interface KeptTerm {
  term: string;
  /** When the English uses the term in this sense; default: the term as a whole word. */
  match?: RegExp;
}

const unit = (u: string): KeptTerm => ({ term: u, match: new RegExp(`\\d\\s?${u}\\b`) });
/** A key name only beside another key or after "press": "Enter the address" is a verb. */
const key = (k: string): KeptTerm => ({
  term: k,
  match: new RegExp(`(?:[+⌘]\\s?${k}\\b|\\b${k}\\s?\\+|\\b[Pp]ress(?:ing)? ${k}\\b|\\b${k} key\\b)`),
});

/** Said in English by Hong Kong teachers: when the English has one, its Chinese keeps it verbatim. */
export const KEEP_ENGLISH: readonly KeptTerm[] = [
  // Exam
  ...['DSE', 'HKDSE', 'Paper 1', 'Paper 2', 'MC', 'MCQ', 'LQ', 'Mock', 'Section A', 'Section B', 'Section C'].map(
    (term) => ({ term }),
  ),
  // Files and tech
  ...['PDF', 'Word', 'PNG', 'CSV', 'Excel', 'AI', 'API key', 'URL', 'VPN'].map((term) => ({ term })),
  ...['.docx', '.json', '.zip'].map((term) => ({ term, match: new RegExp(`\\${term}\\b`) })),
  // Names
  ...['Econ Studio', 'Gemini', 'OpenAI', 'Claude', 'Qwen', 'Vertex AI', 'Mac', 'Windows', 'Safari', 'Chrome'].map(
    (term) => ({ term }),
  ),
  // Units and keys
  ...['A4', 'A3'].map((term) => ({ term })),
  { term: 'Letter', match: /\bLetter\b(?= size| paper|\s*\(|,| or )/ },
  ...['px', 'pt', 'cm', 'in'].map(unit),
  { term: '⌘', match: /⌘/ },
  ...['Shift', 'Esc', 'Enter', 'Tab'].map(key),
  // Diagram symbols
  ...['D', 'S', 'P', 'Q', 'AD', 'AS', 'MR', 'AC', 'AVC', 'MPC', 'MSC', 'MSB'].map((term) => ({ term })),
];

/** The usual wording, so every area says the same thing. */
export const STANDARD_TRANSLATIONS: Readonly<Record<string, string>> = {
  Worksheet: '工作紙',
  'New worksheet': '新增工作紙',
  'Question bank': '題庫',
  Graphs: '圖表庫',
  'Library (start screen)': '資源庫',
  Template: '範本',
  Settings: '設定',
  Appearance: '外觀',
  Language: '語言',
  Export: '匯出',
  Import: '匯入',
  'Back up': '備份',
  Restore: '還原',
  Trash: '垃圾桶',
  Folder: '資料夾',
  Rename: '重新命名',
  Duplicate: '建立副本',
  Delete: '刪除',
  'Delete forever': '永久刪除',
  Undo: '復原',
  Redo: '重做',
  Copy: '複製',
  Cut: '剪下',
  Paste: '貼上',
  Save: '儲存',
  Saved: '已儲存',
  Download: '下載',
  Cancel: '取消',
  Done: '完成',
  Create: '建立',
  Search: '搜尋',
  Insert: '插入',
  Edit: '編輯',
  Preview: '預覽',
  Print: '列印',
  Header: '頁首',
  Footer: '頁尾',
  Cover: '封面',
  Margins: '邊界',
  Font: '字型',
  'Paper size': '紙張大小',
  Page: '頁',
  Question: '題目',
  'Part (of a question)': '分題',
  Stem: '題幹',
  Marks: '分',
  Answer: '答案',
  'Answer key': '答案頁',
  'Answer lines': '答題線',
  'Mark scheme': '評卷參考',
  'Student (view)': '學生版',
  'Teacher (view)': '教師版',
  Diagram: '圖表',
  Graph: '圖表',
  Curve: '曲線',
  Point: '點',
  'Label (on a diagram)': '標示',
  Tag: '標籤',
  Topic: '課題',
  Class: '班別',
  Arrow: '箭頭',
  Shade: '陰影',
  Crop: '裁剪',
  Zoom: '縮放',
  Snap: '吸附',
  Title: '標題',
  Name: '名稱',
  'Alt text': '替代文字',
  'Question-Answer Book': '試題答題簿',
  Untitled: '未命名',
  'Send feedback': '意見回饋',
  "What's new": '最新功能',
  'Open a file…': '開啟檔案…',
  // Added with the Settings and start screen catalogues.
  Light: '淺色',
  Dark: '深色',
  System: '跟隨系統',
  Provider: '供應商',
  Model: '模型',
  Test: '測試',
  'Save & test': '儲存並測試',
  Forget: '移除',
  Recommended: '推薦',
  Keychain: '鑰匙圈',
  'Windows Credential Manager': 'Windows 認證管理員',
  Glossary: '詞彙表',
  Discard: '捨棄',
  'Try again': '再試一次',
  Loading: '載入中',
};

/**
 * Simplified-only characters that `src/translate/simplified.ts` leaves out (it skips forms
 * with several Traditional ones), which interface words would still never use. Escaped: no
 * source file may hold a Simplified character (`src/translate/simplified.test.ts`).
 */
export const SIMPLIFIED_ONLY = '\u4f53\u53d1\u7b7e\u590d\u8f91\u8f7d';

/** Taiwan wording; Hong Kong says 軟件, 網上, 用戶, 網絡, 屏幕. */
export const TAIWAN_ONLY: readonly string[] = ['軟體', '線上', '使用者', '網路', '螢幕'];
