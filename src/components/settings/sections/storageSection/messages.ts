import { defineMessages } from '@/i18n/catalogue';

/** Settings → Storage location 儲存位置 (`docs/design/library-folder.md` § 1). */
export const STORAGE_MESSAGES = defineMessages({
  intro: {
    en: 'Your worksheets are kept on this computer. To have the same worksheets on your other computer, choose a folder inside OneDrive, Google Drive, iCloud Drive or Dropbox.',
    zh: '你的工作紙儲存在這部電腦。如想在另一部電腦使用相同的工作紙，請在 OneDrive、Google Drive、iCloud Drive 或 Dropbox 內選擇一個資料夾。',
  },
  notSynced: {
    en: 'Graphs and Translation terms stay on each computer for now.',
    zh: '圖表和翻譯用語暫時仍各自儲存在每部電腦。',
  },
  choose: { en: 'Choose a folder…', zh: '選擇資料夾…' },
  setupTitle: { en: 'Before you choose', zh: '選擇之前' },
  tipOffline: {
    en: 'Keep the folder downloaded on this computer, not online-only (OneDrive: Always keep on this device; Google Drive: Mirror files or available offline).',
    zh: '請將資料夾保持下載在這部電腦，不要只存於網上（OneDrive：一律保留在此裝置上；Google Drive：鏡像檔案或可離線使用）。',
  },
  tipOtherComputer: {
    en: 'Install this update on your other computer too, then choose the same folder there.',
    zh: '請在另一部電腦也安裝此更新，然後選擇同一個資料夾。',
  },
  tipSameTime: {
    en: "Don't edit the same worksheet on both computers at the same time. Nothing is lost, but you get two copies.",
    zh: '請勿在兩部電腦同時編輯同一份工作紙。內容不會遺失，但會出現兩個副本。',
  },
  tipSubfolder: {
    en: 'A folder named Econ Studio is made inside the one you choose. The worksheets already here are copied into it.',
    zh: '程式會在你選擇的資料夾內建立名為 Econ Studio 的資料夾，並把這部電腦現有的工作紙複製進去。',
  },
  pickerTitle: { en: 'Choose a folder in your cloud drive', zh: '在雲端硬碟選擇資料夾' },
  chooseNow: { en: 'Choose folder…', zh: '選擇資料夾…' },
  choosing: { en: 'Choosing…', zh: '選擇中…' },
  cancel: { en: 'Cancel', zh: '取消' },
  computerName: { en: "This computer's name", zh: '這部電腦的名稱' },
  computerNameHint: {
    en: 'Used in the names of copies, so you can tell which computer made them.',
    zh: '用於副本的名稱，方便你分辨副本來自哪部電腦。',
  },
  folder: { en: 'Folder', zh: '資料夾' },
  showFolder: { en: 'Show folder', zh: '顯示資料夾' },
  syncNow: { en: 'Sync now', zh: '立即同步' },
  syncing: { en: 'Syncing…', zh: '同步中…' },
  syncedAt: { en: (time: string) => `Synced at ${time}`, zh: (time: string) => `已於 ${time} 同步` },
  waiting: { en: 'Waiting to sync', zh: '等待同步' },
  notSyncing: { en: 'Not syncing', zh: '未有同步' },
  unreachable: { en: "Can't reach the folder.", zh: '無法連接資料夾。' },
  stop: { en: 'Stop syncing on this computer…', zh: '停止在這部電腦同步…' },
  stopTitle: { en: 'Stop syncing on this computer?', zh: '停止在這部電腦同步？' },
  stopBody: {
    en: 'Your worksheets stay on this computer, and the folder is left as it is. Your other computer can keep using it.',
    zh: '你的工作紙會保留在這部電腦，資料夾亦會保持原狀。另一部電腦可繼續使用該資料夾。',
  },
  stopConfirm: { en: 'Stop syncing', zh: '停止同步' },
  failed: { en: 'That did not work. Please try again.', zh: '未能完成，請再試一次。' },
  attention: { en: 'Needs attention', zh: '需要處理' },
  attentionConflict: {
    en: 'Changed on both computers, so both versions are kept. This is the copy; the original keeps its name.',
    zh: '兩部電腦都修改過，所以兩個版本都已保留。這是副本，原本的工作紙名稱不變。',
  },
  attentionUnreadable: {
    en: 'Its file in the folder will not open on this computer yet, often because it is not downloaded. It syncs once it opens.',
    zh: '資料夾內的檔案暫時未能在這部電腦開啟，通常是因為尚未下載。可以開啟後便會同步。',
  },
  attentionUnreadableLocal: {
    en: 'The copy on this computer will not open, so it is not synced.',
    zh: '這部電腦上的副本未能開啟，所以沒有同步。',
  },
  attentionNewer: {
    en: 'Saved by a newer version of Econ Studio. Update the app to sync it.',
    zh: '由較新版本的 Econ Studio 儲存。請更新程式後再同步。',
  },
  attentionError: { en: 'Could not be synced this time. It will try again.', zh: '這次未能同步，稍後會再試。' },
  untitled: { en: 'Untitled', zh: '未命名' },
});
