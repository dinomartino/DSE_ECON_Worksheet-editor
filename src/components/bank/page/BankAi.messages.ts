import { defineMessages } from '@/i18n/catalogue';

/** The bank's ✦ run bar, the note above a reviewed question, and the ✦ AI menu. */
export const BANK_AI_MESSAGES = defineMessages({
  lookChip: { en: (n: number) => `${n} to look at`, zh: (n: number) => `${n} 項待查看` },
  failedChip: { en: (n: number) => `${n} failed`, zh: (n: number) => `${n} 項失敗` },
  findingChip: {
    en: (n: number) => `${n} ${n === 1 ? 'finding' : 'findings'}`,
    zh: (n: number) => `${n} 項發現`,
  },
  previous: { en: 'Previous', zh: '上一項' },
  next: { en: 'Next', zh: '下一項' },
  undoAll: { en: 'Undo all', zh: '全部復原' },
  done: { en: 'Done', zh: '完成' },
  ai: { en: 'AI', zh: 'AI' },
  toneFilled: { en: 'Filled', zh: '已補上' },
  toneLook: { en: 'Needs a look', zh: '待查看' },
  toneFailed: { en: "Couldn't translate", zh: '未能翻譯' },
  toneFinding: { en: 'Finding', zh: '發現' },
  fixTitle: { en: 'Changes every copy of this question that says the same', zh: '會更改所有內容相同的副本' },

  doorBusy: { en: 'An AI run is going', zh: '正在執行 AI' },
  doorTitle: { en: 'AI tools: fill a missing language, check terms', zh: 'AI 工具：補上缺少的語言、檢查用詞' },
  tools: { en: 'AI tools', zh: 'AI 工具' },
  actions: { en: 'AI actions', zh: 'AI 功能' },
  whichQuestions: { en: 'Which questions', zh: '哪些題目' },
  back: { en: 'Back', zh: '返回' },
  translateN: { en: (n: number) => `Translate ${n}`, zh: (n: number) => `翻譯 ${n} 條` },
  nothingQuestion: { en: 'Nothing to do for this question', zh: '這條題目沒有需要處理的地方' },
  nothingQuestions: { en: 'Nothing to do for these questions', zh: '這些題目沒有需要處理的地方' },
  free: { en: 'free', zh: '免費' },
});
