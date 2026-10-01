import { defineMessages } from '@/i18n/catalogue';

/** The start screen's left panel: the greeting, ways to start, the libraries and the footer. */
export const START_PANEL_MESSAGES = defineMessages({
  greetingFirst: { en: 'Start your first worksheet.', zh: '開始第一份工作紙。' },
  greeting: { en: 'Start a worksheet, or pick up where you left off.', zh: '開始新的工作紙，或繼續上次的工作。' },
  newWorksheet: { en: 'New worksheet', zh: '新增工作紙' },
  openFile: { en: 'Open a file…', zh: '開啟檔案…' },
  openFileHint: { en: '.json or backup .zip', zh: '.json 或備份 .zip' },
  library: { en: 'Library', zh: '資源庫' },
  bank: { en: 'Question bank 題庫', zh: '題庫' },
  bankCount: {
    en: (n: number) => `${n} ${n === 1 ? 'question' : 'questions'}`,
    zh: (n: number) => `${n} 條題目`,
  },
  bankHintEmpty: { en: 'Fills itself, by topic, as you write questions.', zh: '你寫題目時，會自動按課題收錄。' },
  bankHint: { en: 'Every question from your worksheets, by topic.', zh: '你工作紙中的所有題目，按課題排列。' },
  graphs: { en: 'Graphs 圖表庫', zh: '圖表庫' },
  graphCount: {
    en: (n: number) => `${n} ${n === 1 ? 'graph' : 'graphs'}`,
    zh: (n: number) => `${n} 個圖表`,
  },
  graphsHint: {
    en: 'Draw a graph once. Reuse it in a question or copy it into Word.',
    zh: '圖表畫一次，便可在題目中重用，或複製到 Word。',
  },
  storedDesktop: {
    en: 'Stored on this computer only. No account. AI translation, when you use it, sends the texts you choose (and nearby translated lines for context) to your chosen provider.',
    zh: '只儲存在這部電腦，毋須帳戶。使用 AI 翻譯時，你選擇的文字（以及附近已翻譯的句子，作為上文下理）會傳送到你所選的供應商。',
  },
  storedWeb: {
    en: 'Stored in this browser only. Clearing site data deletes it.',
    zh: '只儲存在這個瀏覽器。清除網站資料會一併刪除。',
  },
  backingUp: { en: 'Backing up…', zh: '備份中…' },
  backUpNow: { en: 'Back up now', zh: '立即備份' },
  whatsNew: { en: 'What’s new', zh: '最新功能' },
  sendFeedback: { en: 'Send feedback', zh: '意見回饋' },
});
