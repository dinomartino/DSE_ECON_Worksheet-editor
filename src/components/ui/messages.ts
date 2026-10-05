import { defineMessages } from '@/i18n/catalogue';

/** Shared controls: dialog chrome, menu trigger, steppers, pickers. */
export const UI_MESSAGES = defineMessages({
  close: { en: 'Close', zh: '關閉' },
  notifications: { en: 'Notifications', zh: '通知' },
  dismissNotice: { en: 'Dismiss notification', zh: '關閉通知' },
  moreNotices: { en: (n: number) => `+${n} more`, zh: (n: number) => `還有 ${n} 則` },
  moreBelow: { en: 'More below', zh: '下方還有內容' },
  settingsSections: { en: 'Settings sections', zh: '設定分類' },
  moreActions: { en: 'More actions', zh: '更多操作' },
  fewer: { en: (label: string) => `Fewer (${label})`, zh: (label: string) => `減少（${label}）` },
  more: { en: (label: string) => `More (${label})`, zh: (label: string) => `增加（${label}）` },
  tableSize: { en: 'Table size', zh: '表格大小' },
  tableChosen: {
    en: (columns: number, rows: number) => `${columns} × ${rows} table`,
    zh: (columns: number, rows: number) => `${columns} × ${rows} 表格`,
  },
  tableDrag: { en: 'Drag to choose a size', zh: '拖曳以選擇大小' },
  tableCell: {
    en: (column: number, row: number) => `${column} by ${row}`,
    zh: (column: number, row: number) => `${column} × ${row}`,
  },
  position: { en: 'Position', zh: '位置' },
  left: { en: 'Left', zh: '靠左' },
  centre: { en: 'Centre', zh: '置中' },
  right: { en: 'Right', zh: '靠右' },
  alignLeftHint: { en: 'Align the figure with the text column', zh: '圖與文字欄靠左對齊' },
  alignCentreHint: { en: 'Centre the figure (the usual choice)', zh: '圖置中（一般選擇）' },
  alignRightHint: { en: 'Align the figure to the right margin', zh: '圖靠右邊界對齊' },
});
