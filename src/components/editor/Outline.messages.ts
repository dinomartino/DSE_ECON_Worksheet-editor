import { defineMessages } from '@/i18n/catalogue';

/** The Content tab: the outline's rows, page groups, drag ghost and "Add here" menu. */
export const OUTLINE_MESSAGES = defineMessages({
  untitled: { en: 'Untitled worksheet', zh: '未命名工作紙' },
  setup: { en: 'Setup', zh: '頁面設定' },
  setupTitle: {
    en: 'Title, paper, margins, header and footer',
    zh: '標題、紙張、邊界、頁首及頁尾',
  },
  empty: { en: 'Empty. Add something below.', zh: '暫無內容，請在下方加入。' },
  emptyPage: { en: 'Empty page. Drag something here.', zh: '空白頁，請把項目拖到這裡。' },
  dragToReorder: { en: 'Drag to reorder', zh: '拖曳以重新排序' },
  moveUp: { en: 'Move up', zh: '上移' },
  moveDown: { en: 'Move down', zh: '下移' },

  rows: { en: (n: number) => `${n} row${n === 1 ? '' : 's'}`, zh: (n: number) => `${n} 行` },
  blocks: { en: (n: number) => `${n} block${n === 1 ? '' : 's'}`, zh: (n: number) => `${n} 個區塊` },
  fillsPage: { en: 'fills page', zh: '填滿頁面' },
  lines: { en: (n: number) => `${n} ${n === 1 ? 'line' : 'lines'}`, zh: (n: number) => `${n} 行` },
  continueNumbering: { en: 'Continue numbering from previous', zh: '接續上一部分的編號' },
  restartNumbering: { en: 'Restart numbering at 1', zh: '由 1 重新編號' },
  restartsHere: { en: 'Numbering restarts at 1 here', zh: '編號在此由 1 重新開始' },
  actionsFor: { en: (name: string) => `Actions for ${name}`, zh: (name: string) => `${name}的操作` },
  deleteKind: { en: (name: string) => `Delete ${name.toLowerCase()}`, zh: (name: string) => `刪除${name}` },

  untitledQuestion: { en: 'Untitled question', zh: '未命名題目' },
  marksShort: { en: (n: number) => `${n}m`, zh: (n: number) => `${n} 分` },
  actionsForQuestion: {
    en: (number: string) => `Actions for question ${number}`,
    zh: (number: string) => `題目 ${number} 的操作`,
  },
  duplicate: { en: 'Duplicate', zh: '建立副本' },
  copyForWord: { en: 'Copy for Word', zh: '複製到 Word' },
  moveTo: { en: (name: string) => `Move to ${name}`, zh: (name: string) => `移至 ${name}` },
  sectionN: { en: (n: number) => `Section ${n}`, zh: (n: number) => `部分 ${n}` },
  deleteQuestion: { en: 'Delete question', zh: '刪除題目' },

  notPlaced: { en: 'Not yet placed', zh: '尚未排入頁面' },
  page: { en: (n: number) => `Page ${n}`, zh: (n: number) => `第 ${n} 頁` },
  emptyGroup: { en: 'empty', zh: '空' },
  items: { en: (n: number) => `${n} item${n === 1 ? '' : 's'}`, zh: (n: number) => `${n} 個項目` },
  removeBreak: { en: 'Remove page break', zh: '移除分頁' },
  deletePage: { en: 'Delete page', zh: '刪除此頁' },
  deletePageAnd: {
    en: (n: number) => `Delete page and ${n} item${n === 1 ? '' : 's'}`,
    zh: (n: number) => `刪除此頁及 ${n} 個項目`,
  },

  dragQuestion: {
    en: (number: string) => (number ? `Question ${number}` : 'Question'),
    zh: (number: string) => (number ? `題目 ${number}` : '題目'),
  },
  dragElement: { en: 'Layout element', zh: '版面元素' },
  dragItem: { en: 'Item', zh: '項目' },

  addToWorksheet: { en: 'Add to worksheet', zh: '插入至工作紙' },
  addHere: { en: 'Add here', zh: '在此插入' },
  addSection: { en: 'Section (restarts numbering)', zh: '部分（重新編號）' },
  addPartHeader: { en: 'Part header (with marks)', zh: '分部標題（附總分）' },
  addText: { en: 'Text / note', zh: '文字或備註' },
});
