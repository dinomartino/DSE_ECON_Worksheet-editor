import { defineMessages } from '@/i18n/catalogue';

/** The cart tray at the foot of the bank: your list, its order, and what to do with it. */
export const SELECTION_TRAY_MESSAGES = defineMessages({
  yourList: { en: 'Your list', zh: '我的清單' },
  orderHint: { en: ' · prints in this order · drag, or Alt+↑ ↓, to move', zh: ' · 按此順序列印 · 拖曳或按 Alt+↑ ↓ 移動' },
  sortedTitle: { en: 'Already in this order', zh: '已是此順序' },
  sortTitle: { en: 'Keep each type in its order', zh: '各類型按順序排列' },
  emptyHint: {
    en: 'Tick a question, or press Space on it, to add it here.',
    zh: '勾選題目，或在題目上按空白鍵，即可加入這裏。',
  },
  listLabel: { en: 'Picked questions, in print order', zh: '已選題目（按列印順序）' },
  untitled: { en: 'Untitled question', zh: '未命名題目' },
  handleLabel: {
    en: (n: number) => `Move question ${n}. Drag, or press Alt+↑ or Alt+↓`,
    zh: (n: number) => `移動第 ${n} 題。拖曳，或按 Alt+↑ 或 Alt+↓`,
  },
  handleTitle: { en: 'Drag to move (Alt+↑ ↓)', zh: '拖曳移動（Alt+↑ ↓）' },
  moveUp: { en: (n: number) => `Move question ${n} up`, zh: (n: number) => `將第 ${n} 題上移` },
  moveDown: { en: (n: number) => `Move question ${n} down`, zh: (n: number) => `將第 ${n} 題下移` },
  takeOff: { en: (n: number) => `Take question ${n} off the list`, zh: (n: number) => `將第 ${n} 題移出清單` },
  isEmpty: { en: 'Your list is empty', zh: '清單是空的' },
  topicsTitle: { en: (mix: string) => `Topics: ${mix}`, zh: (mix: string) => `課題：${mix}` },
  minutes: { en: (n: number) => `≈ ${n} min`, zh: (n: number) => `≈ ${n} 分鐘` },
  undo: { en: 'Undo', zh: '復原' },
  close: { en: 'Close', zh: '關閉' },
  hide: { en: 'Hide your list', zh: '隱藏清單' },
  show: { en: 'Show your list', zh: '顯示清單' },
  clear: { en: 'Clear', zh: '清除' },
  clearTitle: { en: 'Empty the list (you can undo)', zh: '清空清單（可復原）' },
  setTopic: { en: 'Set topic…', zh: '設定課題…' },
  addToTitle: { en: (title: string) => `Open “${title}” and add them at the end`, zh: (title: string) => `開啟「${title}」並將題目加到最後` },
  addTo: { en: (title: string) => `Add to “${title}”`, zh: (title: string) => `加到「${title}」` },
  newWorksheet: { en: 'New worksheet from these', zh: '以這些題目新增工作紙' },
});
