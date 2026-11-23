import { defineMessages } from '@/i18n/catalogue';

/**
 * The Past paper bank 歷屆試題庫 (k-0443): its screen (start screen → Library), its side of
 * the editor's 題庫 tab, and its Settings section. HKCEE, HKALE and HKDSE stay English in
 * 中文 too, as exam names do in the rest of the app.
 */
export const PAST_PAPER_MESSAGES = defineMessages({
  title: { en: 'Past paper bank 歷屆試題庫', zh: '歷屆試題庫' },
  titleShort: { en: 'Past papers', zh: '歷屆試題' },
  home: { en: 'Home', zh: '主頁' },
  readOnly: { en: 'Read-only', zh: '唯讀' },
  readOnlyTitle: {
    en: 'Nothing you do here changes this bank. Questions you take are copies in your own worksheet or bank.',
    zh: '你在這裏的操作不會改動此題庫。你取用的題目會成為你自己工作紙或題庫中的副本。',
  },
  hint: {
    en: 'HKCEE, HKALE and HKDSE MC questions with answers, by topic. Read-only.',
    zh: 'HKCEE、HKALE 及 HKDSE 的 MC 題目連答案，按課題排列。唯讀。',
  },
  count: { en: (n: number) => `${n.toLocaleString('en')} questions`, zh: (n: number) => `${n.toLocaleString('en')} 題` },
  topics: { en: 'Topics', zh: '課題' },
  topicCount: { en: (n: number) => `${n}`, zh: (n: number) => `${n}` },
  // The topic picker, by syllabus part (k-0446).
  topicFilter: { en: 'Find a topic', zh: '搜尋課題' },
  topicFilterNone: { en: 'No topic matches.', zh: '沒有相符的課題。' },
  otherTopics: { en: 'Other topics', zh: '其他課題' },
  openAll: { en: 'Open all', zh: '全部展開' },
  closeAll: { en: 'Close all', zh: '全部收起' },
  partQuestions: { en: (n: number) => `${n.toLocaleString('en')} questions`, zh: (n: number) => `${n.toLocaleString('en')} 題` },
  chooseTopic: { en: 'Choose a topic', zh: '選擇課題' },
  searchLabel: { en: 'Search the past paper bank', zh: '搜尋歷屆試題庫' },
  searchIn: { en: (topic: string) => `Search ${topic}…`, zh: (topic: string) => `在「${topic}」中搜尋…` },
  searchOpened: { en: 'Search the opened topics…', zh: '在已開啟的課題中搜尋…' },
  searchHint: {
    en: 'Words in either language, or a source such as “DSE2016” or “2016 P1”.',
    zh: '中英文字詞皆可，或輸入出處，例如「DSE2016」或「2016 P1」。',
  },
  scopeTopic: { en: 'This topic', zh: '此課題' },
  scopeAll: { en: 'Every topic', zh: '所有課題' },
  scopeLabel: { en: 'Search in', zh: '搜尋範圍' },
  loadingAll: { en: (done: number, total: number) => `Downloading topics… ${done} of ${total}`, zh: (done: number, total: number) => `正在下載課題… ${done} / ${total}` },
  loadAllNote: {
    en: (mb: string) => `Searching every topic downloads the whole bank once (about ${mb} MB). It is kept on this computer.`,
    zh: (mb: string) => `搜尋所有課題會下載整個題庫一次（約 ${mb} MB），並保存在此電腦上。`,
  },
  loadAll: { en: 'Download and search', zh: '下載並搜尋' },
  searchEvery: { en: 'Search every topic…', zh: '在所有課題中搜尋…' },
  // By topic / By year (k-0497, user u-nlb5).
  viewLabel: { en: 'List the bank', zh: '題庫排列方式' },
  byTopic: { en: 'By topic', zh: '按課題' },
  byYear: { en: 'By year', zh: '按年份' },
  yearsNav: { en: 'Exam years', zh: '考試年份' },
  noYears: { en: 'No exam year matches the filters.', zh: '沒有符合篩選的考試年份。' },
  yearCount: { en: (n: number) => (n === 1 ? '1 year' : `${n} years`), zh: (n: number) => `${n} 年` },
  paperCount: { en: (n: number) => `${n} papers`, zh: (n: number) => `${n} 份試卷` },
  yearPapers: { en: (year: string) => `Papers of ${year}`, zh: (year: string) => `${year} 的試卷` },
  scopeYear: { en: 'This year', zh: '此年份' },
  scopeEveryYear: { en: 'Every year', zh: '所有年份' },
  searchEveryYear: { en: 'Search every year…', zh: '在所有年份中搜尋…' },
  yearsNeedAll: {
    en: (mb: string) => `Only the years of topics you opened are listed. Listing every year downloads the whole bank once (about ${mb} MB); it is kept on this computer.`,
    zh: (mb: string) => `只列出你開啟過的課題所屬年份。要列出所有年份，需下載整個題庫一次（約 ${mb} MB），並保存在此電腦上。`,
  },
  loadAllYears: { en: 'Download every year', zh: '下載所有年份' },
  yearKeys: {
    en: '↑ ↓ open the year above or below; → ← its papers',
    zh: '↑ ↓ 開啟上一個或下一個年份；→ ← 選擇該年份的試卷',
  },
  paper: { en: 'Paper', zh: '試卷' },
  allPapers: { en: 'All papers', zh: '所有試卷' },
  paperOption: { en: (label: string, n: number) => `${label} (${n})`, zh: (label: string, n: number) => `${label}（${n} 題）` },
  paperHeading: { en: (label: string) => `${label}, in question order`, zh: (label: string) => `${label}（按題號排列）` },
  inTopic: { en: (topic: string) => `in ${topic}`, zh: (topic: string) => `屬「${topic}」` },
  pictures: { en: (n: number) => (n === 1 ? 'with a picture' : `with ${n} pictures`), zh: (n: number) => `附 ${n} 幅圖` },
  showsSoon: { en: 'Downloading its topic to show it…', zh: '正在下載所屬課題以顯示此題…' },
  notInTopic: {
    en: 'Not in its topic file, or it needs a newer version of Econ Studio.',
    zh: '所屬課題檔案中沒有此題，或需要較新版本的 Econ Studio。',
  },
  indexNote: {
    en: 'Every topic is searched; a question downloads its topic when you scroll to it.',
    zh: '已搜尋所有課題；捲動到某題時才會下載它所屬的課題。',
  },
  storageWarn: {
    en: (pct: number, mb: string) =>
      `Your browser’s storage for documents would be ${pct}% full (${mb} MB of about 5 MB). Pictures take the most room. The desktop app has no such limit.`,
    zh: (pct: number, mb: string) => `你瀏覽器的文件儲存空間將會用了 ${pct}%（約 5 MB 中的 ${mb} MB）。圖片最佔空間。桌面版沒有此限制。`,
  },
  storageFull: {
    en: (mb: string) =>
      `These would not fit: your browser keeps about 5 MB for all your documents and ${mb} MB is used. Pick fewer questions, move old documents to Trash and empty it, or use the desktop app.`,
    zh: (mb: string) => `放不下：你的瀏覽器只為所有文件保留約 5 MB，現已用了 ${mb} MB。請少選幾題、把舊文件移到垃圾桶並清空，或改用桌面版。`,
  },
  exam: { en: 'Exam', zh: '考試' },
  allExams: { en: 'All', zh: '全部' },
  years: { en: 'Years', zh: '年份' },
  yearFrom: { en: 'From year', zh: '由' },
  yearTo: { en: 'To year', zh: '至' },
  anyYear: { en: 'Any', zh: '不限' },
  showAnswers: { en: 'Show answers', zh: '顯示答案' },
  paperLanguage: { en: 'Paper language', zh: '試卷語言' },
  answer: { en: (letter: string) => `Answer ${letter}`, zh: (letter: string) => `答案 ${letter}` },
  shared: { en: 'Shared passage: goes in with this question', zh: '共用資料：會與此題一併加入' },
  shown: { en: (shown: number, total: number) => (shown === total ? `${total} questions` : `${shown} of ${total} questions`), zh: (shown: number, total: number) => (shown === total ? `${total} 題` : `${total} 題中的 ${shown} 題`) },
  noneMatch: { en: 'No question matches. Clear the search or a filter.', zh: '沒有相符的題目。請清除搜尋或篩選。' },
  clearFilters: { en: 'Clear filters', zh: '清除篩選' },
  pickTitle: { en: (source: string) => `Pick ${source}`, zh: (source: string) => `選取 ${source}` },
  picked: { en: (n: number) => (n === 1 ? '1 picked' : `${n} picked`), zh: (n: number) => `已選 ${n} 題` },
  clear: { en: 'Clear', zh: '清除' },
  addTo: { en: 'Add to', zh: '加到' },
  // u-w7gs: keep each question's source (year + question number) on the paper.
  showSources: { en: 'Show source (year + question no.)', zh: '顯示出處（年份及題號）' },
  showSourcesTitle: {
    en: 'Prints each question\'s exam, year and question number in brackets at the right of its first line: on screen, in print, PDF and Word. Change it later in Setup → Page.',
    zh: '在每題首行右方以括號印出其考試、年份及題號：畫面、列印、PDF 及 Word 皆同。之後可在「頁面設定 → 頁面」更改。',
  },
  showSourcesThisPaper: { en: 'Show sources on this paper', zh: '在此試卷顯示出處' },
  // u-z6ft: how the source prints. The examples are the labels themselves (paper words).
  sourceFormat: { en: 'Source format', zh: '出處格式' },
  sourceFormatFull: { en: 'Full: HKDSE 2019 Paper 1 Q12', zh: '完整：HKDSE 2019 Paper 1 Q12（中文卷印中文全稱）' },
  sourceFormatShort: { en: 'Short: DSE2019/P1/Q12', zh: '簡寫：DSE2019/P1/Q12' },
  sourceFormatShortRoman: { en: 'Short: DSE2019/I/Q12', zh: '簡寫：DSE2019/I/Q12' },
  newWorksheet: { en: 'New worksheet', zh: '新工作紙' },
  newPaper1: { en: 'New Paper 1', zh: '新 Paper 1' },
  recentPapers: { en: 'Your papers', zh: '你的試卷' },
  add: { en: 'Add', zh: '加入' },
  copyToBank: { en: 'Copy to my question bank', zh: '複製到我的題庫' },
  copied: {
    en: (n: number, already: number) =>
      `${n === 1 ? '1 question' : `${n} questions`} copied to your question bank${already ? `; ${already} already there` : ''}.`,
    zh: (n: number, already: number) => `已複製 ${n} 題到你的題庫${already ? `；${already} 題已在題庫中` : ''}。`,
  },
  copiedNone: {
    en: (already: number) => (already === 1 ? 'That question is already in your question bank.' : `All ${already} are already in your question bank.`),
    zh: (already: number) => (already === 1 ? '此題已在你的題庫中。' : `這 ${already} 題已全在你的題庫中。`),
  },
  copiedWithStimulus: {
    en: (n: number) => ` ${n === 1 ? 'Its shared passage went' : `${n} shared passages went`} with ${n === 1 ? 'it' : 'them'}, and come along when you insert those questions.`,
    zh: (n: number) => ` 共用資料（${n} 份）亦一併複製，插入這些題目時會一同加入。`,
  },
  added: {
    en: (n: number, skipped: number) => `${n === 1 ? '1 past paper question' : `${n} past paper questions`} added${skipped ? `; ${skipped} already in this paper` : ''}`,
    zh: (n: number, skipped: number) => `已加入 ${n} 題歷屆試題${skipped ? `；${skipped} 題已在此試卷中` : ''}`,
  },
  nothingAdded: {
    en: (n: number) => (n === 1 ? 'That question is already in this paper.' : `All ${n} are already in this paper.`),
    zh: (n: number) => (n === 1 ? '此題已在此試卷中。' : `這 ${n} 題已全在此試卷中。`),
  },
  readOnlyPaper: { en: 'This paper is read-only, so nothing was added.', zh: '此試卷為唯讀，因此沒有加入任何題目。' },
  newName: { en: 'Past paper questions', zh: '歷屆試題' },
  // States of the bank.
  loading: { en: 'Loading the list of topics…', zh: '正在載入課題清單…' },
  loadingTopic: { en: 'Downloading this topic…', zh: '正在下載此課題…' },
  off: {
    en: 'The past paper bank is switched off on this computer.',
    zh: '此電腦已關閉歷屆試題庫。',
  },
  turnOn: { en: 'Settings…', zh: '設定…' },
  disabled: {
    en: 'The past paper bank is not available at the moment. Your worksheets and the questions you took from it are not affected.',
    zh: '歷屆試題庫暫時無法使用。你的工作紙及你已取用的題目不受影響。',
  },
  error: {
    en: (reason: string) =>
      reason === 'offline'
        ? 'The past paper bank can’t be reached. Check the connection and try again; topics you opened before still work offline.'
        : reason === 'notFound'
          ? 'The past paper bank was not found at its address. Settings → Past paper bank shows where it is read from.'
          : 'The past paper bank could not be read. Try again later.',
    zh: (reason: string) =>
      reason === 'offline'
        ? '無法連接歷屆試題庫。請檢查網絡後再試；你以前開啟過的課題可離線使用。'
        : reason === 'notFound'
          ? '在其地址找不到歷屆試題庫。可在「設定 → 歷屆試題庫」查看讀取來源。'
          : '無法讀取歷屆試題庫，請稍後再試。',
  },
  topicError: { en: 'This topic could not be downloaded.', zh: '無法下載此課題。' },
  retry: { en: 'Try again', zh: '再試' },
  offline: { en: 'Offline: showing the copy kept on this computer.', zh: '離線：正在顯示保存在此電腦上的版本。' },
  skipped: {
    en: (n: number) => `${n === 1 ? '1 question needs' : `${n} questions need`} a newer version of Econ Studio and ${n === 1 ? 'is' : 'are'} not shown.`,
    zh: (n: number) => `${n} 題需要較新版本的 Econ Studio，因此未有顯示。`,
  },
  // The editor's 題庫 tab: which bank it shows.
  bankSwitch: { en: 'Which question bank', zh: '選擇題庫' },
  myBank: { en: 'My bank', zh: '我的題庫' },
  tabTopic: { en: 'Topic', zh: '課題' },
  insert: { en: 'Insert', zh: '插入' },
  insertTitle: { en: 'Insert a copy into this paper after the selected item', zh: '在選取項目後插入副本' },
  inPaper: { en: 'In this paper', zh: '已在此試卷' },
  tabHint: { en: 'Read-only. Insert puts a copy in your paper.', zh: '唯讀。「插入」會把副本放進你的試卷。' },
});

/** Settings → Past paper bank. */
export const PAST_PAPER_SETTINGS_MESSAGES = defineMessages({
  label: { en: 'Past paper bank', zh: '歷屆試題庫' },
  hint: { en: 'On, off, or another source', zh: '開啟、關閉或其他來源' },
  description: {
    en: 'The built-in bank of past paper MC questions. It is read-only and downloaded when you open it; it is never one of your documents.',
    zh: '內置的歷屆 MC 試題庫。它是唯讀的，在你開啟時才下載；它不會成為你的文件。',
  },
  source: { en: 'Source', zh: '來源' },
  builtIn: { en: 'Built-in', zh: '內置' },
  builtInNote: { en: (host: string) => `Read from ${host}.`, zh: (host: string) => `從 ${host} 讀取。` },
  builtInGitHubNote: {
    en: (repo: string) =>
      `Downloaded from jsDelivr, a public service that mirrors ${repo} on GitHub, and from GitHub itself. Like any website, both see your computer's IP address.`,
    zh: (repo: string) => `從 jsDelivr（轉載 GitHub 上 ${repo} 的公共服務）及 GitHub 本身下載。與任何網站一樣，兩者都會看到你電腦的 IP 地址。`,
  },
  off: { en: 'Off', zh: '關閉' },
  offNote: {
    en: 'Hides the past paper bank on this computer. Questions you already took stay in your worksheets.',
    zh: '在此電腦上隱藏歷屆試題庫。你已取用的題目會保留在你的工作紙中。',
  },
  custom: { en: 'Another address', zh: '其他地址' },
  customNote: {
    en: 'A folder holding manifest.json and topics/, on https, on this computer (http://localhost…), or a path on this app (/pastpaper-bank/).',
    zh: '存放 manifest.json 及 topics/ 的資料夾：https 地址、此電腦上的地址（http://localhost…），或此程式內的路徑（/pastpaper-bank/）。',
  },
  address: { en: 'Address', zh: '地址' },
  invalid: { en: 'Not an address this can read from.', zh: '無法從此地址讀取。' },
  sent: {
    en: 'Opening the bank downloads its files from the source. Nothing of yours is sent.',
    zh: '開啟題庫時會從來源下載其檔案。你的任何資料都不會傳送出去。',
  },
  kept: { en: 'Kept on this computer', zh: '保存在此電腦上' },
  keptSize: { en: (mb: string, files: number) => `${mb} MB in ${files} files`, zh: (mb: string, files: number) => `${files} 個檔案，共 ${mb} MB` },
  keptNone: { en: 'Nothing downloaded yet.', zh: '尚未下載任何檔案。' },
  clearKept: { en: 'Remove downloads', zh: '移除已下載檔案' },
  cleared: { en: 'Removed. Topics download again when opened.', zh: '已移除。再開啟課題時會重新下載。' },
});
