import { defineMessages } from '@/i18n/catalogue';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Sync's interface text (`docs/design/library-folder.md` § 1.4): the names of the copies it
 * makes (`localNamer.ts`), this computer's default name, and the open editor's notices.
 * A copy's name is written into the document, in the language of the computer that made it.
 */
export const SYNC_MESSAGES = defineMessages({
  /** This computer's version of a document changed on both: `time` is "14:32". */
  conflictCopy: {
    en: (title: string, computer: string, day: number, month: number, time: string) =>
      `${title} (${computer}, ${day} ${MONTHS[month - 1] ?? month} ${time})`,
    zh: (title: string, computer: string, day: number, month: number, time: string) =>
      `${title}（${computer}，${month}月${day}日 ${time}）`,
  },
  providerCopy: {
    en: (title: string) => `${title} (from another computer)`,
    zh: (title: string) => `${title}（來自另一部電腦）`,
  },
  computerMac: { en: 'Mac', zh: 'Mac' },
  computerWindows: { en: 'Windows PC', zh: 'Windows 電腦' },
  computerOther: { en: 'Computer', zh: '電腦' },
  reloaded: { en: 'Updated from your other computer.', zh: '已載入另一部電腦的修改。' },
  keptBoth: {
    en: (copy: string) =>
      `This worksheet was changed on your other computer while you were editing. Your edits are now a separate copy: “${copy}”.`,
    zh: (copy: string) => `你編輯期間，這份工作紙在另一部電腦被修改。你的修改已另存為副本：「${copy}」。`,
  },
});
