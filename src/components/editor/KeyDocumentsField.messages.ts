import { defineMessages } from '@/i18n/catalogue';

/** The export dialog's "Also include" list of saved documents. */
export const KEY_DOCUMENTS_MESSAGES = defineMessages({
  label: { en: 'Also include', zh: '一併包含' },
  hint: {
    en: 'Their answer keys follow this one’s in the same file, each from a new page.',
    zh: '它們的評卷參考會接在本文件的評卷參考之後，放在同一個檔案，各自由新一頁開始。',
  },
  searchLabel: { en: 'Search saved documents', zh: '搜尋已儲存的工作紙' },
  searchPlaceholder: { en: 'Search by name', zh: '按名稱搜尋' },
  listLabel: { en: 'Saved documents', zh: '已儲存的工作紙' },
  noMatch: {
    en: (search: string) => `No saved document matches “${search}”.`,
    zh: (search: string) => `沒有符合「${search}」的已儲存文件。`,
  },
  order: { en: 'Order in the file', zh: '在檔案中的次序' },
  thisDocument: { en: '(this document)', zh: '（本文件）' },
  moveUp: { en: (title: string) => `Move ${title} up`, zh: (title: string) => `將 ${title} 上移` },
  moveDown: { en: (title: string) => `Move ${title} down`, zh: (title: string) => `將 ${title} 下移` },
  leaveOut: { en: (title: string) => `Leave out ${title}`, zh: (title: string) => `不包含 ${title}` },
});
