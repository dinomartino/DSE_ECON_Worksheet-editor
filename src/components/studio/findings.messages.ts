import { DSE_STYLE_WORDS } from '@/dseStyle/words';
import { defineMessages } from '@/i18n/catalogue';

/**
 * What the Question studio's checks found, in words (k-0499). The engine reports codes with
 * values (`src/questionStudio`); `findings.ts` picks the entry. Each sentence says what is
 * wrong and, where it helps, what to look at; none blames the teacher.
 */
export const STUDIO_FINDING_MESSAGES = defineMessages({
  // ---- HKDSE house style (k-0548): the module's own words, shared with other features ----
  ...DSE_STYLE_WORDS,
  sideEn: { en: 'English', zh: '英文' },
  sideZh: { en: '中文', zh: '中文' },
  unknown: { en: (id: string) => `A check reported “${id}”.`, zh: (id: string) => `有檢查回報「${id}」。` },

  // ---- format (a failure: a red warning on the card; the teacher decides, k-0531) ----
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

  shapeNarrates: {
    en: (side: string) => `In ${side}, the question describes its diagram in words. An HKDSE question only refers to the diagram.`,
    zh: (side: string) => `${side}版本的題目用文字描述了圖表。HKDSE 題目只會寫「參看下圖」。`,
  },
  shapeFigureFailed: {
    en: 'The diagram for this question could not be drawn to match it. Draw it yourself or ask for a change.',
    zh: '未能畫出與題目相符的圖表。請自行繪畫，或要求修改。',
  },

  // ---- key ----
  keyDiffers: {
    en: (solver: string, key: string) => `Solved again from the text alone, the check chose ${solver}, but the key says ${key}. Work it out before you use this question.`,
    zh: (solver: string, key: string) => `只憑題目文字重新作答，檢查選了 ${solver}，但答案是 ${key}。使用這條題目前，請自己計算一次。`,
  },
  keyEdited: {
    en: 'You edited this question after the AI checked its key: check again. Work the answer out yourself, or ask the AI to change the draft (that checks it again).',
    zh: '你在 AI 核對答案後修改了這條題目：請再檢查。請自己計算答案，或請 AI 修改草稿（會再次核對）。',
  },
  checkEdited: {
    en: 'You edited this question, and this check could not run again here: check again.',
    zh: '你修改了這條題目，而這項檢查未能在此再次進行：請再檢查。',
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

  // ---- near-copy (a failure: a red warning; keep it strong, it guards against copying past papers) ----
  copyClose: {
    en: (percent: number, kind: string) => `Too close to ${kind}: ${percent}% of its wording is shared. Do not use it as it is: change the wording, or write another.`,
    zh: (percent: number, kind: string) => `與${kind}太相似：${percent}% 的用字相同。請勿直接使用：先修改用字，或另擬一題。`,
  },
  copyReference: {
    en: (percent: number) => `Close to your reference on purpose: ${percent}% of its wording is shared. There is no limit against it.`,
    zh: (percent: number) => `刻意貼近你揀選的參考題：${percent}% 的用字相同。與參考題之間沒有相似度上限。`,
  },
  copyVerbatim: {
    en: (kind: string) => `It repeats a long passage of ${kind} word for word. Do not use it as it is: change the wording, or write another.`,
    zh: (kind: string) => `整段文字與${kind}一字不差。請勿直接使用：先修改用字，或另擬一題。`,
  },
  copyKindBank: { en: 'a past paper question', zh: '一條歷屆試題' },
  copyKindMine: { en: 'one of your questions', zh: '你的一條題目' },
  copyKindPaper: { en: 'a question in the open paper', zh: '開啟中工作紙的一條題目' },
  copyKindExample: { en: 'the example you picked', zh: '你揀選的例子' },
  copyKindDraft: { en: 'another draft', zh: '另一份草稿' },

  // ---- the run ----
  runFewer: {
    en: (asked: number, got: number) => `You asked for ${asked} and the AI wrote ${got}.`,
    zh: (asked: number, got: number) => `你要求 ${asked} 題，AI 寫了 ${got} 題。`,
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
