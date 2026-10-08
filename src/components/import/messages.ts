import { defineMessages } from '@/i18n/catalogue';

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

/** The Paste questions dialog (`PasteImportDialog`) and its entry points. */
export const PASTE_IMPORT_MESSAGES = defineMessages({
  // Entry points
  pasteQuestions: { en: 'Paste questions…', zh: '貼上題目…' },
  pasteQuestionsHint: { en: 'from Word or a PDF', zh: '來自 Word 或 PDF' },

  // Step 1
  title: { en: 'Paste questions', zh: '貼上題目' },
  pasteDescription: {
    en: 'Copy the questions from Word or a PDF and paste them here. Nothing is added until you choose.',
    zh: '從 Word 或 PDF 複製題目，然後貼在這裏。在你選擇之前，不會加入任何內容。',
  },
  pasteLabel: { en: 'Pasted text', zh: '貼上的文字' },
  pastePlaceholder: { en: 'Paste here (⌘V)', zh: '在此貼上（⌘V）' },
  read: { en: 'Read questions', zh: '讀取題目' },
  emptyPaste: {
    en: 'There is no text in this paste. Copy the questions again from Word or a PDF.',
    zh: '貼上的內容沒有文字。請再從 Word 或 PDF 複製題目。',
  },
  scanPaste: {
    en: 'This looks like a scanned paper, so there is no text to read. Copy from the Word file instead, if you have it.',
    zh: '這似乎是掃描的試卷，沒有可讀取的文字。如有 Word 檔案，請改從 Word 檔案複製。',
  },
  scanOcr: {
    en: 'This looks like text read from a scan, so some letters and numbers may be wrong. Copy from the Word file instead, if you have it.',
    zh: '這似乎是從掃描讀取的文字，部分字母和數字可能有誤。如有 Word 檔案，請改從 Word 檔案複製。',
  },
  reviewAnyway: { en: 'Review anyway', zh: '仍然檢查' },

  // Step 2: header
  questionCount: {
    en: (n: number) => `${n} ${plural(n, 'question')}`,
    zh: (n: number) => `${n} 條題目`,
  },
  toCheck: { en: (n: number) => `${n} to check`, zh: (n: number) => `${n} 處待檢查` },
  allClear: { en: 'nothing to check', zh: '沒有待檢查的地方' },
  noAnswerCount: {
    en: (n: number) => `${n} MC without an answer`,
    zh: (n: number) => `${n} 條 MC 未有答案`,
  },
  nextToCheck: { en: 'Next to check', zh: '下一處待檢查' },
  nextNoAnswer: { en: 'Go to the next MC without an answer', zh: '前往下一條未有答案的 MC' },
  pasteAgain: { en: 'Paste again', zh: '重新貼上' },
  undoFix: { en: 'Undo fix', zh: '復原修正' },
  undoFixHint: { en: '⌘Z', zh: '⌘Z' },
  languageAll: { en: 'Language', zh: '語言' },
  languageAuto: { en: 'Auto', zh: '自動' },
  english: { en: 'EN', zh: 'EN' },
  chinese: { en: '中文', zh: '中文' },
  languageFor: { en: (n: number) => `Language of question ${n}`, zh: (n: number) => `第 ${n} 題的語言` },
  pastedLines: { en: 'Pasted lines', zh: '貼上的內容' },
  asPrinted: { en: 'As it will print', zh: '列印效果' },
  setAnswerHint: { en: 'Click an option to make it the answer.', zh: '按一下選項，設為答案。' },
  answerIs: { en: (letter: string) => `Answer ${letter}`, zh: (letter: string) => `答案 ${letter}` },
  sharedStimulus: { en: 'Shared stimulus', zh: '共用資料' },

  // Roles (chip names and the role menu)
  roleQuestion: { en: 'Question', zh: '題目' },
  rolePart: { en: 'Part', zh: '分題' },
  roleSubpart: { en: 'Sub-part', zh: '子分題' },
  roleOption: { en: 'Option', zh: '選項' },
  roleStatement: { en: 'Statement (1)(2)(3)', zh: '陳述 (1)(2)(3)' },
  roleMarks: { en: 'Marks', zh: '分數' },
  roleHeading: { en: 'Heading, not imported', zh: '標題，不會匯入' },
  roleNoise: { en: 'Leave out', zh: '略去' },
  roleStem: { en: 'Text of the line above', zh: '上方內容的文字' },
  roleAnswerSpace: { en: 'Answer space', zh: '答題空間' },
  roleTable: { en: 'Table row', zh: '表格列' },
  roleSource: { en: 'Source or shared stimulus', zh: '資料或共用資料' },
  roleAnswerKey: { en: 'Answer key, not imported', zh: '答案表，不會匯入' },
  roleIgnore: { en: 'Blank', zh: '空白' },
  roleMenu: { en: (role: string) => `Line role: ${role}. Change it`, zh: (role: string) => `此行角色：${role}。按此更改` },
  pinnedSuffix: { en: ' (fixed by you)', zh: '（由你修正）' },
  newQuestionHere: { en: 'Start a new question here', zh: '由此開始新題目' },
  joinAbove: { en: 'Join with the line above', zh: '與上一行合併' },
  removeFix: { en: 'Undo this fix', zh: '復原此修正' },
  newQuestionBadge: { en: 'New question', zh: '新題目' },
  joinedBadge: { en: 'Joined', zh: '已合併' },
  removeBadge: { en: (what: string) => `${what}: undo this fix`, zh: (what: string) => `${what}：復原此修正` },

  // Pictures
  addPicture: { en: 'Add a picture here…', zh: '在此加入圖片…' },
  pictureBadge: { en: 'Picture', zh: '圖片' },
  noPictureBadge: { en: 'No picture', zh: '不需圖片' },
  pictureHint: { en: 'Select a line, then paste a picture (⌘V) to add it there.', zh: '選取一行，然後貼上圖片（⌘V），即可加在該處。' },
  slotMissing: {
    en: 'Picture missing here. Paste a screenshot or drop an image.',
    zh: '此處缺少圖片。請貼上截圖，或把圖片拖放到這裏。',
  },
  choosePicture: { en: 'Choose a picture…', zh: '選擇圖片…' },
  noPictureNeeded: { en: 'No picture needed', zh: '不需要圖片' },
  removePicture: { en: 'Remove picture', zh: '移除圖片' },
  pickPlaceFirst: {
    en: 'Click a line or a missing picture first, then paste the picture again.',
    zh: '請先按一下某一行或缺少圖片的位置，然後再貼上圖片。',
  },
  pictureUnreadable: { en: 'Could not read that picture.', zh: '無法讀取這張圖片。' },

  // Flags
  flagSequenceBreak: { en: 'The numbering skips here.', zh: '編號在此跳過。' },
  flagNumberRestart: { en: 'Numbering starts again with no heading.', zh: '編號重新開始，但沒有標題。' },
  flagOptionCount: {
    en: (n: number) => `This MC has ${n} ${plural(n, 'option')}.`,
    zh: (n: number) => `這條 MC 有 ${n} 個選項。`,
  },
  flagStatementCount: {
    en: 'The (1)(2)(3) labels did not pair with their text.',
    zh: '(1)(2)(3) 標示未能與文字配對。',
  },
  flagNoAnswer: { en: 'No answer yet.', zh: '未有答案。' },
  flagMarksMoved: { en: 'Marks moved to the part above.', zh: '分數已移到上方的分題。' },
  flagDuplicateMarks: { en: 'Two marks for one part. The first is kept.', zh: '同一分題有兩個分數，只保留第一個。' },
  flagUnknownLine: { en: 'A line with no clear role, kept as text.', zh: '這行的角色不明確，已保留為文字。' },
  flagImageLost: { en: 'A picture did not come with the paste.', zh: '圖片未能隨貼上的內容一併帶來。' },
  flagFigureMissing: { en: 'A figure is named here, but no picture came with the paste.', zh: '這裏提及圖表，但貼上的內容沒有圖片。' },
  flagOptionsByOrder: {
    en: 'Option letters were apart from their text, so they were paired in order.',
    zh: '選項字母與文字分開，已按次序配對。',
  },
  flagTextAfterOptions: { en: 'Text after the options moved into the stem.', zh: '選項之後的文字已移到題幹。' },
  flagSharedStemFolded: {
    en: 'A shared stimulus here is kept as the first text of this question.',
    zh: '此處的共用資料保留為這條題目的開首文字。',
  },
  flagUnlabelledStart: { en: 'Text before the first number became a question.', zh: '第一個編號之前的文字成為了一條題目。' },
  flagMixedContent: { en: 'Options and parts in one question. Check the split.', zh: '同一題目內有選項和分題，請檢查分拆。' },

  // Footer
  cancel: { en: 'Cancel', zh: '取消' },
  insert: { en: 'Insert into this paper', zh: '插入至這份工作紙' },
  addToBank: { en: 'Add to 題庫', zh: '加入題庫' },
  bankTarget: { en: 'Which question bank', zh: '加入哪個題庫' },
  newBank: { en: (name: string) => `New bank: ${name}`, zh: (name: string) => `新題庫：${name}` },
  nothingToImport: { en: 'No questions found yet. Fix a line, or paste again.', zh: '仍未找到題目。請修正某一行，或重新貼上。' },
  leftOut: {
    en: (n: number) => `${n} ${plural(n, 'line')} left out (headings, page furniture, answer keys)`,
    zh: (n: number) => `${n} 行不會匯入（標題、頁首頁尾、答案表）`,
  },
  readOnly: { en: 'This paper is read-only.', zh: '這份工作紙是唯讀的。' },
  busy: { en: 'Saving…', zh: '儲存中…' },

  // Results (notices)
  inserted: {
    en: (n: number) => `Inserted ${n} ${plural(n, 'question')}.`,
    zh: (n: number) => `已插入 ${n} 條題目。`,
  },
  noAnswerAfter: {
    en: (n: number) => ` ${n} MC ${n === 1 ? 'has' : 'have'} no answer yet and ${n === 1 ? 'shows' : 'show'} A for now.`,
    zh: (n: number) => `${n} 條 MC 未有答案，暫時顯示為 A。`,
  },
  undo: { en: 'Undo', zh: '復原' },
  addedToBank: {
    en: (n: number, bank: string) => `Added ${n} ${plural(n, 'question')} to ${bank}.`,
    zh: (n: number, bank: string) => `已把 ${n} 條題目加入「${bank}」。`,
  },
  bankHadAll: {
    en: (bank: string) => `${bank} already has every one of these questions. Nothing was added.`,
    zh: (bank: string) => `「${bank}」已有這些題目，沒有加入任何內容。`,
  },
  skippedDuplicates: {
    en: (n: number) => ` ${n} ${plural(n, 'question')} already in the bank ${n === 1 ? 'was' : 'were'} skipped.`,
    zh: (n: number) => `已略過 ${n} 條題庫已有的題目。`,
  },
  stimulusNotInBank: {
    en: ' The shared stimulus stays out of the bank; insert into a paper to keep it.',
    zh: '共用資料不會加入題庫；如要保留，請插入至工作紙。',
  },
  insertRefused: { en: 'Nothing was inserted: the paper changed. Try again.', zh: '沒有插入任何內容：工作紙已改變，請再試一次。' },
  bankFailed: { en: 'Could not save the question bank.', zh: '無法儲存題庫。' },
});
