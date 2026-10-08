import { defineMessages } from '@/i18n/catalogue';

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

/** Import from Word or PDF (`ImportDialog`): reading the file, the review, and Save as. */
export const IMPORT_MESSAGES = defineMessages({
  // The file: reading it, and why it could not be read
  title: { en: 'Import from Word or PDF', zh: '從 Word 或 PDF 匯入' },
  reading: { en: (name: string) => `Reading ${name}…`, zh: (name: string) => `正在讀取 ${name}…` },
  readingHint: { en: 'A long PDF can take a few seconds.', zh: '較長的 PDF 可能需時數秒。' },
  pages: { en: (n: number) => `${n} ${plural(n, 'page')}`, zh: (n: number) => `${n} 頁` },
  problemTitle: { en: 'This file cannot be imported', zh: '無法匯入這個檔案' },
  problemLegacyDoc: {
    en: 'This is an older Word file (.doc). Open it in Word, save it as .docx, then import that.',
    zh: '這是舊版 Word 檔案（.doc）。請在 Word 開啟，另存為 .docx，然後匯入該檔案。',
  },
  problemEncrypted: {
    en: 'This file has a password. Open it in Word or Acrobat, remove the password, and try again.',
    zh: '這個檔案設有密碼。請在 Word 或 Acrobat 開啟，移除密碼，然後再試一次。',
  },
  problemNotPaper: {
    en: 'This is not a Word (.docx) or PDF file. Choose the paper as a .docx or a .pdf.',
    zh: '這不是 Word（.docx）或 PDF 檔案。請選擇 .docx 或 .pdf 格式的試卷。',
  },
  problemUnreadable: {
    en: 'This file could not be read. It may be damaged. Open it in Word or Acrobat, save a new copy, and try again.',
    zh: '無法讀取這個檔案，檔案可能已損壞。請在 Word 或 Acrobat 開啟並另存新檔，然後再試一次。',
  },
  problemScan: {
    en: (pages: number) =>
      `This PDF is a scanned image${pages ? `, ${pages} ${plural(pages, 'page')}` : ''}, so there is no text to read. If you have the Word file, import that instead.`,
    zh: (pages: number) => `這份 PDF 是掃描圖像${pages ? `（${pages} 頁）` : ''}，沒有可讀取的文字。如有 Word 檔案，請改為匯入該檔案。`,
  },
  scanOcr: {
    en: 'This PDF looks like a scan with its text read by a computer, so some letters and numbers may be wrong. Check each question, or import the Word file if you have it.',
    zh: '這份 PDF 似乎是經電腦辨識文字的掃描檔，部分字母和數字可能有誤。請逐題檢查，或如有 Word 檔案，請改為匯入該檔案。',
  },
  chooseAnother: { en: 'Choose another file…', zh: '選擇其他檔案…' },
  close: { en: 'Close', zh: '關閉' },

  // The review: header
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
  undoFix: { en: 'Undo fix', zh: '復原修正' },
  undoFixHint: { en: '⌘Z', zh: '⌘Z' },
  languageAll: { en: 'Language', zh: '語言' },
  languageAuto: { en: 'Auto', zh: '自動' },
  english: { en: 'EN', zh: 'EN' },
  chinese: { en: '中文', zh: '中文' },
  bilingual: { en: 'EN+中', zh: 'EN+中' },
  languageFor: { en: (n: number) => `Language of question ${n}`, zh: (n: number) => `第 ${n} 題的語言` },
  pastedLines: { en: 'Lines in the file', zh: '檔案內容' },
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
  pictureHeic: {
    en: 'This is an iPhone photo (HEIC), which this browser cannot show. Export it as JPEG or PNG, or take a screenshot of it (⌘⇧4), then add it again.',
    zh: '這是 iPhone 相片（HEIC），此瀏覽器無法顯示。請先匯出為 JPEG 或 PNG，或為它截圖（⌘⇧4），然後再加入。',
  },
  pictureUndecodable: {
    en: 'This browser cannot show this kind of picture. Save it as PNG or JPEG, or take a screenshot of it (⌘⇧4), then add it again.',
    zh: '此瀏覽器無法顯示這種圖片。請另存為 PNG 或 JPEG，或為它截圖（⌘⇧4），然後再加入。',
  },
  notAPicture: {
    en: 'Only pictures can go here. For a PDF or a Word file, take a screenshot of the part you need (⌘⇧4) and paste it.',
    zh: '這裏只可加入圖片。如是 PDF 或 Word 檔案，請為所需部分截圖（⌘⇧4），然後貼上。',
  },
  pictureNoQuestion: {
    en: 'There is no question after this line to put a picture in. Click a line inside a question first.',
    zh: '這行之後沒有題目可放圖片。請先按一下題目內的某一行。',
  },
  pictureToQuestion: { en: (n: number) => `Picture → question ${n}`, zh: (n: number) => `圖片 → 第 ${n} 題` },

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
  flagImageLost: { en: 'A picture here could not be read from the file.', zh: '無法從檔案讀取此處的圖片。' },
  flagFigureMissing: { en: 'A figure is named here, but no picture came with it.', zh: '這裏提及圖表，但沒有附上圖片。' },
  flagFigureAsked: {
    en: 'This question asks about pictures, but none came with it.',
    zh: '這題問及圖表，但沒有附上圖片。',
  },
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

  // Several files: reading them
  readingMany: { en: (n: number, of: number) => `Reading file ${n} of ${of}…`, zh: (n: number, of: number) => `正在讀取第 ${n} 個檔案（共 ${of} 個）…` },
  fileRead: { en: 'Read', zh: '已讀取' },
  fileWaiting: { en: 'Waiting', zh: '等候中' },
  fileProblem: { en: 'Cannot be read', zh: '無法讀取' },

  // Several files: linking papers and answers
  linkTitle: { en: 'Papers and answers', zh: '試卷與答案' },
  linkHint: {
    en: 'Check which files are question papers and which hold answers, then pick the answers for each paper.',
    zh: '請檢查哪些檔案是試卷、哪些是答案，然後為每份試卷選擇答案。',
  },
  filesHeading: { en: 'Files', zh: '檔案' },
  papersHeading: { en: 'Answers for each paper', zh: '每份試卷的答案' },
  roleIs: { en: 'This file holds', zh: '這個檔案內容' },
  roleQuestions: { en: 'Questions', zh: '試題' },
  roleAnswers: { en: 'Answers', zh: '答案' },
  roleBoth: { en: 'Both', zh: '兩者' },
  roleQuestionsHint: { en: 'A question paper', zh: '試卷' },
  roleAnswersHint: { en: 'An answer key or marking scheme', zh: '答案或評卷參考' },
  roleBothHint: { en: 'A paper with its answers in it', zh: '附有答案的試卷' },
  removeFile: { en: (name: string) => `Leave ${name} out of the import`, zh: (name: string) => `不匯入 ${name}` },
  answersFrom: { en: 'Answers from', zh: '答案來自' },
  answersNone: { en: 'No answers', zh: '沒有答案' },
  answersOwn: { en: 'Its own answers (in this file)', zh: '檔案內附的答案' },
  reasonName: { en: 'name says answers', zh: '檔名顯示是答案' },
  reasonKey: { en: 'has an answer key', zh: '有答案表' },
  reasonScheme: { en: 'has a marking scheme', zh: '有評卷參考' },
  reasonMc: { en: 'has MC questions', zh: '有 MC 題目' },
  reasonWritten: { en: 'has written questions', zh: '有文字題' },
  reasonAnswersInPaper: { en: 'answers inside the paper', zh: '試卷內附答案' },
  reasonNoText: { en: 'no text to read', zh: '沒有可讀取的文字' },
  scanAnswers: {
    en: (pages: number) =>
      `A scanned image${pages ? `, ${pages} ${plural(pages, 'page')}` : ''}. Answers cannot be read from a scan yet (text recognition is coming), so it links to no paper.`,
    zh: (pages: number) => `掃描圖像${pages ? `（${pages} 頁）` : ''}。暫時未能從掃描檔讀取答案（文字辨識功能即將推出），因此不會連結任何試卷。`,
  },
  scanPaper: {
    en: (pages: number) => `A scanned image${pages ? `, ${pages} ${plural(pages, 'page')}` : ''}, so there is no text to read.`,
    zh: (pages: number) => `掃描圖像${pages ? `（${pages} 頁）` : ''}，沒有可讀取的文字。`,
  },
  noPapers: { en: 'No question paper among these files. Mark a file as Questions or Both.', zh: '這些檔案中沒有試卷。請把其中一個檔案標示為「試題」或「兩者」。' },
  reviewPapers: {
    en: (n: number) => (n === 1 ? 'Review the paper' : `Review ${n} papers`),
    zh: (n: number) => (n === 1 ? '檢查試卷' : `檢查 ${n} 份試卷`),
  },
  chooseOthers: { en: 'Choose other files…', zh: '選擇其他檔案…' },

  // Several files: one paper's review
  paperOf: { en: (n: number, of: number) => `${n} of ${of} papers`, zh: (n: number, of: number) => `第 ${n} 份（共 ${of} 份試卷）` },
  backToLinks: { en: 'Papers and answers', zh: '試卷與答案' },
  previousPaper: { en: 'Previous paper', zh: '上一份試卷' },
  nextPaper: { en: 'Next paper', zh: '下一份試卷' },

  // Answers from a file: the summary
  mcFromFile: {
    en: (set: number, of: number, name: string) => `${set} of ${of} MC answers set from ${name}`,
    zh: (set: number, of: number, name: string) => `已從 ${name} 設定 ${set} / ${of} 條 MC 答案`,
  },
  answersFromFile: { en: (name: string) => `Answers from ${name}`, zh: (name: string) => `答案來自 ${name}` },
  schemeCount: {
    en: (n: number) => `${n} ${plural(n, 'marking scheme')}`,
    zh: (n: number) => `${n} 項評卷參考`,
  },
  answersAllMatched: { en: 'every answer placed', zh: '所有答案已配對' },
  schemeBadge: { en: 'Scheme', zh: '評卷參考' },
  answerTextBadge: { en: 'Answer', zh: '答案' },
  removeSheetBadge: { en: (what: string) => `${what} from the answers file: leave it out`, zh: (what: string) => `答案檔的${what}：不使用` },
  teacherOnly: { en: 'Teacher copy only', zh: '只在教師版' },

  // Answers from a file: rows to check
  questionRef: {
    en: (q: string, section: string) => (section ? `Q${q} (Part ${section})` : `Q${q}`),
    zh: (q: string, section: string) => (section ? `第 ${q} 題（${section} 部）` : `第 ${q} 題`),
  },
  rowMissing: { en: (q: string) => `${q}: no answer in the answers file`, zh: (q: string) => `${q}：答案檔沒有這題的答案` },
  rowConflict: {
    en: (q: string, paper: string, sheet: string) => `${q}: the paper marks ${paper}, the answers file says ${sheet}. Using ${sheet}.`,
    zh: (q: string, paper: string, sheet: string) => `${q}：試卷標示 ${paper}，答案檔寫 ${sheet}，現採用 ${sheet}。`,
  },
  rowOutOfRange: {
    en: (q: string, letter: string, n: number) => `${q}: answer ${letter}, but the question has ${n} ${plural(n, 'option')}`,
    zh: (q: string, letter: string, n: number) => `${q}：答案是 ${letter}，但題目只有 ${n} 個選項`,
  },
  rowNoLetter: { en: (q: string) => `${q}: the answers file has words but no letter for this MC`, zh: (q: string) => `${q}：答案檔有文字，但沒有這條 MC 的答案字母` },
  rowNotWritten: {
    en: (q: string) => `${q}: the answers file gives a letter, but this is a written question`,
    zh: (q: string) => `${q}：答案檔提供了字母，但這是文字題`,
  },
  rowNeedsPart: {
    en: (q: string) => `${q}: the answer names no part, and this question has parts`,
    zh: (q: string) => `${q}：答案沒有註明分題，但這題有分題`,
  },
  rowNoSuchQuestion: { en: (q: string) => `${q} in the answers file: this paper has no such question`, zh: (q: string) => `答案檔的${q}：試卷沒有這題` },
  rowNoSuchPart: { en: (q: string) => `${q} in the answers file: the question has no such part`, zh: (q: string) => `答案檔的${q}：題目沒有這個分題` },
  rowDuplicate: { en: (q: string) => `${q}: a second answer in the answers file, left out`, zh: (q: string) => `${q}：答案檔有第二個答案，不會使用` },
  rowSeveral: {
    en: (q: string, letters: string, first: string) => `${q}: the answers file accepts ${letters}. Using ${first}.`,
    zh: (q: string, letters: string, first: string) => `${q}：答案檔接受 ${letters}，現採用 ${first}。`,
  },
  rowMarks: {
    en: (q: string, sheet: number, paper: number) => `${q}: the answers file gives ${sheet} ${plural(sheet, 'mark')}, the paper prints ${paper}`,
    zh: (q: string, sheet: number, paper: number) => `${q}：答案檔給 ${sheet} 分，試卷印 ${paper} 分`,
  },
  or: { en: ' or ', zh: '或' },

  // Footer
  cancel: { en: 'Cancel', zh: '取消' },
  nothingToImport: { en: 'No questions found yet. Fix a line, or choose another file.', zh: '仍未找到題目。請修正某一行，或選擇其他檔案。' },
  leftOut: {
    en: (n: number) => `${n} ${plural(n, 'line')} left out (headings, page furniture, answer keys)`,
    zh: (n: number) => `${n} 行不會匯入（標題、頁首頁尾、答案表）`,
  },
  saveAs: { en: 'Save as…', zh: '儲存為…' },
  backToReview: { en: 'Back to review', zh: '返回檢查' },
  saveAndOpen: { en: 'Save and open', zh: '儲存並開啟' },
  addToBank: { en: 'Add to 題庫', zh: '加入題庫' },
  busy: { en: 'Saving…', zh: '儲存中…' },

  // Save as
  saveAsTitle: { en: 'Save as', zh: '儲存為' },
  bankOnly: { en: '題庫 only', zh: '只加入題庫' },
  suggested: { en: 'Suggested', zh: '建議' },
  bankOnlyHint: {
    en: 'The questions go into a question bank, ready for any paper. No new paper is made.',
    zh: '題目只會加入題庫，日後可用於任何試卷，不會建立新試卷。',
  },
  name: { en: 'Name', zh: '名稱' },
  nameHint: { en: 'From the file. You can change it later.', zh: '取自檔案，日後可以更改。' },
  bankTarget: { en: 'Which question bank', zh: '加入哪個題庫' },
  newBank: { en: (name: string) => `New bank: ${name}`, zh: (name: string) => `新題庫：${name}` },
  summary: { en: 'What is saved', zh: '儲存內容' },
  mixCount: {
    en: (mc: number, written: number) => `${mc} MC, ${written} written`,
    zh: (mc: number, written: number) => `${mc} 條 MC，${written} 條文字題`,
  },
  paperLanguage: { en: 'Paper language', zh: '試卷語言' },
  misfitWritten: {
    en: (n: number) => `A Paper 1 mock is for MC. ${n} written ${plural(n, 'question')} will still be added. Check how ${n === 1 ? 'it prints' : 'they print'}.`,
    zh: (n: number) => `Paper 1 Mock 只用於 MC。${n} 條文字題仍會加入，請檢查列印效果。`,
  },
  misfitMc: {
    en: (n: number) => `This paper is for written answers. ${n} MC will still be added with their options.`,
    zh: (n: number) => `這份試卷用於文字作答。${n} 條 MC 仍會連同選項加入。`,
  },

  // Save as: several papers
  newPapers: { en: (n: number) => `${n} new papers`, zh: (n: number) => `${n} 份新試卷` },
  paperType: { en: 'Type', zh: '類型' },
  suggestedType: { en: (title: string) => `${title} (suggested)`, zh: (title: string) => `${title}（建議）` },
  paperSummary: {
    en: (questions: number, answers: number) => `${questions} ${plural(questions, 'question')}${answers ? ` · ${answers} with answers` : ''}`,
    zh: (questions: number, answers: number) => `${questions} 條題目${answers ? ` · ${answers} 條有答案` : ''}`,
  },
  nothingWritten: { en: 'Nothing is saved until you press Save.', zh: '按「儲存」之前不會儲存任何內容。' },
  saveAll: { en: (n: number) => `Save ${n} papers`, zh: (n: number) => `儲存 ${n} 份試卷` },

  // Results (notices)
  savedAs: {
    en: (kind: string, name: string, n: number) => `Saved “${name}” as a new ${kind} with ${n} ${plural(n, 'question')}.`,
    zh: (kind: string, name: string, n: number) => `已把「${name}」儲存為新的${kind}，共 ${n} 條題目。`,
  },
  noAnswerAfter: {
    en: (n: number) => ` ${n} MC ${n === 1 ? 'has' : 'have'} no answer yet and ${n === 1 ? 'shows' : 'show'} A for now.`,
    zh: (n: number) => `${n} 條 MC 未有答案，暫時顯示為 A。`,
  },
  addedToBank: {
    en: (n: number, bank: string) => `Added ${n} ${plural(n, 'question')} to ${bank}. They are under Untagged in 題庫.`,
    zh: (n: number, bank: string) => `已把 ${n} 條題目加入「${bank}」，可在題庫的「未標記」找到。`,
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
    en: ' The shared stimulus stays out of the bank; save as a paper to keep it.',
    zh: '共用資料不會加入題庫；如要保留，請儲存為試卷。',
  },
  savedMany: {
    en: (n: number, first: string) => `${n} papers imported. “${first}” is open; the others are on the home screen.`,
    zh: (n: number, first: string) => `已匯入 ${n} 份試卷。已開啟「${first}」，其餘可在主畫面找到。`,
  },
  savedPaperLine: {
    en: (name: string, kind: string, n: number) => `${name}: ${kind}, ${n} ${plural(n, 'question')}`,
    zh: (name: string, kind: string, n: number) => `${name}：${kind}，${n} 條題目`,
  },
  openPaper: { en: (name: string) => `Open ${name}`, zh: (name: string) => `開啟 ${name}` },
  saveFailed: { en: 'Nothing was saved: the new paper could not be made. Try again.', zh: '沒有儲存任何內容：無法建立新試卷，請再試一次。' },
  bankFailed: { en: 'Could not save the question bank.', zh: '無法儲存題庫。' },
});
