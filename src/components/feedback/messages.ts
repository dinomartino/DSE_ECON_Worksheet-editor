import { defineMessages } from '@/i18n/catalogue';

/** The Send feedback dialog. The report it builds (what leaves the app) stays English. */
export const FEEDBACK_MESSAGES = defineMessages({
  title: { en: 'Send feedback', zh: '意見回饋' },
  description: {
    en: 'A bug, an idea or a review. Your worksheet itself is never attached.',
    zh: '回報問題、提出構想或給予評價。工作紙本身絕不會一併傳送。',
  },
  kind: { en: 'Kind', zh: '類別' },
  kindOfFeedback: { en: 'Kind of feedback', zh: '回饋類別' },
  bug: { en: 'Bug', zh: '問題' },
  idea: { en: 'Idea', zh: '構想' },
  other: { en: 'Other', zh: '其他' },
  placeholderBug: {
    en: 'What did you do, what happened, what did you expect?',
    zh: '你做了甚麼、發生了甚麼事、你原本預期會怎樣？',
  },
  placeholderIdea: { en: 'What would help, and where would you use it?', zh: '甚麼功能會有幫助？你會在哪裏使用？' },
  placeholderOther: { en: 'A review, a question, anything else.', zh: '評價、問題或任何其他意見。' },
  message: { en: 'Message', zh: '內容' },
  email: { en: 'Email', zh: '電郵' },
  emailOptional: { en: '(optional, so we can reply)', zh: '（選填，方便我們回覆）' },
  details: { en: 'Details we attach', zh: '我們會附上的資料' },
  detailsSummary: {
    en: (version: string, platform: string, system: string) => `(version ${version}, ${platform}, ${system})`,
    zh: (version: string, platform: string, system: string) => `（版本 ${version}，${platform}，${system}）`,
  },
  githubNote: {
    en: (email: boolean) =>
      `GitHub opens a public issue and needs a free account${email ? '; email goes privately to the developer.' : '.'}`,
    zh: (email: boolean) => `GitHub 會建立公開的問題記錄，並需要免費帳戶${email ? '；電郵則會私下傳給開發者。' : '。'}`,
  },
  sentGithub: { en: 'Press Submit on the GitHub page to send it.', zh: '請在 GitHub 頁面按「Submit」送出。' },
  sentMail: { en: 'Press Send in your mail app to send it.', zh: '請在你的電郵程式按「傳送」送出。' },
  truncated: {
    en: ' The message was too long for the link. The full report is on your clipboard, paste the rest in.',
    zh: '內容太長，無法全部放入連結。完整報告已複製到剪貼簿，請貼上其餘部分。',
  },
  copyFailed: { en: 'Copy failed. The browser blocked clipboard access.', zh: '複製失敗，瀏覽器封鎖了剪貼簿。' },
  noGithub: { en: 'Could not open GitHub.', zh: '無法開啟 GitHub。' },
  noMail: { en: 'Could not open your mail app.', zh: '無法開啟你的電郵程式。' },
  copied: { en: 'Copied', zh: '已複製' },
  copyAll: { en: 'Copy to clipboard', zh: '複製到剪貼簿' },
  sendEmail: { en: 'Send by email', zh: '以電郵傳送' },
  openGithub: { en: 'Open on GitHub', zh: '在 GitHub 開啟' },
  done: { en: 'Done', zh: '完成' },
});
