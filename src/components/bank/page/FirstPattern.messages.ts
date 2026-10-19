import { defineMessages } from '@/i18n/catalogue';

const questions = (n: number) => `${n} ${n === 1 ? 'question' : 'questions'}`;

/** The 題型 map's first run: pick a topic, click questions that are alike, name them. */
export const FIRST_PATTERN_MESSAGES = defineMessages({
  step1: { en: 'Pick a topic', zh: '選一個課題' },
  step2: { en: 'Click questions that are alike', zh: '按選相似的題目' },
  step3: { en: 'Name them', zh: '為它們命名' },
  mostFirst: { en: 'Most questions to sort first', zh: '待分類題目最多的排先' },
  topicCount: {
    en: (n: number, subTopics: number) => `${n} to sort · ${subTopics} ${subTopics === 1 ? 'sub-topic' : 'sub-topics'}`,
    zh: (n: number, subTopics: number) => `${n} 條待分類 · ${subTopics} 個子課題`,
  },
  pickLabel: { en: (name: string) => `Sort questions in ${name}`, zh: (name: string) => `分類「${name}」的題目` },
  otherTopics: { en: 'Other topics:', zh: '其他課題：' },
  subTopics: { en: 'Sub-topic', zh: '子課題' },
  step2Hint: {
    en: 'A 題型 sits under one sub-topic. Shift-click selects a run.',
    zh: '題型屬於一個子課題。按住 Shift 再按可連續選取。',
  },
  showMore: { en: (n: number) => `Show ${n} more`, zh: (n: number) => `顯示其餘 ${n} 條` },
  showFewer: { en: 'Show fewer', zh: '顯示較少' },
  selectedCount: { en: (n: number) => `${n} selected`, zh: (n: number) => `已選取 ${n} 條` },
  clear: { en: 'Clear', zh: '取消選取' },
  nameLabel: { en: 'Name this 題型', zh: '為這個題型命名' },
  namePlaceholder: { en: 'e.g. 計算需求價格彈性, Per unit tax & elasticity', zh: '例如：計算需求價格彈性、Per unit tax & elasticity' },
  create: { en: 'Create 題型', zh: '建立題型' },
  whySelect: { en: 'Click at least one question above first.', zh: '請先在上方按選最少一條題目。' },
  whyName: { en: 'Type a name for the questions you picked.', zh: '請為已選取的題目輸入名稱。' },
  ready: {
    en: (n: number) => `Press Enter to file ${n === 1 ? 'this question' : `these ${n} questions`} under it.`,
    zh: (n: number) => `按 Enter 把${n === 1 ? '這條題目' : `這 ${n} 條題目`}歸入這個題型。`,
  },
  wholeBoard: { en: (code: string) => `Sort all of ${code} on the board →`, zh: (code: string) => `在分類板分類整個 ${code} →` },
  preview: { en: 'How it will look', zh: '建立後的樣子' },
  previewNote: { en: 'Preview', zh: '預覽' },
  yourName: { en: 'Your 題型', zh: '你的題型' },
  notSorted: { en: 'Not sorted', zh: '未分類' },
  shapes: { en: 'Names teachers use:', zh: '老師常用的名稱：' },

  // After the first one
  made: {
    en: (name: string, n: number) => `“${name}” is your first 題型, with ${questions(n)}.`,
    zh: (name: string, n: number) => `「${name}」是你的第一個題型，有 ${n} 條題目。`,
  },
  undo: { en: 'Undo', zh: '復原' },
  keepSorting: { en: (code: string) => `Keep sorting ${code} →`, zh: (code: string) => `繼續分類 ${code} →` },
});
