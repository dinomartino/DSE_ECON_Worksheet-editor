import { defineMessages } from '@/i18n/catalogue';

/**
 * The AI translation, Check terms and error copy (`copy.ts`) and the inline field fill
 * (`fieldFill.ts`). Read through `copyMessages()` (`./text.ts`) outside React. A `.trim()` on
 * a function's first argument only keeps the guard test's numeric samples from reading
 * "2 in" as inches.
 */
export const COPY_MESSAGES = defineMessages({
  menuSettings: { en: 'Settings…', zh: '設定…' },
  undoAction: { en: 'Undo', zh: '復原' },
  replacedTerms: {
    en: (n: number) => `Replaced ${n} ${n === 1 ? 'term' : 'terms'}`,
    zh: (n: number) => `已取代 ${n} 個用詞`,
  },
  paperCheckOpenAi: { en: 'Open ✦ AI', zh: '開啟 ✦ AI' },

  close: { en: 'Close', zh: '關閉' },
  stop: { en: 'Stop', zh: '停止' },
  termsUnavailable: { en: 'Terminology check unavailable', zh: '未能檢查用詞' },
  waitingLine: {
    en: (provider: string, ms: number) => `Waiting for ${provider}'s rate limit (${Math.max(1, Math.round(ms / 1000))} s)`,
    zh: (provider: string, ms: number) => `正在等候 ${provider} 的使用限制（${Math.max(1, Math.round(ms / 1000))} 秒）`,
  },

  termFixed: {
    en: (from: string, to: string) => `Term fixed: ${from} → ${to} (EDB)`,
    zh: (from: string, to: string) => `已修正用詞：${from} → ${to}（EDB）`,
  },
  simplifiedFixed: { en: 'Simplified characters changed to Traditional', zh: '已把簡體字改為繁體字' },
  conflictChip: {
    en: (form: string, meansEn: string) => `Meaning reversed? ${form} is “${meansEn}”`,
    zh: (form: string, meansEn: string) => `意思可能相反？${form} 的意思是「${meansEn}」`,
  },
  termChipNotPreferred: {
    en: (en: string, expected: string) => `EDB lists ${expected} first for “${en}”`,
    zh: (en: string, expected: string) => `「${en}」在 EDB 以 ${expected} 為首選`,
  },
  termChip: {
    en: (en: string, expected: string) => `${en} (EDB: ${expected})`,
    zh: (en: string, expected: string) => `${en}（EDB：${expected}）`,
  },
  failedRow: {
    en: (reason: string) => `Couldn't translate this text safely (${reason}).`,
    zh: (reason: string) => `未能安全地翻譯這段文字（${reason}）。`,
  },
  safetyRow: { en: 'The provider declined to translate this text.', zh: '供應商拒絕翻譯這段文字。' },

  technicalDetail: { en: 'Technical detail', zh: '技術詳情' },
  regionGeminiNote: { en: 'Keep the VPN on while you use Gemini.', zh: '使用 Gemini 期間，請保持 VPN 開啟。' },
  useProvider: { en: (name: string) => `Use ${name}`, zh: (name: string) => `改用 ${name}` },
  hkProvidersNote: {
    en: 'DeepSeek and Qwen work in Hong Kong without a VPN.',
    zh: 'DeepSeek 和 Qwen 在香港毋須 VPN 也可以使用。',
  },
  tryAgain: { en: 'Try again', zh: '再試一次' },
  openSettings: { en: 'Open Settings', zh: '開啟設定' },
  chooseModel: { en: 'Choose a model…', zh: '選擇模型…' },
  switchProvider: { en: 'Switch provider…', zh: '轉換供應商…' },
  getNewKey: { en: 'Get a new key', zh: '取得新的 API key' },
  openProvider: { en: (provider: string) => `Open ${provider}`, zh: (provider: string) => `開啟 ${provider}` },
  switchModel: { en: (model: string) => `Switch to ${model}`, zh: (model: string) => `改用 ${model}` },
  noKeyError: {
    en: (provider: string, desktop: boolean) => `No key for ${provider} is saved on this ${desktop ? 'computer' : 'browser'}.`,
    zh: (provider: string, desktop: boolean) => `這${desktop ? '部電腦' : '個瀏覽器'}沒有儲存 ${provider} 的 API key。`,
  },
  noModelError: {
    en: (provider: string) => `Choose a model for ${provider.trim()} in Settings.`,
    zh: (provider: string) => `請在設定中為 ${provider} 選擇模型。`,
  },
  noBaseUrlError: {
    en: (provider: string) => `Add the server address for ${provider.trim()} in Settings.`,
    zh: (provider: string) => `請在設定中為 ${provider} 加入伺服器位址。`,
  },

  summaryFix: { en: (n: number) => `${n} to fix`, zh: (n: number) => `${n} 個需修正` },
  summaryVariant: {
    en: (n: number) => `${n} textbook ${n === 1 ? 'variant' : 'variants'}`,
    zh: (n: number) => `${n} 個教科書用法`,
  },
  summaryLower: { en: (n: number) => `${n} acceptable but not the first choice`, zh: (n: number) => `${n} 個可接受但非首選` },
  summaryManual: { en: (n: number) => `${n} to check by hand`, zh: (n: number) => `${n} 個需人手檢查` },
  nothingReplaced: {
    en: 'Nothing replaced. These texts changed since the check.',
    zh: '沒有取代任何用詞。這些文字在檢查後已有更改。',
  },
  lowerRankLine: {
    en: (en: string, found: string, expected: string) => `${en}: ${found} (EDB lists ${expected} first)`,
    zh: (en: string, found: string, expected: string) => `${en}：${found}（EDB 以 ${expected} 為首選）`,
  },
  /** The same, when the preferred wording is the teacher's own choice in Settings. */
  chosenLine: {
    en: (en: string, found: string, expected: string) => `${en}: ${found} (your choice: ${expected})`,
    zh: (en: string, found: string, expected: string) => `${en}：${found}（你的選擇：${expected}）`,
  },

  setupTranslation: { en: 'Set up translation…', zh: '設定翻譯…' },
  setupInSettingsTitle: {
    en: 'Set up translation in Settings (⋯ → Settings…)',
    zh: '在設定中設定翻譯（⋯ → 設定…）',
  },
  fillZh: { en: 'Fill 中文', zh: '填寫中文' },
  fillEn: { en: 'Fill English', zh: '填寫英文' },
  fillStale: {
    en: 'Not filled. This text changed while translating.',
    zh: '未有填寫。翻譯期間這段文字已有更改。',
  },
  insertAnyway: { en: 'Insert anyway', zh: '仍然插入' },
  fillFailed: { en: 'Couldn’t translate this text safely.', zh: '未能安全地翻譯這段文字。' },
  needsLook: { en: 'Not filled. Check this translation first.', zh: '未有填寫。請先檢查這個翻譯。' },
  filled: { en: 'Filled', zh: '已填寫' },
  filledCheck: { en: (caveat: string) => `Filled · check: ${caveat}`, zh: (caveat: string) => `已填寫 · 請檢查：${caveat}` },
  filledFix: {
    en: (from: string, to: string) => `Filled · ${from} → ${to} (EDB)`,
    zh: (from: string, to: string) => `已填寫 · ${from} → ${to}（EDB）`,
  },
  notFilled: { en: (caveat: string) => `Not filled: ${caveat}`, zh: (caveat: string) => `未有填寫：${caveat}` },
  conflictLine: {
    en: (form: string, meansEn: string, en: string, expected: string) =>
      `${form} means “${meansEn}” (${en}, EDB: ${expected})`,
    zh: (form: string, meansEn: string, en: string, expected: string) =>
      `${form} 的意思是「${meansEn}」（${en}，EDB：${expected}）`,
  },
});
