import { defineMessages } from '@/i18n/catalogue';

/** The quiet line under the Topic row after a synced edit, its undo or its redo. */
export const TOPIC_SYNC_MESSAGES = defineMessages({
  alsoUpdated: {
    en: (n: number) => `Also updated in ${n} other ${n === 1 ? 'worksheet' : 'worksheets'}.`,
    zh: (n: number) => `已同時更新另外 ${n} 份工作紙。`,
  },
  alsoUndone: {
    en: (n: number) => `Also undone in ${n} other ${n === 1 ? 'worksheet' : 'worksheets'}.`,
    zh: (n: number) => `已同時在另外 ${n} 份工作紙復原。`,
  },
  keepsOld: {
    en: (title: string, reason: string) => `“${title}” keeps its old topics: ${reason}.`,
    zh: (title: string, reason: string) => `「${title}」保留原有課題：${reason}。`,
  },
  keepsNewer: {
    en: (title: string) => `“${title}” keeps its newer topics: they changed since.`,
    zh: (title: string) => `「${title}」保留較新的課題：課題其後已更改。`,
  },
  untitled: { en: 'A worksheet', zh: '一份工作紙' },
});
