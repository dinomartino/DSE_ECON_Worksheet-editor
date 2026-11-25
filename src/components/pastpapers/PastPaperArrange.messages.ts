import { defineMessages } from '@/i18n/catalogue';

/**
 * Arrange 編排 (k-0556): the Past paper bank's view where the teacher puts the questions in
 * their own order, moves them between topics, ticks a whole topic and makes worksheets.
 */
export const ARRANGE_MESSAGES = defineMessages({
  arrange: { en: 'Arrange', zh: '編排' },
  heading: { en: 'Arrange the bank', zh: '編排題庫' },
  hint: {
    en: 'Drag a question to reorder it, or onto another topic to move it there. Your order is kept on this computer; the bank itself never changes.',
    zh: '拖動題目可重新排列，拖到另一課題即移到該課題。你的排列只保存在這部電腦上，題庫本身不會改變。',
  },
  keysHint: {
    en: 'Keyboard: ↑ ↓ go between questions, Space ticks one, Alt + ↑ ↓ moves it (and the ticked ones with it).',
    zh: '鍵盤：↑ ↓ 在題目間移動，空白鍵勾選，Alt + ↑ ↓ 移動題目（連同已勾選的題目）。',
  },
  shown: {
    en: (n: number, total: number) => (n === total ? `${n.toLocaleString('en')} questions` : `${n.toLocaleString('en')} of ${total.toLocaleString('en')} questions`),
    zh: (n: number, total: number) => (n === total ? `${n.toLocaleString('en')} 題` : `${total.toLocaleString('en')} 題中的 ${n.toLocaleString('en')} 題`),
  },
  count: { en: (n: number) => `${n.toLocaleString('en')}`, zh: (n: number) => `${n.toLocaleString('en')}` },
  selectAll: { en: (name: string) => `Tick every question in ${name}`, zh: (name: string) => `勾選「${name}」的所有題目` },
  selectOne: { en: (source: string) => `Tick ${source}`, zh: (source: string) => `勾選${source}` },
  expand: { en: (name: string) => `Show ${name}`, zh: (name: string) => `展開「${name}」` },
  collapse: { en: (name: string) => `Hide ${name}`, zh: (name: string) => `收起「${name}」` },
  showAll: { en: 'Show all', zh: '全部展開' },
  collapseAll: { en: 'Collapse all', zh: '全部收合' },
  showAllTitle: { en: 'Open every part and topic, so every question shows', zh: '展開所有範疇及課題，顯示全部題目' },
  collapseAllTitle: { en: 'Fold every part and topic', zh: '收合所有範疇及課題' },
  selected: { en: (n: number) => `${n.toLocaleString('en')} ticked`, zh: (n: number) => `已勾選 ${n.toLocaleString('en')} 題` },
  clear: { en: 'Clear', zh: '清除' },
  moveTo: { en: 'Move to…', zh: '移到…' },
  moveToLabel: { en: 'Move the ticked questions to another topic', zh: '把已勾選的題目移到另一課題' },
  moved: {
    en: (n: number, name: string) => `Moved ${n === 1 ? '1 question' : `${n} questions`} to ${name}.`,
    zh: (n: number, name: string) => `已把 ${n} 題移到「${name}」。`,
  },
  makeWorksheet: { en: 'New worksheet', zh: '開新工作紙' },
  makeWorksheetTitle: {
    en: (name: string, n: number) => `Make a new worksheet of the ${n === 1 ? 'question' : `${n} questions`} in ${name}, in this order`,
    zh: (name: string, n: number) => `把「${name}」的 ${n} 題按此次序做成新工作紙`,
  },
  changed: { en: 'Your order', zh: '已自訂' },
  changedTitle: { en: 'You changed this topic: its order, or questions moved in or out.', zh: '你改動了此課題：次序，或移入、移出的題目。' },
  resetTopic: { en: 'Reset', zh: '還原' },
  resetTopicTitle: {
    en: 'Back to the bank’s order: questions moved here go back to their own topics, and this topic’s own come back.',
    zh: '還原為題庫原本的次序：移到這裏的題目回到原本的課題，此課題被移走的題目會回來。',
  },
  resetAll: { en: 'Reset all', zh: '全部還原' },
  resetAllConfirm: {
    en: 'Put every topic back in the bank’s order? Your arrangement will be lost.',
    zh: '把所有課題還原為題庫原本的次序？你的排列將會失去。',
  },
  resetDone: { en: 'Every topic is back in the bank’s order.', zh: '所有課題已還原為題庫原本的次序。' },
  movedFrom: { en: (name: string) => `From ${name}`, zh: (name: string) => `來自「${name}」` },
  movedFromTitle: {
    en: (name: string) => `The bank files this question under ${name}. Reset that topic to send it back.`,
    zh: (name: string) => `題庫原本把此題放在「${name}」。還原該課題即可把它送回。`,
  },
  moveUp: { en: 'Move up', zh: '上移' },
  moveDown: { en: 'Move down', zh: '下移' },
  drag: { en: 'Drag to move', zh: '拖動以移動' },
  dropHere: { en: 'Drop questions here', zh: '把題目拖到這裏' },
  showQuestion: { en: 'Show', zh: '顯示' },
  hideQuestion: { en: 'Hide', zh: '隱藏' },
  showQuestionTitle: { en: 'Show the question as it prints', zh: '顯示題目的列印樣式' },
  loadingQuestion: { en: 'Getting the question…', zh: '正在取得題目…' },
  questionError: { en: 'This question could not be downloaded.', zh: '未能下載此題。' },
  gathering: { en: 'Getting the questions…', zh: '正在取得題目…' },
  missing: {
    en: (n: number) => `${n === 1 ? '1 question' : `${n} questions`} could not be downloaded and ${n === 1 ? 'was' : 'were'} left out.`,
    zh: (n: number) => `有 ${n} 題未能下載，已略去。`,
  },
  pictures: { en: (n: number) => (n === 1 ? '1 picture' : `${n} pictures`), zh: (n: number) => `${n} 幅圖` },
  carrying: { en: (n: number) => (n === 1 ? '1 question' : `${n} questions`), zh: (n: number) => `${n} 題` },
  needsAll: {
    en: (mb: string) => `This bank’s list has no search index, so arranging needs every topic downloaded (about ${mb} MB, once).`,
    zh: (mb: string) => `此題庫的清單沒有搜尋索引，編排前需下載所有課題（約 ${mb} MB，只需一次）。`,
  },
  downloadAll: { en: 'Download every topic', zh: '下載所有課題' },
  showSources: { en: 'Show source', zh: '顯示出處' },
  showSourcesTitle: {
    en: 'Print each question’s source (e.g. DSE2024/P1/Q38) on the worksheets made here. Off unless you tick it; a paper can change it later in Setup → Page.',
    zh: '在這裏製作的工作紙上印出每題的出處（例如 DSE2024/P1/Q38）。預設不印，勾選才會印；之後可在「頁面設定 → 頁面」更改。',
  },
  goTo: { en: 'Go to a topic…', zh: '跳到課題…' },
  addHere: { en: 'Add', zh: '加入' },
  addHereTitle: {
    en: (name: string, n: number) => `Add the ${n === 1 ? 'question' : `${n} questions`} in ${name} to this paper, in this order`,
    zh: (name: string, n: number) => `把「${name}」的 ${n} 題按此次序加入此試卷`,
  },
  addTickedTitle: { en: 'Add the ticked questions to this paper, in this order', zh: '把已勾選的題目按此次序加入此試卷' },
  noneMatch: { en: 'No question matches the filters.', zh: '沒有題目符合篩選條件。' },
});
