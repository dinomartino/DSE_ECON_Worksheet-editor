import { defineMessages } from '@/i18n/catalogue';

/** The What's new dialog's chrome. The release notes themselves (the CHANGELOG) stay English. */
export const WHATS_NEW_MESSAGES = defineMessages({
  titleIn: { en: (version: string) => `What’s new in ${version}`, zh: (version: string) => `${version} 的最新功能` },
  released: { en: (date: string) => `Released ${date}`, zh: (date: string) => `發佈日期：${date}` },
  seeAll: { en: 'See all releases', zh: '查看所有版本' },
  gotIt: { en: 'Got it', zh: '知道了' },
  title: { en: 'What’s new', zh: '最新功能' },
  description: {
    en: (version: string) => `You have version ${version}. Every release, newest first.`,
    zh: (version: string) => `你目前的版本是 ${version}。以下是所有版本，最新的在前。`,
  },
  done: { en: 'Done', zh: '完成' },
  none: { en: 'No release notes in this build.', zh: '這個版本沒有更新說明。' },
  unreleased: { en: 'Unreleased', zh: '未發佈' },
  yourVersion: { en: 'Your version', zh: '你的版本' },
  devOnly: { en: 'Dev build only', zh: '僅限開發版' },
});
