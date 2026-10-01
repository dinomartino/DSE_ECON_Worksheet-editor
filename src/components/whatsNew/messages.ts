import { defineMessages } from '@/i18n/catalogue';

/** The What's new dialog's chrome. The notes themselves come from CHANGELOG.md, both languages. */
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
  // The CHANGELOG's `###` groups.
  added: { en: 'Added', zh: '新增' },
  changed: { en: 'Changed', zh: '改動' },
  fixed: { en: 'Fixed', zh: '修正' },
  /** "8 added", for a folded release. */
  count: {
    en: (n: number, group: string) => `${n} ${group.toLowerCase()}`,
    zh: (n: number, group: string) => `${group} ${n} 項`,
  },
  /** The "## Earlier (…)" heading is English data; 中文 shows this in its place. */
  earlier: { en: 'Earlier', zh: '早期版本' },
});
