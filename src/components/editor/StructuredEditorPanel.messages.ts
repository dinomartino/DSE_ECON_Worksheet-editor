import { defineMessages } from '@/i18n/catalogue';

export const STRUCTURED_PANEL_MESSAGES = defineMessages({
  removeGraph: { en: 'Remove graph space', zh: '移除作圖空間' },
  addGraph: { en: 'Add graph space', zh: '加入作圖空間' },
  removeDiagram: { en: 'Remove model diagram', zh: '移除參考圖表' },
  addDiagram: { en: 'Add model diagram', zh: '加入參考圖表' },
  showOnPage: { en: 'Show on the page', zh: '在頁面上顯示' },
  typeOnPage: { en: 'type on the page', zh: '直接在頁面上輸入' },
  stem: { en: 'Stem', zh: '題幹' },
  typedOnPage: { en: 'typed on the page', zh: '直接在頁面上輸入' },
  marks: { en: 'Marks', zh: '分' },
  answerLines: { en: 'Answer lines', zh: '答題線' },
  none: { en: 'none', zh: '無' },
  addGraphSpace: { en: '+ Graph space', zh: '+ 作圖空間' },
  addModelDiagram: { en: '+ Model diagram', zh: '+ 參考圖表' },
  partsMarks: { en: 'Parts & marks', zh: '分題及分數' },
  partsHint: { en: '(a), (b), (c)… · text on the page', zh: '(a)、(b)、(c)… · 文字在頁面上' },
  showTotal: { en: 'Show total', zh: '顯示總分' },
  colMarks: { en: 'Marks', zh: '分' },
  colLines: { en: 'Lines', zh: '答題線' },
  marksShort: { en: (n: number) => `${n}m`, zh: (n: number) => `${n} 分` },
  moveUp: { en: 'Move up', zh: '上移' },
  moveDown: { en: 'Move down', zh: '下移' },
  addSubPart: { en: '+ Sub-part', zh: '+ 小分題' },
  textBefore: { en: 'Text before this part', zh: '此分題之前的文字' },
  deletePart: { en: 'Delete part', zh: '刪除分題' },
  deleteSubPart: { en: 'Delete sub-part', zh: '刪除小分題' },
  marksTogether: {
    en: (first: string, last: string) => `Marks for ${first}–${last} together`,
    zh: (first: string, last: string) => `${first}至${last}合共的分數`,
  },
  marksFor: {
    en: (label: string) => `Marks for ${label}`,
    zh: (label: string) => `${label} 的分數`,
  },
  partMarks: {
    en: (label: string) => `Part ${label} marks`,
    zh: (label: string) => `分題 ${label} 的分數`,
  },
  partSpace: {
    en: (label: string) => `Part ${label} answer space (dotted lines)`,
    zh: (label: string) => `分題 ${label} 的答題空位（點線）`,
  },
  partActions: {
    en: (label: string) => `Actions for part ${label}`,
    zh: (label: string) => `分題 ${label} 的操作`,
  },
  unnumberedHint: { en: 'unnumbered · typed on the page', zh: '不設題號 · 直接在頁面上輸入' },
  subMarks: {
    en: (label: string) => `Sub-part ${label} marks`,
    zh: (label: string) => `小分題 ${label} 的分數`,
  },
  shared: { en: 'shared', zh: '共用' },
  subSpace: {
    en: (label: string) => `Sub-part ${label} answer space (dotted lines)`,
    zh: (label: string) => `小分題 ${label} 的答題空位（點線）`,
  },
  subActions: {
    en: (label: string) => `Actions for sub-part ${label}`,
    zh: (label: string) => `小分題 ${label} 的操作`,
  },
  answerTeacher: { en: 'Answer (teacher version)', zh: '答案（教師版）' },
  answerMarking: {
    en: 'Answer / marking scheme (teacher version)',
    zh: '答案／評卷參考（教師版）',
  },
  addPart: { en: '+ Part', zh: '+ 分題' },
  total: {
    en: (n: number) => `Total: ${n} marks`,
    zh: (n: number) => `總分：${n} 分`,
  },
});
