import { bi } from '@/model/text';

/**
 * The answer key's printed wording, in one place so the tests and backends agree.
 * Printed text, never interface chrome: it follows the document's language, not the
 * app's, and stays out of the `messages.ts` catalogues.
 */

export const ANSWER_KEY_WORDING = {
  title: { en: 'Answer key', zh: '答案及評分參考' },
  explanations: { en: 'Explanations', zh: '解說' },
  explanationsVersionA: {
    en: 'Explanations (option letters as in Version A)',
    zh: '解說（選項字母以版本 A 為準）',
  },
  question: (n: number) => ({ en: `Question ${n}`, zh: `第${n}題` }),
  version: (letter: string) => ({ en: `Version ${letter}`, zh: `版本 ${letter}` }),
  versionMap: { en: 'Version map', zh: '版本對照' },
  versionMapHint: {
    en: 'For each printed option, the letter it has in Version A.',
    zh: '各版本每個選項在版本 A 的字母。',
  },
  sameAsA: { en: 'Same as A', zh: '同版本 A' },
} as const;

/**
 * What the layouts add (`Worksheet.answerKeyLayout`). The disclaimer and legend follow
 * the HKEAA marking schemes' front matter in substance, in our own words: this is the
 * teacher's scheme, not the Authority's.
 */
export const KEY_LAYOUT_WORDING = {
  /** The derived title's second half, per preset (`ANSWER_KEY_STYLES`). */
  hkeaaTitle: { en: 'Marking scheme', zh: '評卷參考' },
  disclaimer: bi(
    'This marking scheme is for markers’ reference. It is not a set of model answers: ' +
      'other relevant answers should be accepted and given credit on their merits.',
    '本評卷參考只供閱卷員參考之用，並非標準答案。考生如提出其他合理答案，亦應按其質素給分。',
  ),
  legendHeading: bi('Notation', '評分符號'),
  /** Each symbol as the scheme prints it in that language (`MARK_SCHEME_WORDING`). */
  legend: [
    { symbol: bi('/', '/'), meaning: bi('separates alternative answers; any one is accepted.', '分隔可接受的其他答案，答其中之一即可。') },
    { symbol: bi('n@', 'n@'), meaning: bi('n marks for each point.', '每項要點得 n 分。') },
    { symbol: bi('max: n', '最高n分'), meaning: bi('the most marks the points above can earn.', '以上各項最多可得的分數。') },
    { symbol: bi('OR', '或'), meaning: bi('separates two complete alternative answers.', '分隔兩個完整的不同答案。') },
  ],
  /** The Marks column's running head. */
  marksHeader: bi('Marks', '分數'),
  questionTotal: (n: number) => bi(`(Total: ${n} ${n === 1 ? 'mark' : 'marks'})`, `（共${n}分）`),
  paperTotal: (n: number) => bi(`Total: ${n} ${n === 1 ? 'mark' : 'marks'}`, `總分：${n}分`),
  /** The HKEAA MC table's column heads. */
  questionNo: bi('Question No.', '題號'),
  key: bi('Key', '答案'),
  /** The list layout's answer line under a stem. */
  answer: (letter: string) => bi(`Answer: ${letter}`, `答案：${letter}`),
} as const;
