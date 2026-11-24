import { defineMessages } from '@/i18n/catalogue';

/** The ✦ AI door: its button, menu, setup card, run bar and review card. */
export const AI_UI_MESSAGES = defineMessages({
  ai: { en: 'AI', zh: 'AI' },
  done: { en: 'Done', zh: '完成' },
  close: { en: 'Close', zh: '關閉' },
  cancel: { en: 'Cancel', zh: '取消' },
  back: { en: 'Back', zh: '返回' },
  previous: { en: 'Previous', zh: '上一個' },
  next: { en: 'Next', zh: '下一個' },
  skip: { en: 'Skip', zh: '略過' },
  settings: { en: 'Settings', zh: '設定' },

  // Toolbar button
  aiTools: { en: 'AI tools', zh: 'AI 工具' },
  aiToolsTitle: { en: (hint: string) => `AI tools (${hint})`, zh: (hint: string) => `AI 工具（${hint}）` },
  untranslatedSuffix: { en: (n: number) => ` · ${n} untranslated`, zh: (n: number) => ` · ${n} 項未翻譯` },
  aiToolsUntranslated: {
    en: (n: number) => `AI tools, ${n} untranslated`,
    zh: (n: number) => `AI 工具，${n} 項未翻譯`,
  },

  // Menu
  searchPlaceholder: { en: 'Search AI actions…', zh: '搜尋 AI 功能…' },
  searchLabel: { en: 'Search AI actions', zh: '搜尋 AI 功能' },
  aiActions: { en: 'AI actions', zh: 'AI 功能' },
  noMatch: { en: (query: string) => `No AI action matches “${query}”`, zh: (query: string) => `沒有符合「${query}」的 AI 功能` },
  nothingToDo: { en: 'Nothing to do for this selection', zh: '所選內容沒有可執行的項目' },
  free: { en: 'free', zh: '免費' },
  // First-run setup: the DSEcon Mentor account before an own key (k-0519).
  mentorNoKey: {
    en: 'No API key? Sign in with DSEcon Mentor and pay only for what you use. New accounts get free trial credits.',
    zh: '沒有 API key？以 DSEcon Mentor 登入，按用量付費。新帳戶可獲免費試用點數。',
  },
  orOwnKey: { en: 'Or use your own API key:', zh: '或使用你自己的 API key：' },
  // Before a run on the DSEcon Mentor account (k-0519, E4).
  creditsAbout: {
    en: (n: string, one: boolean) => `Uses about ${n} ${one ? 'credit' : 'credits'}`,
    // 中文 has one word for one and many.
    zh: (n: string, one: boolean) => (one ? `約用 ${n} 點` : `約用 ${n} 點`),
  },
  creditsLeft: { en: (n: string) => `${n} left`, zh: (n: string) => `尚餘 ${n} 點` },
  creditsShort: { en: 'More than your credits left', zh: '多於尚餘點數' },
  scope: { en: (label: string) => `Scope: ${label}`, zh: (label: string) => `範圍：${label}` },
  groupTranslate: { en: 'Translate', zh: '翻譯' },
  groupCheck: { en: 'Check', zh: '檢查' },
  groupWrite: { en: 'Write', zh: '撰寫' },
  groupCreate: { en: 'Create', zh: '建立' },
  characters: {
    en: (n: number) => `${n} ${n === 1 ? 'character' : 'characters'}`,
    zh: (n: number) => `${n} 個字元`,
  },
  atLeast: { en: (n: number) => ` · at least ${n}`, zh: (n: number) => ` · 最少 ${n} 個` },
  generate: { en: 'Generate', zh: '產生' },
  notSetUp: { en: ' · not set up', zh: ' · 未設定' },

  // Setup card
  setUpAi: { en: 'Set up AI', zh: '設定 AI' },
  needsKey: { en: 'needs a key', zh: '需要 API key' },
  keeps: {
    en: (where: string) => `Uses your own AI account. Your key stays on this computer, in ${where}.`,
    zh: (where: string) => `使用你自己的 AI 帳戶。你的 API key 只存於${where}。`,
  },
  aiProvider: { en: 'AI provider', zh: 'AI 供應商' },
  getKey: { en: (name: string) => `Get a ${name} key ↗`, zh: (name: string) => `取得 ${name} 的 API key ↗` },
  moreProviders: { en: 'More providers…', zh: '更多供應商…' },
  apiKeyOf: { en: (provider: string) => `${provider} API key`, zh: (provider: string) => `${provider} API key` },
  pasteKey: { en: (name: string) => `Paste your ${name} key`, zh: (name: string) => `貼上你的 ${name} API key` },
  show: { en: 'Show', zh: '顯示' },
  hide: { en: 'Hide', zh: '隱藏' },
  testingKey: { en: 'Testing your key…', zh: '正在測試你的 API key…' },
  testAnyway: { en: 'Test anyway', zh: '仍然測試' },
  keychainDenied: {
    en: (os: string, store: string) => `${os} didn’t allow access to ${store}.`,
    zh: (os: string, store: string) => `${os} 不允許存取${store}。`,
  },
  keychainFailed: {
    en: (store: string) => `The key couldn’t be saved in ${store}.`,
    zh: (store: string) => `未能把 API key 儲存在${store}。`,
  },
  sessionOnlyAsk: { en: 'Use it for this session only?', zh: '只在這次使用？' },
  useForSession: { en: 'Use for this session', zh: '只用於這次' },
  tryAgain: { en: 'Try again', zh: '再試一次' },
  useDeepSeek: { en: 'Use DeepSeek', zh: '改用 DeepSeek' },
  useQwen: { en: 'Use Qwen', zh: '改用 Qwen' },
  remember: { en: 'Remember on this computer', zh: '在這部電腦記住' },
  testing: { en: 'Testing…', zh: '測試中…' },
  saveContinue: { en: 'Save & continue', zh: '儲存並繼續' },

  // Run bar and review card
  progress: { en: (done: number, total: number) => `${done} of ${total}`, zh: (done: number, total: number) => `${done} / ${total}` },
  undoAll: { en: 'Undo all', zh: '全部復原' },
  chipLook: { en: (n: number) => `${n} to look at`, zh: (n: number) => `${n} 項需留意` },
  chipFailed: { en: (n: number) => `${n} failed`, zh: (n: number) => `${n} 項失敗` },
  chipFinding: { en: (n: number) => `${n} ${n === 1 ? 'finding' : 'findings'}`, zh: (n: number) => `${n} 項發現` },
  toneInserted: { en: 'Inserted', zh: '已插入' },
  toneLook: { en: 'Needs a look', zh: '需要留意' },
  toneFailed: { en: "Couldn't translate", zh: '未能翻譯' },
  toneFinding: { en: 'Finding', zh: '發現' },

  // The AI status chip in the studio's header and before big runs (k-0524; no status bar, k-0526).
  chipCredits: { en: (n: string) => `AI credits ${n}`, zh: (n: string) => `AI 點數 ${n}` },
  chipChecking: { en: 'AI credits …', zh: 'AI 點數 …' },
  chipOwnKey: { en: (p: string) => `AI: own key (${p})`, zh: (p: string) => `AI：自己的 API key（${p}）` },
  chipLocal: { en: (p: string) => `AI: ${p} on this computer`, zh: (p: string) => `AI：這部電腦的 ${p}` },
  chipSetup: { en: 'Set up AI', zh: '設定 AI' },
  chipBuy: { en: 'Buy credits', zh: '購買點數' },
  chipTitleCredits: {
    en: 'Credits left on your DSEcon Mentor account.',
    zh: '你的 DSEcon Mentor 帳戶尚餘的點數。',
  },
  chipTitleLow: {
    en: (n: string) => `Running low: under ${n} credits, about one Question studio run.`,
    zh: (n: string) => `點數快將用完：少於 ${n} 點，約為擬題工作室一次的用量。`,
  },
  chipTitleOut: {
    en: 'No credits left. Buy credits to keep using AI, or use your own API key.',
    zh: '點數已用完。請購買點數以繼續使用 AI，或改用你自己的 API key。',
  },
  chipTitleOwnKey: {
    en: (p: string) => `AI uses your own ${p} API key. Its balance is on ${p}’s own site.`,
    zh: (p: string) => `AI 正使用你自己的 ${p} API key，餘額請到 ${p} 的網站查看。`,
  },
  chipTitleLocal: {
    en: (p: string) => `AI runs on ${p} on this computer.`,
    zh: (p: string) => `AI 正使用這部電腦上的 ${p}。`,
  },
  chipTitleSetup: {
    en: 'AI isn’t set up. Sign in with DSEcon Mentor or add your own API key in Settings → AI.',
    zh: 'AI 尚未設定。請到「設定 → AI」以 DSEcon Mentor 登入，或加入你自己的 API key。',
  },
  chipTest: { en: 'Test build', zh: '測試版本' },
  chipClickSettings: { en: 'Click for Settings → AI.', zh: '按一下開啟「設定 → AI」。' },

  // Mentor credits or my own key, when both exist (k-0527, u-ypm9): the chip's menu and Settings → AI.
  chipClickChoose: {
    en: 'Click to choose DSEcon Mentor credits or your own key.',
    zh: '按一下選擇使用 DSEcon Mentor 點數或你自己的 API key。',
  },
  choiceTitle: { en: 'Use for AI', zh: 'AI 使用' },
  choiceMentor: { en: 'DSEcon Mentor credits', zh: 'DSEcon Mentor 點數' },
  choiceOwn: { en: (p: string) => `My own key (${p})`, zh: (p: string) => `我自己的 API key（${p}）` },
  choiceMentorNote: {
    en: (n: string) => `${n} credits left. No VPN needed.`,
    zh: (n: string) => `尚餘 ${n} 點，毋須 VPN。`,
  },
  choiceMentorNoteUnread: { en: 'Pay as you go with credits. No VPN needed.', zh: '以點數按用量付費，毋須 VPN。' },
  choiceOwnNote: {
    en: (p: string) => `${p} bills your own account. No credits are used.`,
    zh: (p: string) => `由 ${p} 向你自己的帳戶收費，不會用點數。`,
  },
  choiceSettings: { en: 'AI settings…', zh: 'AI 設定…' },
});
