import { defineMessages } from '@/i18n/catalogue';

/** The Settings dialog and the gear. */
export const SETTINGS_MESSAGES = defineMessages({
  title: { en: 'Settings', zh: '設定' },
  description: {
    en: (desktop: boolean) =>
      `Saved ${desktop ? 'on this computer' : 'in this browser'}. Applies to every worksheet; never saved in a worksheet.`,
    zh: (desktop: boolean) => `儲存在${desktop ? '這部電腦' : '這個瀏覽器'}。適用於所有工作紙，不會存入工作紙。`,
  },
  storageBlocked: {
    en: "Settings can't be saved in this browser (private mode?). They last until you close the tab.",
    zh: '這個瀏覽器無法儲存設定（私密瀏覽模式？）。設定只保留到你關閉分頁為止。',
  },
  loading: { en: 'Loading…', zh: '載入中…' },
  loadFailed: {
    en: 'This section couldn’t load. Close Settings and try again.',
    zh: '這部分未能載入。請關閉設定再試一次。',
  },
  discard: { en: 'Discard', zh: '捨棄' },
  testing: { en: 'Testing…', zh: '測試中…' },
  done: { en: 'Done', zh: '完成' },
  /** The gear's tooltip, with the shortcut on desktop. */
  gearTitle: { en: (hint: string) => `Settings${hint}`, zh: (hint: string) => `設定${hint}` },
});
