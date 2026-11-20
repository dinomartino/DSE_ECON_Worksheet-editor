import { defineMessages } from '@/i18n/catalogue';

/**
 * The DRQ words the right panel and the rail share (k-0474): the kinds a source starts as,
 * the DRQ starter, "Refer to" and the essay note, and the panel's kind labels.
 */
export const DRQ_PANEL_MESSAGES = defineMessages({
  // Add → Source ▾
  sourceMenu: { en: 'Source', zh: '資料' },
  addSourceOf: { en: 'Add a source: pick what it holds', zh: '加入資料：選擇內容類型' },
  kindTable: { en: 'Table', zh: '表格' },
  kindTableHint: { en: 'figures with headings', zh: '附標題的數據' },
  kindBarChart: { en: 'Bar chart', zh: '棒形圖' },
  kindBarChartHint: { en: 'from a small data table', zh: '由數據表繪製' },
  kindLineChart: { en: 'Line graph', zh: '折線圖' },
  kindLineChartHint: { en: 'figures over time', zh: '數據隨時間變化' },
  kindText: { en: 'News extract', zh: '新聞節錄' },
  kindTextHint: { en: 'a framed passage', zh: '加框的文字' },
  kindViews: { en: "People's views", zh: '各方意見' },
  kindViewsHint: { en: 'who says it | what they say', zh: '發言者｜意見' },
  kindForum: { en: 'Forum', zh: '論壇對話' },
  kindForumHint: { en: 'speech bubbles round a picture', zh: '圖片四周的對話框' },
  kindStakeholders: { en: 'Stakeholder diagram', zh: '持份者圖示' },
  kindStakeholdersHint: { en: 'an issue and who it affects', zh: '議題及受影響的持份者' },
  kindPicture: { en: 'Picture', zh: '圖片' },
  kindPictureHint: { en: 'a photo, cartoon or scan', zh: '相片、漫畫或掃描' },
  kindEmpty: { en: 'Empty', zh: '空白' },
  kindEmptyHint: { en: 'add its contents after', zh: '稍後加入內容' },

  // Panel kind labels
  stem: { en: 'Question text', zh: '題幹' },
  sourceLabel: { en: (letter: string) => `Source ${letter}`, zh: (letter: string) => `資料 ${letter}` },
  part: { en: 'Part', zh: '分題' },
  subPart: { en: 'Sub-part', zh: '小分題' },
  teacherOnly: { en: 'Teacher only', zh: '教師專用' },
  answerAndMarking: { en: 'Answer & marking', zh: '答案及評分' },
  where: { en: 'You are editing', zh: '正在編輯' },
  whereNothing: { en: 'Click text on the page to edit it here', zh: '按頁面上的文字，即可在此編輯' },
  holdsText: { en: 'Text', zh: '文字' },
  holdsTable: { en: 'Table', zh: '表格' },
  holdsPicture: { en: 'Picture', zh: '圖片' },
  holdsDiagram: { en: 'Diagram', zh: '圖表' },
  holdsMixed: { en: 'Mixed', zh: '混合內容' },

  // DRQ starter
  drqTitle: { en: 'Data-response question?', zh: '資料回應題？' },
  drqHint: {
    en: 'Start with Sources A–D (table, bar chart, extract, views) and parts (a)–(e), 28 marks. Type over everything on the page.',
    zh: '預設資料A至D（表格、棒形圖、節錄、各方意見）及分題 (a) 至 (e)，共 28 分。所有內容可直接在頁面上改寫。',
  },
  drqStart: { en: 'Start a DRQ', zh: '建立資料回應題' },
  drqRail: { en: 'Data-response (DRQ)', zh: '資料回應題' },
  drqRailHint: { en: 'Sources A–D and parts (a)–(e)', zh: '資料A至D及分題 (a) 至 (e)' },

  // Part helpers
  referTo: { en: 'Refer to', zh: '參閱' },
  referToHint: {
    en: 'Starts this part with "Refer to Source …." in both languages',
    zh: '在此分題開首加入「參閱資料…。」（中英文同步）',
  },
  referToSource: {
    en: (letter: string) => `Source ${letter}`,
    zh: (letter: string) => `資料${letter}`,
  },
  essayNote: { en: '+ Essay note before this part', zh: '+ 分題前的短文作答說明' },
  addSubPartHere: { en: '+ Sub-part', zh: '+ 小分題' },
});
