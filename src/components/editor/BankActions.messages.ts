import { defineMessages } from '@/i18n/catalogue';

export const BANK_ACTIONS_MESSAGES = defineMessages({
  treatNewText: {
    en: 'This copy will no longer be linked to the bank’s version or to its other copies. The bank will list it as a question of its own, and Update bank copy will not change it. Nothing on the page changes, and ⌘Z undoes it.',
    zh: '這份副本將不再與題庫的版本或其他副本連結。題庫會把它當作獨立的題目，「更新題庫副本」也不會改動它。頁面上的內容不會改變，亦可按 ⌘Z 復原。',
  },
  nameRequired: { en: 'Give it a name first.', zh: '請先為它命名。' },
  theBank: { en: 'the bank', zh: '題庫' },
  saveFailed: { en: 'Could not save the bank.', zh: '無法儲存題庫。' },
  updated: {
    en: (name: string) => `Updated the copy in ${name}.`,
    zh: (name: string) => `已更新「${name}」中的副本。`,
  },
  noCopy: {
    en: (name: string) => `${name} has no copy of this question.`,
    zh: (name: string) => `「${name}」沒有這條題目的副本。`,
  },
  copyToBankMenu: { en: 'Copy to bank…', zh: '複製到題庫…' },
  updateBankCopy: { en: 'Update bank copy', zh: '更新題庫副本' },
  updateCopyIn: {
    en: (name: string) => `Update copy in ${name}`,
    zh: (name: string) => `更新「${name}」中的副本`,
  },
  treatNewMenu: { en: 'Treat as a new question…', zh: '視為新題目…' },
  copied: {
    en: (name: string) => `Copied to ${name}.`,
    zh: (name: string) => `已複製到「${name}」。`,
  },
  alreadyHas: {
    en: (name: string) => `${name} already has this question. Nothing was copied.`,
    zh: (name: string) => `「${name}」已有這條題目，沒有複製任何內容。`,
  },
  noteSame: {
    en: (name: string) => `${name} already has this question.`,
    zh: (name: string) => `「${name}」已有這條題目。`,
  },
  noteDiffers: {
    en: (name: string) => `${name} has another version of this question. Update it to match this one.`,
    zh: (name: string) => `「${name}」有這條題目的另一個版本。請更新它，使之與此題一致。`,
  },
  dialogCopy: { en: 'Copy to bank', zh: '複製到題庫' },
  dialogTreatNew: { en: 'Treat as a new question?', zh: '視為新題目？' },
  dialogDone: { en: 'Question bank', zh: '題庫' },
  dialogError: { en: 'Could not save', zh: '無法儲存' },
  cancel: { en: 'Cancel', zh: '取消' },
  copy: { en: 'Copy', zh: '複製' },
  treatAsNew: { en: 'Treat as new', zh: '視為新題目' },
  done: { en: 'Done', zh: '完成' },
  pickLegend: {
    en: 'A copy is added to the bank. This worksheet is not changed.',
    zh: '副本會加入題庫，這份工作紙不會改變。',
  },
  newBank: { en: 'New bank', zh: '新題庫' },
  newBankName: { en: 'New bank name', zh: '新題庫名稱' },
  newBankHint: {
    en: 'What it is called in your list. It does not print.',
    zh: '它在清單中顯示的名稱，不會列印。',
  },
  hasThis: { en: 'has this question', zh: '已有此題' },
  hasAnother: { en: 'has another version', zh: '有另一個版本' },
});
