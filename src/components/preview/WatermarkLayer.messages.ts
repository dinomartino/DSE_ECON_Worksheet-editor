import { defineMessages } from '@/i18n/catalogue';

/** The watermark's per-page switch beside each sheet (k-0242). */
export const WATERMARK_PAGE_MESSAGES = defineMessages({
  on: { en: 'Watermark', zh: '浮水印' },
  off: { en: 'No watermark', zh: '沒有浮水印' },
  turnOff: { en: 'Turn the watermark off on this page', zh: '在此頁關閉浮水印' },
  turnOn: { en: 'Turn the watermark on for this page', zh: '在此頁開啟浮水印' },
  coverOff: { en: 'Turn the watermark off on the cover', zh: '在封面關閉浮水印' },
  coverOn: { en: 'Turn the watermark on for the cover', zh: '在封面開啟浮水印' },
  follows: {
    en: 'This page continues the question from the page before, so it follows that page',
    zh: '此頁接續上一頁的題目，故跟隨上一頁的設定',
  },
});
