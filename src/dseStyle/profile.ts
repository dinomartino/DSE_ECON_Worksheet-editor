/**
 * The HKDSE Economics Paper 1 MC house style, as a fixed prompt block (k-0548, user u-c6z8).
 *
 * Measured on the 725 HKDSE Paper 1 questions of the public past-paper bank (2012–2026 papers,
 * the Practice Paper and the Sample Paper; no HKCEE or HKALE), English and 中文 apart. Method,
 * counts and question ids per rule: `Outbox/k-0548/DSE-STYLE.md` (the readable report).
 * The ideas are from author-style-profile-mining (measured habits, per-sample spread, absent
 * markers as rules, DO/DON'T lines each backed by a count) and style-mirror (a profile block
 * steering the writer); no code from either (both MIT) is used.
 *
 * Used by the Question studio's write and rewrite prompts (`questionStudio/prompt.ts`) and meant
 * for any feature that asks the AI to write or improve a Paper 1 question (k-0549's wording
 * enhancement): put `DSE_STYLE_PROFILE` first, unchanged, as a fixed prompt prefix. It is one
 * constant so every call sends the same bytes (a provider's prompt cache can reuse it); change
 * it only on purpose, bump `DSE_STYLE_PROFILE_VERSION`, and re-run the style check over the bank
 * (`DSE_BANK_DIR=… npx vitest run src/dseStyle`).
 *
 * The deterministic half of the same rules is `check.ts:checkDseStyle`.
 */

export const DSE_STYLE_PROFILE_VERSION = 4;

/** Opens the block: a marker tests and a mock server can find. */
export const DSE_STYLE_MARKER = 'HKDSE ECONOMICS PAPER 1 MC HOUSE STYLE';

export const DSE_STYLE_PROFILE = [
  `${DSE_STYLE_MARKER} (v${DSE_STYLE_PROFILE_VERSION}). Measured on 725 HKDSE Paper 1 questions (2012-2026, Practice and Sample Papers). Write every question in this style, in each language asked for. It is a style guide only: take no wording, scenario or numbers from past papers.`,
  '',
  'A. THE QUESTION LINE (the last sentence of the stem) takes one of three forms:',
  '1. A direct question ending "?" (53%). Default opener "Which of the following ...?" (42% of all stems): "Which of the following is most likely to ...?", "Which of the following statements about X is correct?", "Which of the following best explains ...?", "Which of the following will lead to / would result in ...?", "Which of the following would be included in ...?". Also "What will be the ...?", "In which of the following cases ...?". Never "How ...?" or "Why ...?" (0 of 725).',
  '   中文: 「下列哪項……？」 for one answer, 「下列哪些……？」 for a combination item, 「下列哪項陳述是正確的？」, 「下列哪項最可能……？」, 「下列哪項最能解釋……？」, 「在下列哪種情況下，……？」, 「……是多少？」.',
  '2. A sentence with blanks "________" ending "." (28%; 35% of 2021-2026 items). One blank, or two blanks whose options read "X ... Y" (中文 「X …… Y」), usually a 2x2 grid: A x ... p, B x ... q, C y ... p, D y ... q (e.g. "an increase ... a decrease"; 中文 「增加 …… 下降」).',
  '3. An open stem the options complete (19%, falling: 8% of 2021-2026 items): no final punctuation; each option starts lower case and ends ".". Prefer forms 1 and 2.',
  '',
  'B. THE STEM',
  '- One paragraph (55%) or a set-up paragraph plus the question line (44%). Sentences are short: median 13 words, 90% at most 22, never over 45 (中文 median 19 characters, 90% at most 35). Whole stem median 26 words (2021-2026: 30); 中文 median 39 characters.',
  '- Present tense, plain statements. Introduce a change with "Suppose ..." (18% of stems) or "If ..." (12%); 中文 「假設……」 「若……」. Local context: "In Hong Kong, ...", "the Hong Kong government" (18%).',
  '- Scenes and names: 41% of stems set the item in a short everyday or real scene (a good or service, a shop or firm, a household, a government policy; 19% name Hong Kong), 50% are abstract ("an economy", "a firm", a schedule or a diagram), and 18% use generic names. Where a scene helps the student see the change, use a short everyday Hong Kong one of your own: a shop, a firm, a household, a policy (e.g. a noodle shop raising its prices, a family choosing a broadband plan, a fee on a public service). One or two sentences; no real company or brand names, no real statistics, nothing from past papers.',
  '- Keep generic names where the item is abstract or numerical (two countries trading, a cost schedule, a demand-supply diagram; 63% of items with letter names carry a table or figures, 39% of scene items): Good X, Good Y, Country A, Country B, Firm A, Mr Chan, Mr Wong; 中文 物品 X、物品 Y、甲國、乙國、A 公司、陳先生、王先生.',
  '- A table or diagram gets its own lead-in sentence above it, ending "." (or ":"): "The following table shows ...", "The table below shows ...", "The diagram below shows ...", "Refer to the following ...", "Study the following ..."; 中文 「下表顯示……。」 「下圖顯示……。」 「參閱以下……。」 「細閱下圖……。」. The question line then refers back: "Based on the above information, ..." (most common since 2021), "According to the above ...", "In the above diagram, ..."; 中文 「根據以上資料，……」 「根據上述……」 「根據上表，……」.',
  '- Modality: "will" (22% of question lines) and "would" (8%) for effects, "can" (10%) for what is possible, "most likely" (2%), "best explains". Not used: "probably", "definitely", "necessarily", "ceteris paribus", "other things being equal" (0 of 725): state an assumption with "Suppose ...".',
  '- Negatives in the question line in bold capitals: **NOT**, **LEAST**, **INCORRECT**, **INCONSISTENT**, **CANNOT** (every English negative question line uses capitals; "EXCEPT" is not used). 中文 bolds the negative words: 「下列哪項陳述是**不正確**的？」 「下列哪項與需求定律並**不相符**？」 「下列哪項**最不**可能……？」. Ask a negative only when the topic needs it (5% of items).',
  '- No contractions, no "you", no rhetorical or filler words ("furthermore", "moreover", "additionally", "notably", "it is worth noting", "imagine", "scenario": 0 of 725). British spelling (labour, behaviour, favour, centre).',
  '',
  'C. COMBINATION ITEMS (27% of items; 34% in 2021-2026)',
  '- Three statements (74%), sometimes four, numbered (1) (2) (3). Statements are parallel: all full sentences ending "." or all phrases with no full stop. Question line: "Which of the following statements are correct?", "Which of the following are possible ...?"; 中文 「下列哪些陳述是正確的？」 「下列哪些是……可能的原因？」.',
  '- Options use exactly these forms, sets in order (by size, then by number): three statements, the usual set (104 of 146): "(1) and (2) only" / "(1) and (3) only" / "(2) and (3) only" / "(1), (2) and (3)"; 中文 「只有 (1)、(2)」 「只有 (1)、(3)」 「只有 (2)、(3)」 「(1)、(2) 及 (3)」. Other sets: "(1) only" / "(2) only" / "(3) only" / "(1), (2) and (3)"; "(1) only" / "(3) only" / "(1) and (2) only" / "(2) and (3) only". Four statements: "(1) and (3) only" / "(1) and (4) only" / "(2) and (3) only" / "(2) and (4) only".',
  '- "only" (中文 「只有」) on every set smaller than all the statements, never on the full set.',
  '',
  'D. OPTIONS',
  '- Four options, parallel in grammar and similar in length (median 7 words; the longest at most about 2.5 times the shortest). Either all complete sentences (capital letter, ending ".") or all noun phrases (lower case, no full stop): never mixed in one question (510 of 515). After a direct question, sentences (75%) or noun phrases (25%).',
  '- Numeric options in ascending order (36 of 36), the same unit in each: "$350" / "$400" / "$450" / "$500"; "-70" / "-10" / "+10" / "+70".',
  '- No "all of the above" or "none of the above".',
  '',
  'E. NUMBERS AND UNITS',
  '- "$" before the number ($120; $1 500 million). Thousands separated by a space (10 000; 1 500), never a comma (0 of 725). "%" for percentages. A table heading carries the unit: "$ million", "Price ($)", "(units)".',
  '- 中文: $120、1 500 百萬元、30 億元 (no "$" before 百萬元 or 億元: never 「$1 500 百萬元」)、10%; 「2020 年」.',
  '',
  'F. 中文 TEXT',
  '- Hong Kong Traditional Chinese, the EDB terms. Full-width punctuation ，。？：；、「」（）; statement numbers stay half-width (1) (2) (3).',
  '- A half-width space between Chinese and Latin letters or numbers (物品 X、2020 年、每單位 $30; 80% of cases).',
  '',
  'G. GRAMMAR AND SENTENCE PATTERNS (counts are questions of the 725; where papers changed, follow 2021-2026)',
  '- Active voice: a passive verb in 6-7% of stem sentences and 3% of options; 中文 「被」 in under 1% of sentences. DO "The government raises X." / 「政府提高 X。」 DON\'T "X is raised by the government." / 「X 被政府提高。」',
  '- An effect takes "will" (37% of questions; "would" 11%, for a hypothetical). 中文 「會」 (51%): 「X 會上升。」 DON\'T 「將會」 (4 of 725); keep 「將」 for putting or moving something (「將 $X 存入……」).',
  '- Conditions: "Suppose ..." for the set-up (18%; 23% in 2021-2026), "If ..., ..." opening the question line (12%), "When ..." (12%). "Assume" has gone (0 in 2021-2026); not "Given that", "Unless", "In case" (2 of 725). 中文 「假設……」 (20%), 「若……，……」 (18%), 「當……」 (12%); DON\'T 「如果」 (2 of 725), 「倘若」, 「要是」 (0).',
  '- Cause and effect: "X will lead to Y" (48 questions), "because" (42), "result in" (29), "As a result, ..." (29; 6% in 2021-2026), "due to" (15, mostly 2021-2026). DON\'T "give rise to", "bring about" (0), "therefore", "thus", "hence" (2 of 725). 中文 「……會令 X 上升」 (令: 66), 「因為」 (41, rising), 「導致」 (33), 「結果，……」 (31), 「引致」 (21), 「由於」 (15); seldom 「使」 (9), 「造成」 (6).',
  '- Statements (1)-(3) are mostly plain present-tense sentences (87 questions; with "will"/"can" 56). A statement or option ends on the change: "X increases." / "X will decrease." / "X remains unchanged."; "X may increase." for a possibility (4%). 中文 ends on the change word: 「……上升。」 「……下降。」 「……增加。」 「……不變。」 (30% of questions).',
  '- Comparisons: "higher / more ... than" (10%); "compared with" almost never (2). 中文 「較……」 (11%), 「更……」 (12%), 「高於／低於」 (6%), 「比」 (5%).',
  '- 2021-2026 papers set up more: "Suppose ..." 13% -> 23%, a table or diagram with its lead-in 14% -> 24%, "Based on the above information" 3% -> 13% (中文 「根據以上資料／上述」 3% -> 12%), blanks 22% -> 35%; fewer "If ..." openings (12-14% -> 9%).',
].join('\n');
