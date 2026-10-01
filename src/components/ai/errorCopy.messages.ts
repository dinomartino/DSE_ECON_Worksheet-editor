import { defineMessages } from '@/i18n/catalogue';

/**
 * The app's own wording for provider failures (`src/ai/errors.ts`, which may not import
 * from here). The `en` side repeats that text; `errorCopy.test.ts` keeps them equal.
 */
export const ERROR_COPY_MESSAGES = defineMessages({
  notConfigured: { en: 'Set up a provider in Settings first.', zh: '請先在設定中設定供應商。' },
  geminiRegion: {
    en: "Gemini can't be reached from your location. Turn on a VPN and try again.",
    zh: '在你所在的地區無法連接 Gemini。請開啟 VPN 後再試。',
  },
  region: {
    en: (p: string) => `${p}'s API doesn't serve your location.`,
    zh: (p: string) => `${p} 的 API 不支援你所在的地區。`,
  },
  badKey: {
    en: (p: string) => `${p} didn't accept this key. It may be mistyped or deleted.`,
    zh: (p: string) => `${p} 不接受這個 API key。可能輸入錯誤或已被刪除。`,
  },
  geminiKeyBlocked: {
    en: 'Google has blocked this key. Create a new key in AI Studio.',
    zh: 'Google 已封鎖這個 API key。請在 AI Studio 建立新的 API key。',
  },
  keyBlocked: {
    en: (p: string) => `${p} has blocked this key. Create a new key.`,
    zh: (p: string) => `${p} 已封鎖這個 API key。請建立新的 API key。`,
  },
  networkOrKey: {
    en: (p: string) => `${p} didn't answer. Usually this is a wrong key, but ${p} hides the reason from browsers. Or there is no connection.`,
    zh: (p: string) => `${p} 沒有回應。通常是 API key 不正確，但 ${p} 不會向瀏覽器顯示原因；也可能是沒有網絡連線。`,
  },
  network: {
    en: (host: string) => `Couldn't reach ${host}. Check your connection.`,
    zh: (host: string) => `未能連接 ${host}。請檢查網絡連線。`,
  },
  networkOllama: {
    en: ' Is it running, and does it allow this app (OLLAMA_ORIGINS)?',
    zh: '它有在運行嗎？有沒有允許這個 app（OLLAMA_ORIGINS）？',
  },
  networkCustom: {
    en: ' Is it running, and does it allow browser requests (CORS)?',
    zh: '它有在運行嗎？有沒有允許瀏覽器要求（CORS）？',
  },
  geminiQuota: {
    en: (p: string) => `${p}'s limit was reached. Daily limits reset at midnight Pacific time (3 pm or 4 pm in Hong Kong).`,
    zh: (p: string) => `已達 ${p} 的用量上限。每日上限會在太平洋時間午夜重設（香港時間下午 3 時或 4 時）。`,
  },
  quota: { en: (p: string) => `${p}'s limit was reached.`, zh: (p: string) => `已達 ${p} 的用量上限。` },
  billing: { en: (p: string) => `Your ${p} balance is empty.`, zh: (p: string) => `你的 ${p} 餘額不足。` },
  modelNamed: {
    en: (p: string, model: string) => `${p} has no model “${model}” for this key.`,
    zh: (p: string, model: string) => `${p} 沒有名為「${model}」的模型可供這個 API key 使用。`,
  },
  model: {
    en: (p: string) => `${p} has no such model for this key.`,
    zh: (p: string) => `${p} 沒有這個模型可供這個 API key 使用。`,
  },
  policy: {
    en: 'No model matches the privacy setting (no data collection).',
    zh: '沒有模型符合私隱設定（不收集資料）。',
  },
  badRequest: { en: (p: string) => `${p} couldn't read the request.`, zh: (p: string) => `${p} 未能讀取這個要求。` },
  server: { en: (p: string) => `${p} is having trouble right now.`, zh: (p: string) => `${p} 目前出現問題。` },
  timeout: { en: (p: string) => `${p} took too long to answer.`, zh: (p: string) => `${p} 回應逾時。` },
  cancelled: { en: 'Stopped.', zh: '已停止。' },
  safety: { en: 'The provider declined to translate this text.', zh: '供應商拒絕翻譯這段文字。' },
  truncated: {
    en: "Couldn't translate this text safely (the answer was cut off).",
    zh: '未能安全地翻譯這段文字（回應被截斷）。',
  },
  badOutput: {
    en: "Couldn't translate this text safely (the answer wasn't readable).",
    zh: '未能安全地翻譯這段文字（回應無法讀取）。',
  },
});
