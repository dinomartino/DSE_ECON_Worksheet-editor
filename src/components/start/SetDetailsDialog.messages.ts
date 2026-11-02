import { defineMessages } from '@/i18n/catalogue';

/** The Set details dialog (k-0299 step B): a set's shared details, written to every paper. */
export const SET_DETAILS_MESSAGES = defineMessages({
  title: { en: 'Set details', zh: '套卷資料' },
  description: {
    en: 'These are kept the same on every paper in the set. Times and each paper’s own name stay per paper.',
    zh: '套卷內每份試卷都會使用相同資料。考試時間及各試卷自己的名稱則各自保留。',
  },
  setName: { en: 'Set name', zh: '套卷名稱' },
  school: { en: 'School', zh: '學校' },
  schoolHint: { en: 'On each cover, at the top and at the foot.', zh: '印在每份封面的頂部及底部。' },
  exam: { en: 'Examination', zh: '考試' },
  examHint: { en: 'The line under the school on each cover.', zh: '每份封面學校下方的一行。' },
  english: { en: 'English', zh: '英文' },
  chinese: { en: '中文', zh: '中文' },
  satOn: { en: 'Date sat', zh: '考試日期' },
  classes: { en: 'Classes', zh: '班別' },
  classesPlaceholder: { en: '6A 6B', zh: '6A 6B' },
  whoHint: {
    en: 'Not printed: the question bank uses them for “used with”.',
    zh: '不會印出：題庫用來顯示「用於哪些班別」。',
  },
  papers: { en: 'Papers', zh: '試卷' },
  noLine: {
    en: (field: string) => `No ${field} line on its cover: it keeps its own.`,
    zh: (field: string) => `封面沒有${field}一行：會保留原有內容。`,
  },
  // Drift.
  differs: { en: 'Not the same on every paper', zh: '各試卷並不一致' },
  says: { en: (paper: string, value: string) => `${paper}: ${value}`, zh: (paper: string, value: string) => `${paper}：${value}` },
  nothing: { en: '(none)', zh: '（沒有）' },
  noLineShort: { en: '(no line on the cover)', zh: '（封面沒有這一行）' },
  useOnEvery: { en: (value: string) => `Use “${value}” on every paper`, zh: (value: string) => `每份試卷都用「${value}」` },
  datesNote: {
    en: 'Fine if the papers were sat on different days.',
    zh: '如試卷在不同日子應考，這是正常的。',
  },
  willApply: { en: 'Will be written to every paper.', zh: '會寫入每份試卷。' },
  apply: { en: 'Apply to every paper', zh: '套用至每份試卷' },
  cancel: { en: 'Cancel', zh: '取消' },
  loading: { en: 'Reading the papers…', zh: '正在讀取試卷…' },
  applied: { en: (n: number) => `Set details written to ${n === 1 ? '1 paper' : `${n} papers`}.`, zh: (n: number) => `已將套卷資料寫入 ${n} 份試卷。` },
  // Where it opens from.
  open: { en: 'Set details…', zh: '套卷資料…' },
  detailsDiffer: { en: 'Details differ', zh: '資料不一致' },
});
