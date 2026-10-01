import { defineMessages } from '@/i18n/catalogue';

/** The Edit panel's frame: a selected layout element, a question's header, the empty state. */
export const INSPECTOR_MESSAGES = defineMessages({
  // What each layout element is called
  nameSection: { en: 'Section', zh: '部分' },
  nameHeading: { en: 'Heading', zh: '標題' },
  nameText: { en: 'Text', zh: '文字' },
  nameSpacer: { en: 'Blank space', zh: '留白' },
  nameDivider: { en: 'Divider', zh: '分隔線' },
  namePageBreak: { en: 'New page', zh: '新頁' },
  nameAnswerLines: { en: 'Answer lines', zh: '答題線' },
  nameAnswerSpace: { en: 'Answer space', zh: '答題空間' },
  namePartHeader: { en: 'Part header', zh: '分部標題' },
  nameLabelList: { en: 'Label list', zh: '標示列表' },
  nameQuestionCount: { en: 'Question count', zh: '題數' },
  nameStimulus: { en: 'Shared stimulus', zh: '共用資料' },

  // One line under the name
  hintSection: { en: 'names the run of questions below it', zh: '為下面的一組題目命名' },
  hintStimulus: { en: 'content the questions below refer to', zh: '下面題目所引用的內容' },
  hintHeading: { en: 'a display line, typed on the page', zh: '顯示用的一行字，在頁面上輸入' },
  hintText: { en: 'a note or closing line, typed on the page', zh: '備註或結語，在頁面上輸入' },
  hintPartHeader: { en: 'part heading with a derived marks total', zh: '分部標題，附自動計算的總分' },
  hintQuestionCount: { en: 'authored wording around the derived count', zh: '圍繞自動題數的自訂文字' },
  hintLabelList: { en: 'side-by-side label · value rows', zh: '並排的「標籤 · 內容」行' },
  hintAnswerLines: { en: 'ruled lines for written answers', zh: '供書寫答案的橫線' },
  hintAnswerSpace: { en: 'dotted lines for written answers', zh: '供書寫答案的點線' },
  hintSpacer: { en: 'blank vertical space', zh: '垂直空白' },
  hintDivider: { en: 'a horizontal rule', zh: '一條橫線' },
  hintPageBreak: { en: 'starts a new sheet', zh: '由新一頁開始' },

  // Layout element panel
  emptyType: { en: 'Empty. Type on the page', zh: '空白，請在頁面上輸入' },
  restartNumbering: { en: 'Restart numbering at 1', zh: '由 1 重新編號' },
  showSectionMarks: { en: "Show the section's marks total", zh: '顯示此部分的總分' },
  fillsPage: { en: 'fills page', zh: '填滿頁面' },
  fillsPageNote: {
    en: (lines: number) =>
      `This space stretches to the bottom of its page, so the line count is set by the layout. Currently ${lines} lines.`,
    zh: (lines: number) => `此空間會伸展至頁面底部，行數由版面決定，目前為 ${lines} 行。`,
  },
  // Existing Chinese second lines: shown beside the English only.
  fillsPageZh: { en: '此答題空間自動填滿頁面。', zh: '此答題空間自動填滿頁面。' },
  lines: { en: 'Lines', zh: '行數' },
  linesZh: { en: '行數', zh: '行數' },
  unitLine: { en: 'line', zh: '行' },
  unitLines: { en: 'lines', zh: '行' },
  answerSpaceLines: { en: 'Answer space lines', zh: '答題空間行數' },
  answerLinesLabel: { en: 'Answer lines', zh: '答題線行數' },
  height: { en: 'Height', zh: '高度' },
  heightZh: { en: '留白高度', zh: '留白高度' },
  blankHeight: { en: 'Blank space height', zh: '留白高度' },
  rows: { en: 'Rows', zh: '行' },
  rowsHint: { en: 'typed on the page', zh: '在頁面上輸入' },
  addRow: { en: '+ Row', zh: '+ 行' },
  removeRow: { en: 'Remove row', zh: '移除此行' },
  dividerNote: {
    en: 'A rule across the text column. It has no settings. Drag it on the page or in Content to move it.',
    zh: '橫跨文字欄的一條線，沒有設定。在頁面或「內容」清單拖曳即可移動。',
  },
  pageBreakNote: {
    en: 'Everything after this starts on a new sheet. Drag it to move the break.',
    zh: '此後的內容會由新一頁開始。拖曳即可移動分頁位置。',
  },
  deleteElement: { en: (name: string) => `Delete ${name.toLowerCase()}`, zh: (name: string) => `刪除${name}` },

  // Frame
  closeEditor: { en: 'Close editor', zh: '關閉編輯面板' },
  pickSomething: { en: 'Pick something to edit.', zh: '選擇要編輯的項目。' },
  pickHint: {
    en: 'Click a question on the page, or choose one from Content.',
    zh: '在頁面上按一條題目，或從「內容」清單選擇。',
  },
  pickHintZh: { en: '在頁面或內容清單選擇題目', zh: '在頁面或內容清單選擇題目' },
  browseContent: { en: 'Browse content', zh: '瀏覽內容' },
  questionTitle: {
    en: (number: number | undefined) => `Question ${number ?? '–'}`,
    zh: (number: number | undefined) => (number === undefined ? '題目' : `第 ${number} 題`),
  },
  marksCount: {
    en: (n: number) => `${n} ${n === 1 ? 'mark' : 'marks'}`,
    zh: (n: number) => `${n} 分`,
  },
});
