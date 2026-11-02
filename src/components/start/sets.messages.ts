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
  renameSet: { en: 'Rename set…', zh: '重新命名套卷…' },
  addPapers: { en: 'Add papers…', zh: '加入試卷…' },
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
  renameSetTitle: { en: 'Rename set', zh: '重新命名套卷' },
  renameSetDescription: {
    en: 'Every paper in the set takes the new name. The printed papers do not change.',
    zh: '套卷內每份試卷都會用新名稱。印出的試卷內容不變。',
  },
  rename: { en: 'Rename', zh: '重新命名' },
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
  copyLeftSet: {
    en: (name: string) => `Copy saved. It is not in the set “${name}”: a set holds each paper once.`,
    zh: (name: string) => `已建立副本。副本不屬於套卷「${name}」：每份試卷在套卷中只出現一次。`,
  },
});
