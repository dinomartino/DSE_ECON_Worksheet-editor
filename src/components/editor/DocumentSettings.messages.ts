import { defineMessages } from '@/i18n/catalogue';

type Edge = 'header' | 'footer';
const zhEdge = (which: Edge) => (which === 'header' ? '頁首' : '頁尾');

/** The Setup dialog: Worksheet, Page, Header & footer and Cover tabs. */
export const DOCUMENT_SETTINGS_MESSAGES = defineMessages({
  // Dialog and tabs
  dialogTitle: { en: 'Document setup', zh: '頁面設定' },
  dialogDescription: {
    en: 'Applies to the whole worksheet. Changes show on the page immediately.',
    zh: '套用於整份工作紙，更改會即時顯示在頁面上。',
  },
  tabWorksheet: { en: 'Worksheet', zh: '工作紙' },
  tabWorksheetHint: { en: 'Title, fonts, sections', zh: '標題、字型、部分' },
  tabPage: { en: 'Page', zh: '頁面' },
  tabPageHint: { en: 'Paper, margins', zh: '紙張、邊界' },
  tabFurniture: { en: 'Header & footer', zh: '頁首及頁尾' },
  tabFurnitureHint: { en: 'Page 1, later pages', zh: '第 1 頁、其後頁面' },
  tabCover: { en: 'Cover', zh: '封面' },
  tabCoverHint: { en: 'Mock exam front page', zh: 'Mock 考試封面頁' },

  // Worksheet tab
  title: { en: 'Title', zh: '標題' },
  titleHintBlock: {
    en: 'The title block prints on page 1 instead. Edit that on the page. To rename the file, click its name in the toolbar.',
    zh: '標題區會改為印在第 1 頁，請直接在頁面上修改。如要重新命名檔案，請按工具列上的檔案名稱。',
  },
  titleHint: {
    en: 'Printed at the top of the first page. To rename the file, click its name in the toolbar.',
    zh: '印在第一頁頂部。如要重新命名檔案，請按工具列上的檔案名稱。',
  },
  titleAria: { en: 'Worksheet title', zh: '工作紙標題' },
  instructions: { en: 'Instructions', zh: '作答指示' },
  instructionsHintCover: {
    en: 'A line under the title. This paper’s rubric lives on the cover. Edit it there.',
    zh: '標題下的一行字。此試卷的作答指示在封面，請在封面修改。',
  },
  instructionsHint: {
    en: 'A line under the title, e.g. “Answer ALL questions.”',
    zh: '標題下的一行字，例如「Answer ALL questions.」',
  },
  fonts: { en: 'Fonts', zh: '字型' },
  fontsHint: {
    en: 'Applied to Latin and Chinese text separately in the export.',
    zh: '匯出時，英文與中文文字分別套用。',
  },
  custom: { en: 'Custom', zh: '自訂' },
  customEllipsis: { en: 'Custom…', zh: '自訂…' },

  // Versions
  versions: { en: 'Versions', zh: '版本' },
  versionsHint: {
    en: 'Multiple-choice options shuffle per version; version A keeps your order. Pinned, “all of the above” and combination options never move.',
    zh: '選擇題的選項會按版本打亂次序，版本 A 保持你的次序。已固定的選項、「以上皆是」及組合選項不會移動。',
  },
  versionsCount: { en: 'Number of versions', zh: '版本數目' },
  versionsOff: { en: 'Off', zh: '關閉' },
  versionsOne: { en: 'One paper', zh: '單一試卷' },
  versionsRange: { en: (last: string) => `Versions A–${last}`, zh: (last: string) => `版本 A–${last}` },
  reshuffleTitle: { en: 'Pick a new shuffle for versions B onwards', zh: '為版本 B 及之後的版本重新打亂' },
  reshuffle: { en: 'Reshuffle', zh: '重新打亂' },
  pageShows: { en: 'Page shows', zh: '頁面顯示' },
  versionShown: { en: 'Version shown on the page', zh: '頁面顯示的版本' },

  // Classes and the bank
  classes: { en: 'Classes 班別', zh: '班別' },
  classesHint: {
    en: 'Which classes sat this paper, and when. The question bank uses it to warn about questions these students have seen. Never printed.',
    zh: '哪些班別考過這份試卷，以及考試日期。題庫會據此提示這些學生做過的題目。不會印出。',
  },
  classesNone: {
    en: 'No class yet: the bank treats this paper as a draft.',
    zh: '未有班別：題庫視此試卷為草稿。',
  },
  yearGroup: { en: (list: string) => `Year group: ${list}`, zh: (list: string) => `年級：${list}` },
  noDate: {
    en: (day: string) => `No date set: counts from ${day}, when the paper was made`,
    zh: (day: string) => `未設日期：由 ${day}（建立試卷當日）起計`,
  },
  removeClass: { en: (name: string) => `Remove class ${name}`, zh: (name: string) => `移除班別 ${name}` },
  classesAria: { en: 'Classes', zh: '班別' },
  classesExample: { en: 'e.g. 5A, 5B', zh: '例如 5A、5B' },
  addClass: { en: 'Add a class', zh: '加入班別' },
  satOn: { en: 'Sat on', zh: '考試日期' },
  hideFromBank: { en: 'Hide from question bank', zh: '在題庫中隱藏' },

  // Target
  target: { en: 'Target', zh: '目標' },
  targetHint: {
    en: 'Optional. The summary in the toolbar counts toward it, and the export check flags a paper over or under it.',
    zh: '選填。工具列的摘要會對照此目標，匯出檢查也會標示超出或不足的試卷。',
  },
  targetMarks: { en: 'Marks', zh: '總分' },
  targetTime: { en: 'Time', zh: '時間' },
  targetMinutes: { en: 'min', zh: '分鐘' },

  // Page tab
  paperSize: { en: 'Paper size', zh: '紙張大小' },
  fixedByBooklet: { en: "Fixed by the booklet's page frame.", zh: '由小冊子的頁面框架固定。' },
  paperSizeBooklet: {
    en: (size: string) => `${size}: the size the reference booklet’s frame and answer-line pitch were measured against.`,
    zh: (size: string) => `${size}：參考小冊子的框架及答題線間距就是按此尺寸量度。`,
  },
  paperSizeHint: { en: 'Written straight into the .docx page setup.', zh: '直接寫入 .docx 的頁面設定。' },
  orientation: { en: 'Orientation', zh: '方向' },
  orientationHint: { en: 'Worksheets print portrait.', zh: '工作紙以直向列印。' },
  portrait: { en: 'Portrait', zh: '直向' },
  margins: { en: 'Margins', zh: '邊界' },
  marginsBooklet: {
    en: 'The reference booklet’s own margins. The page frame and margin notes are positioned against this column, so changing it would move them off the text they frame.',
    zh: '採用參考小冊子本身的邊界。頁面框架和邊注是按此欄定位，更改邊界會令它們偏離所框住的文字。',
  },
  fixedByPaper: { en: 'Fixed by the reference paper.', zh: '由參考試卷固定。' },
  marginsPaper1: {
    en: 'The reference MCQ paper’s own margins. Question, statement and option indents were measured against this column, so the geometry is fixed together.',
    zh: '採用參考 MCQ 試卷本身的邊界。題目、陳述及選項的縮排都是按此欄量度，因此版面一併固定。',
  },
  marginsHint: { en: 'Pick a preset, or set each edge yourself.', zh: '選擇預設，或自行設定每一邊。' },
  marginTop: { en: 'Top', zh: '上' },
  marginBottom: { en: 'Bottom', zh: '下' },
  marginLeft: { en: 'Left', zh: '左' },
  marginRight: { en: 'Right', zh: '右' },
  marginsRange: {
    en: '0–5 cm per edge. Stored in twips, exactly as Word writes them.',
    zh: '每邊 0–5 cm。以 twip 儲存，與 Word 的寫法一致。',
  },
  marginPreset0: { en: 'Normal (2.54 cm)', zh: '標準（2.54 cm）' },
  marginPreset1: { en: 'Narrow (1.27 cm)', zh: '窄（1.27 cm）' },
  marginPreset2: { en: 'Worksheet (2.54 / 1.5 cm)', zh: '工作紙（2.54 / 1.5 cm）' },
  marginPreset3: { en: 'Moderate (2.54 / 1.91 cm)', zh: '中等（2.54 / 1.91 cm）' },
  marginPreset4: { en: 'Wide (2.54 / 5.08 cm)', zh: '寬（2.54 / 5.08 cm）' },
  betweenQuestions: { en: 'Between questions', zh: '題目之間' },
  betweenQuestionsHint: {
    en: 'Blank lines separating one question from the next. A single question can override this in its own panel, or by dragging its gap on the page.',
    zh: '分隔題目的空白行數。個別題目可在其面板中，或在頁面上拖曳間距來覆寫。',
  },
  gapDefault: {
    en: (lines: number) => `Default: ${lines} lines (the reference paper)`,
    zh: (lines: number) => `預設：${lines} 行（參考試卷）`,
  },
  gapLines: {
    en: (lines: number) => (lines === 1 ? '1 line' : `${lines} lines`),
    zh: (lines: number) => `${lines} 行`,
  },

  // Notices
  dupTitle: { en: 'Full marks appears more than once.', zh: '滿分出現多於一次。' },
  dupBody: {
    en: 'The total is worked out from the questions, so it will print the same number in each place. Remove the one you do not want by hovering it on the page and clicking ✕.',
    zh: '總分由各題目計算得出，每處都會印出相同數字。將滑鼠移到不需要的一處，再按 ✕ 移除。',
  },
  overTitle: {
    en: (header: boolean, footer: boolean) =>
      `The ${[header && 'header', footer && 'footer'].filter(Boolean).join(' and ')} ${header && footer ? 'are' : 'is'} taller than the margin.`,
    zh: (header: boolean, footer: boolean) =>
      `${header && footer ? '頁首及頁尾' : header ? '頁首' : '頁尾'}比邊界高。`,
  },
  overBody: {
    en: (cm: string, top: boolean) =>
      `About ${cm} cm of it runs into the page, so questions are pushed down. Give the page a bigger ${top ? 'top' : 'bottom'} margin on the Page tab, or remove a row.`,
    zh: (cm: string, top: boolean) =>
      `約有 ${cm} cm 伸入頁面，令題目被推低。請在「頁面」分頁加大${top ? '上' : '下'}邊界，或移除一行。`,
  },

  // Header and footer surfaces
  startEmptyRow: { en: 'Or start with an empty row', zh: '或從空白一行開始' },
  dragHint: {
    en: (which: Edge) =>
      `Double-click this ${which} on the page to type in it, or drag a field between the left, centre and right zones.`,
    zh: (which: Edge) => `在頁面上按兩下此${zhEdge(which)}即可輸入文字，或在左、中、右區之間拖曳欄位。`,
  },
  ruleLine: { en: 'Rule line', zh: '分隔線' },
  addRow: { en: '+ Row', zh: '+ 行' },
  clear: { en: 'Clear', zh: '清除' },
  replaceLayout: { en: 'Replace with a different layout', zh: '改用其他版面' },
  presetRunningTitle: { en: 'Paper name and page', zh: '試卷名稱及頁碼' },
  presetExam: { en: 'Exam paper (school, paper, date)', zh: '考試試卷（學校、試卷、日期）' },
  presetTitleOnly: { en: 'Three centred title lines', zh: '三行置中標題' },
  presetPublisher: { en: 'Title, page, copyright', zh: '標題、頁碼、版權' },
  noHeaderBooklet: { en: 'No header on this booklet', zh: '此小冊子沒有頁首' },
  footerAlways: { en: 'Footer always prints', zh: '頁尾必定印出' },
  printEdge: { en: (which: Edge) => `Print a ${which}`, zh: (which: Edge) => `印出${zhEdge(which)}` },
  withheldHeader: {
    en: 'A Question-Answer Book prints no header. The page frame and the margin notes occupy the top of every sheet, as the reference booklet has it.',
    zh: '試題答題簿不印頁首。頁面框架及邊注佔據每頁頂部，與參考小冊子一樣。',
  },
  edgeOff: {
    en: (which: Edge) => `The ${which} is off on every page. Tick “Print a ${which}” above to turn it on.`,
    zh: (which: Edge) => `所有頁面的${zhEdge(which)}均已關閉。請剔選上方的「印出${zhEdge(which)}」以開啟。`,
  },
  sameAsLater: { en: 'Same as pages 2+', zh: '與第 2 頁起相同' },
  itsOwn: { en: 'Its own', zh: '獨立設定' },
  nothing: { en: 'Nothing', zh: '不印' },
  edgeOnPage1: {
    en: (which: Edge) => `${which === 'header' ? 'Header' : 'Footer'} on page 1`,
    zh: (which: Edge) => `第 1 頁${zhEdge(which)}`,
  },
  edgeOnLater: {
    en: (which: Edge) => `${which === 'header' ? 'Header' : 'Footer'} on pages 2+`,
    zh: (which: Edge) => `第 2 頁起${zhEdge(which)}`,
  },
  laterEmpty: {
    en: (which: Edge) => `Pages 2+ have no ${which} rows yet`,
    zh: (which: Edge) => `第 2 頁起尚未有${zhEdge(which)}的行`,
  },
  printsLater: { en: (which: Edge) => `Prints the pages 2+ ${which}.`, zh: (which: Edge) => `印出第 2 頁起的${zhEdge(which)}。` },
  editOnLater: { en: 'Edit on Pages 2+', zh: '在第 2 頁起編輯' },
  ownRowsNote: {
    en: 'Page 1 has its own rows. Switching back discards them (⌘Z undoes).',
    zh: '第 1 頁有獨立的行。切換回去會捨棄它們（⌘Z 可復原）。',
  },
  page1Blank: {
    en: (which: Edge) => `Page 1 prints no ${which}. Pages 2+ still do.`,
    zh: (which: Edge) => `第 1 頁不印${zhEdge(which)}，第 2 頁起仍會印出。`,
  },
  laterHintSame: { en: 'Page 1 prints these rows too.', zh: '第 1 頁也會印出這些行。' },
  laterHintOwn: {
    en: 'Page 1 has its own rows. Change that on the Page 1 tab.',
    zh: '第 1 頁有獨立的行，請在「第 1 頁」分頁更改。',
  },
  laterHintBlank: {
    en: 'Page 1 prints none. Change that on the Page 1 tab.',
    zh: '第 1 頁不印任何行，請在「第 1 頁」分頁更改。',
  },
  onOrOff: { en: 'On or off for every page.', zh: '對所有頁面開啟或關閉。' },
  pageToEdit: { en: 'Page to edit', zh: '要編輯的頁面' },
  page1: { en: 'Page 1', zh: '第 1 頁' },
  pages2Onward: { en: 'Pages 2 onward', zh: '第 2 頁起' },
  everyPageAfter: { en: 'Every page after the first', zh: '第一頁之後的所有頁面' },
  captionSame: { en: 'Same as later pages, plus the title', zh: '與其後頁面相同，另加標題' },
  captionOwn: { en: (edge: string) => `own ${edge}`, zh: (edge: string) => `獨立${edge}` },
  captionNo: { en: (edge: string) => `no ${edge}`, zh: (edge: string) => `不印${edge}` },
  captionList: { en: ', ', zh: '、' },
  captionPlus: {
    en: (parts: string) => {
      const text = `${parts}, plus the title`;
      return text.charAt(0).toUpperCase() + text.slice(1);
    },
    zh: (parts: string) => `${parts}，另加標題`,
  },
  edgeHeader: { en: 'header', zh: '頁首' },
  edgeFooter: { en: 'footer', zh: '頁尾' },

  // Cover tab
  coverHeading: { en: 'Mock exam cover', zh: 'Mock 考試封面' },
  coverIntro: {
    en: 'A two-column front page: the paper’s identity and instructions on the left, a candidate panel on the right. Every line is edited on the page afterwards, like any other text.',
    zh: '雙欄封面：左邊是試卷資料和指示，右邊是考生欄。之後可像其他文字一樣，直接在頁面上修改每一行。',
  },
  paperStyle: { en: 'Paper style', zh: '試卷類型' },
  paperStyleHint: {
    en: 'The two differ in where candidates put their answers, which is what the instructions have to say.',
    zh: '兩者的分別在於考生作答的位置，指示須據此說明。',
  },
  styleMcq: { en: 'Multiple choice', zh: '多項選擇題' },
  styleMcqHint: { en: 'Answers on a separate answer sheet', zh: '答案寫在另一張答題紙' },
  styleWriteIn: { en: 'Write-in booklet', zh: '填寫式小冊子' },
  styleWriteInHint: { en: 'Answers in the spaces provided', zh: '答案寫在預留的空位' },
  cornerCode: { en: 'Corner code', zh: '角位編號' },
  school: { en: 'School', zh: '學校' },
  examination: { en: 'Examination', zh: '考試' },
  paper: { en: 'Paper', zh: '試卷' },
  timeAllowed: { en: 'Time allowed', zh: '作答時間' },
  hasCover: {
    en: 'This document already has a cover. Building another replaces it.',
    zh: '此文件已有封面，建立新封面會取代它。',
  },
  removeCover: { en: 'Remove cover', zh: '移除封面' },
  replaceCover: { en: 'Replace cover', zh: '取代封面' },
  addCover: { en: 'Add cover page', zh: '加入封面頁' },
  coverOptions: { en: 'Cover options', zh: '封面選項' },
  instructionNumbers: { en: 'Instruction numbers', zh: '指示編號' },
  instructionNumbersHint: {
    en: 'A house style: the reference’s Paper 1 numbers “1.”, its Paper 2 “(1)”.',
    zh: '屬於格式風格：參考試卷的 Paper 1 用「1.」，Paper 2 用「(1)」。',
  },
  writeInBoxes: { en: 'Write-in boxes', zh: '填寫方格' },
  writeInBoxesHint: {
    en: 'Boxes beside the panel label. 0 draws none; with an empty note that removes the panel and the cover prints one wide column.',
    zh: '考生欄標籤旁的方格。0 表示不畫；若備註留空，會移除考生欄，封面改為單一寬欄。',
  },

  // Title section
  titleSection: { en: 'Title (page 1 only)', zh: '標題（只限第 1 頁）' },
  titleSectionHint: {
    en: 'Printed below the header, above the first question. Choose one. A title block takes the place of the plain title rather than printing as well as it.',
    zh: '印在頁首之下、第一題之上，二選一。標題區會取代純標題，不會同時印出。',
  },
  worksheetTitlePlaceholder: { en: 'Worksheet title', zh: '工作紙標題' },
  justTheTitle: { en: 'Just the title', zh: '只有標題' },
  titleBlock: { en: 'Title block (name, marks, time)', zh: '標題區（姓名、分數、時間）' },
  titleBlockEdit: {
    en: 'Edit the text on the page. Add to the last row:',
    zh: '請在頁面上修改文字。加到最後一行：',
  },
  addFullMarks: { en: '+ Full marks', zh: '+ 滿分' },
  addFullMarksTitle: { en: 'A total computed from the question marks', zh: '由各題分數計算的總分' },
  addFillIn: { en: '+ Fill-in', zh: '+ 填寫線' },
  addFillInTitle: { en: 'A ruled line to write on', zh: '可供書寫的橫線' },
});

/** `MARGIN_PRESETS[i]`'s name, by index. */
export const MARGIN_PRESET_KEYS = ['marginPreset0', 'marginPreset1', 'marginPreset2', 'marginPreset3', 'marginPreset4'] as const;
