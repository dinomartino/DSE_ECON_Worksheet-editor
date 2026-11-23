import { defineMessages } from '@/i18n/catalogue';

/**
 * What the Question studio's checks found, in words (k-0499). The engine reports codes with
 * values (`src/questionStudio`); `findings.ts` picks the entry. Each sentence says what is
 * wrong and, where it helps, what to look at; none blames the teacher.
 */
export const STUDIO_FINDING_MESSAGES = defineMessages({
  sideEn: { en: 'English', zh: '英文' },
  sideZh: { en: '中文', zh: '中文' },
  unknown: { en: (id: string) => `A check reported “${id}”.`, zh: (id: string) => `有檢查回報「${id}」。` },

  // ---- format (a failure: the draft cannot be added) ----
  shapeStemEmpty: { en: (side: string) => `The question text is missing in ${side}.`, zh: (side: string) => `題幹缺少${side}版本。` },
  shapeOptionCount: { en: (count: number) => `It has ${count} options; a question needs 4.`, zh: (count: number) => `共有 ${count} 個選項，必須有 4 個。` },
  shapeOptionEmpty: { en: (side: string) => `An option is empty in ${side}.`, zh: (side: string) => `有選項的${side}版本是空白的。` },
  shapeOptionsSame: { en: (side: string) => `Two options say the same thing in ${side}.`, zh: (side: string) => `有兩個選項的${side}內容相同。` },
  shapeKeyRange: { en: 'The key is not one of the four options.', zh: '答案不是四個選項之一。' },
  shapeStatementEmpty: { en: (side: string) => `A statement is empty in ${side}.`, zh: (side: string) => `有陳述的${side}版本是空白的。` },
  shapeStatementCount: {
    en: (count: number) => `A statements question has 2 to 4 statements; this has ${count}.`,
    zh: (count: number) => `帶陳述的題目需要 2 至 4 項陳述，這題有 ${count} 項。`,
  },
  shapeNotCombination: {
    en: (side: string) => `In ${side}, the options do not combine the statements as “(1) and (2) only” does.`,
    zh: (side: string) => `${side}版本的選項沒有像「只有 (1) 及 (2)」那樣組合陳述。`,
  },

  // ---- key ----
  keyDiffers: {
    en: (solver: string, key: string) => `Solved again from the text alone, the check chose ${solver}, but the key says ${key}. Work it out before you use this question.`,
    zh: (solver: string, key: string) => `只憑題目文字重新作答，檢查選了 ${solver}，但答案是 ${key}。使用這條題目前，請自己計算一次。`,
  },
  keyAmbiguous: {
    en: 'Solved again from the text alone, the check found more than one option defensible.',
    zh: '只憑題目文字重新作答，檢查認為有多於一個選項說得通。',
  },

  // ---- numbers, terms, syllabus ----
  numbersDiffer: {
    en: (enOnly: string, zhOnly: string) => `The numbers differ between English and 中文. Only in English: ${enOnly || 'none'}. Only in 中文: ${zhOnly || 'none'}.`,
    zh: (enOnly: string, zhOnly: string) => `英文與中文版本的數字不一致。只在英文出現：${enOnly || '無'}。只在中文出現：${zhOnly || '無'}。`,
  },
  termsNote: { en: (text: string) => `Terms: ${text}`, zh: (text: string) => `詞彙：${text}` },
  syllabusLimited: {
    en: (term: string, code: string) => `Mentions ${term}, which the 2025 syllabus says is not required (${code}).`,
    zh: (term: string, code: string) => `提及 ${term}，而 2025 年課程指引表明毋須學習（${code}）。`,
  },

  // ---- question quality ----
  lintKeyLongest: { en: 'The key is the longest option, which gives it away.', zh: '答案是最長的選項，容易被猜中。' },
  lintUneven: { en: 'The options differ a lot in length.', zh: '各選項的長度相差很大。' },
  lintAllNone: { en: 'An option says “all of the above” or “none of the above”.', zh: '有選項是「以上皆是」或「以上皆非」。' },
  lintNegativeStem: {
    en: 'The question asks for what is not true, but the word NOT is not in bold.',
    zh: '題目問的是哪項不正確，但 NOT 沒有加粗。',
  },
  lintShapeAsked: {
    en: (asked: string, got: string) => `You asked for ${asked === 'combination' ? 'statements (1)(2)(3)' : 'four plain options'}, but this one has ${got === 'combination' ? 'statements' : 'four plain options'}.`,
    zh: (asked: string, got: string) => `你要求${asked === 'combination' ? '帶陳述 (1)(2)(3) 的格式' : '四個一般選項'}，但這題是${got === 'combination' ? '帶陳述的格式' : '四個一般選項'}。`,
  },
  lintKeySpread: {
    en: (letter: string, count: number, of: number) => `${count} of these ${of} questions have the key ${letter}. Students can learn a pattern like that.`,
    zh: (letter: string, count: number, of: number) => `這 ${of} 條題目中，有 ${count} 條的答案是 ${letter}。學生可能會發現這個規律。`,
  },

  // ---- near-copy (a failure) ----
  copyClose: {
    en: (percent: number, kind: string) => `Too close to ${kind}: ${percent}% of its wording is shared. Write another, or change it.`,
    zh: (percent: number, kind: string) => `與${kind}太相似：${percent}% 的用字相同。請另擬一題，或加以修改。`,
  },
  copyReference: {
    en: (percent: number) => `Close to your reference on purpose: ${percent}% of its wording is shared. There is no limit against it.`,
    zh: (percent: number) => `刻意貼近你揀選的參考題：${percent}% 的用字相同。與參考題之間沒有相似度上限。`,
  },
  copyVerbatim: {
    en: (kind: string) => `It repeats a long passage of ${kind} word for word. Write another, or change it.`,
    zh: (kind: string) => `整段文字與${kind}一字不差。請另擬一題，或加以修改。`,
  },
  copyKindBank: { en: 'a past paper question', zh: '一條歷屆試題' },
  copyKindMine: { en: 'one of your questions', zh: '你的一條題目' },
  copyKindPaper: { en: 'a question in the open paper', zh: '開啟中工作紙的一條題目' },
  copyKindExample: { en: 'the example you picked', zh: '你揀選的例子' },
  copyKindDraft: { en: 'another draft', zh: '另一份草稿' },

  // ---- the run ----
  runFewer: {
    en: (asked: number, got: number) => `You asked for ${asked} and ${got} could be used. The others failed a check and are listed as left out.`,
    zh: (asked: number, got: number) => `你要求 ${asked} 題，其中 ${got} 題可以使用。其餘未通過檢查，列在「已剔除」。`,
  },
  runStopped: {
    en: 'Stopped. The keys of these drafts were not checked.',
    zh: '已停止。這些草稿的答案還沒有檢查。',
  },
  runKeyNotChecked: {
    en: 'The keys could not be checked this time, so read each one yourself.',
    zh: '這次未能檢查答案，請自己逐題核對。',
  },
});
