import { defineMessages } from '@/i18n/catalogue';

/** What the callers call the captioned thing, in Chinese ("table", "picture"). */
const zhNoun = (noun: string): string =>
  ({ table: '表格', picture: '圖片', image: '圖片', diagram: '圖表' })[noun] ?? noun;

/** A block's caption and where it prints. */
export const CAPTION_MESSAGES = defineMessages({
  caption: { en: 'Caption', zh: '說明文字' },
  sits: { en: 'Caption sits', zh: '說明文字位於' },
  placement: { en: 'Caption placement', zh: '說明文字位置' },
  above: { en: 'Above', zh: '上方' },
  below: { en: 'Below', zh: '下方' },
  printAbove: {
    en: (noun: string) => `Print the caption above the ${noun}`,
    zh: (noun: string) => `將說明文字印在${zhNoun(noun)}上方`,
  },
  printBelow: {
    en: (noun: string) => `Print the caption below the ${noun}`,
    zh: (noun: string) => `將說明文字印在${zhNoun(noun)}下方`,
  },
});
