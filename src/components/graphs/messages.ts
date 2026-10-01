import { defineMessages } from '@/i18n/catalogue';

/** The Graphs library, its cards and dialogs. */
export const GRAPH_LIBRARY_MESSAGES = defineMessages({
  home: { en: '← Home', zh: '← 主頁' },
  title: { en: 'Graphs 圖表庫', zh: '圖表庫' },
  searchLabel: { en: 'Search graphs', zh: '搜尋圖表' },
  searchPlaceholder: { en: 'Search graphs by name', zh: '按名稱搜尋圖表' },
  newGraph: { en: 'New graph', zh: '新增圖表' },
  saveFailed: { en: 'Could not save a new graph. Storage may be full.', zh: '無法儲存新圖表。儲存空間可能已滿。' },
  duplicateFailed: { en: 'Could not duplicate that graph.', zh: '無法建立該圖表的副本。' },
  renameNewer: {
    en: 'This graph was saved by a newer version of Econ Studio and cannot be renamed here.',
    zh: '這個圖表由較新版本的 Econ Studio 儲存，無法在這裏重新命名。',
  },
  renameFailed: { en: 'Could not rename that graph.', zh: '無法重新命名該圖表。' },
  deleteFailed: { en: 'Could not delete that graph.', zh: '無法刪除該圖表。' },
  unreadable: {
    en: (n: number) =>
      `${n === 1 ? '1 saved graph could not be read' : `${n} saved graphs could not be read`} and${n === 1 ? ' is' : ' are'} left as it was.`,
    zh: (n: number) => `有 ${n} 個已儲存的圖表無法讀取，已保持原狀。`,
  },
  emptyTitle: { en: 'No graphs yet', zh: '尚未有圖表' },
  emptyHint: {
    en: 'Draw a graph once. Reuse it in a question or copy it into Word.',
    zh: '圖表畫一次，便可在題目中重用，或複製到 Word。',
  },
  noMatch: { en: 'No graph is named like that.', zh: '沒有名稱相符的圖表。' },
  deleteTitle: { en: (name: string) => `Delete “${name}”?`, zh: (name: string) => `刪除「${name}」？` },
  deleteBody: {
    en: 'It is deleted for good. Worksheets that already use a copy of it keep theirs.',
    zh: '圖表會永久刪除。已使用其副本的工作紙不受影響。',
  },
  cancel: { en: 'Cancel', zh: '取消' },
  delete: { en: 'Delete', zh: '刪除' },
  open: { en: (name: string) => `Open ${name}`, zh: (name: string) => `開啟 ${name}` },
  actionsFor: { en: (name: string) => `Actions for ${name}`, zh: (name: string) => `${name} 的操作` },
  renameItem: { en: 'Rename…', zh: '重新命名…' },
  duplicateItem: { en: 'Duplicate', zh: '建立副本' },
  deleteItem: { en: 'Delete…', zh: '刪除…' },
  newDialogDescription: {
    en: 'Start from a template, or from blank axes. Everything on it can be changed.',
    zh: '由範本開始，或由空白座標軸開始。所有內容都可以修改。',
  },
  startBlank: { en: 'Start blank', zh: '空白開始' },
  renameTitle: { en: 'Rename graph', zh: '重新命名圖表' },
  renameDescription: {
    en: 'What this graph is called here and what a downloaded image is named. It is never printed.',
    zh: '這個圖表在這裏的名稱，也是下載圖片的檔名。不會列印出來。',
  },
  rename: { en: 'Rename', zh: '重新命名' },
  graphName: { en: 'Graph name', zh: '圖表名稱' },
});

/** The graph editor's top bar, notices and read-only note. */
export const GRAPH_EDITOR_MESSAGES = defineMessages({
  back: { en: '← Graphs', zh: '← 圖表庫' },
  saveFailed: {
    en: 'Could not save this graph. Your changes are still here; try again.',
    zh: '無法儲存這個圖表。你的修改仍然保留，請再試一次。',
  },
  copied: { en: 'Copied. Paste it into Word at its print size.', zh: '已複製。貼到 Word 時會是列印大小。' },
  copyFailed: {
    en: 'Could not copy the image here. Use Download PNG instead.',
    zh: '無法在這裏複製圖片。請改用「下載 PNG」。',
  },
  savedFile: { en: (name: string) => `Saved ${name}.`, zh: (name: string) => `已儲存 ${name}。` },
  saveImageFailed: { en: 'Could not save the image.', zh: '無法儲存圖片。' },
  copyImage: { en: 'Copy image', zh: '複製圖片' },
  copyImageTitle: {
    en: 'Copy as a picture, sized to print, to paste into Word',
    zh: '以列印大小複製成圖片，以便貼到 Word',
  },
  downloadPng: { en: 'Download PNG', zh: '下載 PNG' },
  downloadPngTitle: { en: 'Save a PNG of the graph on white', zh: '把圖表儲存為白底 PNG' },
  useInWorksheet: { en: 'Use in a worksheet…', zh: '用於工作紙…' },
  useNewer: {
    en: 'Saved by a newer version of Econ Studio. Update to use it in a worksheet.',
    zh: '由較新版本的 Econ Studio 儲存。請先更新，才能用於工作紙。',
  },
  useTitle: {
    en: 'Add a copy of this graph to a question in one of your worksheets',
    zh: '把這個圖表的副本加到你某份工作紙的題目中',
  },
  missing: { en: 'This graph is no longer saved here.', zh: '這個圖表已不在這裏儲存。' },
  newerNote: {
    en: 'This graph was saved by a newer version of Econ Studio, so it can be copied and downloaded here but not changed. Update to edit it.',
    zh: '這個圖表由較新版本的 Econ Studio 儲存，所以在這裏只能複製和下載，不能修改。請更新後再編輯。',
  },
  resizeHint: {
    en: 'Drag a bubble’s inner edge on the figure to resize it.',
    zh: '在圖上拖曳氣泡的內邊緣，即可調整大小。',
  },
  saving: { en: 'Saving', zh: '儲存中' },
  savingDetail: { en: 'Saving your changes', zh: '正在儲存你的修改' },
  notSaved: { en: 'Not saved', zh: '未儲存' },
  notSavedDetail: {
    en: 'Your latest changes could not be saved. They are kept here; try again.',
    zh: '最近的修改無法儲存。修改仍保留在這裏，請再試一次。',
  },
  readOnly: { en: 'Read-only', zh: '唯讀' },
  readOnlyDetail: {
    en: 'Saved by a newer version of Econ Studio, so it cannot be changed here',
    zh: '由較新版本的 Econ Studio 儲存，無法在這裏修改',
  },
  saved: { en: 'Saved', zh: '已儲存' },
  savedDetail: { en: 'All changes saved', zh: '所有修改已儲存' },
  showInFolder: { en: 'Show in folder', zh: '在資料夾中顯示' },
  showInFinder: { en: 'Show in Finder', zh: '在 Finder 中顯示' },
  showInExplorer: { en: 'Show in Explorer', zh: '在檔案總管中顯示' },
});

/** The graph settings panel beside the canvas. */
export const GRAPH_PANEL_MESSAGES = defineMessages({
  name: { en: 'Name', zh: '名稱' },
  namePlaceholder: { en: 'Graph name', zh: '圖表名稱' },
  nameHint: { en: 'Never printed. Names the file you download.', zh: '不會列印出來，只用作下載檔案的名稱。' },
  printWidth: { en: 'Print width', zh: '列印寬度' },
  labels: { en: 'Labels', zh: '標示' },
  labelsLanguage: { en: 'Labels language', zh: '標示語言' },
  langEn: { en: 'Labels in English', zh: '標示用英文' },
  langZh: { en: 'Labels in Chinese', zh: '標示用中文' },
  langBoth: { en: 'Axis titles in both languages', zh: '座標軸標題用中英文' },
  both: { en: 'Both', zh: '中英' },
  title: { en: 'Title', zh: '標題' },
  titleSits: { en: 'Title sits', zh: '標題位置' },
  titlePlacement: { en: 'Title placement', zh: '標題位置' },
  above: { en: 'Above', zh: '上方' },
  below: { en: 'Below', zh: '下方' },
  aboveTitle: { en: 'Draw the title above the plot', zh: '標題放在圖表上方' },
  belowTitle: { en: 'Draw the title below the plot', zh: '標題放在圖表下方' },
  altText: { en: 'Alt text', zh: '替代文字' },
});

/** "Use in a worksheet…" and the My graphs tab of the diagram picker. */
export const GRAPH_USE_MESSAGES = defineMessages({
  gone: {
    en: (title: string) => `“${title}” is no longer saved here.`,
    zh: (title: string) => `「${title}」已不在這裏儲存。`,
  },
  newer: {
    en: (title: string) =>
      `“${title}” was saved by a newer version of Econ Studio, so it cannot be changed here. Update to add a graph to it.`,
    zh: (title: string) => `「${title}」由較新版本的 Econ Studio 儲存，無法在這裏修改。請先更新，才能加入圖表。`,
  },
  whereTitle: { en: 'Where should the graph go?', zh: '圖表要放在哪裏？' },
  title: { en: 'Use in a worksheet', zh: '用於工作紙' },
  whereDescription: {
    en: 'A copy is added at the end of the question. Later changes to the saved graph do not change it.',
    zh: '副本會加到題目的最後。之後修改已儲存的圖表，不會影響副本。',
  },
  description: {
    en: (name: string) => `Add a copy of “${name}” to one of your worksheets.`,
    zh: (name: string) => `把「${name}」的副本加到你的其中一份工作紙。`,
  },
  worksheets: { en: '← Worksheets', zh: '← 工作紙' },
  cancel: { en: 'Cancel', zh: '取消' },
  newQuestion: { en: '+ New question', zh: '+ 新增題目' },
  newQuestionHint: { en: 'As a new question at the end', zh: '作為最後的新題目' },
  noText: { en: 'No text yet', zh: '尚未有文字' },
  searchWorksheets: { en: 'Search worksheets by name', zh: '按名稱搜尋工作紙' },
  noWorksheets: { en: 'No worksheets saved yet. Start one from Home.', zh: '尚未儲存任何工作紙。請從主頁開始一份。' },
  noMatch: { en: 'No worksheet is named like that.', zh: '沒有名稱相符的工作紙。' },
  questionCount: {
    en: (n: number) => `${n} ${n === 1 ? 'question' : 'questions'}`,
    zh: (n: number) => `${n} 條題目`,
  },
  graphCount: {
    en: (n: number) => `${n} ${n === 1 ? 'graph' : 'graphs'}`,
    zh: (n: number) => `${n} 個圖表`,
  },
  reading: { en: 'Reading your graphs…', zh: '正在讀取你的圖表…' },
  noSaved: { en: 'No saved graphs yet', zh: '尚未有已儲存的圖表' },
  noSavedHint: {
    en: 'Draw one in Home → Graphs 圖表庫, then pick it here. Or use Save to Graphs on a diagram.',
    zh: '請在「主頁 → 圖表庫」畫一個，再在這裏選用。或在圖表上使用「儲存到圖表庫」。',
  },
  searchMine: { en: 'Search my graphs', zh: '搜尋我的圖表' },
  noMatchGraph: { en: 'No graph is named like that.', zh: '沒有名稱相符的圖表。' },
  cardNewer: {
    en: 'Saved by a newer version of Econ Studio. Update to use it.',
    zh: '由較新版本的 Econ Studio 儲存。請先更新才能使用。',
  },
  cardInsert: { en: (name: string) => `Insert a copy of ${name}`, zh: (name: string) => `插入「${name}」的副本` },
});
