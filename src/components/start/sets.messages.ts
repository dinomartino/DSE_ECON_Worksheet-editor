import { defineMessages } from '@/i18n/catalogue';

/**
 * Paper sets on the start screen (k-0299): the set frame, the card menu entries and the set
 * dialogs. "Set" / 套卷 is the one word (the user, 2026-11-02); Paper 1 / Paper 2 stay English
 * (`docs/design/ui-language.md`).
 */
export const SET_MESSAGES = defineMessages({
  set: { en: 'Set', zh: '套卷' },
  papers: { en: (n: number) => (n === 1 ? '1 paper' : `${n} papers`), zh: (n: number) => `${n} 份試卷` },
  paper1: { en: 'Paper 1', zh: 'Paper 1' },
  paper2: { en: 'Paper 2', zh: 'Paper 2' },
  examPaper: { en: 'Exam paper', zh: '試卷' },
  elsewhere: {
    en: (n: number) => `+${n} in ${n === 1 ? 'another folder' : 'other folders'}`,
    zh: (n: number) => `另有 ${n} 份在其他資料夾`,
  },
  untitledSet: { en: 'Untitled set', zh: '未命名套卷' },
  blankPaper: { en: 'Blank, not started', zh: '空白，未開始' },
  inSet: { en: (name: string) => `In the set “${name}”`, zh: (name: string) => `屬於套卷「${name}」` },
  // Menus.
  makeSet: { en: 'Make a set…', zh: '建立套卷…' },
  addToSet: { en: 'Add to set…', zh: '加入套卷…' },
  leaveSet: { en: 'Remove from set', zh: '移出套卷' },
  setDetails: { en: 'Set details…', zh: '套卷資料…' },
  addPapers: { en: 'Add papers…', zh: '加入試卷…' },
  duplicateSet: { en: 'Duplicate set…', zh: '複製套卷…' },
  ungroup: { en: 'Ungroup', zh: '解散套卷' },
  setActions: { en: (name: string) => `Actions for the set ${name}`, zh: (name: string) => `套卷「${name}」的操作` },
  // Dialogs.
  makeTitle: { en: 'Make a set', zh: '建立套卷' },
  makeDescription: {
    en: 'A set is the papers sat as one exam, such as Paper 1 and Paper 2 of a mock. Each paper keeps its own file and folder.',
    zh: '套卷是同一次考試的試卷，例如 Mock 考試的 Paper 1 和 Paper 2。每份試卷仍是獨立檔案，資料夾不變。',
  },
  setName: { en: 'Set name', zh: '套卷名稱' },
  setNamePlaceholder: { en: 'S6 Mock 2026-27', zh: '中六 Mock 2026-27' },
  withPapers: { en: 'Papers in the set', zh: '套卷內的試卷' },
  thisPaper: { en: '(this paper)', zh: '（這份試卷）' },
  noOtherPapers: {
    en: 'No other exam paper is free to join. You can add papers later from the set’s ⋯ menu.',
    zh: '沒有其他可加入的試卷。之後可從套卷的 ⋯ 選單加入試卷。',
  },
  looksLikePair: { en: 'Same exam?', zh: '同一考試？' },
  make: { en: 'Make set', zh: '建立套卷' },
  addToSetTitle: { en: (title: string) => `Add “${title}” to a set`, zh: (title: string) => `將「${title}」加入套卷` },
  addToSetDescription: {
    en: 'A paper sits in one set at a time.',
    zh: '每份試卷只可屬於一個套卷。',
  },
  addPapersTitle: { en: (name: string) => `Add papers to “${name}”`, zh: (name: string) => `加入試卷至「${name}」` },
  addPapersDescription: {
    en: 'Exam papers not in a set yet. A paper sits in one set at a time.',
    zh: '未屬於任何套卷的試卷。每份試卷只可屬於一個套卷。',
  },
  add: { en: 'Add', zh: '加入' },
  cancel: { en: 'Cancel', zh: '取消' },
  // Results.
  changeFailed: {
    en: (n: number) => `${n === 1 ? '1 paper' : `${n} papers`} could not be changed (saved by a newer version, or not readable).`,
    zh: (n: number) => `有 ${n} 份試卷無法更改（由較新版本儲存，或無法讀取）。`,
  },
  blankNotSaved: {
    en: 'The blank paper of the mock set could not be saved. Your paper is open; make the other one from New worksheet.',
    zh: '無法儲存 Mock 套卷的空白試卷。你的試卷已開啟；可從「新增工作紙」建立另一份。',
  },
  detailsRead: {
    en: 'Could not read every paper of the set.',
    zh: '無法讀取套卷內的所有試卷。',
  },
  // Duplicate set (step C).
  duplicateTitle: { en: (name: string) => `Duplicate “${name}”`, zh: (name: string) => `複製「${name}」` },
  duplicateDescription: {
    en: (n: number) => `Copies ${n === 1 ? 'its paper' : `all ${n} papers`} into a new set, for the next sitting. The set you copy stays as it is.`,
    zh: (n: number) => `將 ${n} 份試卷全部複製到新套卷，供下次考試使用。原有套卷保持不變。`,
  },
  newSetName: { en: 'New set name', zh: '新套卷名稱' },
  bumpYear: {
    en: (from: string, to: string) => `Change ${from} to ${to}`,
    zh: (from: string, to: string) => `將 ${from} 改為 ${to}`,
  },
  bumpYearHint: {
    en: 'Every year in the papers’ names, titles and covers moves on by one. Questions are left as they are.',
    zh: '試卷名稱、標題和封面上的年份全部加一年。題目內容不變。',
  },
  duplicateNote: {
    en: 'The copies leave out the date sat and the classes; set them in Set details….',
    zh: '副本不會保留考試日期和班別，可在「套卷資料…」中設定。',
  },
  duplicate: { en: 'Duplicate set', zh: '複製套卷' },
  duplicated: {
    en: (name: string, n: number) => `Made “${name}”: ${n === 1 ? '1 paper' : `${n} papers`}.`,
    zh: (name: string, n: number) => `已建立「${name}」，共 ${n} 份試卷。`,
  },
  duplicateFailed: {
    en: (n: number) => `${n === 1 ? '1 paper' : `${n} papers`} could not be copied (not readable, or saved by a newer version).`,
    zh: (n: number) => `有 ${n} 份試卷無法複製（無法讀取，或由較新版本儲存）。`,
  },
  copyLeftSet: {
    en: (name: string) => `Copy saved. It is not in the set “${name}”: a set holds each paper once.`,
    zh: (name: string) => `已建立副本。副本不屬於套卷「${name}」：每份試卷在套卷中只出現一次。`,
  },
});
