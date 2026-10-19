import { defineMessages } from '@/i18n/catalogue';

const questions = (n: number) => `${n} ${n === 1 ? 'question' : 'questions'}`;

/** The 題型 sort board: one coarse topic's questions, selected and named into 題型. */
export const SORT_BOARD_MESSAGES = defineMessages({
  hint: {
    en: 'Select questions that are alike, then name them. Shift-click selects a run.',
    zh: '選取相似的題目，然後為它們命名。按住 Shift 再按可連續選取。',
  },
  keys: {
    en: 'Keys: 1–9 sort into that 題型 · N name · Z undo · Esc clear',
    zh: '快捷鍵：1–9 分類到該題型 · N 命名 · Z 復原 · Esc 取消選取',
  },
  counts: {
    en: (left: number, sorted: number) => `${left} not sorted · ${sorted} sorted`,
    zh: (left: number, sorted: number) => `${left} 條未分類 · 已分類 ${sorted} 條`,
  },
  sectionLeft: { en: (n: number) => `${n} not sorted`, zh: (n: number) => `${n} 條未分類` },
  allSorted: { en: 'All sorted', zh: '全部已分類' },
  bucketCount: { en: (n: number) => questions(n), zh: (n: number) => `${n} 條題目` },
  bucketTitle: {
    en: (name: string) => `Sort the selected questions into “${name}”`,
    zh: (name: string) => `把已選取的題目分類到「${name}」`,
  },
  bucketIdle: { en: 'Select questions first', zh: '請先選取題目' },
  select: { en: (what: string) => `Select ${what}`, zh: (what: string) => `選取 ${what}` },
  marks: { en: (n: number) => `${n} ${n === 1 ? 'mark' : 'marks'}`, zh: (n: number) => `${n} 分` },
  diagram: { en: 'Diagram', zh: '圖表' },
  noText: { en: '(no text)', zh: '（沒有文字）' },
  selected: { en: (n: number) => `${n} selected`, zh: (n: number) => `已選取 ${n} 條` },
  nameLabel: { en: 'Name this 題型', zh: '為這個題型命名' },
  namePlaceholder: { en: 'e.g. 計算需求價格彈性, Per unit tax & elasticity', zh: '例如：計算需求價格彈性、Per unit tax & elasticity' },
  create: { en: 'Create', zh: '建立' },
  addTo: { en: (name: string) => `Add to “${name}”`, zh: (name: string) => `加到「${name}」` },
  clear: { en: 'Clear', zh: '取消選取' },
  orInto: { en: 'or into', zh: '或分類到' },
  sorted: {
    en: (n: number, name: string) => `${questions(n)} sorted into “${name}”.`,
    zh: (n: number, name: string) => `已把 ${n} 條題目分類到「${name}」。`,
  },
  undone: { en: (name: string) => `Took back the sort into “${name}”.`, zh: (name: string) => `已復原分類到「${name}」。` },
  undo: { en: 'Undo', zh: '復原' },
  done: { en: 'Done', zh: '完成' },
  topicDone: { en: (code: string) => `Every question in ${code} has a 題型.`, zh: (code: string) => `${code} 的每條題目都已有題型。` },
  next: { en: (code: string) => `Next: ${code} →`, zh: (code: string) => `下一個：${code} →` },
  backToMap: { en: 'Back to the 題型 map', zh: '返回題型一覽' },
  nothing: {
    en: 'No question in this topic has a sub-topic yet. A 題型 sits under a sub-topic.',
    zh: '這個課題的題目都未有子課題。題型屬於子課題。',
  },
});
