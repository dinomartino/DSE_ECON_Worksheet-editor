/**
 * The words of the HKDSE house-style findings (k-0548), as plain catalogue entries: the
 * catalogue is `messages.ts:DSE_STYLE_MESSAGES`, and the Question studio spreads the same
 * entries into its findings catalogue (one place for the words, each catalogue file its own).
 */
export const DSE_STYLE_WORDS = {
  styleSideEn: { en: 'English', zh: '英文' },
  styleSideZh: { en: '中文', zh: '中文' },
  styleNegativeCase: {
    en: 'The negative word in the question should be in bold capitals, as in HKDSE papers (NOT, LEAST).',
    zh: '英文題目中的否定字眼應以粗體大寫標示，與 HKDSE 試卷一致（NOT、LEAST）。',
  },
  styleQuestionMark: {
    en: (side: string) => `The question in ${side} does not end with a question mark.`,
    zh: (side: string) => `${side}題目是問句，但沒有以問號結尾。`,
  },
  styleComboForm: {
    en: (side: string) => `The ${side} options should read like HKDSE ones: “(1) and (2) only”, “(1), (2) and (3)”.`,
    zh: (side: string) => `${side}選項應依 HKDSE 試卷的寫法：「只有 (1)、(2)」、「(1)、(2) 及 (3)」。`,
  },
  styleComboOnly: {
    en: (side: string) => `In ${side}, “only” belongs on every option that leaves a statement out, and not on the one with all of them.`,
    zh: (side: string) => `${side}選項中，未包括全部陳述的選項須寫「只有」，包括全部陳述的選項則不寫。`,
  },
  styleComboOrder: {
    en: (side: string) => `The ${side} options are not in the usual order (fewer statements first, then by number).`,
    zh: (side: string) => `${side}選項未按慣常次序排列（陳述數目少的先列，再按編號）。`,
  },
  styleNumberOrder: {
    en: (side: string) => `The number options in ${side} are not in ascending order, as HKDSE papers list them.`,
    zh: (side: string) => `${side}的數字選項未按由小至大排列（HKDSE 試卷的慣例）。`,
  },
  styleThousandsComma: {
    en: (example: string) => `HKDSE papers separate thousands with a space (10 000), not a comma (${example}).`,
    zh: (example: string) => `HKDSE 試卷以空格分隔千位（10 000），而非逗號（${example}）。`,
  },
  styleOptionStops: {
    en: (side: string) => `Some ${side} options end with a full stop and some do not.`,
    zh: (side: string) => `部分${side}選項以句號結尾，部分沒有。`,
  },
  styleStatementStops: {
    en: (side: string) => `Some ${side} statements end with a full stop and some do not.`,
    zh: (side: string) => `部分${side}陳述以句號結尾，部分沒有。`,
  },
  styleBlankSeparator: {
    en: (side: string) => `With two blanks, every ${side} option should read “X ... Y”.`,
    zh: (side: string) => `題目有兩個空格時，每個${side}選項都應寫成「X …… Y」。`,
  },
  styleZhPunctuation: {
    en: (example: string) => `The 中文 uses half-width punctuation (“${example}”); HKDSE papers use full-width ，。？：.`,
    zh: (example: string) => `中文使用了半形標點（「${example}」）；HKDSE 試卷使用全形標點 ，。？：。`,
  },
  styleZhSimplified: {
    en: (example: string) => `The 中文 has a Simplified character (“${example}”); HKDSE papers use Traditional Chinese.`,
    zh: (example: string) => `中文出現簡體字（「${example}」）；HKDSE 試卷使用繁體字。`,
  },
  styleContraction: {
    en: (example: string) => `HKDSE papers do not use contractions (“${example}”).`,
    zh: (example: string) => `HKDSE 試卷不用縮寫形式（「${example}」）。`,
  },
  styleFiller: {
    en: (example: string) => `“${example}” does not appear in HKDSE Paper 1 questions; state the point plainly (an assumption as “Suppose …”).`,
    zh: (example: string) => `HKDSE Paper 1 題目不用「${example}」；請直接陳述（假設條件寫成「假設……」）。`,
  },
  styleLongSentence: {
    en: (side: string, length: number) => `A sentence in ${side} is long (${length}); HKDSE sentences stay under 45 words (中文 90 characters).`,
    zh: (side: string, length: number) => `${side}有一句很長（${length}）；HKDSE 題目的句子一般少於 45 個英文字（中文 90 字）。`,
  },
  styleSpelling: {
    en: (example: string, british: string) => `HKDSE papers use British spelling: “${british}”, not “${example}”.`,
    zh: (example: string, british: string) => `HKDSE 試卷使用英式拼寫：應為「${british}」，而非「${example}」。`,
  },
} as const;
