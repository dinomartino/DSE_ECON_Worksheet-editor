import { defineMessages } from '@/i18n/catalogue';

export const SPACE_ABOVE_MESSAGES = defineMessages({
  label: { en: 'Space above', zh: '上方空位' },
  paperDefault: {
    en: (lines: number) => (lines === 1 ? 'Paper default (1 line)' : `Paper default (${lines} lines)`),
    zh: (lines: number) => `試卷預設（${lines} 行）`,
  },
  lines: {
    en: (lines: number) => (lines === 1 ? '1 line' : `${lines} lines`),
    zh: (lines: number) => `${lines} 行`,
  },
  // Said under the control when a number is set that the page cannot use, so a choice never
  // silently does nothing. Not "one line stays": a Paper 1 spaces a lead-in by two.
  noteFirst: {
    en: 'This is the first thing on the paper, so there is nothing to space it from.',
    zh: '這是試卷的第一項，上方沒有內容可作間隔。',
  },
  noteAfterElement: {
    en: 'Only counts straight under a question of the same kind. Something else sits above this one, so it keeps the usual spacing.',
    zh: '只在同類型題目的正下方生效。這題上方是其他內容，所以維持一般間距。',
  },
  noteUnlikeAbove: {
    en: 'Only counts straight under a question of the same kind. The question above is a different kind, so it keeps the usual spacing.',
    zh: '只在同類型題目的正下方生效。上一題是另一種類型，所以維持一般間距。',
  },
});
