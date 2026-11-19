import { defineMessages } from '@/i18n/catalogue';

/**
 * Exam results (k-0471): the Layout tab's section and its dialog, where a teacher enters
 * each MC question's % correct and the candidates' performance after the exam. Interface
 * text only; what the key prints is `render/examResultsKey.ts:EXAM_RESULTS_WORDING`.
 */
export const EXAM_RESULTS_MESSAGES = defineMessages({
  // The Layout tab's section.
  section: { en: 'Exam results', zh: '考試結果' },
  sectionHint: {
    en: 'After the exam: each MC answer’s % correct, and how candidates did. Printed in this key only.',
    zh: '考試後填寫：每題 MC 答對百分比及考生表現。只會印在評卷參考。',
  },
  enter: { en: 'Enter results…', zh: '輸入考試結果…' },
  edit: { en: 'Edit results…', zh: '編輯考試結果…' },
  summary: {
    en: (entered: number, total: number) => `% correct for ${entered} of ${total} MC`,
    zh: (entered: number, total: number) => `已填 ${entered}／${total} 題 MC 答對百分比`,
  },
  commentsEntered: { en: 'Candidates’ performance entered', zh: '已填考生表現' },
  showPercent: { en: 'MC % correct, e.g. “A (65%)”', zh: 'MC 答對百分比，例如「A (65%)」' },
  showPerformance: { en: 'Candidates’ performance', zh: '考生表現' },

  // The dialog.
  title: { en: 'Exam results', zh: '考試結果' },
  description: {
    en: 'Enter how candidates did after the exam. It prints in the answer key, as HKEAA answer keys and examination reports do, and never on the paper. Leave a box empty to print nothing for it.',
    zh: '考試後填寫考生的表現。結果會印在評卷參考，與 HKEAA 的答案及考試報告相同，不會印在試卷上。留空的格不會印出。',
  },
  percentHeading: { en: 'MC: % correct', zh: 'MC：答對百分比' },
  percentHint: {
    en: 'The % of candidates who chose the key. Enter moves to the next question.',
    zh: '選了正確答案的考生百分比。按 Enter 跳到下一題。',
  },
  percentLabel: {
    en: (number: number) => `Question ${number}, % correct`,
    zh: (number: number) => `第 ${number} 題答對百分比`,
  },
  noKey: { en: 'No key set', zh: '未設答案' },
  invalid: { en: 'Enter a number from 0 to 100.', zh: '請輸入 0 至 100 的數字。' },
  noMc: { en: 'This paper has no MC questions.', zh: '這份試卷沒有 MC 題目。' },
  performanceHeading: { en: 'Candidates’ performance', zh: '考生表現' },
  performanceHint: {
    en: 'Comments like an HKEAA examination report. Each line prints as a paragraph; a side left empty uses the other.',
    zh: '可仿照 HKEAA 考試報告撰寫評語。每行印成一段；只填一種語言時，另一語言的評卷參考亦會使用它。',
  },
  mcComments: { en: 'MC', zh: 'MC' },
  sqComments: { en: 'Structured questions (SQ, LQ)', zh: '結構題（SQ、LQ）' },
  english: { en: 'English', zh: '英文' },
  chinese: { en: '中文', zh: '中文' },
  clearAll: { en: 'Clear all', zh: '全部清除' },
  cancel: { en: 'Cancel', zh: '取消' },
  save: { en: 'Save', zh: '儲存' },
});
