import { defineMessages } from '@/i18n/catalogue';

/**
 * What the AI verbs, their scope chip and the question bank's runs say: labels, summaries,
 * review-card notes. Built when a verb is offered or run, so read through `assistMessages()`
 * (`./text.ts`). Where a function's first argument is `.trim()`med, that is only to keep the
 * guard test's numeric samples from reading "2 in" as inches.
 */
export const ASSIST_MESSAGES = defineMessages({
  sideZh: { en: '中文', zh: '中文' },
  sideEn: { en: 'English', zh: '英文' },

  // Scope chip
  wholePaper: { en: 'Whole paper', zh: '整份工作紙' },
  questionN: { en: (n: number) => `Question ${n}`, zh: (n: number) => `第 ${n} 題` },
  thisQuestion: { en: 'This question', zh: '這條題目' },
  questionsN: { en: (n: number) => `${n} questions`, zh: (n: number) => `${n} 條題目` },
  itemsN: { en: (n: number) => `${n} items`, zh: (n: number) => `${n} 個項目` },
  thisItem: { en: 'This item', zh: '這個項目' },
  thisText: { en: 'This text', zh: '這段文字' },
  textsN: { en: (n: number) => `${n} texts`, zh: (n: number) => `${n} 段文字` },
  thisTable: { en: 'This table', zh: '這個表格' },
  thisFigure: { en: 'This figure', zh: '這個圖像' },

  // Fill missing and Re-translate
  fillMissing: { en: (name: string) => `Fill missing ${name}`, zh: (name: string) => `補上缺少的${name}` },
  retranslate: { en: (name: string) => `Re-translate ${name}…`, zh: (name: string) => `重新翻譯${name}…` },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- the same signature as en
  unitTexts: { en: (n: number) => (n === 1 ? 'text' : 'texts'), zh: (_n: number) => '段文字' },
  sendsTexts: {
    en: (n: number, provider: string) => `Sends ${n} ${n === 1 ? 'text' : 'texts'} to ${provider} with your key`,
    zh: (n: number, provider: string) => `會連同你的 API key 把 ${n} 段文字傳送到 ${provider}`,
  },
  translatingInto: { en: (name: string) => `Translating into ${name}`, zh: (name: string) => `正在翻譯成${name}` },
  remove: { en: 'Remove', zh: '移除' },
  replaceWith: { en: (to: string) => `Replace with ${to}`, zh: (to: string) => `取代為 ${to}` },
  replaceN: { en: (n: number) => `Replace ${n}`, zh: (n: number) => `取代 ${n} 項` },
  changedSince: {
    en: 'Nothing changed. This text was edited since.',
    zh: '沒有更改。這段文字之後已被編輯。',
  },
  changedWhileTranslating: {
    en: 'Changed while translating. Left as it is.',
    zh: '翻譯期間已有更改，保持原樣。',
  },
  nothingToFill: { en: 'Nothing to fill here', zh: '這裏沒有需要填寫的內容' },
  stoppedNothing: { en: 'Stopped. Nothing was changed.', zh: '已停止，沒有更改任何內容。' },
  documentChanged: {
    en: 'Another document is open. Nothing was inserted.',
    zh: '已開啟另一份文件，沒有插入任何內容。',
  },
  genericError: {
    en: 'Something went wrong. Nothing more was changed.',
    zh: '發生問題，沒有再更改任何內容。',
  },

  // Fill summary: "Filled 47 中文 texts, 5 need a look, 2 couldn't be translated"
  summaryFilled: {
    en: (verb: string, n: number, side: string) => `${verb} ${n} ${side} ${n === 1 ? 'text' : 'texts'}`,
    zh: (verb: string, n: number, side: string) => `${verb === 'Filled' ? '已填寫' : '已重新翻譯'} ${n} 段${side}`,
  },
  summaryNothing: {
    en: (verb: string) => `Nothing ${verb.toLowerCase()}`,
    zh: (verb: string) => (verb === 'Filled' ? '沒有填寫任何內容' : '沒有重新翻譯任何內容'),
  },
  summaryLook: {
    en: (n: number) => `${n} ${n === 1 ? 'needs' : 'need'} a look`,
    zh: (n: number) => `${n} 段需要留意`,
  },
  summaryFailed: { en: (n: number) => `${n} couldn't be translated`, zh: (n: number) => `${n} 段未能翻譯` },
  summaryChanged: { en: (n: number) => `${n} changed while translating`, zh: (n: number) => `${n} 段在翻譯期間已有更改` },
  summaryNotSent: {
    en: (n: number, reason: string) => `${n} not sent (${reason})`,
    zh: (n: number, reason: string) => `${n} 段未有傳送（${reason}）`,
  },
  summaryStopped: { en: 'Stopped · ', zh: '已停止 · ' },
  listJoin: { en: ', ', zh: '，' },
  endStop: { en: '.', zh: '。' },

  // The question bank's runs
  bankQuestions: { en: (n: number) => `${n} ${n === 1 ? 'question' : 'questions'}`, zh: (n: number) => `${n} 條題目` },
  bankStopped: { en: (done: number, total: number) => `Stopped. ${done} of ${total} done`, zh: (done: number, total: number) => `已停止，已完成 ${done} / ${total}` },
  bankFilled: {
    en: (side: string, questions: string) => `Filled ${side.trim()} in ${questions}`,
    zh: (side: string, questions: string) => `已在 ${questions} 填寫${side}`,
  },
  bankNothingFilled: { en: 'Nothing filled', zh: '沒有填寫任何內容' },
  bankNotSent: {
    en: (questions: string, reason: string) => `${questions} not sent (${reason})`,
    zh: (questions: string, reason: string) => `${questions}未有傳送（${reason}）`,
  },
  bankTermsIn: {
    en: (summary: string, questions: string) => `${summary.trim()} in ${questions}`,
    zh: (summary: string, questions: string) => `${questions}：${summary}`,
  },
  changedSinceRead: {
    en: 'Changed since the bank read it. Left as it is.',
    zh: '題庫讀取後已有更改，保持原樣。',
  },
  notWritten: { en: 'No copy of it could be written.', zh: '未能寫入任何副本。' },

  // Check terms
  checkTermsLabel: { en: 'Check terms against EDB glossary', zh: '按 EDB 詞彙表檢查用詞' },
  checkingTerms: { en: 'Checking terms', zh: '正在檢查用詞' },
  termsMatch: { en: 'Terms match the EDB glossary', zh: '用詞與 EDB 詞彙表一致' },
  termsMatchN: {
    en: (n: number) => `${n} ${n === 1 ? 'term matches' : 'terms match'} the EDB glossary`,
    zh: (n: number) => `${n} 個用詞與 EDB 詞彙表一致`,
  },
  noTermsFound: { en: 'No EDB glossary terms found', zh: '沒有找到 EDB 詞彙表的用詞' },
  matchedN: { en: (n: number) => `${n} match`, zh: (n: number) => `${n} 個相符` },
  nothingReplacedOne: {
    en: 'Nothing replaced. This text changed since the check.',
    zh: '沒有取代任何用詞。這段文字在檢查後已有更改。',
  },
  foundLine: {
    en: (en: string, found: string, expected: string) => `${en} → ${found} (EDB: ${expected})`,
    zh: (en: string, found: string, expected: string) => `${en} → ${found}（EDB：${expected}）`,
  },
  /** The same for the teacher's own choice or term (Settings → Translation terms). */
  foundOwnLine: {
    en: (en: string, found: string, expected: string) => `${en} → ${found} (yours: ${expected})`,
    zh: (en: string, found: string, expected: string) => `${en} → ${found}（你的：${expected}）`,
  },
  textbookForm: {
    en: (to: string) => `A textbook form; EDB lists ${to} first.`,
    zh: (to: string) => `這是教科書的寫法；EDB 以 ${to} 為首選。`,
  },

  // Check question quality
  qualityLabel: { en: 'Check question quality', zh: '檢查題目質素' },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- the same signature as en
  unitQuestions: { en: (n: number) => (n === 1 ? 'question' : 'questions'), zh: (_n: number) => '條題目' },
  questionsBlank: { en: 'These questions are blank', zh: '這些題目是空白的' },
  sendsQuestions: {
    en: (n: number, provider: string) => `Sends ${n} ${n === 1 ? 'question' : 'questions'} to ${provider} with your key. Changes nothing.`,
    zh: (n: number, provider: string) => `會連同你的 API key 把 ${n} 條題目傳送到 ${provider}。不會更改任何內容。`,
  },
  checkingQuestions: {
    en: (n: number) => `Checking ${n} ${n === 1 ? 'question' : 'questions'}`,
    zh: (n: number) => `正在檢查 ${n} 條題目`,
  },
  noProblems: {
    en: (total: number) => `No problems found in ${total} ${total === 1 ? 'question' : 'questions'}`,
    zh: (total: number) => `${total} 條題目中沒有發現問題`,
  },
  noProblemsPartial: {
    en: (reviewed: number, total: number) =>
      `No problems found in the ${reviewed} of ${total} ${total === 1 ? 'question' : 'questions'} checked`,
    zh: (reviewed: number, total: number) => `已檢查的 ${reviewed} 條題目（共 ${total} 條）中沒有發現問題`,
  },
  suggested: { en: (text: string) => `Suggested: ${text}`, zh: (text: string) => `建議：${text}` },
  qualityHead: {
    en: (findings: number, total: number) =>
      `${findings} ${findings === 1 ? 'finding' : 'findings'} in ${total} ${total === 1 ? 'question' : 'questions'}`,
    zh: (findings: number, total: number) => `${total} 條題目中有 ${findings} 項發現`,
  },
  qualityWithTail: { en: (head: string, tail: string) => `${head} (${tail})`, zh: (head: string, tail: string) => `${head}（${tail}）` },
  qualityStoppedWith: { en: (message: string) => `stopped: ${message}`, zh: (message: string) => `已停止：${message}` },
  qualityStoppedEarly: { en: 'stopped early', zh: '提早停止' },
  qualityCouldNot: {
    en: (n: number) => `${n} ${n === 1 ? 'question' : 'questions'} could not be checked`,
    zh: (n: number) => `${n} 條題目未能檢查`,
  },
  tailJoin: { en: '; ', zh: '；' },

  // Write answers & mark scheme
  writeAnswersLabel: { en: 'Write answers & mark scheme', zh: '撰寫答案及評卷參考' },
  unitParts: { en: 'parts', zh: '個分題' },
  sendsParts: {
    en: (n: number, provider: string) => `Sends ${n} ${n === 1 ? 'part' : 'parts'} to ${provider} with your key`,
    zh: (n: number, provider: string) => `會連同你的 API key 把 ${n} 個分題傳送到 ${provider}`,
  },
  changedWhileWriting: { en: 'Changed while writing. Not inserted', zh: '寫入期間已有更改，未有插入' },
  nothingInserted: { en: (tail: string) => `Nothing inserted${tail}`, zh: (tail: string) => `沒有插入任何內容${tail}` },
  filledParts: {
    en: (n: number, tail: string) => `Filled ${n} ${n === 1 ? 'part' : 'parts'}${tail}`,
    zh: (n: number, tail: string) => `已填寫 ${n} 個分題${tail}`,
  },
  tailStopped: { en: ': stopped', zh: '：已停止' },
  tailMessage: { en: (message: string) => `: ${message}`, zh: (message: string) => `：${message}` },

  // Questions from a source
  fromSourceLabel: { en: 'Questions from a source…', zh: '根據資料撰寫題目…' },
  sendsSource: {
    en: (provider: string, makes: string) => `Sends your source to ${provider} with your key; adds ${makes}`,
    zh: (provider: string, makes: string) => `會連同你的 API key 把資料傳送到 ${provider}；將加入 ${makes}`,
  },
  makesMcq: { en: (n: number) => `${n} MCQs`, zh: (n: number) => `${n} 條 MCQ` },
  makesStructured: {
    en: (n: number) => `${n === 1 ? 'a' : n} structured question${n === 1 ? '' : 's'}`,
    zh: (n: number) => `${n} 條結構題`,
  },
  makesJoin: { en: ' and ', zh: '和' },
  pasteSource: { en: 'Paste a source', zh: '貼上資料' },
  sourcePlaceholder: {
    en: 'A news extract, a data table described in words…',
    zh: '一段新聞摘錄、用文字描述的數據表…',
  },
  pasteAtLeast: {
    en: (n: number) => `Paste at least ${n} characters of source.`,
    zh: (n: number) => `請貼上至少 ${n} 個字的資料。`,
  },
  writingFromSource: { en: 'Writing questions from your source…', zh: '正在根據你的資料撰寫題目…' },
  stoppedNothingAdded: { en: 'Stopped. Nothing was added.', zh: '已停止，沒有加入任何內容。' },
  notAdded: { en: 'Not added', zh: '未有加入' },
  noneAdded: {
    en: 'No question passed the checks, so nothing was added.',
    zh: '沒有題目通過檢查，所以沒有加入任何內容。',
  },
  notAddedChanged: {
    en: 'Nothing was added: the document changed or is read-only.',
    zh: '沒有加入任何內容：文件已有更改，或屬唯讀。',
  },
  fromYourSource: { en: 'From your source', zh: '來自你的資料' },
  sourceKept: {
    en: (name: string) => `The source is kept as pasted (${name}); Fill missing translates it.`,
    zh: (name: string) => `資料維持貼上時的原貌（${name}）；可用「補上缺少的…」翻譯。`,
  },
  addedQuestions: {
    en: (added: number, failed: number) =>
      `Added ${added} question${added === 1 ? '' : 's'} from your source${failed ? `; ${failed} failed the checks` : ''}.`,
    zh: (added: number, failed: number) =>
      `已根據你的資料加入 ${added} 條題目${failed ? `；${failed} 條未通過檢查` : ''}。`,
  },
});
