import { defineMessages } from '@/i18n/catalogue';

/**
 * What the import check says (k-0494): each finding's line, its fix's button, the bar.
 * Interface text only — nothing here reaches the paper or the `.docx`.
 */
export const IMPORT_CHECK_MESSAGES = defineMessages({
  // Findings, by kind
  junk: { en: (text: string) => `Layout text left over from the file: “${text}”`, zh: (text: string) => `檔案殘留的版面文字：「${text}」` },
  marksInText: {
    en: (marks: number, set: boolean) => `“${marks} marks” is still in the words${set ? ', and the part has no marks' : ''}`,
    zh: (marks: number, set: boolean) => `文字中仍有「${marks} 分」${set ? '，而這部分沒有分數' : ''}`,
  },
  marksTotal: {
    en: (file: number, paper: number) => `The file gives ${file} marks here, the paper ${paper}`,
    zh: (file: number, paper: number) => `檔案在這裏共 ${file} 分，試卷是 ${paper} 分`,
  },
  marksMissing: { en: (marks: number) => `No marks: the file gives ${marks}`, zh: (marks: number) => `沒有分數：檔案寫 ${marks} 分` },
  spaceMissing: {
    en: (lines: number) => `No answer lines: the file has ${lines}`,
    zh: (lines: number) => `沒有作答橫線：檔案有 ${lines} 行`,
  },
  fixSpace: { en: (lines: number) => `Add ${lines} lines`, zh: (lines: number) => `加入 ${lines} 行` },
  lostText: { en: (text: string) => `Words from the file are missing: “${text}”`, zh: (text: string) => `缺少檔案中的文字：「${text}」` },
  lostDrawing: {
    en: (count: number, what: string) =>
      `${count === 1 ? 'A' : count} ${what === 'chart' ? (count === 1 ? 'Word chart' : 'Word charts') : what === 'smartart' ? 'SmartArt graphic' : count === 1 ? 'diagram drawn with Word shapes' : 'diagrams drawn with Word shapes'} could not be imported. Copy ${count === 1 ? 'it' : 'each'} in Word as a picture and paste it here`,
    zh: (count: number, what: string) =>
      `有 ${count} 個${what === 'chart' ? ' Word 圖表' : what === 'smartart' ? ' SmartArt 圖形' : '用 Word 圖形繪畫的圖'}無法匯入。請在 Word 中把它複製為圖片，再貼到這裏`,
  },
  lostPicture: { en: 'A picture from the file is missing', zh: '缺少檔案中的一張圖片' },
  pictureMoved: { en: (from: number) => `This picture is in Question ${from}; the file has it here`, zh: (from: number) => `這張圖片放了在第 ${from} 題；檔案中它在這裏` },
  pictureSize: {
    en: (width: number, max: number) => `The picture is ${width} px wide, wider than the text column (${max} px)`,
    zh: (width: number, max: number) => `圖片闊 ${width} px，比文字欄（${max} px）闊`,
  },
  optionCount: { en: (count: number) => `This MC question has ${count} options, not 4`, zh: (count: number) => `這條 MC 題有 ${count} 個選項，不是 4 個` },
  optionsMerged: { en: (count: number) => `${count} options were read as one`, zh: (count: number) => `${count} 個選項被讀成一個` },
  mcAsWritten: {
    en: 'This reads as an MC question whose options are pictures, but it became a written question',
    zh: '這看來是以圖片作選項的 MC 題，但匯入成了文字題',
  },
  questionMerged: {
    en: (n: number) => `Question ${n} was read as part of this question`,
    zh: (n: number) => `第 ${n} 題被讀成這條題目的一部分`,
  },
  partMerged: { en: (label: string) => `Part ${label} was read as text of the part before it`, zh: (label: string) => `分題 ${label} 被讀成上一分題的文字` },
  language: {
    en: (to: string) => `The words are on the ${to === 'zh' ? 'English' : '中文'} side but they are ${to === 'zh' ? 'Chinese' : 'English'}`,
    zh: (to: string) => `文字放了在${to === 'zh' ? '英文' : '中文'}一邊，但它們是${to === 'zh' ? '中文' : '英文'}`,
  },
  garbled: {
    en: (count: number) => `${count} ${count === 1 ? 'character' : 'characters'} from a symbol font will not print as in Word`,
    zh: (count: number) => `有 ${count} 個符號字型的字元不會像 Word 中那樣印出`,
  },
  emptyBlock: { en: 'An empty paragraph left by the import', zh: '匯入留下的空白段落' },
  split: { en: 'One sentence was split into two paragraphs', zh: '一句句子被分成了兩段' },
  tableAsText: { en: (rows: number) => `A table of ${rows} rows was read as lines of text`, zh: (rows: number) => `一個 ${rows} 行的表格被讀成文字` },
  tableChanged: {
    en: (paper: string, file: string) => `This table (${paper}) is not the file's (${file})`,
    zh: (paper: string, file: string) => `這個表格（${paper}）與檔案中的（${file}）不同`,
  },
  aiFinding: { en: (text: string) => `AI: ${text}`, zh: (text: string) => `AI：${text}` },

  // Fix buttons
  fixRemove: { en: 'Remove', zh: '移除' },
  fixMarks: { en: (marks: number) => `Set ${marks} marks`, zh: (marks: number) => `設為 ${marks} 分` },
  fixMarksText: { en: 'Move to marks', zh: '移到分數' },
  fixSplit: { en: 'Split the options', zh: '分開選項' },
  fixPutBack: { en: 'Put it back', zh: '放回' },
  fixMove: { en: 'Move it here', zh: '移到這裏' },
  fixFit: { en: 'Fit the column', zh: '配合欄寬' },
  fixSide: { en: (to: string) => (to === 'zh' ? 'Move to 中文' : 'Move to English'), zh: (to: string) => (to === 'zh' ? '移到中文' : '移到英文') },
  fixSymbols: { en: 'Replace the symbols', zh: '取代符號' },
  fixJoin: { en: 'Join', zh: '合併' },
  fixTable: { en: 'Read as a table', zh: '讀作表格' },
  fixTableFile: { en: "Use the file's table", zh: '使用檔案的表格' },
  fixNewQuestion: { en: 'Make it a question', zh: '設為新題目' },
  fixPart: { en: 'Make it a part', zh: '設為分題' },
  fixKeepText: { en: 'Keep the words', zh: '保留文字' },
  fixMakeMc: { en: 'Make it MC', zh: '改為 MC 題' },
  fixApply: { en: 'Apply', zh: '套用' },

  // The check itself
  checkImport: { en: 'Check import', zh: '檢查匯入' },
  checkImportTitle: { en: 'Compare the paper with the file and list what the import got wrong', zh: '把試卷與檔案比較，列出匯入出錯的地方' },
  findingsN: {
    en: (n: number, safe: number) => `${n} ${n === 1 ? 'thing' : 'things'} to check${safe ? ` · ${safe} safe ${safe === 1 ? 'fix' : 'fixes'}` : ''}`,
    zh: (n: number, safe: number) => `${n} 項要檢查${safe ? ` · ${safe} 項安全修正` : ''}`,
  },
  noFindings: { en: 'The paper matches the file: nothing to fix', zh: '試卷與檔案相符：沒有要修正的地方' },
  applyAllSafe: { en: (n: number) => `Apply all safe fixes (${n})`, zh: (n: number) => `套用全部安全修正（${n}）` },
  appliedN: { en: (n: number) => `${n} ${n === 1 ? 'fix' : 'fixes'} applied`, zh: (n: number) => `已套用 ${n} 項修正` },
  staleN: {
    en: (n: number) => `${n} ${n === 1 ? 'fix no longer fits' : 'fixes no longer fit'} the paper and ${n === 1 ? 'was' : 'were'} left out`,
    zh: (n: number) => `有 ${n} 項修正已不適用於試卷，沒有套用`,
  },
  skip: { en: 'Skip', zh: '略過' },
  skipped: { en: 'Skipped', zh: '已略過' },
  applied: { en: 'Applied', zh: '已套用' },
  before: { en: 'Now', zh: '現在' },
  after: { en: 'After', zh: '之後' },
  removed: { en: '(removed)', zh: '（移除）' },
  noFix: { en: 'No automatic fix: change it on the page', zh: '沒有自動修正：請在頁面上修改' },
  close: { en: 'Close', zh: '關閉' },
  where: { en: (n: number, place: string) => `Question ${n}${place ? ` ${place}` : ''}`, zh: (n: number, place: string) => `第 ${n} 題${place ? ` ${place}` : ''}` },
  aiNoProvider: { en: 'No AI provider is set up (Settings → AI): only the rules ran', zh: '未設定 AI 服務（設定 → AI）：只用了規則檢查' },
  aiChecking: { en: (n: number) => `Asking the AI about ${n} ${n === 1 ? 'question' : 'questions'}…`, zh: (n: number) => `正在向 AI 查詢 ${n} 條題目…` },
  reviewNote: {
    en: 'Fixes change the import before Save; ⌘Z takes the last one back.',
    zh: '修正會在儲存前改動匯入內容；⌘Z 可取消最後一項。',
  },
  needFile: {
    en: 'Choose the file this paper was imported from',
    zh: '請選擇這份試卷匯入時用的檔案',
  },
  fileUnreadable: { en: 'That file could not be read', zh: '無法讀取該檔案' },
  checkImportLabel: { en: 'Check import', zh: '檢查匯入' },
  checkImportFile: { en: 'Check import against a file…', zh: '與檔案比較檢查匯入…' },
  checkingImport: { en: 'Checking the import against the file…', zh: '正在與檔案比較檢查匯入…' },
  sendsImport: {
    en: (n: number, provider: string) => `Rules first, then ${n} ${n === 1 ? 'question' : 'questions'} and the file's words to ${provider} with your key`,
    zh: (n: number, provider: string) => `先用規則檢查，再把 ${n} 條題目及檔案文字連同你的 API key 傳送到 ${provider}`,
  },
  // The AI check's own row (k-0501, user u-2ywo): always there, with progress, a result and a summary
  aiCheck: { en: 'AI check', zh: 'AI 檢查' },
  aiBarButton: { en: '✦ AI check', zh: '✦ AI 檢查' },
  aiBarTitle: {
    en: 'Ask the AI to compare every question with the file, for what the rules cannot see',
    zh: '請 AI 把每條題目與檔案比較，找出規則看不到的問題',
  },
  aiBarBusy: { en: (done: number, total: number) => `✦ AI checking ${done}/${total}`, zh: (done: number, total: number) => `✦ AI 檢查中 ${done}/${total}` },
  aiBarConnecting: { en: '✦ AI connecting…', zh: '✦ AI 連接中…' },
  aiBarClean: { en: '✦ AI: no problems', zh: '✦ AI：沒有問題' },
  aiBarFound: { en: (n: number) => `✦ AI: ${n} to look at`, zh: (n: number) => `✦ AI：${n} 項要看` },
  aiBarFailed: { en: '✦ AI check failed', zh: '✦ AI 檢查失敗' },
  aiRun: { en: 'Ask the AI', zh: '請 AI 檢查' },
  aiRunAgain: { en: 'Ask again', zh: '再檢查一次' },
  aiStop: { en: 'Stop', zh: '停止' },
  aiIdle: {
    en: (provider: string) => `Not run yet. Sends each question and its part of the file to ${provider} with your key.`,
    zh: (provider: string) => `尚未執行。會把每條題目及檔案中相應的部分，連同你的 API key 傳送到 ${provider}。`,
  },
  aiIdleNoProvider: {
    en: 'Not run yet. No AI provider is set up: add one in Settings → AI first.',
    zh: '尚未執行。未設定 AI 服務：請先在「設定 → AI」中加入。',
  },
  aiConnecting: { en: (provider: string) => `Connecting to ${provider}…`, zh: (provider: string) => `正在連接 ${provider}…` },
  aiSending: {
    en: (total: number, batches: number, provider: string) =>
      `Sending ${total} ${total === 1 ? 'question' : 'questions'}${batches > 1 ? ` in ${batches} batches` : ''} to ${provider}`,
    zh: (total: number, batches: number, provider: string) => `正在把 ${total} 條題目${batches > 1 ? `分 ${batches} 批` : ''}傳送到 ${provider}`,
  },
  aiProgress: {
    en: (done: number, total: number) => `${done} of ${total} checked`,
    zh: (done: number, total: number) => `已檢查 ${done}／${total} 條`,
  },
  aiElapsed: { en: (time: string) => `${time} so far`, zh: (time: string) => `已用 ${time}` },
  aiLeft: { en: (time: string) => `about ${time} left`, zh: (time: string) => `約剩 ${time}` },
  aiGuess: { en: (time: string) => `usually about ${time} in all`, zh: (time: string) => `通常共需約 ${time}` },
  seconds: { en: (n: number) => `${n} s`, zh: (n: number) => `${n} 秒` },
  minutes: { en: (n: number) => `${n} min`, zh: (n: number) => `${n} 分鐘` },
  aiClean: {
    en: (time: string, n: number) => `AI checked the whole paper (${n} ${n === 1 ? 'question' : 'questions'}) at ${time}: no problems found`,
    zh: (time: string, n: number) => `AI 已於 ${time} 檢查整份試卷（${n} 條題目）：沒有發現問題`,
  },
  aiFound: {
    en: (time: string, n: number, found: number) =>
      `AI checked the whole paper (${n} ${n === 1 ? 'question' : 'questions'}) at ${time}: ${found} ${found === 1 ? 'thing' : 'things'} to look at, listed below`,
    zh: (time: string, n: number, found: number) => `AI 已於 ${time} 檢查整份試卷（${n} 條題目）：有 ${found} 項要看，列在下面`,
  },
  aiPartly: {
    en: (time: string, done: number, total: number, found: number) =>
      `AI checked ${done} of ${total} questions at ${time}: ${found ? `${found} ${found === 1 ? 'thing' : 'things'} to look at, listed below` : 'no problems found in those'}`,
    zh: (time: string, done: number, total: number, found: number) =>
      `AI 已於 ${time} 檢查 ${done}／${total} 條題目：${found ? `有 ${found} 項要看，列在下面` : '這些題目沒有發現問題'}`,
  },
  aiStopped: {
    en: (done: number, total: number) => `AI check stopped: ${done} of ${total} questions checked`,
    zh: (done: number, total: number) => `AI 檢查已停止：已檢查 ${done}／${total} 條題目`,
  },
  aiFailedWhy: { en: (why: string) => `AI check failed: ${why}`, zh: (why: string) => `AI 檢查失敗：${why}` },
  aiUnreadable: { en: 'its replies could not be read. Ask again, or try another model in Settings → AI.', zh: '無法讀取它的回覆。請再試一次，或在「設定 → AI」中改用另一個模型。' },
  aiNothingSent: {
    en: 'No question could be matched to its part of the file, so nothing was sent to the AI.',
    zh: '沒有題目能與檔案中相應的部分配對，所以沒有傳送任何內容給 AI。',
  },
  aiRulesStand: { en: 'The rule check above still stands.', zh: '上面的規則檢查結果仍然有效。' },
  aiCheckedLine: { en: (list: string) => `Checked: ${list}`, zh: (list: string) => `檢查了：${list}` },
  aiQuestionsN: { en: (n: number) => `${n} ${n === 1 ? 'question' : 'questions'}`, zh: (n: number) => `${n} 條題目` },
  aiOptionsN: { en: (n: number) => `${n} MC ${n === 1 ? 'option' : 'options'}`, zh: (n: number) => `${n} 個 MC 選項` },
  aiStatementsN: { en: (n: number) => `${n} ${n === 1 ? 'statement' : 'statements'}`, zh: (n: number) => `${n} 句陳述` },
  aiPicturesN: { en: (n: number) => `${n} ${n === 1 ? 'picture or diagram' : 'pictures and diagrams'}`, zh: (n: number) => `${n} 張圖片或圖表` },
  aiTablesN: { en: (n: number) => `${n} ${n === 1 ? 'table' : 'tables'}`, zh: (n: number) => `${n} 個表格` },
  aiMarksN: { en: (n: number) => `the marks of ${n} ${n === 1 ? 'part' : 'parts'}`, zh: (n: number) => `${n} 個部分的分數` },
  aiListJoin: { en: ' · ', zh: '、' },
  aiLookedFor: {
    en: 'Looked for missing or garbled words, lines run together or cut in two, wrong marks, page text left in and the wrong language: none found.',
    zh: '找過缺漏或亂碼的文字、黏在一起或被切開的句子、錯誤的分數、殘留的版面文字及放錯語言：全部沒有發現。',
  },
  aiFoundLine: { en: (list: string) => `Found: ${list}`, zh: (list: string) => `發現：${list}` },
  aiWithFix: { en: (n: number) => `${n} with a fix to apply`, zh: (n: number) => `${n} 項附有可套用的修正` },
  aiIssue: {
    en: (issue: string, n: number) =>
      `${({ lostWords: 'missing words', garbled: 'garbled words', merged: 'lines run together', split: 'a line cut in two', marks: 'marks', leftover: 'page text left in', language: 'wrong language' } as Record<string, string>)[issue] ?? 'other'} (${n})`,
    zh: (issue: string, n: number) =>
      `${({ lostWords: '缺漏文字', garbled: '亂碼文字', merged: '句子黏在一起', split: '句子被切開', marks: '分數', leftover: '殘留版面文字', language: '放錯語言' } as Record<string, string>)[issue] ?? '其他'}（${n}）`,
  },
  aiPicturesNote: {
    en: 'Pictures and diagrams are checked for their place only: the AI does not see the image.',
    zh: '圖片及圖表只檢查位置：AI 看不到圖像本身。',
  },
  aiDroppedNote: {
    en: (n: number) => `${n} more ${n === 1 ? 'suggestion was' : 'suggestions were'} left out: ${n === 1 ? 'it named' : 'they named'} nothing on this paper.`,
    zh: (n: number) => `另有 ${n} 項建議沒有列出：它們指向的內容不在這份試卷上。`,
  },
  aiFailedNote: {
    en: (n: number, why: string) => `Could not check ${n} ${n === 1 ? 'question' : 'questions'}${why ? `: ${why}` : ''}. Ask again to retry.`,
    zh: (n: number, why: string) => `有 ${n} 條題目未能檢查${why ? `：${why}` : ''}。請再檢查一次。`,
  },
  aiVerbClean: { en: (n: number) => `AI checked ${n} ${n === 1 ? 'question' : 'questions'}: no problems found`, zh: (n: number) => `AI 檢查了 ${n} 條題目：沒有發現問題` },
  noSourceYet: { en: 'Asks for the file the paper came from', zh: '會要求選擇試卷來源檔案' },
});
