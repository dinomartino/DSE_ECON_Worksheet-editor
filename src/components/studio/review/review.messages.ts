import { defineMessages } from '@/i18n/catalogue';

/**
 * The studio's review tools' words (k-0598): the Note box under each reply and on the chat,
 * the quick tags, and Export for review. Develop builds on the desktop only, never in front of
 * a teacher in a release build; English and Hong Kong 繁體中文 like every interface string.
 */
export const REVIEW_MESSAGES = defineMessages({
  dev: { en: 'Dev', zh: '開發' },
  devTitle: { en: 'Only in a develop build: for improving the studio, never in a release', zh: '只在開發版出現：用來改進工作室，正式版不會有' },
  note: { en: 'Note', zh: '備註' },
  noteTitle: { en: 'Your own words on this reply, kept for Export for review', zh: '你對這個回覆的意見，會在「匯出以供檢討」時一併匯出' },
  notePlaceholder: { en: 'What you wanted, what was wrong, what good would look like…', zh: '你想要甚麼、哪裏出錯、怎樣才算好……' },
  chatNote: { en: 'Note on this chat', zh: '這個對話的備註' },
  chatNotePlaceholder: { en: 'What this whole chat was for, and how it went…', zh: '整個對話想做甚麼、結果如何……' },
  tagGood: { en: 'Good', zh: '好' },
  tagWrong: { en: 'Wrong', zh: '有錯' },
  tagUnclear: { en: 'Unclear', zh: '不清楚' },
  tagsLabel: { en: 'Quick tag', zh: '快速標記' },
  noted: { en: 'Noted', zh: '已備註' },
  exportButton: { en: 'Export for review', zh: '匯出以供檢討' },
  exportTitle: { en: 'Save the chats with what happened behind each reply and your notes, for improving the studio', zh: '儲存對話、每個回覆背後的過程和你的備註，用來改進工作室' },
  exportThis: { en: 'This chat', zh: '這個對話' },
  exportAll: { en: (n: number) => `All chats (${n})`, zh: (n: number) => `所有對話（${n} 個）` },
  exportHint: { en: 'One .zip: a readable conversation.md and raw.json per chat. Kept on this computer; nothing is sent.', zh: '一個 .zip：每個對話一份 conversation.md 和 raw.json。只儲存在這部電腦，不會傳送。' },
  exportEmpty: { en: 'No chat to export yet.', zh: '暫時未有可匯出的對話。' },
  exporting: { en: 'Exporting…', zh: '正在匯出……' },
  exported: {
    en: (chats: number, recorded: number, replies: number) => `Exported ${chats} chat${chats === 1 ? '' : 's'}: ${recorded} of ${replies} replies have a behind-the-scenes record.`,
    zh: (chats: number, recorded: number, replies: number) => `已匯出 ${chats} 個對話：${replies} 個回覆中有 ${recorded} 個有背後過程紀錄。`,
  },
  exportFailed: { en: 'The export could not be saved.', zh: '未能儲存匯出檔案。' },
});
