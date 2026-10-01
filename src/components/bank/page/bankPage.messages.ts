import { defineMessages } from '@/i18n/catalogue';

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

/** The words of the bank page's pure helpers (filters, counts, rail headings, parts) and the words shared by its components. */
export const BANK_PAGE_MESSAGES = defineMessages({
  // Counts
  questions: {
    en: (n: number) => `${n} ${plural(n, 'question')}`,
    zh: (n: number) => `${n} 條題目`,
  },
  countQuestions: {
    en: (n: number) => `${n} ${plural(n, 'question')}`,
    zh: (n: number) => `${n} 條題目`,
  },
  countWorksheets: {
    en: (n: number) => `${n} ${plural(n, 'worksheet')}`,
    zh: (n: number) => `${n} 份工作紙`,
  },
  countBanks: {
    en: (n: number) => `${n} ${plural(n, 'bank')}`,
    zh: (n: number) => `${n} 個題庫`,
  },
  worksheets: {
    en: (n: number) => `${n} ${plural(n, 'worksheet')}`,
    zh: (n: number) => `${n} 份工作紙`,
  },
  sep: { en: ', ', zh: '、' },

  // Filters
  marksAny: { en: 'Any marks', zh: '任何分數' },
  marks1: { en: '1 mark', zh: '1 分' },
  marks2_4: { en: '2–4 marks', zh: '2–4 分' },
  marks5_8: { en: '5–8 marks', zh: '5–8 分' },
  marks9: { en: '9+ marks', zh: '9+ 分' },
  sinceEver: { en: 'at any time', zh: '任何時間' },
  sinceYear: { en: 'this school year', zh: '本學年' },
  since12m: { en: 'in the last 12 months', zh: '過去 12 個月' },
  since6m: { en: 'in the last 6 months', zh: '過去 6 個月' },
  notUsedWith: { en: (label: string) => `Not used with ${label}`, zh: (label: string) => `未用於 ${label}` },
  notUsedWithOpen: {
    en: (closed: string, detail: string) => `${closed} (${detail})`,
    zh: (closed: string, detail: string) => `${closed}（${detail}）`,
  },
  sameStudents: { en: (detail: string) => `Same students: ${detail}`, zh: (detail: string) => `同一批學生：${detail}` },
  missingZh: { en: 'Missing 中文', zh: '缺少中文' },
  missingEn: { en: 'Missing English', zh: '缺少英文' },
  quoted: { en: (text: string) => `“${text}”`, zh: (text: string) => `「${text}」` },
  filterUntagged: { en: 'untagged', zh: '未標記課題' },
  filterNotUsed: {
    en: (label: string, since: string) => `not used with ${label}${since ? ` ${since}` : ''}`,
    zh: (label: string, since: string) => `未用於 ${label}${since ? `（${since}）` : ''}`,
  },
  fromBanks: { en: 'from banks', zh: '來自題庫' },
  fromWorksheets: { en: 'from worksheets', zh: '來自工作紙' },
  filterPattern: { en: (name: string) => `題型 ${name}`, zh: (name: string) => `題型 ${name}` },
  mixMore: {
    en: (head: string, rest: number) => `${head} +${rest} more`,
    zh: (head: string, rest: number) => `${head}，另有 ${rest} 項`,
  },
  withDetail: {
    en: (label: string, detail: string) => `${label} (${detail})`,
    zh: (label: string, detail: string) => `${label}（${detail}）`,
  },

  // Rail headings
  general: { en: 'General', zh: '一般' },
  noTopic: { en: 'No topic', zh: '未有課題' },
  noPattern: { en: 'No 題型', zh: '未有題型' },

  // Which part tests it
  partsAnd: {
    en: (head: string, last: string) => `${head} and ${last}`,
    zh: (head: string, last: string) => `${head}及${last}`,
  },
  partTestsThis: { en: (label: string) => `Part ${label} tests this`, zh: (label: string) => `分題 ${label} 考核此項` },
  partsTestThis: { en: (list: string) => `Parts ${list} test this`, zh: (list: string) => `分題 ${list} 考核此項` },
  partTests: { en: (label: string, what: string) => `Part ${label} tests ${what}`, zh: (label: string, what: string) => `分題 ${label} 考核${what}` },
  partsTest: { en: (list: string, what: string) => `Parts ${list} test ${what}`, zh: (list: string, what: string) => `分題 ${list} 考核${what}` },
  alsoIn: { en: (list: string) => `Also in ${list}`, zh: (list: string) => `同時屬於${list}` },
  wholeQuestion: { en: 'the whole question', zh: '整條題目' },
  targetPart: { en: (label: string) => `part ${label}`, zh: (label: string) => `分題 ${label}` },
  targetSubPart: { en: (label: string) => `sub-part ${label}`, zh: (label: string) => `子分題 ${label}` },

  // Class usage strip
  classLabel: { en: (name: string) => `Class ${name}`, zh: (name: string) => `班別 ${name}` },

  // Selection tray
  typeSplit: { en: (count: number, label: string) => `${count} ${label}`, zh: (count: number, label: string) => `${count} ${label}` },
  before: { en: ' before ', zh: ' 先於 ' },

  // Adding to an open worksheet
  addedFromBank: { en: (n: number) => `${n} ${plural(n, 'question')} added from 題庫`, zh: (n: number) => `已從題庫加入 ${n} 條題目` },
  addedSkipped: {
    en: (added: number, skipped: number) => `${added} ${plural(added, 'question')} added from 題庫. Skipped ${skipped} already in this paper.`,
    zh: (added: number, skipped: number) => `已從題庫加入 ${added} 條題目。已略過 ${skipped} 條已在這份工作紙內的題目。`,
  },
  nothingAddedOne: {
    en: (title: string) => `That question is already in “${title}”. Nothing was added.`,
    zh: (title: string) => `該題目已在「${title}」內，沒有加入任何題目。`,
  },
  nothingAddedMany: {
    en: (n: number, title: string) => `${n === 2 ? 'Both questions' : `All ${n} questions`} are already in “${title}”. Nothing was added.`,
    zh: (n: number, title: string) => `這 ${n} 條題目都已在「${title}」內，沒有加入任何題目。`,
  },

  // ✦ AI scopes and verbs
  scopeQuestion: { en: 'This question', zh: '這條題目' },
  scopeList: { en: (n: number) => `Your list · ${n}`, zh: (n: number) => `我的清單 · ${n}` },
  scopeShown: { en: (n: number) => `All ${n} shown`, zh: (n: number) => `顯示的全部 ${n} 條` },
  fillZh: { en: 'Fill missing 中文', zh: '補上缺少的中文' },
  fillEn: { en: 'Fill missing English', zh: '補上缺少的英文' },
  checkTerms: { en: 'Check terms against EDB glossary', zh: '按 EDB 詞彙表檢查用詞' },
  sends: {
    en: (n: number, provider: string) => `Sends ${n} ${plural(n, 'question')} to ${provider} with your key`,
    zh: (n: number, provider: string) => `使用你的 API key 將 ${n} 條題目傳送至 ${provider}`,
  },

  // ✦ AI run
  roughUnder: { en: 'under a minute', zh: '不足一分鐘' },
  roughOne: { en: 'about a minute', zh: '約一分鐘' },
  roughMany: { en: (n: number) => `about ${n} minutes`, zh: (n: number) => `約 ${n} 分鐘` },
  confirmFill: {
    en: (n: number, time: string) => `Translate ${n} questions? This takes ${time}. You can stop at any time.`,
    zh: (n: number, time: string) => `要翻譯 ${n} 條題目嗎？需時${time}，你可隨時停止。`,
  },
  translating: { en: 'Translating', zh: '翻譯中' },
  checkingTerms: { en: 'Checking terms', zh: '檢查用詞中' },
  stopped: { en: 'Stopped', zh: '已停止' },
  replaceN: { en: (n: number) => `Replace ${n}`, zh: (n: number) => `取代 ${n} 項` },
  putBack: {
    en: (n: number) => `Put back ${n} ${plural(n, 'question')} as ${n === 1 ? 'it was' : 'they were'}.`,
    zh: (n: number) => `已將 ${n} 條題目還原。`,
  },
  nothingToPutBack: { en: 'Nothing to put back.', zh: '沒有可還原的項目。' },
});
