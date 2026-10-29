import { defineMessages } from '@/i18n/catalogue';

/** The watermark (k-0242): the toolbar button, Setup → Page, and Settings → Watermarks. */
export const WATERMARK_MESSAGES = defineMessages({
  // The toolbar's one-click button and its menu.
  button: { en: 'Watermark', zh: '浮水印' },
  turnOn: { en: 'Put the watermark on this paper', zh: '為此試卷加上浮水印' },
  turnOnNamed: {
    en: (name: string) => `Put the watermark on this paper: ${name}`,
    zh: (name: string) => `為此試卷加上浮水印：${name}`,
  },
  turnOff: { en: 'Take the watermark off this paper', zh: '移除此試卷的浮水印' },
  addFirst: { en: 'Add a watermark: a school logo or a line of text', zh: '加入浮水印：學校標誌或一行文字' },
  choose: { en: 'Choose a watermark', zh: '選擇浮水印' },
  noneOnPaper: { en: 'No watermark', zh: '不用浮水印' },
  adjust: { en: 'Faintness and size…', zh: '淡度及大小…' },
  manage: { en: 'Manage saved watermarks…', zh: '管理已儲存的浮水印…' },
  addNew: { en: 'Add a watermark…', zh: '加入浮水印…' },

  // Setup → Page.
  heading: { en: 'Watermark', zh: '浮水印' },
  fieldHint: {
    en: 'A faint picture behind every page: on screen, in print, PDF and Word. To leave it off one page, use the switch above that page.',
    zh: '每頁背後的淡色圖片：屏幕、列印、PDF 及 Word 都會顯示。如某頁不需要，可用該頁上方的開關關閉。',
  },
  printOnPages: { en: 'Print it on every page', zh: '在每頁列印' },
  pagesDiffer: {
    en: (n: number) => (n === 1 ? '1 page has its own setting.' : `${n} pages have their own setting.`),
    zh: (n: number) => `${n} 頁有自己的設定。`,
  },
  resetPages: { en: 'Same on every page', zh: '每頁相同' },
  faintness: { en: 'Strength', zh: '深淺' },
  resetPlacement: { en: 'Reset to default', zh: '重設為預設' },
  resetPlacementTitle: {
    en: 'Put it back in the middle of the page, at the default size',
    zh: '放回頁面中央，並回復預設大小',
  },
  centerPlacement: { en: 'Center', zh: '置中' },
  centerPlacementTitle: {
    en: 'Put it in the middle of the page, keeping its size',
    zh: '放到頁面正中央，保持原來大小',
  },
  placementHint: {
    en: 'To move it or change its size on the page, use Move or resize above a page.',
    zh: '如要在頁面上移動浮水印或調整大小，請按頁面上方的「移動或調整大小」。',
  },
  size: { en: 'Size', zh: '大小' },
  emptyLibrary: {
    en: 'No saved watermarks yet. Add a school logo or a line of text once and use it on any paper.',
    zh: '尚未儲存浮水印。加入一次學校標誌或文字，即可用於任何試卷。',
  },
  notInLibrary: {
    en: 'This paper’s watermark (no longer in your saved list)',
    zh: '此試卷的浮水印（已不在你的儲存清單）',
  },

  // Settings → Watermarks.
  sectionLabel: { en: 'Watermarks', zh: '浮水印' },
  sectionHint: { en: 'School logos, text', zh: '學校標誌、文字' },
  sectionDescription: {
    en: 'Saved on this computer for every paper. A paper keeps its own copy, so changing this list never changes a paper you have made.',
    zh: '儲存在此電腦，所有試卷均可使用。每份試卷保留自己的副本，更改此清單不會改變已完成的試卷。',
  },
  addPicture: { en: 'Add a picture…', zh: '加入圖片…' },
  addPictureHint: { en: 'PNG, JPG or SVG, e.g. a school logo', zh: 'PNG、JPG 或 SVG，例如學校標誌' },
  addText: { en: 'Add text', zh: '加入文字' },
  textPlaceholder: { en: 'e.g. SAMPLE, or your school’s name', zh: '例如 樣本，或學校名稱' },
  textLabel: { en: 'Watermark text', zh: '浮水印文字' },
  direction: { en: 'Direction', zh: '方向' },
  diagonal: { en: 'Diagonal', zh: '斜向' },
  horizontal: { en: 'Across', zh: '橫向' },
  create: { en: 'Save', zh: '儲存' },
  cancel: { en: 'Cancel', zh: '取消' },
  name: { en: 'Name', zh: '名稱' },
  rename: { en: 'Rename', zh: '重新命名' },
  remove: { en: 'Delete', zh: '刪除' },
  removeNamed: {
    en: (name: string) => `Delete ${name}`,
    zh: (name: string) => `刪除${name}`,
  },
  lastUsed: { en: 'Used by the one-click button', zh: '一按即用' },
  useAsDefault: { en: 'Use for the one-click button', zh: '設為一按即用' },
  untitled: { en: 'Watermark', zh: '浮水印' },
  unreadable: {
    en: 'That file could not be read as a picture. Try a PNG, JPG or SVG.',
    zh: '未能把此檔案讀取為圖片。請試用 PNG、JPG 或 SVG。',
  },
  full: {
    en: (n: number) => `You can save up to ${n} watermarks. Delete one to add another.`,
    zh: (n: number) => `最多可儲存 ${n} 個浮水印。請先刪除一個。`,
  },
  storageFull: {
    en: 'This computer’s storage for the app is full, so the watermark was not saved. Delete a saved watermark, or use a smaller picture.',
    zh: '此電腦為本程式預留的儲存空間已滿，浮水印未能儲存。請刪除一個已儲存的浮水印，或使用較小的圖片。',
  },
});
