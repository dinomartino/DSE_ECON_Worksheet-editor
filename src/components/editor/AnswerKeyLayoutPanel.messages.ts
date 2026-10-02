import { defineMessages } from '@/i18n/catalogue';

/** The Marking scheme view's Layout tab: the answer key's style and switches (never printed). */
export const ANSWER_KEY_LAYOUT_MESSAGES = defineMessages({
  tab: { en: 'Layout', zh: '版面' },
  style: { en: 'Style', zh: '樣式' },
  styleHint: { en: 'Saved with this paper', zh: '隨工作紙儲存' },
  classic: { en: 'Classic', zh: '經典' },
  classicHint: {
    en: 'An answer grid, then each answer with its marks at the end of the line.',
    zh: '先列答案方格，再逐題列出答案，分數列於行末。',
  },
  hkeaa: { en: 'HKEAA style', zh: 'HKEAA 評卷參考' },
  hkeaaHint: {
    en: 'Like an HKEAA marking scheme: the MC key table, a Marks column, the notation and a note for markers.',
    zh: '仿照 HKEAA 評卷參考：MC 答案表、分數欄、評分符號說明及閱卷聲明。',
  },
  suggested: { en: 'Suggested answers', zh: '參考答案' },
  suggestedHint: {
    en: 'A handout for students after the test: answers, model diagrams and the marking points as plain bullets. No marking notation, levels or notes for markers.',
    zh: '測驗後派發給學生：答案、示範圖表及以要點列出的評分要點，不含評分符號、等級描述或閱卷備註。',
  },
  detailed: { en: 'Detailed table', zh: '詳細表格' },
  detailedHint: {
    en: 'Long questions in a Question, Answer, Marks and Guidance table, and MC answers with why the other options are wrong.',
    zh: '長題目以「題號、答案、分數、評分指引」表格列出，MC 答案附其他選項錯誤的原因。',
  },
  newerStyle: {
    en: 'This key uses a style from a newer version of Econ Studio. It shows as Classic here.',
    zh: '這份評卷參考使用較新版本 Econ Studio 的樣式，在此以經典樣式顯示。',
  },
  mcAnswers: { en: 'MC answers', zh: 'MC 答案' },
  mcGrid: { en: 'Grid', zh: '方格' },
  mcGridTitle: { en: 'Five number and letter pairs to a row', zh: '每行五組題號及答案' },
  mcTable: { en: 'Table', zh: '表格' },
  mcTableTitle: {
    en: 'Question No. and Key in two column pairs, ruled in fives',
    zh: '題號及答案分兩組直欄，每五題一格',
  },
  mcList: { en: 'List', zh: '列表' },
  mcListTitle: { en: 'One question per line, with its notes', zh: '每題一行，附解說' },
  mcReasons: { en: 'Reasons', zh: '原因' },
  mcReasonsTitle: {
    en: 'A table with each explanation and why the other options are wrong',
    zh: '以表格列出解說及其他選項錯誤的原因',
  },
  mcStems: { en: 'MC question wording', zh: 'MC 題幹' },
  mcStemsHint: {
    en: 'The MC answers then print as a list, each under its question.',
    zh: '開啟後，MC 答案會以列表列出，每題答案列於題幹之下。',
  },
  longQuestions: { en: 'Long questions', zh: '長題目' },
  lqCompact: { en: 'Marks at line end', zh: '分數在行末' },
  lqCompactTitle: { en: 'Marks sit at the end of each line', zh: '分數列於每行末端' },
  lqColumn: { en: 'Marks column', zh: '分數欄' },
  lqColumnTitle: {
    en: 'Answers stop short of a right-hand Marks column, headed on every page',
    zh: '答案右側留出分數欄，每頁頂部標示「分數」',
  },
  lqTable: { en: 'Table', zh: '表格' },
  lqTableTitle: {
    en: 'Question, Answer, Marks and Guidance columns, the heading repeated on every page',
    zh: '題號、答案、分數及評分指引四欄，每頁重複表頭',
  },
  show: { en: 'Show', zh: '顯示' },
  partMarks: { en: 'Marks for each part', zh: '分題分數' },
  schemeAsPoints: { en: 'Marking points as answer points', zh: '評分要點列作答案要點' },
  subtitle: { en: 'Subtitle line', zh: '副標題' },
  disclaimer: { en: 'Note for markers', zh: '閱卷聲明' },
  legend: { en: 'Notation legend', zh: '評分符號說明' },
  stems: { en: 'Question stems', zh: '題幹' },
  stemsHint: { en: 'MC stems show in the List layout.', zh: 'MC 題幹只在列表版面顯示。' },
  explanations: { en: 'MC explanations', zh: 'MC 解說' },
  rationales: { en: 'Option rationales', zh: '選項分析' },
  sources: { en: 'Source notes', zh: '出處' },
  totals: { en: 'Totals', zh: '總分' },
  questionTotals: { en: 'Each question', zh: '每題' },
  sectionTotals: { en: 'Each section', zh: '每部分' },
  paperTotal: { en: 'The whole paper', zh: '全卷' },
  textHint: {
    en: 'Click the title or subtitle on the page to type it.',
    zh: '按一下頁面上的標題或副標題即可輸入。',
  },
  reset: { en: 'Reset to preset', zh: '重設為所選樣式' },
  resetTitle: {
    en: 'Undo your changes to this style; the title and subtitle stay',
    zh: '還原對此樣式的修改；標題及副標題保留不變',
  },
});
