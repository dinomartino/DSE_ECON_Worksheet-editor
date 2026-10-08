import { defineMessages } from '@/i18n/catalogue';
import { providerCopyName } from './names';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Sync's interface text (`docs/design/library-folder.md` § 1.4): the names of the copies it
 * makes (`localNamer.ts`), this computer's default name, its notices, and why a folder
 * cannot be reached (Settings → Storage location shows those too).
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
  /** One bilingual name in both: two computers in different languages must make the same copy. */
  providerCopy: { en: providerCopyName, zh: providerCopyName },
  computerMac: { en: 'Mac', zh: 'Mac' },
  computerWindows: { en: 'Windows PC', zh: 'Windows 電腦' },
  computerOther: { en: 'Computer', zh: '電腦' },
  reloaded: { en: 'Updated from your other computer.', zh: '已載入另一部電腦的修改。' },
  keptBoth: {
    en: (copy: string) =>
      `This worksheet was changed on your other computer while you were editing. Your edits are now a separate copy: “${copy}”.`,
    zh: (copy: string) => `你編輯期間，這份工作紙在另一部電腦被修改。你的修改已另存為副本：「${copy}」。`,
  },
  conflicts: {
    en: (count: number, copy: string) =>
      count === 1
        ? `A worksheet was changed on both computers. Both versions are kept; the copy is named “${copy}”.`
        : `${count} worksheets were changed on both computers. Both versions of each are kept; the copies are listed below.`,
    zh: (count: number, copy: string) =>
      count === 1
        ? `一份工作紙在兩部電腦上都有修改，兩個版本都已保留，副本名為「${copy}」。`
        : `有 ${count} 份工作紙在兩部電腦上都有修改，每份的兩個版本都已保留，副本如下。`,
  },
  review: { en: 'Review', zh: '查看' },
  refilled: {
    en: 'The cloud copy was empty, so it was refilled from this computer.',
    zh: '雲端副本是空的，所以已用這部電腦的內容重新填入。',
  },
  unreachable: {
    en: "Can't reach the storage folder. Your edits are kept on this computer and will be saved there when it is back.",
    zh: '無法連接儲存資料夾。你的修改已保留在這部電腦，資料夾恢復後會自動儲存。',
  },
  /** Why the folder cannot be used: `LibraryUnavailableReason`, or `error` when a run failed. */
  reasonRootMissing: {
    en: 'The folder is not there. Your cloud drive may be signed out or still starting.',
    zh: '找不到資料夾。你的雲端硬碟可能已登出，或仍在啟動。',
  },
  reasonNotAFolder: { en: 'That place is no longer a folder.', zh: '該位置已不再是資料夾。' },
  reasonNoMarker: {
    en: 'The folder is missing its econ-studio-library.json file.',
    zh: '資料夾缺少 econ-studio-library.json 檔案。',
  },
  reasonNewerFormat: {
    en: 'A newer version of Econ Studio set up this folder. Update the app to use it.',
    zh: '這個資料夾由較新版本的 Econ Studio 設定。請先更新程式。',
  },
  reasonIo: { en: 'The folder could not be read.', zh: '未能讀取資料夾。' },
  reasonError: { en: 'Something went wrong while syncing. It will try again.', zh: '同步時出現問題，稍後會再試。' },
});
