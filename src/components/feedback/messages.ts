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
  // The optional screenshot. It travels on the clipboard, never in the link.
  screenshot: { en: 'Screenshot', zh: '截圖' },
  screenshotOptional: { en: '(optional)', zh: '（選填）' },
  screenshotZone: { en: 'Paste or drop a screenshot here', zh: '在這裏貼上或拖放截圖' },
  screenshotDropping: { en: 'Drop the image to attach it', zh: '放開即可附上圖片' },
  chooseImage: { en: 'Choose image…', zh: '選擇圖片…' },
  screenshotHintMac: {
    en: 'Press ⇧⌘4 and drop the file here, or press ⌃⇧⌘4 to copy part of the screen and paste it with ⌘V.',
    zh: '按 ⇧⌘4 截圖後把檔案拖放到這裏；或按 ⌃⇧⌘4 複製部分畫面，再按 ⌘V 貼上。',
  },
  screenshotHintWindows: {
    en: 'Press Win+Shift+S to copy part of the screen, then press Ctrl+V here.',
    zh: '按 Win+Shift+S 複製部分畫面，再在這裏按 Ctrl+V 貼上。',
  },
  screenshotHintOther: {
    en: 'Take one with your system screenshot tool, then paste it here.',
    zh: '用系統的截圖工具截圖，再貼上到這裏。',
  },
  screenshotPrivacy: {
    en: 'A screenshot can show your worksheet. On GitHub it will be public.',
    zh: '截圖可能會顯示你的工作紙。在 GitHub 上，截圖會公開。',
  },
  screenshotAlt: { en: 'Your screenshot', zh: '你的截圖' },
  screenshotSize: {
    en: (width: number, height: number, size: string) => `${width} × ${height} px, ${size}`,
    zh: (width: number, height: number, size: string) => `${width} × ${height} px，${size}`,
  },
  screenshotReading: { en: 'Reading the image…', zh: '正在讀取圖片…' },
  copyScreenshot: { en: 'Copy screenshot', zh: '複製截圖' },
  removeScreenshot: { en: 'Remove', zh: '移除' },
  removeScreenshotLabel: { en: 'Remove the screenshot', zh: '移除截圖' },
  screenshotNotImage: {
    en: 'That file is not a picture. Choose a PNG, JPEG, GIF or WebP image.',
    zh: '該檔案不是圖片，請選擇 PNG、JPEG、GIF 或 WebP 圖片。',
  },
  screenshotTooLarge: { en: 'That image is over 20 MB. Choose a smaller one.', zh: '該圖片超過 20 MB，請選擇較小的圖片。' },
  screenshotUnreadable: { en: 'That image could not be read.', zh: '無法讀取該圖片。' },
  sentGithubShot: {
    en: (chord: string) =>
      `The screenshot is on your clipboard. On the GitHub page, click the Screenshot line and press ${chord}, then press Submit.`,
    zh: (chord: string) =>
      `截圖已複製到剪貼簿。請在 GitHub 頁面點按「Screenshot」一行再按 ${chord} 貼上，然後按「Submit」送出。`,
  },
  sentMailShot: {
    en: (chord: string) =>
      `The screenshot is on your clipboard. In your mail app, click the Screenshot line and press ${chord}, then press Send.`,
    zh: (chord: string) => `截圖已複製到剪貼簿。請在電郵程式點按「Screenshot」一行再按 ${chord} 貼上，然後按「傳送」。`,
  },
  truncatedShot: {
    en: ' The message was too long for the link. After the screenshot, press Copy the full text and paste it in too.',
    zh: '內容太長，無法全部放入連結。貼上截圖後，請按「複製完整內容」，再貼上其餘部分。',
  },
  copyFullText: { en: 'Copy the full text', zh: '複製完整內容' },
  screenshotCopyFailed: {
    en: ' The screenshot could not be copied. Drag the image file into the issue or email instead.',
    zh: '無法複製截圖，請改為把圖片檔案拖放到問題記錄或電郵內。',
  },
  copiedTextShot: {
    en: 'Text copied. Paste it, then press Copy screenshot and paste the image too.',
    zh: '文字已複製。貼上後，請按「複製截圖」，再貼上圖片。',
  },
  screenshotCopied: {
    en: (chord: string) => `Screenshot copied. Paste it with ${chord}.`,
    zh: (chord: string) => `截圖已複製，請按 ${chord} 貼上。`,
  },
  copyText: { en: 'Copy text', zh: '複製文字' },
});
