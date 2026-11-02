import { defineMessages } from '@/i18n/catalogue';

/** The editor's "Papers in this set" strip (k-0299). Paper 1 / Paper 2 stay English. */
export const PAPER_SET_STRIP_MESSAGES = defineMessages({
  set: { en: 'Set', zh: '套卷' },
  papersInSet: { en: 'Papers in this set', zh: '這套卷的試卷' },
  untitledSet: { en: 'Untitled set', zh: '未命名套卷' },
  paper1: { en: 'Paper 1', zh: 'Paper 1' },
  paper2: { en: 'Paper 2', zh: 'Paper 2' },
  examPaper: { en: 'Exam paper', zh: '試卷' },
  blank: { en: 'blank', zh: '空白' },
  openBlank: { en: (title: string) => `Open ${title} (blank, not started)`, zh: (title: string) => `開啟「${title}」（空白，未開始）` },
  open: { en: (title: string) => `Open ${title}`, zh: (title: string) => `開啟「${title}」` },
  thisPaper: { en: (title: string) => `${title} (open now)`, zh: (title: string) => `${title}（正在編輯）` },
  onlyThis: {
    en: 'Only this paper so far. Add the others from the start screen.',
    zh: '暫時只有這份試卷。可在開始畫面加入其他試卷。',
  },
  couldNotOpen: { en: 'Could not open that paper.', zh: '無法開啟該試卷。' },
});
