import { defineMessages } from '@/i18n/catalogue';

/**
 * The Question studio's trial kit (k-0499, decision 7a): the 30 invented briefs, the marks the
 * teacher gives each draft, and where the trial stands against its bar. Words for the page
 * only; the report text the Copy button makes is English, for the people tuning the studio
 * (`questionStudio/trialScore.ts`).
 */
export const STUDIO_TRIAL_MESSAGES = defineMessages({
  tabWrite: { en: 'Write', zh: '擬題' },
  tabTrial: { en: 'Trial kit', zh: '試用工具' },
  tabsLabel: { en: 'Studio views', zh: '工作室檢視' },

  // The briefs
  briefsTitle: { en: 'The 30 briefs', zh: '30 個擬定要求' },
  briefsBody: {
    en: 'Thirty invented requests, each written once with your AI key, so the trial does not depend on what you happen to ask. About 90 drafts, and between 60 and 150 requests to your provider (a draft that fails a check is written again). With Gemini in Hong Kong, turn the VPN on first.',
    zh: '30 個自擬的要求，各用你的 AI key 擬題一次，令試用結果不受你偶然的提問所左右。共約 90 份草稿，向服務供應商發出 60 至 150 次請求（草稿未通過檢查時會重寫）。在香港使用 Gemini，請先開啟 VPN。',
  },
  briefsRun: { en: 'Run the 30 briefs', zh: '執行 30 個要求' },
  briefsRunRest: { en: 'Run the rest', zh: '執行餘下的要求' },
  briefsStop: { en: 'Stop', zh: '停止' },
  briefsProgress: {
    en: (done: number, total: number) => `${done} of ${total} briefs have drafts`,
    zh: (done: number, total: number) => `${total} 個要求中，${done} 個已有草稿`,
  },
  briefsRunning: {
    en: (brief: string) => `Writing brief ${brief}…`,
    zh: (brief: string) => `正在為要求 ${brief} 擬題…`,
  },
  briefsAllDone: { en: 'Every brief has drafts. Read and mark them in the list.', zh: '每個要求都已有草稿。請在清單中閱讀並評分。' },
  briefsStopped: { en: 'Stopped. Nothing is lost: run the rest when you are ready.', zh: '已停止，沒有任何損失。準備好後可執行餘下的要求。' },

  // The teacher's own requests
  mineTitle: { en: 'Your own requests', zh: '你自己的要求' },
  mineBody: {
    en: 'Write as usual in the Question studio. Every request, Another, Harder, Easier and change you ask is added here to mark.',
    zh: '照常在擬題工作室擬題。你每次的要求，以及「再擬一題」、「更難」、「更易」或修改，都會加入這裏供你評分。',
  },
  mineCount: {
    en: (writes: number, changes: number) => `${writes} of your requests so far, and ${changes} changes`,
    zh: (writes: number, changes: number) => `至今 ${writes} 個你的要求，另有 ${changes} 次修改`,
  },

  // The list
  show: { en: 'Show', zh: '顯示' },
  filterTodo: { en: 'Not marked yet', zh: '未評分' },
  filterAll: { en: 'All', zh: '全部' },
  filterBriefs: { en: 'Briefs', zh: '擬定要求' },
  filterMine: { en: 'Mine', zh: '我的要求' },
  listTitle: { en: 'To read and mark', zh: '待閱讀及評分' },
  listCount: {
    en: (shown: number, marked: number, total: number) => `${marked} of ${total} marked, ${shown} shown`,
    zh: (shown: number, marked: number, total: number) => `${total} 份中，已評分 ${marked} 份，顯示 ${shown} 份`,
  },
  listEmpty: {
    en: 'Nothing to read yet. Run the briefs, or write a few questions in the Question studio.',
    zh: '暫時沒有可閱讀的草稿。請執行擬定要求，或在擬題工作室擬幾題。',
  },
  listDone: { en: 'Everything shown is marked.', zh: '顯示的草稿都已評分。' },
  cardBrief: { en: (id: string) => `Brief ${id}`, zh: (id: string) => `要求 ${id}` },
  cardMine: { en: 'Your request', zh: '你的要求' },
  asked: {
    en: (keyPoint: string, level: string, shape: string, languages: string) => `${keyPoint} · ${level} · ${shape} · ${languages}`,
    zh: (keyPoint: string, level: string, shape: string, languages: string) => `${keyPoint} · ${level} · ${shape} · ${languages}`,
  },

  // The marks
  marksLabel: { en: 'Your marks', zh: '你的評分' },
  keyQuestion: { en: 'Key defensible?', zh: '答案合理嗎？' },
  keyHint: { en: 'Exactly one option you would defend as the answer.', zh: '只有一個你會認為合理的答案。' },
  keyYes: { en: 'Yes', zh: '合理' },
  keyNo: { en: 'No', zh: '不合理' },
  dseQuestion: { en: 'Reads like DSE?', zh: '像 DSE 的題目嗎？' },
  dseHint: { en: 'Would it fit in a real HKDSE paper: the stem, the options, the wrong options?', zh: '放進真正的 HKDSE 試卷，題幹、選項和錯誤選項是否合適？' },
  testedQuestion: { en: 'Concept often tested?', zh: '是常考的概念嗎？' },
  testedHint: { en: 'Is this a concept DSE really asks about, not a corner of the syllabus?', zh: '是 DSE 真正會考的概念，而不是課程中冷門的角落？' },
  yes: { en: 'Yes', zh: '是' },
  no: { en: 'No', zh: '否' },
  armTitle: { en: 'How to write them', zh: '擬題方式' },
  armToday: { en: 'Key point alone', zh: '只按學習要點' },
  armRefs: { en: 'With real questions', zh: '附真實試題' },
  armStrict: { en: 'Close to one real question', zh: '貼近一條真實試題' },
  armPicked: { en: 'With questions you picked', zh: '附你揀選的題目' },
  armHint: {
    en: 'The same 30 requests in three ways, to compare them: the key point alone (the studio before), with 3 to 5 real HKDSE questions the studio picks (the default now), or written close to one real question on purpose. Each way runs and resumes on its own. Mark the new questions "Reads like DSE?" and "Concept often tested?" too.',
    zh: '同樣的 30 個要求用三種方式擬題，以作比較：只按學習要點（以前的做法）、附上擬題工作室挑選的 3 至 5 條真實 HKDSE 題目（現在的預設）、或刻意貼近一條真實試題。每種方式各自執行、各自續做。請同時為新題目標示「像 DSE 的題目嗎？」和「是常考的概念嗎？」。',
  },
  styleTitle: { en: 'Style and concepts', zh: '文風與概念' },
  styleLine: {
    en: (name: string, dse: string, tested: string) => `${name}: reads like DSE ${dse} · concept often tested ${tested}`,
    zh: (name: string, dse: string, tested: string) => `${name}：像 DSE ${dse} · 常考概念 ${tested}`,
  },
  styleNone: { en: 'Marked so far: none.', zh: '暫時未有標示。' },
  useQuestion: { en: 'Would you use it?', zh: '你會用這題嗎？' },
  useAsis: { en: 'As it stands', zh: '原題直接用' },
  useEdit: { en: 'After one edit', zh: '改一次就用' },
  useReject: { en: 'Reject', zh: '不用' },

  // Where it stands
  report: { en: 'Where it stands', zh: '目前結果' },
  reportBar: { en: 'The bar', zh: '標準' },
  gateKey: { en: 'Key defensible', zh: '答案合理' },
  gateUse: { en: 'Usable as it stands or after one edit', zh: '原題或改一次後可用' },
  gateCopy: { en: 'Near-copy shown', zh: '顯示出來的近似抄襲' },
  gateNeed: { en: (percent: number) => `needs ${percent}% or more`, zh: (percent: number) => `需要 ${percent}% 或以上` },
  gateZero: { en: 'must be 0', zh: '必須為 0' },
  gateCounts: { en: (got: number, of: number) => `${got} of ${of}`, zh: (got: number, of: number) => `${of} 中 ${got}` },
  gatePass: { en: 'Passes', zh: '達標' },
  gateFail: { en: 'Falls short', zh: '未達標' },
  gatePending: {
    en: (marked: number, need: number) => `Judged once ${need} are marked (${marked} so far)`,
    zh: (marked: number, need: number) => `評分滿 ${need} 項才作判斷（目前 ${marked} 項）`,
  },
  verdictPass: { en: 'The bar is met', zh: '已達標' },
  verdictFail: { en: 'The bar is not met', zh: '未達標' },
  verdictPending: { en: 'Not enough marked yet', zh: '評分數量未足' },
  markedOf: {
    en: (marked: number, shown: number) => `${marked} of ${shown} drafts marked`,
    zh: (marked: number, shown: number) => `${shown} 份草稿中，已評分 ${marked} 份`,
  },
  noBank: {
    en: (n: number) => `The near-copy check had no Past paper bank to compare with in ${n} ${n === 1 ? 'run' : 'runs'}, so its number means less.`,
    zh: (n: number) => `近似抄襲檢查有 ${n} 次沒有「歷屆試題庫」可供比對，數字參考價值較低。`,
  },
  localTitle: { en: 'Checks the studio ran', zh: '工作室的檢查' },
  localAgree: { en: 'The blind solve agreed with the key', zh: '盲測答案與擬題答案相同' },
  localLint: { en: 'Question quality notes', zh: '題目質素提示' },
  localSyllabus: { en: 'Syllabus limits met', zh: '觸及課程限制' },
  localNumbers: { en: 'Numbers differing between languages', zh: '兩種語言數字不一致' },
  localTerms: { en: 'EDB term notes', zh: 'EDB 詞彙提示' },
  localCopy: {
    en: (max: number, p90: number) => `Closest near-copy shown: ${max}% (90th percentile ${p90}%)`,
    zh: (max: number, p90: number) => `顯示出來最接近的近似抄襲：${max}%（第 90 百分位 ${p90}%）`,
  },
  localWarned: {
    en: (n: number, copy: number, shape: number) => `Shown with a hard-check warning: ${n} (near-copy ${copy}, format ${shape})`,
    zh: (n: number, copy: number, shape: number) => `顯示時附有嚴格檢查警告：${n} 份（近似抄襲 ${copy}，格式 ${shape}）`,
  },
  costTitle: { en: 'What it cost', zh: '用量' },
  cost: {
    en: (requests: number, tokens: string, seconds: number) => `${requests} requests to the provider · ${tokens} tokens · about ${seconds} s a click`,
    zh: (requests: number, tokens: string, seconds: number) => `向供應商發出 ${requests} 次請求 · ${tokens} 個 token · 每次約 ${seconds} 秒`,
  },

  // The report and the record
  copyReport: { en: 'Copy report', zh: '複製報告' },
  copied: { en: 'Report copied. Paste it to whoever is tuning the studio.', zh: '已複製報告，請貼給負責調校工作室的人。' },
  copyFailed: { en: 'Could not copy. Select the text under “Show the report text” and copy it yourself.', zh: '無法複製。請在「顯示報告文字」下選取文字，自行複製。' },
  showReport: { en: 'Show the report text', zh: '顯示報告文字' },
  saveFailed: {
    en: 'This browser could not keep the record (its storage is full or blocked). Copy the report now.',
    zh: '此瀏覽器無法保存紀錄（儲存空間已滿或被封鎖），請現在複製報告。',
  },
  recordNote: { en: 'The record stays on this computer and is never sent anywhere.', zh: '紀錄只保存在這部電腦，不會傳送到任何地方。' },
  clear: { en: 'Clear the trial record', zh: '清除試用紀錄' },
  clearAsk: { en: 'Click again to clear every draft and mark', zh: '再按一次，清除所有草稿及評分' },
});
