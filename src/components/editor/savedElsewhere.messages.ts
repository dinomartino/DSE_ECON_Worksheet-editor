import { defineMessages } from '@/i18n/catalogue';

/** The warning when another tab saved the open document while this one has unsaved edits. */
export const SAVED_ELSEWHERE_MESSAGES = defineMessages({
  title: { en: 'Changed in another tab', zh: '已在另一分頁更改' },
  body: {
    en: 'This paper was saved in another tab while you had unsaved edits here. Its topics are kept. Reload to see the other tab’s version; your unsaved edits here will be lost.',
    zh: '你在此分頁仍有未儲存的修改時，另一分頁已儲存這份試卷。課題已保留。重新載入可查看另一分頁的版本，但此分頁未儲存的修改將會遺失。',
  },
  reload: { en: 'Reload', zh: '重新載入' },
});
