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
  adjust: { en: 'Move or resize', zh: '移動或調整大小' },
  adjustTitle: {
    en: 'Move or resize the watermark on the page (every page that has it follows)',
    zh: '在頁面上移動浮水印或調整其大小（所有有浮水印的頁面都會跟隨）',
  },
  done: { en: 'Done', zh: '完成' },
  frame: {
    en: 'Watermark: drag to move, drag a corner to resize. Arrow keys move it, + and − resize it, Esc finishes.',
    zh: '浮水印：拖曳以移動，拖曳角落以調整大小。方向鍵可移動，+ 及 − 可調整大小，按 Esc 完成。',
  },
  corner: { en: 'Resize the watermark', zh: '調整浮水印大小' },
});
